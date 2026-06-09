/**
 * Verification: transfer exclusion from Reports + Categories accordion
 * Run: npx playwright test tests/verify-transfers-and-accordion.spec.js --headed
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

const NOW = new Date()
const MONTH = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}`
const MID   = `${MONTH}-15T12:00:00Z`

// --- Reports mocks ---
// income $1000, expense $400, transfer $500 (should be excluded)
const REPORT_TXNS = [
  { id: 'r1', occurred_at: MID, amount:  1000, type: 'income',   category_id: 'cat-1', person: 'Alexander', category: { name: 'Salary', color: '#22c55e' } },
  { id: 'r2', occurred_at: MID, amount:  -400, type: 'expense',  category_id: 'cat-2', person: 'Alexander', category: { name: 'Food',   color: '#f97316' } },
  { id: 'r3', occurred_at: MID, amount:  -500, type: 'transfer', category_id: null,     person: 'Alexander', category: null },
]

// --- Categories mocks ---
const MOCK_CATS = [
  { id: 'p1', name: 'Housing',    color: '#6366f1', parent_id: null, is_tax_deductible: false, tax_line: null, user_id: 'u1' },
  { id: 'p2', name: 'Food',       color: '#f97316', parent_id: null, is_tax_deductible: false, tax_line: null, user_id: 'u1' },
  { id: 'c1', name: 'Rent',       color: '#6366f1', parent_id: 'p1', is_tax_deductible: false, tax_line: null, user_id: 'u1' },
  { id: 'c2', name: 'Utilities',  color: '#6366f1', parent_id: 'p1', is_tax_deductible: false, tax_line: null, user_id: 'u1' },
  { id: 'c3', name: 'Groceries',  color: '#f97316', parent_id: 'p2', is_tax_deductible: false, tax_line: null, user_id: 'u1' },
]

async function setupMocks(page) {
  await page.addInitScript(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify(session))
    localStorage.setItem('hacienda_onboarded', 'true')
  }, { key: STORAGE_KEY, session: MOCK_SESSION })

  await page.route(`**/${SUPABASE_HOST}/**`, async route => {
    const url  = route.request().url()
    const path = new URL(url).pathname
    const search = new URL(url).search

    if (path.startsWith('/auth/v1/')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(MOCK_SESSION.user) })
    }
    if (path.includes('/household_members')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
    if (path.includes('/accounts')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
    if (path.includes('/exchange_rates')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify([{ month: `${MONTH}-01`, cop_to_cad: 0.00032 }]) })
    }
    if (path.includes('/transactions')) {
      // Reports query should have type=neq.transfer in its params — confirm it by logging
      if (search.includes('neq.transfer')) {
        // Return only non-transfer txns (DB-level filter honoured)
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify(REPORT_TXNS.filter(t => t.type !== 'transfer')) })
      }
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(REPORT_TXNS) })
    }
    if (path.includes('/categories')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(MOCK_CATS) })
    }
    if (path.includes('/budgets')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
}

// ─── Test 1: Reports sends neq=transfer query param ────────────────────────────
test('Reports query includes neq.transfer filter', async ({ page }) => {
  const capturedQueries = []
  await page.addInitScript(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify(session))
    localStorage.setItem('hacienda_onboarded', 'true')
  }, { key: STORAGE_KEY, session: MOCK_SESSION })

  await page.route(`**/${SUPABASE_HOST}/**`, async route => {
    const url    = route.request().url()
    const path   = new URL(url).pathname
    const search = new URL(url).search

    if (path.startsWith('/auth/v1/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SESSION.user) })
    }
    if (path.includes('/transactions')) {
      capturedQueries.push(search)
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(REPORT_TXNS.filter(t => t.type !== 'transfer')) })
    }
    if (path.includes('/exchange_rates')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify([{ month: `${MONTH}-01`, cop_to_cad: 0.00032 }]) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  await page.goto(`http://localhost:${PORT}/reports`)
  await page.waitForTimeout(2500)

  console.log('All /transactions queries:')
  capturedQueries.forEach((q, i) => console.log(` [${i}] ${q}`))

  const hasNeqFilter = capturedQueries.some(q => q.includes('neq.transfer'))
  expect(hasNeqFilter).toBe(true)
  console.log('PASS: DB query has type=neq.transfer filter')
})

// ─── Test 2: Reports KPIs exclude transfer amounts ─────────────────────────────
test('Reports KPIs show $1000 income and $400 expenses (transfers excluded)', async ({ page }) => {
  await setupMocks(page)
  await page.goto(`http://localhost:${PORT}/reports`)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'test-results/reports-kpis.png' })

  const kpiText = await page.locator('.kpi-grid').innerText()
  console.log('KPI grid text:', kpiText)

  // fmtK: $1000 → '$1.0k', $400 → '$400'
  // Transfer ($500 expense): if counted, income=$1,000 (ok), expenses=$900 (wrong), net=$100 (wrong)
  // Without transfer:        income=$1,000 ($1.0k), expenses=$400, net=$600
  expect(kpiText).toContain('$1.0k')   // income
  expect(kpiText).toContain('$400')    // expenses
  expect(kpiText).toContain('$600')    // net
  expect(kpiText).not.toContain('$900')   // transfer would inflate expenses
  expect(kpiText).not.toContain('$1,500') // transfer would inflate income if signed wrong

  console.log('PASS: income=$1.0k, expenses=$400, net=$600 — transfer excluded')
})

// ─── Test 3: Categories accordion renders with chevrons ────────────────────────
test('Categories accordion shows parent rows with chevrons', async ({ page }) => {
  await setupMocks(page)
  await page.goto(`http://localhost:${PORT}/categories`)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'test-results/categories-accordion-initial.png' })

  // Both parent names should be visible
  await expect(page.getByText('Housing')).toBeVisible()
  await expect(page.getByText('Food')).toBeVisible()

  // Subcategory names should also be visible (all open by default)
  await expect(page.getByText('Rent')).toBeVisible()
  await expect(page.getByText('Utilities')).toBeVisible()
  await expect(page.getByText('Groceries')).toBeVisible()

  // Chevron indicators should exist (▾)
  const chevrons = await page.locator('text=▾').count()
  console.log('Chevron count:', chevrons)
  expect(chevrons).toBeGreaterThanOrEqual(2) // Housing and Food both have children

  console.log('PASS: all categories visible, chevrons present')
})

// ─── Test 4: Clicking parent collapses its children ────────────────────────────
test('Clicking Housing header hides Rent and Utilities', async ({ page }) => {
  await setupMocks(page)
  await page.goto(`http://localhost:${PORT}/categories`)
  await page.waitForTimeout(1500)

  // Verify children visible before collapse
  await expect(page.getByText('Rent')).toBeVisible()
  await expect(page.getByText('Utilities')).toBeVisible()

  // Click the Housing row header to collapse it
  await page.getByText('Housing').click()
  await page.waitForTimeout(200)

  await page.screenshot({ path: 'test-results/categories-accordion-collapsed.png' })

  // After collapse, Rent and Utilities should not be visible
  await expect(page.getByText('Rent')).not.toBeVisible()
  await expect(page.getByText('Utilities')).not.toBeVisible()

  // But Housing (parent) should still be visible
  await expect(page.getByText('Housing')).toBeVisible()
  // Food sibling untouched
  await expect(page.getByText('Groceries')).toBeVisible()

  console.log('PASS: Housing collapsed, Rent/Utilities hidden, Food/Groceries untouched')
})

// ─── Test 5: Clicking collapsed parent re-expands it ──────────────────────────
test('Clicking collapsed Housing re-expands Rent and Utilities', async ({ page }) => {
  await setupMocks(page)
  await page.goto(`http://localhost:${PORT}/categories`)
  await page.waitForTimeout(1500)

  // Collapse Housing
  await page.getByText('Housing').click()
  await page.waitForTimeout(400)
  await expect(page.getByText('Rent')).not.toBeVisible()

  // Re-expand Housing
  await page.getByText('Housing').click()
  await page.waitForTimeout(400)

  await page.screenshot({ path: 'test-results/categories-accordion-expanded.png' })

  await expect(page.getByText('Rent')).toBeVisible()
  await expect(page.getByText('Utilities')).toBeVisible()
  console.log('PASS: Housing re-expanded, Rent and Utilities visible again')
})
