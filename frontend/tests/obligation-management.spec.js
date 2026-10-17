/**
 * Managing obligations — the Recurring screen as a rule manager.
 *
 * Phase 4: the screen creates, edits, pauses and deletes scheduled_payments
 * rows rather than transactions, a leftover inferred series can be adopted into
 * one, and the transaction modal links a payment to the obligation it settles.
 *
 *   npx playwright test tests/obligation-management.spec.js
 */
import { test } from '@playwright/test'
import { expect, openApp, ALEX, NEW_RULE_ID } from './fixtures/hacienda-stub.js'

const CAD = { name: 'Scotia Chequing', currency: 'CAD' }

const mkRule = (o) => ({
  id: o.id, user_id: o.user_id ?? ALEX, name: o.name,
  amount: o.amount, type: o.type ?? 'expense',
  frequency: o.frequency ?? 'monthly',
  anchor_date: o.anchor_date ?? '2026-10-10', ends_on: o.ends_on ?? null,
  is_active: o.is_active ?? true, is_variable: o.is_variable ?? false,
  person: o.person ?? 'Alexander', account_id: null, category_id: null,
  account: CAD, category: null,
})

const rows     = (page) => page.locator('.rec-row')
const ruleRow  = (page, name) => rows(page).filter({
  has: page.locator('.rec-name', { hasText: new RegExp(`^${name}$`) }) })
const writesTo = (writes, table, method) =>
  writes.filter(w => w.table === table && w.method === method)

async function openRecurring(page, { rules = [], writes = [], viewMode = 'family' } = {}) {
  await openApp(page, '/recurring', viewMode, writes, rules)
  await page.waitForSelector('.rec-row', { timeout: 20000 })
}

test.describe('Obligations · creating', () => {
  test('the screen offers to add an obligation, not a transaction', async ({ page }) => {
    await openRecurring(page)
    await page.getByRole('button', { name: /Add obligation/i }).click()

    const modal = page.locator('.modal-card, [role="dialog"]').first()
    await expect(modal).toContainText('New obligation')
    // Fields a rule owns and a transaction does not.
    await expect(page.locator('#ob-frequency')).toBeVisible()
    await expect(page.locator('#ob-anchor')).toBeVisible()
    await expect(page.locator('#ob-name')).toBeVisible()
  })

  test('creating writes a rule, never a transaction', async ({ page }) => {
    const writes = []
    await openRecurring(page, { writes })

    await page.getByRole('button', { name: /Add obligation/i }).click()
    await page.locator('#ob-name').fill('Property Tax')
    await page.locator('#ob-amount').fill('420')
    await page.locator('#ob-frequency').selectOption('quarterly')
    await page.locator('#ob-anchor').fill('2026-11-22')
    await page.getByRole('button', { name: 'Create obligation' }).click()

    await expect.poll(() => writesTo(writes, 'scheduled_payments', 'POST').length).toBe(1)
    const [body] = writesTo(writes, 'scheduled_payments', 'POST')[0].body
    expect(body.name).toBe('Property Tax')
    expect(body.amount).toBe(420)
    expect(body.type).toBe('expense')
    expect(body.frequency).toBe('quarterly')
    expect(body.anchor_date).toBe('2026-11-22')
    expect(body.is_active).toBe(true)
    // The whole point: no transaction is created for an obligation.
    expect(writesTo(writes, 'transactions', 'POST')).toHaveLength(0)
  })

  test('the amount is stored as a magnitude and direction comes from type', async ({ page }) => {
    const writes = []
    await openRecurring(page, { writes })

    await page.getByRole('button', { name: /Add obligation/i }).click()
    await page.locator('#ob-name').fill('Dividend')
    await page.locator('#ob-amount').fill('250')
    await page.locator('#ob-type').selectOption('income')
    await page.getByRole('button', { name: 'Create obligation' }).click()

    await expect.poll(() => writesTo(writes, 'scheduled_payments', 'POST').length).toBe(1)
    const [body] = writesTo(writes, 'scheduled_payments', 'POST')[0].body
    expect(body.amount).toBe(250)      // positive, not negated
    expect(body.type).toBe('income')
  })

  test('it refuses to save an obligation that makes no sense', async ({ page }) => {
    const writes = []
    await openRecurring(page, { writes })
    await page.getByRole('button', { name: /Add obligation/i }).click()

    // No name.
    await page.locator('#ob-amount').fill('100')
    await page.getByRole('button', { name: 'Create obligation' }).click()
    await expect(page.getByText('Give the obligation a name.')).toBeVisible()

    // Name, but no amount.
    await page.locator('#ob-name').fill('Something')
    await page.locator('#ob-amount').fill('0')
    await page.getByRole('button', { name: 'Create obligation' }).click()
    await expect(page.getByText('Enter an amount greater than zero.')).toBeVisible()

    // Ends before it starts.
    await page.locator('#ob-amount').fill('100')
    await page.locator('#ob-anchor').fill('2026-11-10')
    await page.locator('#ob-ends').fill('2026-10-10')
    await page.getByRole('button', { name: 'Create obligation' }).click()
    await expect(page.getByText('The end date cannot be before the first due date.')).toBeVisible()

    expect(writesTo(writes, 'scheduled_payments', 'POST')).toHaveLength(0)
  })
})

