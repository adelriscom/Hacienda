/**
 * Linked transfer pairs — Playwright smoke test (mocked Supabase)
 * Run: npx playwright test tests/transfer-pairs.spec.js
 */
import { test, expect } from '@playwright/test'

const SUPABASE_HOST = 'msdswuzscfowsxecjqxh.supabase.co'
const STORAGE_KEY   = 'sb-msdswuzscfowsxecjqxh-auth-token'

const MOCK_SESSION = {
  access_token: 'mock', token_type: 'bearer',
  expires_in: 3600, expires_at: 9999999999, refresh_token: 'mock',
  user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'test@test.com',
    email_confirmed_at: '2020-01-01T00:00:00Z', app_metadata: {}, user_metadata: {},
    created_at: '2020-01-01T00:00:00Z', updated_at: '2020-01-01T00:00:00Z' },
}

const GROUP_ID = 'aaaaaaaa-0000-0000-0000-000000000001'

const MOCK_ACCOUNTS = [
  { id: 'acct-1', name: 'TD Chequing',     type: 'checking', currency: 'CAD', balance: 5000, is_active: true },
  { id: 'acct-2', name: 'Scotia Savings',  type: 'savings',  currency: 'CAD', balance: 2000, is_active: true },
]

// Two linked transfer legs
const MOCK_TXNS = [
  { id: 'tx-1', occurred_at: '2026-05-10T12:00:00Z', description: 'Transfer to Savings',
    amount: -500, type: 'transfer', status: 'match', person: 'Alexander',
    account_id: 'acct-1', account: { name: 'TD Chequing' },
    category_id: null, category: null, is_recurring: false, notes: null,
    transfer_group_id: GROUP_ID, user_id: 'u1' },
  { id: 'tx-2', occurred_at: '2026-05-10T12:00:00Z', description: 'Transfer to Savings',
    amount: 500, type: 'transfer', status: 'match', person: 'Alexander',
    account_id: 'acct-2', account: { name: 'Scotia Savings' },
    category_id: null, category: null, is_recurring: false, notes: null,
    transfer_group_id: GROUP_ID, user_id: 'u1' },
  // Unlinked transfer (imported, no group)
  { id: 'tx-3', occurred_at: '2026-05-08T12:00:00Z', description: 'Wire transfer',
    amount: -200, type: 'transfer', status: 'match', person: 'Alexander',
    account_id: 'acct-1', account: { name: 'TD Chequing' },
    category_id: null, category: null, is_recurring: false, notes: null,
    transfer_group_id: null, user_id: 'u1' },
]

async function setupMocks(page, { interceptInsert } = {}) {
  await page.addInitScript(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify(session))
    localStorage.setItem('hacienda_onboarded', 'true')
  }, { key: STORAGE_KEY, session: MOCK_SESSION })

  await page.route(`**/${SUPABASE_HOST}/**`, async route => {
    const url  = route.request().url()
    const path = new URL(url).pathname
    const method = route.request().method()

    if (path.startsWith('/auth/v1/')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(MOCK_SESSION.user) })
    }

    if (path.includes('/accounts')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(MOCK_ACCOUNTS) })
    }

    if (path.includes('/transactions')) {
      if (method === 'POST' && interceptInsert) {
        const body = route.request().postDataJSON()
        interceptInsert(body)
        return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
      }
      if (method === 'DELETE') {
        return route.fulfill({ status: 204, body: '' })
      }
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(MOCK_TXNS) })
    }

    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
}

test('Transfer rows: linked shows ⇄ AccountName, unlinked shows ⇄ Transfer', async ({ page }) => {
  await setupMocks(page)
  await page.goto('http://localhost:5173/expenses')
  // Navigate to transactions (all types including transfers)
  await page.goto('http://localhost:5173/transactions')
  await page.waitForSelector('.tx-row', { timeout: 10000 })

  const chips = await page.locator('.chip.tag-transfer').allInnerTexts()
  console.log('Transfer chips:', chips)

  // Linked transfers show the partner account name
  const hasLinkedTD     = chips.some(c => c.includes('TD Chequing'))
  const hasLinkedScotia = chips.some(c => c.includes('Scotia Savings'))
  // Unlinked transfer shows generic "Transfer"
  const hasUnlinked     = chips.some(c => c.includes('Transfer') && !c.includes('Chequing') && !c.includes('Savings'))

  console.log('Has linked (TD Chequing):', hasLinkedTD)
  console.log('Has linked (Scotia Savings):', hasLinkedScotia)
  console.log('Has unlinked transfer:', hasUnlinked)

  expect(hasLinkedTD).toBe(true)
  expect(hasLinkedScotia).toBe(true)
  expect(hasUnlinked).toBe(true)

  console.log('PASS: linked transfers show partner account, unlinked shows generic label')
})

