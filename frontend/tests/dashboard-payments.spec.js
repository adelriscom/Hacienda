/**
 * Dashboard · Upcoming Payments — profile filtering, monthly periods, statuses.
 *
 * Self-contained: the Supabase REST layer is stubbed with fixtures and the clock
 * is pinned to 2026-10-14, so every payment status is exercised deterministically
 * without touching the live project or needing credentials.
 *
 *   npx playwright test tests/dashboard-payments.spec.js
 */
import { test, expect } from '@playwright/test'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://stub.supabase.co'
const PROJECT_REF  = SUPABASE_URL.match(/https:\/\/([^.]+)\./)?.[1] || 'stub'

const TODAY   = '2026-10-14'
const ALEX    = '11111111-1111-4111-8111-111111111111'
const MARCELA = '22222222-2222-4222-8222-222222222222'
const HOUSE   = '33333333-3333-4333-8333-333333333333'

// ── Fixtures ────────────────────────────────────────────────────────────────
// Day of month is what drives each projected due date, so with the clock pinned
// to 14 Oct 2026 each obligation below lands on one specific status.
const CAD = { name: 'Scotia Chequing', currency: 'CAD' }
const COP = { name: 'Bancolombia',     currency: 'COP' }

const OBLIGATIONS = [
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

const recurringRows = () => OBLIGATIONS.flatMap((o, oi) =>
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

const MEMBERS = [
  { id: 'hm-1', household_id: HOUSE, user_id: ALEX,    display_name: 'Alexander', role: 'owner'  },
  { id: 'hm-2', household_id: HOUSE, user_id: MARCELA, display_name: 'Marcela',   role: 'member' },
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

// Serves the handful of tables the dashboard touches; everything else is empty
// so no screen can crash on a missing stub.
async function stubSupabase(page, viewMode) {
  await page.route(`${SUPABASE_URL}/auth/v1/**`, route => {
    const url = route.request().url()
    if (url.includes('/user')) return route.fulfill({ json: SESSION.user })
    return route.fulfill({ json: SESSION })
  })

  await page.route(`${SUPABASE_URL}/rest/v1/**`, route => {
    const url    = new URL(route.request().url())
    const table  = url.pathname.split('/rest/v1/')[1]?.split('?')[0]
    const query  = url.search
    const single = (route.request().headers()['accept'] || '').includes('pgrst.object')

    let body = []
    if (table === 'household_members') {
      body = query.includes(`user_id=eq.${ALEX}`)
        ? [{ ...MEMBERS[0], household: { id: HOUSE, name: 'Delrisco-Falla' } }]
        : MEMBERS
    } else if (table === 'households') {
      body = [{ id: HOUSE, name: 'Delrisco-Falla' }]
    } else if (table === 'exchange_rates') {
      body = RATES
    } else if (table === 'transactions') {
      body = query.includes('is_recurring=eq.true') ? recurringRows() : []
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

async function openDashboard(page, viewMode = 'family') {
  await page.clock.setFixedTime(new Date(`${TODAY}T10:00:00`))
  await stubSupabase(page, viewMode)
  await page.goto('/')
  await page.waitForSelector('.pay-card', { timeout: 20000 })
}

// Rows are scoped to a payment period: the same obligation recurs in several.
function period(page, title) {
  return page.locator('.pay-card .pay-period')
    .filter({ has: page.locator('.pay-period-title', { hasText: title }) })
}

function row(scope, name) {
  return scope.locator('.pay-row')
    .filter({ has: scope.page().locator('.up-name', { hasText: new RegExp(`^${name}$`) }) })
}

// Same obligation anywhere in the card, regardless of period.
const anyRow = (page, name) => page.locator('.pay-row')
  .filter({ has: page.locator('.up-name', { hasText: new RegExp(`^${name}$`) }) })

const october = (page) => period(page, 'OCTOBER 2026')
const chipsOf = (locator) => locator.locator('.pay-chip').allInnerTexts()
const toggle  = (page, name) => page.getByRole('button', { name, exact: true })

// The sidebar's profile switch. `.sb-item` excludes the nav link of the same
// name; period titles are uppercased by CSS, so they're read via innerText.
const profileSwitch = (page, mode) =>
  page.locator('button:not(.sb-item)').filter({ hasText: mode })

test.describe('Dashboard · Upcoming Payments', () => {
  test('groups payments by month with the exact period and due date', async ({ page }) => {
    await openDashboard(page)

    await expect(page.locator('.pay-card .insight-sub'))
      .toHaveText('Family · Delrisco-Falla · 2 overdue · $2,677 outstanding in October 2026')

    const titles = await page.locator('.pay-period-title').allInnerTexts()
    expect(titles).toEqual(['OCTOBER 2026', 'NOVEMBER 2026', 'DECEMBER 2026'])

    const spans = await page.locator('.pay-period-span').allInnerTexts()
    expect(spans[0]).toBe('Payment period · Oct 1 – Oct 31')
    expect(spans[1]).toBe('Payment period · Nov 1 – Nov 30')

    // Every row states its exact, year-qualified due date.
    for (const s of await page.locator('.pay-row .up-sub').allInnerTexts())
      expect(s).toMatch(/^Due [A-Za-z]{3} \d{1,2}, 20\d{2}/)

    await expect(row(october(page), 'Mortgage').locator('.up-sub'))
      .toContainText('Due Oct 10, 2026')
    await expect(row(october(page), 'Celular').locator('.up-sub'))
      .toContainText('Due Oct 20, 2026')
    await expect(row(period(page, 'NOVEMBER 2026'), 'Mortgage').locator('.up-sub'))
      .toContainText('Due Nov 10, 2026')
  })

  test('derives each payment status from real transactions', async ({ page }) => {
    await openDashboard(page)

    const oct = october(page)

    // Unpaid and past due → Overdue, still filed under October.
    expect(await chipsOf(row(oct, 'Mortgage'))).toEqual(['Overdue'])
    await expect(row(oct, 'Mortgage').locator('.up-sub')).toContainText('4d late')

    // Due on the pinned date.
    expect(await chipsOf(row(oct, 'Gym'))).toEqual(['Due today'])

    // Future due date → Upcoming. Never "Paid" just because the date hasn't passed.
    expect(await chipsOf(row(oct, 'Celular'))).toEqual(['Upcoming'])
    expect(await chipsOf(row(period(page, 'DECEMBER 2026'), 'Mortgage'))).toEqual(['Upcoming'])

    // Recurring income gets inflow wording.
    expect(await chipsOf(row(oct, 'Salary'))).toEqual(['Expected'])

    // October's Internet is settled → gone from the Outstanding view, while its
    // unpaid November occurrence remains.
    await expect(row(oct, 'Internet')).toHaveCount(0)
    expect(await chipsOf(row(period(page, 'NOVEMBER 2026'), 'Internet'))).toEqual(['Upcoming'])
  })

  test('a partially paid overdue obligation shows progress, balance and both states', async ({ page }) => {
    await openDashboard(page)

    const rent = row(october(page), 'Rent')
    expect(await chipsOf(rent)).toEqual(['Partially paid', 'Overdue'])
    await expect(rent.locator('.pay-progress-txt'))
      .toHaveText('58% · $700.00 of $1,200.00 · $500.00 left')
    // Scheduled amount survives the short payment.
    await expect(rent.locator('.up-amt')).toHaveText('−$1,200.00')
    // Due date and the date money actually moved are both reported.
    await expect(rent.locator('.up-sub')).toContainText('Due Oct 8, 2026')
    await expect(rent.locator('.up-sub')).toContainText('paid Oct 8')
    // November's Rent is back to the full scheduled amount, unpaid.
    const novRent = row(period(page, 'NOVEMBER 2026'), 'Rent')
    expect(await chipsOf(novRent)).toEqual(['Upcoming'])
    await expect(novRent.locator('.pay-progress')).toHaveCount(0)
  })

  test('period totals count outstanding balances, not original amounts', async ({ page }) => {
    await openDashboard(page)
    const oct = page.locator('.pay-card .pay-period').first()

    // Scheduled: 2000 + 80 + 45 + 1200 + (400000 COP × 0.00033 = 132) = 3457
    await expect(oct.locator('.pay-period-tot')).toContainText('Scheduled')
    // Outstanding: 2000 + 45 + 132 + 500 balance = 2677 — Internet's settled 80 drops out,
    // and Rent contributes only its remaining 500.
    const totals = await oct.locator('.pay-period-tot .num').allInnerTexts()
    expect(totals[0]).toBe('$3,457')
    expect(totals[1]).toBe('$2,677')
    // Income is tracked apart from obligations.
    await expect(oct.locator('.pay-period-tot')).toContainText('Expected in')
    expect(totals[2]).toBe('$5,000')

    await expect(page.locator('.pay-card .insight-sub')).toContainText('2 overdue')
  })

  test('COP amounts are shown natively and converted only in totals', async ({ page }) => {
    await openDashboard(page)
    const celular = row(october(page), 'Celular')
    await expect(celular.locator('.up-amt')).toHaveText('−$400.000')
    await expect(celular.locator('.pay-amt-sub')).toHaveText('COP')
    // A CAD row carries no currency suffix.
    await expect(row(october(page), 'Mortgage').locator('.pay-amt-sub')).toHaveCount(0)
  })

  test('the All toggle reveals settled occurrences and historical periods', async ({ page }) => {
    await openDashboard(page)
    const outstanding = await page.locator('.pay-row').count()

    await toggle(page, 'All').click()
    await expect
      .poll(() => page.locator('.pay-period-title').first().innerText())
      .toBe('AUGUST 2026')

    expect(await page.locator('.pay-row').count()).toBeGreaterThan(outstanding)
    const internet = row(october(page), 'Internet')
    expect(await chipsOf(internet)).toEqual(['Paid'])
    await expect(internet.locator('.up-sub')).toContainText('paid Oct 12')
    // Settled history stays reachable without re-entering the outstanding totals.
    await expect(october(page).locator('.pay-period-tot .num').nth(1)).toHaveText('$2,677')
  })

  test('family mode names the owner of each payment', async ({ page }) => {
    await openDashboard(page, 'family')
    await expect(row(october(page), 'Mortgage').locator('.pay-owner')).toHaveText('Alexander')
    await expect(row(october(page), 'Rent').locator('.pay-owner')).toHaveText('Marcela')
    expect(new Set(await page.locator('.pay-owner').allInnerTexts()))
      .toEqual(new Set(['Alexander', 'Marcela']))
  })

  test('personal profile shows only the signed-in member and drops owner badges', async ({ page }) => {
    await openDashboard(page, 'personal')

    await expect(page.locator('.pay-card .insight-sub'))
      .toHaveText('Alexander · 1 overdue · $2,045 outstanding in October 2026')

    // Alexander's obligations only.
    await expect(row(october(page), 'Mortgage')).toBeVisible()
    await expect(row(october(page), 'Gym')).toBeVisible()
    await expect(anyRow(page, 'Rent')).toHaveCount(0)
    await expect(anyRow(page, 'Celular')).toHaveCount(0)
    expect(await page.locator('.pay-owner').count()).toBe(0)

    // Totals cover this profile alone: 2000 + 80 + 45 = 2125 scheduled, 2045 outstanding.
    const totals = await page.locator('.pay-card .pay-period').first()
      .locator('.pay-period-tot .num').allInnerTexts()
    expect(totals[0]).toBe('$2,125')
    expect(totals[1]).toBe('$2,045')
    await expect(page.locator('.pay-card .insight-sub')).toContainText('1 overdue')
  })

  test('switching profiles refreshes the payments without a reload', async ({ page }) => {
    await openDashboard(page, 'family')
    await expect(anyRow(page, 'Rent').first()).toBeVisible()

    await profileSwitch(page, 'Personal').click()
    await expect(anyRow(page, 'Rent')).toHaveCount(0)
    await expect(row(october(page), 'Mortgage')).toBeVisible()
    await expect(page.locator('.pay-card .insight-sub')).toContainText('1 overdue')

    await profileSwitch(page, 'Family').click()
    await expect(anyRow(page, 'Rent').first()).toBeVisible()
    await expect(page.locator('.pay-card .insight-sub')).toContainText('2 overdue')
  })

  test('the card stays readable at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openDashboard(page)

    const overflow = await page.evaluate(() => {
      const el = document.querySelector('.pay-card')
      return {
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        card: el.scrollWidth - el.clientWidth,
      }
    })
    expect(overflow.page).toBeLessThanOrEqual(1)
    expect(overflow.card).toBeLessThanOrEqual(1)

    await expect(page.locator('.pay-period-title').first()).toBeVisible()
    await expect(row(october(page), 'Rent').locator('.pay-progress-bar')).toBeVisible()
    await expect(toggle(page, 'Outstanding')).toBeVisible()
  })

})
