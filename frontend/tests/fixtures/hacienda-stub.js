/**
 * Shared Supabase stub + fixture household for the Playwright specs.
 *
 * The REST layer is intercepted and the clock pinned to 2026-10-14, so suites
 * run deterministically against known data without touching the live project or
 * needing credentials. Not named *.spec.js, so Playwright won't collect it.
 */
import { expect } from '@playwright/test'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') })

export const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://stub.supabase.co'
const PROJECT_REF = SUPABASE_URL.match(/https:\/\/([^.]+)\./)?.[1] || 'stub'

export const TODAY   = '2026-10-14'
export const ALEX    = '11111111-1111-4111-8111-111111111111'
export const MARCELA = '22222222-2222-4222-8222-222222222222'
export const HOUSE   = '33333333-3333-4333-8333-333333333333'

// ── Fixture household ───────────────────────────────────────────────────────
// Day of month is what drives each projected due date, so with the clock pinned
// to 14 Oct 2026 each obligation below lands on one specific status.
const CAD = { name: 'Scotia Chequing', currency: 'CAD' }
const COP = { name: 'Bancolombia',     currency: 'COP' }

export const OBLIGATIONS = [
  // Due the 10th, paid through September → October is unpaid and overdue.
  { desc: 'Mortgage', owner: ALEX, person: 'Alexander', account: CAD, amount: -2000,
    pays: [['2026-08-10', -2000], ['2026-09-10', -2000]] },
  // Due the 12th and already settled this month → Paid, hidden under Outstanding.
  { desc: 'Internet', owner: ALEX, person: 'Alexander', account: CAD, amount: -80,
    pays: [['2026-08-12', -80], ['2026-09-12', -80], ['2026-10-12', -80]] },
  // Due the 14th → due today.
  { desc: 'Gym', owner: ALEX, person: 'Alexander', account: CAD, amount: -45,
    pays: [['2026-08-14', -45], ['2026-09-14', -45]] },
  // Due the 8th, only 700 of 1200 paid → partially paid and past due.
  { desc: 'Rent', owner: MARCELA, person: 'Marcela', account: CAD, amount: -1200,
    pays: [['2026-08-08', -1200], ['2026-09-08', -1200], ['2026-10-08', -700]] },
  // Due the 20th in COP → upcoming, non-base currency.
  { desc: 'Celular', owner: MARCELA, person: 'Marcela', account: COP, amount: -400000,
    pays: [['2026-08-20', -400000, 0.00034], ['2026-09-20', -400000, 0.00035]] },
  // Recurring income → inflow wording, excluded from obligation totals.
  { desc: 'Salary', owner: ALEX, person: 'Alexander', account: CAD, amount: 5000,
    pays: [['2026-08-30', 5000], ['2026-09-30', 5000]] },
]

export const recurringRows = () => OBLIGATIONS.flatMap((o, oi) =>
  o.pays.map(([date, amount, rate], pi) => ({
    id: `tx-${oi}-${pi}`,
    user_id: o.owner,
    account_id: `acct-${oi}`,
    category_id: null,
    occurred_at: `${date}T12:00:00+00:00`,
    description: o.desc,
    amount,
    type: amount > 0 ? 'income' : 'expense',
    status: 'match',
    is_recurring: true,
    person: o.person,
    notes: null,
    exchange_rate: rate ?? null,
    account: o.account,
    category: null,
  }))
)

// Every transaction id belonging to one obligation, in fixture order.
export const idsFor = (desc) => {
  const i = OBLIGATIONS.findIndex(o => o.desc === desc)
  return OBLIGATIONS[i].pays.map((_, pi) => `tx-${i}-${pi}`)
}

export const MEMBERS = [
  { id: 'hm-1', household_id: HOUSE, user_id: ALEX,    display_name: 'Alexander', role: 'owner'  },
  { id: 'hm-2', household_id: HOUSE, user_id: MARCELA, display_name: 'Marcela',   role: 'member' },
]

// The accounts the fixture transactions already reference, so account pickers
// have something to offer.
export const ACCOUNTS = [
  { id: 'acct-cad', user_id: ALEX,    name: 'Scotia Chequing', type: 'checking',
    currency: 'CAD', balance: 0, is_active: true },
  { id: 'acct-cop', user_id: MARCELA, name: 'Bancolombia',     type: 'checking',
    currency: 'COP', balance: 0, is_active: true },
]

const RATES = [
  { currency_code: 'COP', rate_to_base: 0.00032, month: '2026-09-01' },
  { currency_code: 'COP', rate_to_base: 0.00033, month: '2026-10-01' },
]