test('New transfer modal shows "To account" picker', async ({ page }) => {
  await setupMocks(page)
  await page.goto('http://localhost:5173/transactions')
  await page.waitForSelector('.topbar', { timeout: 10000 })

  // Open new transaction modal
  await page.locator('.btn.primary.sm').last().click()
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 })

  // Switch to Transfer type (scope to dialog to avoid the filter-tab "Transfers")
  await page.locator('[role="dialog"] button[type="button"]').filter({ hasText: /^Transfer$/ }).click()

  // "To account" label should appear
  await expect(page.getByText('To account', { exact: false })).toBeVisible()
  console.log('"To account" field visible after selecting Transfer type')

  // "From account" label should appear
  await expect(page.getByText('From account')).toBeVisible()
  console.log('"From account" label shown for transfers')

  console.log('PASS: transfer modal shows From/To account pickers')
})

test('Saving a paired transfer calls insert with two linked rows', async ({ page }) => {
  const insertedRows = []
  await setupMocks(page, {
    interceptInsert: (body) => {
      if (Array.isArray(body)) insertedRows.push(...body)
      else insertedRows.push(body)
    }
  })
  await page.goto('http://localhost:5173/transactions')
  await page.waitForSelector('.topbar', { timeout: 10000 })

  // Open new transaction modal
  await page.locator('.btn.primary.sm').last().click()
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 })

  // Switch to Transfer (scope to dialog to avoid filter-tab "Transfers")
  await page.locator('[role="dialog"] button[type="button"]').filter({ hasText: /^Transfer$/ }).click()

  // Fill in the form
  await page.locator('input[name="description"]').fill('Move to savings')
  await page.locator('input[name="amount"]').fill('300')

  // Select "From account"
  await page.locator('select[name="account_id"]').selectOption('acct-1')

  // Select "To account"
  await page.locator('#tx-to-account').selectOption('acct-2')

  // Submit
  await page.locator('button[type="submit"]').click()

  // Wait for the insert call
  await page.waitForTimeout(1500)

  console.log('Inserted rows:', JSON.stringify(insertedRows, null, 2))

  // Should have inserted 2 rows
  expect(insertedRows.length).toBe(2)

  // Both should have the same transfer_group_id
  const [r1, r2] = insertedRows
  expect(r1.transfer_group_id).toBeTruthy()
  expect(r1.transfer_group_id).toBe(r2.transfer_group_id)

  // Outgoing: negative amount from TD Chequing
  const outgoing = insertedRows.find(r => r.amount < 0)
  const incoming = insertedRows.find(r => r.amount > 0)

  expect(outgoing).toBeTruthy()
  expect(incoming).toBeTruthy()
  expect(outgoing.account_id).toBe('acct-1')
  expect(incoming.account_id).toBe('acct-2')
  expect(Math.abs(outgoing.amount)).toBe(Math.abs(incoming.amount))
  expect(outgoing.type).toBe('transfer')
  expect(incoming.type).toBe('transfer')

  console.log(`PASS: two rows inserted, group=${r1.transfer_group_id.slice(0,8)}…`)
  console.log(`  Outgoing: ${outgoing.amount} from acct-1`)
  console.log(`  Incoming: ${incoming.amount} to acct-2`)
})

test('Editing a paired transfer shows partner info and "Delete both legs" confirm', async ({ page }) => {
  await setupMocks(page)
  await page.goto('http://localhost:5173/transactions')
  await page.waitForSelector('.tx-row', { timeout: 10000 })

  // Click the ⇄ chip on the first linked transfer (tx-1: outgoing leg)
  const chip = page.locator('.chip.tag-transfer').filter({ hasText: 'Scotia Savings' }).first()
  await chip.click()
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 })

  const dialogText = await page.locator('[role="dialog"]').innerText()
  console.log('Dialog text snippet:', dialogText.slice(0, 300))

  // Should mention the partner account
  expect(dialogText).toMatch(/Paired with|Scotia Savings|TD Chequing/)

  // Click delete to trigger confirm
  await page.locator('button', { hasText: /delete/i }).first().click()

  const confirmText = await page.locator('[role="dialog"]').innerText()
  console.log('After delete click:', confirmText.slice(0, 200))
  expect(confirmText).toMatch(/both legs/i)

  console.log('PASS: paired transfer edit shows partner + "Delete both legs?" confirm')
})
