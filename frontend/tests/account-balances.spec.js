/**
 * Derived account balances — the balance is an anchor plus what happened.
 *
 * `accounts.balance` used to be typed by hand and never updated, so net worth,
 * a debt's "% paid off" and a goal's current saved all drifted the moment a
 * statement was imported.
 *
 *   npx playwright test tests/account-balances.spec.js
 */
import { test } from '@playwright/test'
import { expect, openApp, ACCOUNTS } from './fixtures/hacienda-stub.js'

const main = (page) => page.locator('.main')

async function openAccounts(page, viewMode = 'family') {
  await openApp(page, '/accounts', viewMode)
  // HouseholdProvider resolves asynchronously, so the first render is always
  // personal-scoped. Bancolombia is Marcela's, so its presence means Family has
  // settled — waiting on a bare element count would race that.
  await expect(main(page)).toContainText(
    viewMode === 'family' ? 'Bancolombia' : 'Scotia Chequing', { timeout: 20000 })
}

// The fixture household: Scotia Chequing anchored at 3,200 with CAD movement,
// Bancolombia anchored at 1,200,000 with COP movement, Scotia Visa at −900.
const CHEQUING = ACCOUNTS.find(a => a.name === 'Scotia Chequing')

test.describe('Account balances · derivation', () => {
  test('a balance is shown at all, which it previously was not', async ({ page }) => {
    await openAccounts(page)
    const body = await main(page).innerText()
    expect(body).toContain('Scotia Chequing')
    expect(body).toMatch(/\$[\d,]+\.\d{2}/)
  })

  test('the balance is the anchor plus the transactions, not the stored figure', async ({ page }) => {
    await openAccounts(page)
    const body = await main(page).innerText()

    // Anchor 3,200. The stored column still says 4,750 — if that were being
    // rendered, the derived total below would never appear.
    expect(CHEQUING.opening_balance).toBe(3200)
    expect(CHEQUING.balance).toBe(4750)
    expect(body).not.toContain('$4,750.00')
    expect(body).toMatch(/\$5,770\.00/)      // 3,200 + CAD movement
  })

  test('the balance says where it came from', async ({ page }) => {
    await openAccounts(page)
    const body = await main(page).innerText()
    expect(body).toMatch(/from \d+ transactions/)
    expect(body).toMatch(/since anchor/)
  })

  test('a negative balance puts the sign before the currency symbol', async ({ page }) => {
    await openAccounts(page)
    const body = await main(page).innerText()
    // Scotia Visa is a credit card anchored at −900.
    expect(body).toContain('−$900.00')
    expect(body).not.toContain('$-900.00')
  })

  test('net worth adds the derived balances, not the stale ones', async ({ page }) => {
    await openAccounts(page)
    const body = await main(page).innerText()
    // 5,770 chequing + (−900) card = 4,870.
    expect(body).toContain('$4,870.00')
  })

  test('COP accounts keep their own formatting', async ({ page }) => {
    await openAccounts(page)
    const body = await main(page).innerText()
    expect(body).toMatch(/\$ [\d.]+/)        // es-CO grouping, no decimals
    expect(body).toContain('Bancolombia')
  })
})

test.describe('Account balances · re-anchoring', () => {
  test('stating a balance moves the anchor, not a transaction', async ({ page }) => {
    const writes = []
    await openApp(page, '/accounts', 'family', writes)
    await expect(main(page)).toContainText('Bancolombia', { timeout: 20000 })

    // Open the first account's editor.
    await page.getByTitle(/Edit/i).first().click()
    const field = page.locator('input[type="number"]').first()
    await expect(field).toBeVisible()
    await field.fill('5000')
    await page.getByRole('button', { name: 'Save changes' }).click()

    // The anchoring write is the second of two; wait for it, not just any write.
    const anchorWrites = () => writes.filter(
      w => w.table === 'accounts' && w.method === 'PATCH' && w.body && 'opening_balance' in w.body)
    await expect.poll(anchorWrites, { timeout: 10000 }).toHaveLength(1)

    // Stated 5,000 against 2,570 of movement already counted → anchor 2,430.
    const { body } = anchorWrites()[0]
    expect(body.opening_balance).toBe(2430)
    expect(body.balance).toBe(5000)

    // Nothing was written to transactions.
    expect(writes.filter(w => w.table === 'transactions' && w.method !== 'GET'))
      .toHaveLength(0)
  })
})