function fakeJwt(sub) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
    sub, role: 'authenticated', exp: 4102444800, iat: 1760000000,
  })}.stub`
}

const SESSION = {
  access_token: fakeJwt(ALEX),
  refresh_token: 'stub-refresh',
  token_type: 'bearer',
  expires_in: 999999999,
  expires_at: 4102444800,
  user: {
    id: ALEX, aud: 'authenticated', role: 'authenticated',
    email: 'alexander@example.com', app_metadata: {}, user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  },
}

// Declared obligations served from scheduled_payments. Empty by default, so the
// existing suites keep exercising the inferred path; a test that wants rules
// passes them to openApp/openDashboard.
export const NEW_RULE_ID = '99999999-9999-4999-8999-999999999999'
let rulesFixture = []
export function setRules(rules) { rulesFixture = rules || [] }

// Serves the handful of tables these screens touch; everything else comes back
// empty so no screen can crash on a missing stub. Writes are recorded rather
// than applied — `writes` lets a test assert exactly what was sent.
export async function stubSupabase(page, viewMode, writes = []) {
  await page.route(`${SUPABASE_URL}/auth/v1/**`, route => {
    const url = route.request().url()
    if (url.includes('/user')) return route.fulfill({ json: SESSION.user })
    return route.fulfill({ json: SESSION })
  })

  await page.route(`${SUPABASE_URL}/rest/v1/**`, route => {
    const req    = route.request()
    const url    = new URL(req.url())
    const table  = url.pathname.split('/rest/v1/')[1]?.split('?')[0]
    const query  = url.search
    const single = (req.headers()['accept'] || '').includes('pgrst.object')

    if (req.method() !== 'GET') {
      writes.push({ method: req.method(), table, query, body: req.postDataJSON?.() ?? null })
      // An insert that asks for the row back (.select().single()) needs an
      // object, not an empty list, or the client rejects the response.
      const echo = { id: NEW_RULE_ID }
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(single ? echo : [echo]),
      })
    }

    let body = []
    if (table === 'household_members') {
      body = query.includes(`user_id=eq.${ALEX}`)
        ? [{ ...MEMBERS[0], household: { id: HOUSE, name: 'Delrisco-Falla' } }]
        : MEMBERS
    } else if (table === 'households') {
      body = [{ id: HOUSE, name: 'Delrisco-Falla' }]
    } else if (table === 'accounts') {
      body = ACCOUNTS
      const owner = query.match(/user_id=eq\.([0-9a-f-]+)/)
      if (owner) body = body.filter(r => r.user_id === owner[1])
    } else if (table === 'exchange_rates') {
      body = RATES
    } else if (table === 'scheduled_payments') {
      body = rulesFixture
      const owner = query.match(/user_id=eq\.([0-9a-f-]+)/)
      if (owner) body = body.filter(r => r.user_id === owner[1])
    } else if (table === 'transactions') {
      // Matches both `is_recurring=eq.true` and the or(...) form the hook uses
      // once declared obligations are in play.
      body = query.includes('is_recurring') ? recurringRows() : []
      // The personal profile filters server-side; mirror that here.
      const owner = query.match(/user_id=eq\.([0-9a-f-]+)/)
      if (owner) body = body.filter(r => r.user_id === owner[1])
    }

    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json', 'content-range': `0-${body.length}/*` },
      body: JSON.stringify(single ? (body[0] ?? null) : body),
    })
  })

  await page.addInitScript(({ key, session, viewMode }) => {
    localStorage.setItem(key, JSON.stringify(session))
    localStorage.setItem('hacienda_viewMode', viewMode)
    // Shell opens the onboarding wizard when no accounts exist; its overlay
    // would swallow clicks on the sidebar profile toggle.
    localStorage.setItem('hacienda_onboarded', 'true')
  }, { key: `sb-${PROJECT_REF}-auth-token`, session: SESSION, viewMode })
}

// Boots the app at `route` with the clock pinned and the stub installed.
export async function openApp(page, route, viewMode = 'family', writes = [], rules = []) {
  setRules(rules)
  await page.clock.setFixedTime(new Date(`${TODAY}T10:00:00`))
  await stubSupabase(page, viewMode, writes)
  await page.goto(route)
}

export async function openDashboard(page, viewMode = 'family', rules = []) {
  await openApp(page, '/', viewMode, [], rules)
  await page.waitForSelector('.pay-card', { timeout: 20000 })
  // HouseholdProvider resolves the household asynchronously, so the card renders
  // personal-scoped for an instant before Family mode settles. Wait for the
  // profile label to reach its final value rather than racing it.
  await expect(page.locator('.pay-card .insight-sub'))
    .toContainText(viewMode === 'family' ? 'Family · Delrisco-Falla' : 'Alexander')
}

// The sidebar's profile switch. `.sb-item` excludes the nav link of the same name.
export const profileSwitch = (page, mode) =>
  page.locator('button:not(.sb-item)').filter({ hasText: mode })

export { expect }
