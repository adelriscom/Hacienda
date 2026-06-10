/**
 * Production smoke test — runs against https://hacienda.vercel.app
 * with mocked Supabase to verify the two shipped changes:
 *   1. Reports excludes transfers from KPI calculations
 *   2. Categories shows collapsible accordion
 */
import { test, expect } from '@playwright/test'

const SUPABASE_HOST = 'msdswuzscfowsxecjqxh.supabase.co'
const STORAGE_KEY   = 'sb-msdswuzscfowsxecjqxh-auth-token'
const BASE          = 'https://hacienda-ez442w42x-adelriscoms-projects.vercel.app'

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

const REPORT_TXNS = [
  { id: 'r1', occurred_at: MID, amount:  1000, type: 'income',   category_id: 'cat-1', person: 'Alexander', category: { name: 'Salary', color: '#22c55e' } },
  { id: 'r2', occurred_at: MID, amount:  -400, type: 'expense',  category_id: 'cat-2', person: 'Alexander', category: { name: 'Food',   color: '#f97316' } },
  { id: 'r3', occurred_at: MID, amount:  -500, type: 'transfer', category_id: null,     person: 'Alexander', category: null },
]

const MOCK_CATS = [
  { id: 'p1', name: 'Housing',   color: '#6366f1', parent_id: null, is_tax_deductible: false, tax_line: null, user_id: 'u1' },
  { id: 'p2', name: 'Food',      color: '#f97316', parent_id: null, is_tax_deductible: false, tax_line: null, user_id: 'u1' },
  { id: 'c1', name: 'Rent',      color: '#6366f1', parent_id: 'p1', is_tax_deductible: false, tax_line: null, user_id: 'u1' },
  { id: 'c2', name: 'Utilities', color: '#6366f1', parent_id: 'p1', is_tax_deductible: false, tax_line: null, user_id: 'u1' },
  { id: 'c3', name: 'Groceries', color: '#f97316', parent_id: 'p2', is_tax_deductible: false, tax_line: null, user_id: 'u1' },
]

async function setupMocks(page) {
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
      const body = search.includes('neq.transfer')
        ? REPORT_TXNS.filter(t => t.type !== 'transfer')
        : REPORT_TXNS
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    }
    if (path.includes('/categories')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CATS) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
}

test('PROD: Reports sends neq.transfer query and KPIs exclude transfer', async ({ page }) => {
  const capturedQueries = []
  await page.addInitScript(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify(session))
    localStorage.setItem('hacienda_onboarded', 'true')
  }, { key: STORAGE_KEY, session: MOCK_SESSION })

  await page.route(`**/${SUPABASE_HOST}/**`, async route => {
    const url  = route.request().url()
    const path = new URL(url).pathname
    const search = new URL(url).search
    if (path.startsWith('/auth/v1/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SESSION.user) })
    }
    if (path.includes('/transactions')) {
      capturedQueries.push(search)
      const body = search.includes('neq.transfer')
        ? REPORT_TXNS.filter(t => t.type !== 'transfer')
        : REPORT_TXNS
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    }
    if (path.includes('/exchange_rates')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify([{ month: `${MONTH}-01`, cop_to_cad: 0.00032 }]) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  await page.goto(`${BASE}/reports`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'test-results/prod-reports-kpis.png' })

  const hasNeqFilter = capturedQueries.some(q => q.includes('neq.transfer'))
  console.log('Queries sent:', capturedQueries.length)
  console.log('Has neq.transfer:', hasNeqFilter)
  expect(hasNeqFilter).toBe(true)

  const kpiText = await page.locator('.kpi-grid').innerText()
  console.log('KPIs:', kpiText.replace(/\n/g, ' | '))
  expect(kpiText).toContain('$1.0k')
  expect(kpiText).toContain('$400')
  expect(kpiText).not.toContain('$900')
})

test('PROD: Categories accordion renders and collapses', async ({ page }) => {
  await setupMocks(page)
  await page.goto(`${BASE}/categories`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'test-results/prod-categories-open.png' })

  await expect(page.getByText('Housing')).toBeVisible()
  await expect(page.getByText('Rent')).toBeVisible()
  await expect(page.getByText('Utilities')).toBeVisible()

  const chevrons = await page.locator('text=▾').count()
  console.log('Chevrons:', chevrons)
  expect(chevrons).toBeGreaterThanOrEqual(2)

  await page.getByText('Housing').click()
  await page.waitForTimeout(200)
  await page.screenshot({ path: 'test-results/prod-categories-collapsed.png' })

  await expect(page.getByText('Rent')).not.toBeVisible()
  await expect(page.getByText('Utilities')).not.toBeVisible()
  await expect(page.getByText('Groceries')).toBeVisible()

  console.log('PASS: accordion collapses Housing, Food untouched')
})