test.describe('Obligations · managing', () => {
  const MORTGAGE = mkRule({ id: 'rule-1', name: 'Mortgage Rule', amount: 2000 })

  test('a declared rule opens the obligation editor, prefilled', async ({ page }) => {
    await openRecurring(page, { rules: [MORTGAGE] })

    await ruleRow(page, 'Mortgage Rule').getByTitle('Edit obligation').click()
    await expect(page.locator('#ob-name')).toHaveValue('Mortgage Rule')
    await expect(page.locator('#ob-amount')).toHaveValue('2000')
    await expect(page.locator('#ob-anchor')).toHaveValue('2026-10-10')
  })

  test('editing patches only the rule', async ({ page }) => {
    const writes = []
    await openRecurring(page, { rules: [MORTGAGE], writes })

    await ruleRow(page, 'Mortgage Rule').getByTitle('Edit obligation').click()
    await page.locator('#ob-amount').fill('2100')
    await page.getByRole('button', { name: 'Save changes' }).click()

    await expect.poll(() => writesTo(writes, 'scheduled_payments', 'PATCH').length).toBe(1)
    const patch = writesTo(writes, 'scheduled_payments', 'PATCH')[0]
    expect(patch.body.amount).toBe(2100)
    expect(patch.query).toContain('rule-1')
    expect(writesTo(writes, 'transactions', 'PATCH')).toHaveLength(0)
  })

  test('pausing flips is_active and nothing else', async ({ page }) => {
    const writes = []
    await openRecurring(page, { rules: [MORTGAGE], writes })

    await ruleRow(page, 'Mortgage Rule').getByTitle('Pause').click()
    await expect.poll(() => writesTo(writes, 'scheduled_payments', 'PATCH').length).toBe(1)
    const patch = writesTo(writes, 'scheduled_payments', 'PATCH')[0]
    expect(patch.body).toEqual({ is_active: false })
  })

  test('a paused rule says so and offers to resume', async ({ page }) => {
    const writes = []
    await openRecurring(page, {
      rules: [mkRule({ id: 'rule-2', name: 'Old Gym Rule', amount: 45, is_active: false })],
      writes,
    })

    const row = ruleRow(page, 'Old Gym Rule')
    await expect(row).toContainText('Paused')
    await row.getByTitle('Resume').click()
    await expect.poll(() => writesTo(writes, 'scheduled_payments', 'PATCH').length).toBe(1)
    expect(writesTo(writes, 'scheduled_payments', 'PATCH')[0].body).toEqual({ is_active: true })
  })

  test('deleting a rule is confirmed and leaves transactions alone', async ({ page }) => {
    const writes = []
    await openRecurring(page, { rules: [MORTGAGE], writes })

    const row = ruleRow(page, 'Mortgage Rule')
    await row.getByTitle('Delete').click()
    await expect(writesTo(writes, 'scheduled_payments', 'DELETE')).toHaveLength(0)

    await row.getByRole('button', { name: 'Confirm delete' }).click()
    await expect.poll(() => writesTo(writes, 'scheduled_payments', 'DELETE').length).toBe(1)
    expect(writesTo(writes, 'scheduled_payments', 'DELETE')[0].query).toContain('rule-1')
    // The link is cleared by ON DELETE SET NULL, not by the client.
    expect(writesTo(writes, 'transactions', 'DELETE')).toHaveLength(0)
  })
})

