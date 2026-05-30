/**
 * Budget detail modal — Playwright smoke test (mocked Supabase)
 * Run: npx playwright test tests/budget-detail.spec.js
 */
import { test, expect } from '@playwright/test'

const SUPABASE_HOST = 'msdswuzscfowsxecjqxh.supabase.co'
const STORAGE_KEY   = `sb-msdswuzscfowsxecjqxh-auth-token`

const MOCK_SESSION = {
  access_token: 'mock-access-token',
  token_type:   'bearer',
  expires_in:   3600,
  expires_at:   9999999999,
  refresh_token: 'mock-refresh-token',
  user: {
    id:    'user-1',
    aud:   'authenticated',
    role:  'authenticated',
    email: 'test@test.com',
    email_confirmed_at: '2020-01-01T00:00:00Z',
    app_metadata:  { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at:    '2020-01-01T00:00:00Z',
    updated_at:    '2020-01-01T00:00:00Z',
  },
}

const MOCK_BUDGETS = [
  { id: 'bud-1', category_id: 'cat-1', amount: 600, currency: 'CAD', month: '2026-05-01',
    category: { id: 'cat-1', name: 'Groceries', color: '#10b981', parent_id: null } },
  { id: 'bud-2', category_id: 'cat-2', amount: 200, currency: 'CAD', month: '2026-05-01',
    category: { id: 'cat-2', name: 'Transport', color: '#6366f1', parent_id: null } },
]

const MOCK_CATEGORIES = [
  { id: 'cat-1', name: 'Groceries', color: '#10b981', parent_id: null, is_tax_deductible: false },
  { id: 'cat-2', name: 'Transport', color: '#6366f1', parent_id: null, is_tax_deductible: false },
]

const MOCK_ACCOUNTS = [
  { id: 'acct-1', name: 'TD Chequing', type: 'checking', currency: 'CAD', balance: 5000, is_active: true },
]

const MOCK_TXNS_GROCERIES = [
  { id: 'tx-1', occurred_at: '2026-05-10', description: 'Metro Grocery', amount: 95.40,
    account: { name: 'TD Chequing', currency: 'CAD' } },
  { id: 'tx-2', occurred_at: '2026-05-05', description: 'FreshCo', amount: 73.20,
    account: { name: 'TD Chequing', currency: 'CAD' } },
]

async function setupMocks(page) {
  // Seed auth session into localStorage BEFORE React boots
  await page.addInitScript(({ key, session, onboarded }) => {
    localStorage.setItem(key, JSON.stringify(session))
    localStorage.setItem('hacienda_onboarded', onboarded)
  }, { key: STORAGE_KEY, session: MOCK_SESSION, onboarded: 'true' })

  // Intercept all Supabase requests
  await page.route(`**/${SUPABASE_HOST}/**`, async route => {
    const url  = route.request().url()
    const path = new URL(url).pathname

    // Auth endpoints — return the mock user
    if (path.startsWith('/auth/v1/')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(MOCK_SESSION.user) })
    }

    // REST endpoints
    if (path.startsWith('/rest/v1/')) {
      if (path.includes('/accounts'))       return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ACCOUNTS) })
      if (path.includes('/categories'))     return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CATEGORIES) })
      if (path.includes('/budgets'))        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_BUDGETS) })
      if (path.includes('/exchange_rates')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ month: '2026-05-01', cop_to_cad: 0.00033 }]) })
      if (path.includes('/recurring_transactions')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      if (path.includes('/financial_obligations'))  return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      if (path.includes('/household_members'))      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })

      if (path.includes('/transactions')) {
        const searchParams = new URL(url).searchParams
        const catFilter = [...searchParams.entries()].find(([k, v]) => k === 'category_id')
        if (catFilter?.[1] === 'eq.cat-1') {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_TXNS_GROCERIES) })
        }
        // Spending totals or other category — return compact rows
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify([
            { category_id: 'cat-1', amount: 168.60, account: { currency: 'CAD' } },
            { category_id: 'cat-2', amount: 156.00, account: { currency: 'CAD' } },
          ]) })
      }

      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }

    return route.continue()
  })
}

test('Envelope cards are clickable and open a detail modal', async ({ page }) => {
  await setupMocks(page)
  await page.goto('http://localhost:5173/budgets')
  await page.waitForSelector('.envelope', { timeout: 12000 })

  // Pointer cursor means clickable
  const cursor = await page.locator('.envelope').first().evaluate(el => getComputedStyle(el).cursor)
  console.log('Envelope cursor:', cursor)
  expect(cursor).toBe('pointer')

  // Footer should show "X left" or "X over"
  const footers = await page.locator('.env-foot').allInnerTexts()
  console.log('Footers:', footers)
  expect(footers.some(f => f.includes('left') || f.includes('over'))).toBe(true)

  // Click envelope to open detail modal
  await page.locator('.envelope').first().click()
  await page.waitForSelector('[role="dialog"]', { timeout: 6000 })

  const title = await page.locator('.modal-header h2').innerText()
  console.log('Modal title:', title)
  expect(['Groceries', 'Transport']).toContain(title)

  // Stat boxes present
  await expect(page.getByText('Allocated', { exact: true })).toBeVisible()
  await expect(page.getByText('Spent',     { exact: true })).toBeVisible()

  console.log('PASS: detail modal opened with stat boxes')
})

test('⋯ button opens edit modal, not detail modal', async ({ page }) => {
  await setupMocks(page)
  await page.goto('http://localhost:5173/budgets')
  await page.waitForSelector('.envelope', { timeout: 12000 })

  await page.locator('.envelope .icon-btn').first().click()
  await page.waitForSelector('[role="dialog"]', { timeout: 6000 })

  const title = await page.locator('.modal-header h2').innerText()
  console.log('Edit modal title:', title)
  // Edit modal says "Edit budget" or translation, not a category name
  expect(title.toLowerCase()).not.toMatch(/^groceries|transport$/i)
})

test('Detail modal fetches and lists transactions', async ({ page }) => {
  await setupMocks(page)
  await page.goto('http://localhost:5173/budgets')
  await page.waitForSelector('.envelope', { timeout: 12000 })

  // Click Groceries envelope (first)
  await page.locator('.envelope').first().click()
  await page.waitForSelector('[role="dialog"]', { timeout: 6000 })

  // Wait for transactions to load (spinner gone)
  await page.waitForFunction(
    () => !document.querySelector('[role="dialog"]')?.textContent.includes('Loading'),
    { timeout: 8000 }
  )

  const dialogText = await page.locator('[role="dialog"]').innerText()
  console.log('Dialog preview:\n', dialogText.slice(0, 500))

  expect(dialogText).toMatch(/Transactions/i)
})
