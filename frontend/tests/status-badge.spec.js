/**
 * Status badge inline toggle — Playwright tests
 *
 * Run with:
 *   PW_PASSWORD=yourpassword npx playwright test tests/status-badge.spec.js
 *
 * Or set PW_PASSWORD in frontend/.env.test and run:
 *   npx playwright test tests/status-badge.spec.js
 */
import { test, expect, request } from '@playwright/test'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })
dotenv.config({ path: path.join(__dirname, '..', '.env.test'), override: true })

const SUPABASE_URL  = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY  = process.env.VITE_SUPABASE_ANON_KEY
const EMAIL         = process.env.PW_EMAIL    || 'khovac@gmail.com'
const PASSWORD      = process.env.PW_PASSWORD || ''

// Inject Supabase session via REST API so we bypass the UI login form
async function injectSession(page) {
  if (!PASSWORD) throw new Error('Set PW_PASSWORD env var to run these tests')

  // Get a session token from Supabase
  const ctx = await request.newContext()
  const res = await ctx.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    data:    { email: EMAIL, password: PASSWORD },
  })
  const session = await res.json()
  if (!session.access_token) {
    throw new Error('Auth failed: ' + JSON.stringify(session))
  }

  // Navigate to the app first (creates the window.localStorage context)
  await page.goto('/')

  // Inject the token into localStorage exactly as Supabase expects
  const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1]
  const storageKey = `sb-${projectRef}-auth-token`
  await page.evaluate(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify(session))
  }, { key: storageKey, session })

  // Reload so the app picks up the auth state
  await page.reload()
  await page.waitForSelector('.sidebar', { timeout: 15000 })
}

test.describe('Status badge inline toggle', () => {
  test.beforeEach(async ({ page }) => {
    await injectSession(page)
  })

  test('Cleared badge is clickable and shows pointer cursor', async ({ page }) => {
    await page.goto('/expenses')
    await page.waitForSelector('.tx-row', { timeout: 10000 })

    const badge = page.locator('.tx-row .chip.tag-ok').first()
    await expect(badge).toBeVisible()

    const cursor = await badge.evaluate(el => getComputedStyle(el).cursor)
    console.log('Cursor on Cleared badge:', cursor)
    expect(cursor).toBe('pointer')
  })

  test('Clicking Cleared toggles status to To review', async ({ page }) => {
    await page.goto('/expenses')
    await page.waitForSelector('.tx-row', { timeout: 10000 })

    // Record count of "To review" badges before click
    const warnBefore = await page.locator('.chip.tag-warn').count()
    console.log('Warn badges before:', warnBefore)

    // Click the first "Cleared" badge
    const clearedBadge = page.locator('.chip.tag-ok').first()
    await clearedBadge.click()

    // Wait for the Supabase round-trip + re-render (reload fetches all txns)
    await page.waitForTimeout(3000)

    const warnAfter = await page.locator('.chip.tag-warn').count()
    console.log('Warn badges after:', warnAfter)

    // There should be at least one more To review badge than before
    expect(warnAfter).toBeGreaterThan(warnBefore)
  })

  test('Clicking To review toggles status back to Cleared', async ({ page }) => {
    await page.goto('/expenses')
    await page.waitForSelector('.tx-row', { timeout: 10000 })

    // First ensure we have a To review badge to click — create one if needed
    const warnBadges = await page.locator('.chip.tag-warn').count()
    if (warnBadges === 0) {
      // Toggle the first Cleared badge to review
      await page.locator('.chip.tag-ok').first().click()
      await page.waitForTimeout(3000)
    }

    const clearedBefore = await page.locator('.chip.tag-ok').count()
    console.log('Cleared badges before toggle-back:', clearedBefore)

    // Now click the To review badge to toggle it back
    await page.locator('.chip.tag-warn').first().click()
    await page.waitForTimeout(3000)

    const clearedAfter = await page.locator('.chip.tag-ok').count()
    console.log('Cleared badges after toggle-back:', clearedAfter)
    expect(clearedAfter).toBeGreaterThan(clearedBefore)
  })

  test('Row selection is not triggered when clicking a status badge', async ({ page }) => {
    await page.goto('/expenses')
    await page.waitForSelector('.tx-row', { timeout: 10000 })

    // Click the first status badge
    await page.locator('.chip.tag-ok').first().click()
    await page.waitForTimeout(500)

    // The row should NOT be in selected state (no checkbox checked via badge click)
    const selectedRows = await page.locator('.tx-row-selected').count()
    console.log('Selected rows after badge click:', selectedRows)
    expect(selectedRows).toBe(0)
  })
})
