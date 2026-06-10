/**
 * Verification: bulk "— No category —" clears category_id (sends null)
 * Run: npx playwright test tests/verify-bulk-no-category.spec.js --headed
 */
import { test, expect } from '@playwright/test'

const SUPABASE_HOST = 'msdswuzscfowsxecjqxh.supabase.co'
const STORAGE_KEY   = 'sb-msdswuzscfowsxecjqxh-auth-token'
const PORT          = 5179

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

// Two transactions that already have a category assigned
const MOCK_TXNS = [
  { id: 'tx-1', occurred_at: MID, description: 'PAYCHEQUE', amount: 1000, type: 'income',  category_id: 'cat-1', person: 'Alexander', status: 'match',  account_id: 'acc-1', category: { name: 'Salary',  color: '#22c55e' } },
  { id: 'tx-2', occurred_at: MID, description: 'HYDRO BILL',  amount: -120, type: 'expense', category_id: 'cat-2', person: 'Alexander', status: 'match',  account_id: 'acc-1', category: { name: 'Housing', color: '#6366f1' } },
]

const MOCK_ACCTS = [
  { id: 'acc-1', name: 'Chequing', currency: 'CAD', is_active: true, user_id: 'u1' },
]

test('Bulk "— No category —" sends PATCH with category_id: null', async ({ page }) => {
  const patchBodies = []

  await page.addInitScript(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify(session))
    localStorage.setItem('hacienda_onboarded', 'true')
  }, { key: STORAGE_KEY, session: MOCK_SESSION })

  await page.route(`**/${SUPABASE_HOST}/**`, async route => {
    const req    = route.request()
    const url    = req.url()
    const path   = new URL(url).pathname
    const method = req.method()

    if (path.startsWith('/auth/v1/')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(MOCK_SESSION.user) })
    }
    if (path.includes('/household_members')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
    if (path.includes('/accounts')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(MOCK_ACCTS) })
    }
    if (path.includes('/exchange_rates')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify([{ month: `${MONTH}-01`, cop_to_cad: 0.00032 }]) })
    }
    if (path.includes('/categories')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(MOCK_CATS) })
    }
    if (path.includes('/transactions')) {
      if (method === 'PATCH') {
        const body = req.postDataJSON()
        patchBodies.push(body)
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify([]) })
      }
      if (method === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify(MOCK_TXNS) })
      }
    }
    if (path.includes('/budgets')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  await page.goto(`http://localhost:${PORT}/transactions`)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'test-results/bulk-no-cat-initial.png' })

  // Select the first transaction via its row checkbox
  const checkboxes = page.locator('.tx-card input[type="checkbox"]')
  await checkboxes.first().check()
  await page.waitForTimeout(300)

  // The bulk bar should now be visible
  await expect(page.getByText(/selected/)).toBeVisible()
  await page.screenshot({ path: 'test-results/bulk-no-cat-selected.png' })

  // Pick "— No category —" from the Category dropdown in the bulk bar
  // The bulk bar has 4 selects: Account, Category, Person, Status — Category is index 1
  const bulkSelects = page.locator('select').filter({ hasText: /— No category —/ })
  await bulkSelects.first().selectOption({ value: '__none__' })
  await page.waitForTimeout(200)

  // Verify the selected value shows the sentinel
  await expect(bulkSelects.first()).toHaveValue('__none__')

  // Click Apply
  await page.getByRole('button', { name: /Apply to/ }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-results/bulk-no-cat-applied.png' })

  console.log('PATCH bodies received:', JSON.stringify(patchBodies))
  expect(patchBodies.length).toBeGreaterThan(0)

  // Every patch must have category_id explicitly set to null
  const allNull = patchBodies.every(b => Object.prototype.hasOwnProperty.call(b, 'category_id') && b.category_id === null)
  console.log('All patches have category_id: null →', allNull)
  expect(allNull).toBe(true)

  // Bulk bar should have cleared after apply (no "N selected" text)
  await expect(page.getByText(/selected/)).not.toBeVisible()
  console.log('PASS: bulk "— No category —" sends PATCH with category_id: null and clears selection')
})