test.describe('Obligations · adopting a leftover series', () => {
  test('an inferred series is marked as detected and can be adopted', async ({ page }) => {
    const writes = []
    await openRecurring(page, { writes })

    const row = ruleRow(page, 'Mortgage')     // from the fixture household
    await expect(row).toContainText('Detected')
    // The full explanation is the badge's tooltip, so it can't crowd the name.
    await expect(row.getByTitle('Detected from your transactions')).toBeVisible()
    await row.getByRole('button', { name: 'Make it an obligation' }).click()

    // One rule created…
    await expect.poll(() => writesTo(writes, 'scheduled_payments', 'POST').length).toBe(1)
    const [body] = writesTo(writes, 'scheduled_payments', 'POST')[0].body
    expect(body.name).toBe('Mortgage')
    expect(body.type).toBe('expense')
    expect(body.frequency).toBe('monthly')
    expect(body.amount).toBe(2000)
    expect(body.anchor_date).toBe('2026-08-10')   // first payment, not the latest

    // …and its transactions linked to it.
    await expect.poll(() => writesTo(writes, 'transactions', 'PATCH').length).toBe(1)
    const link = writesTo(writes, 'transactions', 'PATCH')[0]
    expect(link.body).toEqual({ obligation_id: NEW_RULE_ID })
    expect(decodeURIComponent(link.query)).toMatch(/id=in\./)
  })

  test('adopting carries the variable flag the history implies', async ({ page }) => {
    const writes = []
    await openRecurring(page, { writes })

    // Celular is steady, so it must not be flagged variable.
    await ruleRow(page, 'Celular').getByRole('button', { name: 'Make it an obligation' }).click()
    await expect.poll(() => writesTo(writes, 'scheduled_payments', 'POST').length).toBe(1)
    const [body] = writesTo(writes, 'scheduled_payments', 'POST')[0].body
    expect(body.is_variable).toBe(false)
  })

  test('a declared rule offers no adopt action', async ({ page }) => {
    await openRecurring(page, { rules: [mkRule({ id: 'rule-1', name: 'Mortgage Rule', amount: 2000 })] })
    await expect(ruleRow(page, 'Mortgage Rule')
      .getByRole('button', { name: 'Make it an obligation' })).toHaveCount(0)
  })
})

test.describe('Obligations · linking a payment', () => {
  test('the transaction modal offers the obligations to count toward', async ({ page }) => {
    await openApp(page, '/expenses', 'family', [], [
      mkRule({ id: 'rule-1', name: 'Mortgage Rule', amount: 2000 }),
      mkRule({ id: 'rule-2', name: 'Hydro Rule', amount: 140, is_variable: true }),
    ])
    await page.getByRole('button', { name: /New transaction/i }).first().click()

    const picker = page.locator('#tx-obligation')
    await expect(picker).toBeVisible()
    const labels = await picker.locator('option').allInnerTexts()
    expect(labels).toContain('Mortgage Rule')
    expect(labels).toContain('Hydro Rule')
    expect(labels[0]).toBe('— Not a recurring payment —')
  })

  test('picking one sends the link with the transaction', async ({ page }) => {
    const writes = []
    await openApp(page, '/expenses', 'family', writes, [
      mkRule({ id: 'rule-1', name: 'Mortgage Rule', amount: 2000 }),
    ])
    await page.getByRole('button', { name: /New transaction/i }).first().click()

    await page.locator('#tx-desc').fill('October mortgage')
    await page.locator('#tx-amount').fill('2000')
    await page.locator('#tx-account').selectOption({ index: 1 })
    await page.locator('#tx-obligation').selectOption('rule-1')
    await page.getByRole('button', { name: /Save transaction/i }).click()

    await expect.poll(() => writesTo(writes, 'transactions', 'POST').length).toBe(1)
    const [body] = writesTo(writes, 'transactions', 'POST')[0].body
    expect(body.obligation_id).toBe('rule-1')
    // The link is the only record of recurrence — no second flag to drift.
    expect(body).not.toHaveProperty('is_recurring')
  })

  test('with nothing declared there is no recurring control at all', async ({ page }) => {
    // A transaction is recurring because it points at an obligation. With none
    // declared there is nothing to point at, so the form offers nothing —
    // rather than a checkbox that sets a flag no longer read.
    await openApp(page, '/expenses', 'family', [], [])
    await page.getByRole('button', { name: /New transaction/i }).first().click()

    await expect(page.locator('#tx-obligation')).toHaveCount(0)
    await expect(page.locator('.modal-overlay').getByText('Recurring', { exact: true }))
      .toHaveCount(0)
  })
})

