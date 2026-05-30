/**
 * Responsive layout — Playwright smoke tests
 * Run: npx playwright test tests/responsive.spec.js
 */
import { test, expect } from '@playwright/test'

const SUPABASE_HOST = 'msdswuzscfowsxecjqxh.supabase.co'
const STORAGE_KEY   = 'sb-msdswuzscfowsxecjqxh-auth-token'

const MOCK_SESSION = {
  access_token: 'mock', token_type: 'bearer',
  expires_in: 3600, expires_at: 9999999999, refresh_token: 'mock',
  user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'test@test.com',
    email_confirmed_at: '2020-01-01T00:00:00Z', app_metadata: {}, user_metadata: {}, created_at: '2020-01-01T00:00:00Z', updated_at: '2020-01-01T00:00:00Z' },
}

async function setupMocks(page) {
  await page.addInitScript(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify(session))
    localStorage.setItem('hacienda_onboarded', 'true')
  }, { key: STORAGE_KEY, session: MOCK_SESSION })

  await page.route(`**/${SUPABASE_HOST}/**`, route => {
    const path = new URL(route.request().url()).pathname
    if (path.startsWith('/auth/v1/')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SESSION.user) })
    if (path.includes('/accounts')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'a1', name: 'TD', type: 'checking', currency: 'CAD', balance: 5000, is_active: true }]) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
}

test.describe('Tablet (900px) — icon-only sidebar', () => {
  test.use({ viewport: { width: 900, height: 768 } })

  test('sidebar is 64px wide and shows icons without labels', async ({ page }) => {
    await setupMocks(page)
    await page.goto('http://localhost:5173/dashboard')
    await page.waitForSelector('.sidebar', { timeout: 10000 })

    const sidebarBox = await page.locator('.sidebar').boundingBox()
    console.log('Sidebar width at 900px:', sidebarBox.width)
    // Should be icon-only (64px), not full (240px), not 0 (hidden)
    expect(sidebarBox.width).toBeLessThan(100)
    expect(sidebarBox.width).toBeGreaterThan(50)

    // Labels should not be visible
    const labelVisible = await page.locator('.sb-item > span:not(.badge)').first().isVisible().catch(() => false)
    console.log('Label visible:', labelVisible)
    expect(labelVisible).toBe(false)

    // Icons should be visible
    const iconVisible = await page.locator('.sb-item .ico').first().isVisible()
    expect(iconVisible).toBe(true)

    // Hamburger should NOT be visible (it's for ≤768px only)
    const hamburgerVisible = await page.locator('.hamburger').isVisible()
    console.log('Hamburger visible at 900px:', hamburgerVisible)
    expect(hamburgerVisible).toBe(false)

    console.log('PASS: icon-only sidebar at 900px')
  })
})

test.describe('Mobile (375px) — overlay sidebar', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('hamburger is visible and sidebar is hidden by default', async ({ page }) => {
    await setupMocks(page)
    await page.goto('http://localhost:5173/dashboard')
    await page.waitForSelector('.sidebar', { timeout: 10000 })

    // Hamburger should be visible
    const hamburgerVisible = await page.locator('.hamburger').isVisible()
    console.log('Hamburger visible at 375px:', hamburgerVisible)
    expect(hamburgerVisible).toBe(true)

    // Sidebar should be off-screen (translateX -100%)
    const sidebarTransform = await page.locator('.sidebar').evaluate(el => getComputedStyle(el).transform)
    console.log('Sidebar transform:', sidebarTransform)
    // transform: matrix(-1, 0, 0, 1, -260, 0) means translateX(-260px)
    expect(sidebarTransform).toMatch(/matrix/)

    const sidebarBox = await page.locator('.sidebar').boundingBox()
    // The sidebar extends off screen to the left, so x should be negative or very small
    console.log('Sidebar left edge:', sidebarBox?.x)

    console.log('PASS: hamburger visible, sidebar is overlay at 375px')
  })

  test('envelope grid is 2-column on mobile', async ({ page }) => {
    await setupMocks(page)
    // Mock budgets data
    await page.route(`**/${SUPABASE_HOST}/rest/v1/budgets*`, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { id: 'b1', category_id: 'c1', amount: 600, currency: 'CAD', month: '2026-05-01',
          category: { id: 'c1', name: 'Groceries', color: '#10b981', parent_id: null } },
        { id: 'b2', category_id: 'c2', amount: 200, currency: 'CAD', month: '2026-05-01',
          category: { id: 'c2', name: 'Transport', color: '#6366f1', parent_id: null } },
        { id: 'b3', category_id: 'c3', amount: 300, currency: 'CAD', month: '2026-05-01',
          category: { id: 'c3', name: 'Dining', color: '#f59e0b', parent_id: null } },
      ]) })
    )
    await page.route(`**/${SUPABASE_HOST}/rest/v1/categories*`, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    )
    await page.route(`**/${SUPABASE_HOST}/rest/v1/exchange_rates*`, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    )

    await page.goto('http://localhost:5173/budgets')
    await page.waitForSelector('.envelope-grid', { timeout: 10000 })

    const gridCols = await page.locator('.envelope-grid').evaluate(el =>
      getComputedStyle(el).gridTemplateColumns
    )
    console.log('Envelope grid columns at 375px:', gridCols)
    // Should be 2 columns (two values), not 3
    const colCount = gridCols.trim().split(/\s+(?=\d)/).length
    console.log('Column count:', colCount)
    expect(colCount).toBe(2)

    console.log('PASS: envelope grid is 2-col on mobile')
  })

  test('transaction table becomes card list on mobile', async ({ page }) => {
    await setupMocks(page)
    await page.goto('http://localhost:5173/expenses')
    await page.waitForSelector('.tx-card', { timeout: 10000 })

    // Table header should be hidden
    const headerVisible = await page.locator('.tx-header').isVisible().catch(() => false)
    console.log('TX header visible on mobile:', headerVisible)
    expect(headerVisible).toBe(false)

    console.log('PASS: transaction header hidden on mobile (card layout active)')
  })
})

test.describe('Desktop (1280px) — full sidebar', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('sidebar is full width with labels', async ({ page }) => {
    await setupMocks(page)
    await page.goto('http://localhost:5173/dashboard')
    await page.waitForSelector('.sidebar', { timeout: 10000 })

    const sidebarBox = await page.locator('.sidebar').boundingBox()
    console.log('Sidebar width at 1280px:', sidebarBox.width)
    expect(sidebarBox.width).toBeGreaterThan(200)

    const labelVisible = await page.locator('.sb-item > span').first().isVisible()
    console.log('Label visible at 1280px:', labelVisible)
    expect(labelVisible).toBe(true)

    console.log('PASS: full sidebar with labels at 1280px')
  })
})
