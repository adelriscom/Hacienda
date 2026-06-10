/**
 * Verification: "— No category —" filter option shows only uncategorized transactions
 * Run: npx playwright test tests/verify-filter-no-category.spec.js --headed
 */
import { test, expect } from '@playwright/test'

const SUPABASE_HOST = 'msdswuzscfowsxecjqxh.supabase.co'
const STORAGE_KEY   = 'sb-msdswuzscfowsxecjqxh-auth-token'
const PORT          = 5181

const MOCK_SESSION = {
  access_token: 'mock', token_type: 'bearer',
  expires_in: 3600, expires_at: 9999999999, refresh_token: 'mock',
  user: {
    id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'test@test.com',
    email_confirmed_at: '2020-01-01T00:00:00Z', app_metadata: {}, user_metadata: {},
    created_at: '2020-01-01T00:00:00Z', updated_at: '2020-01-01T00:00:00Z',
  },
}

const NOW   = new Date()
const MONTH = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}`
const MID   = `${MONTH}-15T12:00:00Z`

const MOCK_CATS = [
  { id: 'cat-1', name: 'Salary',  color: '#22c55e', parent_id: null, is_tax_deductible: false, tax_line: null, user_id: 'u1' },
  { id: 'cat-2', name: 'Housing', color: '#6366f1', parent_id: null, is_tax_deductible: false, tax_line: null, user_id: 'u1' },
]

const MOCK_TXNS = [
  { id: 'tx-1', occurred_at: MID, description: 'PAYCHEQUE',  amount:  1000, type: 'income',  category_id: 'cat-1', person: 'Alexander', status: 'match', account_id: 'acc-1', category: { name: 'Salary',  color: '#22c55e' } },
  { id: 'tx-2', occurred_at: MID, description: 'HYDRO BILL', amount:  -120, type: 'expense', category_id: 'cat-2', person: 'Alexander', status: 'match', account_id: 'acc-1', category: { name: 'Housing', color: '#6366f1' } },
  { id: 'tx-3', occurred_at: MID, description: 'MYSTERY TXN',amount:   -55, type: 'expense', category_id: null,    person: 'Alexander', status: 'review',account_id: 'acc-1', category: null },
  { id: 'tx-4', occurred_at: MID, description: 'UNKNOWN FEE', amount:   -10, type: 'expense', category_id: null,    person: 'Alexander', status: 'review',account_id: 'acc-1', category: null },
]

async function setup(page) {
  await page.addInitScript(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify(session))
    localStorage.setItem('hacienda_onboarded', 'true')
  }, { key: STORAGE_KEY, session: MOCK_SESSION })

  await page.route(`**/${SUPABASE_HOST}/**`, async route => {
    const path = new URL(route.request().url()).pathname
    if (path.startsWith('/auth/v1/'))
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SESSION.user) })
    if (path.includes('/household_members') || path.includes('/budgets'))
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    if (path.includes('/accounts'))
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify([{ id: 'acc-1', name: 'Chequing', currency: 'CAD', is_active: true, user_id: 'u1' }]) })
    if (path.includes('/exchange_rates'))
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify([{ month: `${MONTH}-01`, cop_to_cad: 0.00032 }]) })
    if (path.includes('/categories'))
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CATS) })
    if (path.includes('/transactions'))
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_TXNS) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
}

test('"— No category —" filter shows only uncategorized transactions', async ({ page }) => {
  await setup(page)
  await page.goto(`http://localhost:${PORT}/transactions`)
  await page.waitForTimeout(1500)

  // All 4 transactions visible initially
  await expect(page.getByText('PAYCHEQUE')).toBeVisible()
  await expect(page.getByText('HYDRO BILL')).toBeVisible()
  await expect(page.getByText('MYSTERY TXN')).toBeVisible()
  await expect(page.getByText('UNKNOWN FEE')).toBeVisible()
  await page.screenshot({ path: 'test-results/filter-no-cat-all.png' })

  // Select "— No category —" from the category filter dropdown
  await page.locator('select').filter({ hasText: /— No category —/ }).first().selectOption({ value: '__none__' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'test-results/filter-no-cat-filtered.png' })

  // Only uncategorized transactions should be visible
  await expect(page.getByText('MYSTERY TXN')).toBeVisible()
  await expect(page.getByText('UNKNOWN FEE')).toBeVisible()

  // Categorized transactions should be hidden
  await expect(page.getByText('PAYCHEQUE')).not.toBeVisible()
  await expect(page.getByText('HYDRO BILL')).not.toBeVisible()

  console.log('PASS: filter shows 2 uncategorized, hides 2 categorized')
})

test('Clearing filter restores all transactions', async ({ page }) => {
  await setup(page)
  await page.goto(`http://localhost:${PORT}/transactions`)
  await page.waitForTimeout(1500)

  // Apply filter
  await page.locator('select').filter({ hasText: /— No category —/ }).first().selectOption({ value: '__none__' })
  await page.waitForTimeout(300)
  await expect(page.getByText('PAYCHEQUE')).not.toBeVisible()

  // Reset to "all categories"
  await page.locator('select').filter({ hasText: /— No category —/ }).first().selectOption({ value: '' })
  await page.waitForTimeout(300)

  await expect(page.getByText('PAYCHEQUE')).toBeVisible()
  await expect(page.getByText('MYSTERY TXN')).toBeVisible()
  console.log('PASS: clearing filter restores all 4 transactions')
})