test.describe('Obligations · converging', () => {
  const banner = (page) => page.locator('.card').filter({ hasText: 'series detected from your transactions' })

  test('the screen says how many series are still inferred', async ({ page }) => {
    await openRecurring(page)
    // The fixture household has six: Mortgage, Internet, Gym, Rent, Celular, Salary.
    await expect(banner(page)).toContainText('6 series detected from your transactions')
    await expect(banner(page)).toContainText('renaming one splits it in two')
  })

  test('adopt all converts every leftover in one go', async ({ page }) => {
    const writes = []
    await openRecurring(page, { writes })

    await banner(page).getByRole('button', { name: 'Adopt all' }).click()

    // One rule per series, and one link call per series.
    await expect.poll(() => writesTo(writes, 'scheduled_payments', 'POST').length,
                      { timeout: 15000 }).toBe(6)
    await expect.poll(() => writesTo(writes, 'transactions', 'PATCH').length).toBe(6)

    const names = writesTo(writes, 'scheduled_payments', 'POST').map(w => w.body[0].name).sort()
    expect(names).toEqual(['Celular', 'Gym', 'Internet', 'Mortgage', 'Rent', 'Salary'])
  })

  test('with nothing left to adopt the banner is gone', async ({ page }) => {
    // Every transaction already linked, so no series can be inferred.
    await openRecurring(page, { rules: [mkRule({ id: 'rule-1', name: 'Mortgage Rule', amount: 2000 })] })
    const inferred = await page.locator('.rec-row').filter({ hasText: 'Detected' }).count()
    if (inferred === 0) await expect(banner(page)).toHaveCount(0)
  })
})

test.describe('Obligations · before migration 018', () => {
  test('saving a transaction sends no obligation_id when none exist', async ({ page }) => {
    // PostgREST rejects a write naming a column it does not know — even one set
    // to null. Sending obligation_id unconditionally broke saving any
    // transaction at all until 018 had been applied.
    const writes = []
    await openApp(page, '/expenses', 'family', writes, [])
    await page.getByRole('button', { name: /New transaction/i }).first().click()

    await page.locator('#tx-desc').fill('Coffee')
    await page.locator('#tx-amount').fill('6')
    await page.getByRole('button', { name: /Save transaction/i }).click()

    await expect.poll(() => writesTo(writes, 'transactions', 'POST').length).toBe(1)
    const [body] = writesTo(writes, 'transactions', 'POST')[0].body
    expect(body).not.toHaveProperty('obligation_id')
    expect(body.description).toBe('Coffee')
  })

  test('the link is sent once an obligation exists to link to', async ({ page }) => {
    const writes = []
    await openApp(page, '/expenses', 'family', writes, [
      mkRule({ id: 'rule-1', name: 'Mortgage Rule', amount: 2000 }),
    ])
    await page.getByRole('button', { name: /New transaction/i }).first().click()

    await page.locator('#tx-desc').fill('Mortgage')
    await page.locator('#tx-amount').fill('2000')
    await page.getByRole('button', { name: /Save transaction/i }).click()

    await expect.poll(() => writesTo(writes, 'transactions', 'POST').length).toBe(1)
    const [body] = writesTo(writes, 'transactions', 'POST')[0].body
    expect(body).toHaveProperty('obligation_id')
  })
})
