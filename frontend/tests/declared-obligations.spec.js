/**
 * Declared obligations — scheduled_payments rows rendering through the real UI.
 *
 * The point of phase 3 is that a declared rule and an inferred series produce
 * the same obligation shape, so the Dashboard cannot tell them apart. These
 * tests drive the actual screens with rules in the stub.
 *
 *   npx playwright test tests/declared-obligations.spec.js
 */
import { test } from '@playwright/test'
import { expect, openDashboard, openApp, ALEX, MARCELA } from './fixtures/hacienda-stub.js'

const CAD = { name: 'Scotia Chequing', currency: 'CAD' }

// A scheduled_payments row as the API returns it.
const mkRule = (o) => ({
  id: o.id, user_id: o.user_id ?? ALEX, name: o.name,
  amount: o.amount, type: o.type ?? 'expense',
  frequency: o.frequency ?? 'monthly',
  anchor_date: o.anchor_date, ends_on: o.ends_on ?? null,
  is_active: o.is_active ?? true, is_variable: o.is_variable ?? false,
  person: o.person ?? 'Alexander', account: o.account ?? CAD, category: null,
})

const month = (page, title) => page.locator('.pay-card .pay-month')
  .filter({ has: page.locator('.pay-period-title', { hasText: title }) })
const october = (page) => month(page, 'OCTOBER 2026')
const row = (scope, name) => scope.locator('.pay-row')
  .filter({ has: scope.page().locator('.up-name', { hasText: new RegExp(`^${name}$`) }) })
const chipsOf = (l) => l.locator('.pay-chip').allInnerTexts()
const totsOf  = (h) => h.locator('.pay-tot').allInnerTexts()

async function expandMonth(page, title) {
  const m = month(page, title)
  if (await m.locator('.pay-month-h').getAttribute('aria-expanded') === 'false')
    await m.locator('.pay-month-h').click()
  await expect(m.locator('.pay-month-body')).toBeVisible()
  return m
}

test.describe('Declared obligations · Dashboard', () => {
  test('a rule with no payments at all still appears', async ({ page }) => {
    // The thing defect 5 made impossible: scheduling a bill never paid.
    await openDashboard(page, 'family', [
      mkRule({ id: 'r-new', name: 'Property Tax', amount: 420, anchor_date: '2026-10-22' }),
    ])

    const oct = october(page)
    await expect(row(oct, 'Property Tax')).toBeVisible()
    expect(await chipsOf(row(oct, 'Property Tax'))).toEqual(['Upcoming'])
    await expect(row(oct, 'Property Tax').locator('.up-sub')).toContainText('Due Oct 22, 2026')
    await expect(row(oct, 'Property Tax').locator('.up-amt')).toHaveText('−$420.00')

    // And it keeps recurring.
    const nov = await expandMonth(page, 'NOVEMBER 2026')
    await expect(row(nov, 'Property Tax').locator('.up-sub')).toContainText('Due Nov 22, 2026')
  })

  test('the declared due date is the one stated, not one inferred from payments', async ({ page }) => {
    // A date-only column parsed as UTC would render 9 October west of Greenwich.
    await openDashboard(page, 'family', [
      mkRule({ id: 'r-dt', name: 'Strata Fee', amount: 300, anchor_date: '2026-10-10' }),
    ])
    await expect(row(october(page), 'Strata Fee').locator('.up-sub'))
      .toContainText('Due Oct 10, 2026')
  })

  test('an expense rule counts as an obligation, never as income', async ({ page }) => {
    // scheduled_payments.amount is a positive magnitude; only `type` says which
    // direction the money moves.
    await openDashboard(page, 'family', [
      mkRule({ id: 'r-exp', name: 'Strata Fee', amount: 300, type: 'expense', anchor_date: '2026-10-22' }),
    ])
    const strata = row(october(page), 'Strata Fee')
    expect(await chipsOf(strata)).toEqual(['Upcoming'])      // not "Expected"
    await expect(strata.locator('.up-amt')).toHaveText('−$300.00')
  })

  test('an income rule is worded as income', async ({ page }) => {
    await openDashboard(page, 'family', [
      mkRule({ id: 'r-inc', name: 'Dividend', amount: 250, type: 'income', anchor_date: '2026-10-22' }),
    ])
    const div = row(october(page), 'Dividend')
    expect(await chipsOf(div)).toEqual(['Expected'])
    await expect(div.locator('.up-amt')).toHaveText('+$250.00')
  })

  test('a paused rule stops projecting forward', async ({ page }) => {
    await openDashboard(page, 'family', [
      mkRule({ id: 'r-off', name: 'Old Gym', amount: 45, anchor_date: '2026-08-20', is_active: false }),
    ])
    const nov = await expandMonth(page, 'NOVEMBER 2026')
    await expect(row(nov, 'Old Gym')).toHaveCount(0)
  })

  test('an ended rule stops at its final due date', async ({ page }) => {
    await openDashboard(page, 'family', [
      mkRule({ id: 'r-end', name: 'Old Gym', amount: 45,
               anchor_date: '2026-08-20', ends_on: '2026-09-20' }),
    ])
    await expect(row(october(page), 'Old Gym')).toHaveCount(0)
    const nov = await expandMonth(page, 'NOVEMBER 2026')
    await expect(row(nov, 'Old Gym')).toHaveCount(0)
  })

  test('a variable obligation is never reported short', async ({ page }) => {
    // Hydro's declared 140 is an estimate; the UI must not invent a balance.
    await openDashboard(page, 'family', [
      mkRule({ id: 'r-var', name: 'Hydro', amount: 140, is_variable: true,
               anchor_date: '2026-10-22', person: 'Shared' }),
    ])
    const hydro = row(october(page), 'Hydro')
    expect(await chipsOf(hydro)).toEqual(['Upcoming'])
    await expect(hydro.locator('.pay-progress')).toHaveCount(0)
  })

  test('declared rules and inferred series sit side by side', async ({ page }) => {
    await openDashboard(page, 'family', [
      mkRule({ id: 'r-mix', name: 'Property Tax', amount: 420, anchor_date: '2026-10-22' }),
    ])
    const oct = october(page)
    // The rule, plus the fixture household's inferred series.
    await expect(row(oct, 'Property Tax')).toBeVisible()
    await expect(row(oct, 'Mortgage')).toBeVisible()
    await expect(row(oct, 'Rent')).toBeVisible()

    // October's outstanding grows by exactly the new obligation: 2677 + 420.
    const tots = await totsOf(oct.locator('.pay-month-h'))
    expect(tots[2]).toBe('OUTSTANDING$3,097')
  })

  test('a rule belongs to its owner in Family mode', async ({ page }) => {
    await openDashboard(page, 'family', [
      mkRule({ id: 'r-own', name: 'Property Tax', amount: 420,
               user_id: MARCELA, person: 'Marcela', anchor_date: '2026-10-22' }),
    ])
    const marcela = october(page).locator('.pay-member')
      .filter({ has: page.locator('.pay-member-name', { hasText: /^Marcela$/ }) })
    await expect(row(marcela, 'Property Tax')).toBeVisible()

    const alexander = october(page).locator('.pay-member')
      .filter({ has: page.locator('.pay-member-name', { hasText: /^Alexander$/ }) })
    await expect(row(alexander, 'Property Tax')).toHaveCount(0)
  })

  test("another member's rule is hidden in a personal profile", async ({ page }) => {
    await openDashboard(page, 'personal', [
      mkRule({ id: 'r-m', name: 'Property Tax', amount: 420,
               user_id: MARCELA, person: 'Marcela', anchor_date: '2026-10-22' }),
    ])
    await expect(page.locator('.pay-row')
      .filter({ has: page.locator('.up-name', { hasText: /^Property Tax$/ }) })).toHaveCount(0)
  })
})

test.describe('Declared obligations · Recurring screen', () => {
  test('a rule is listed and reports its status', async ({ page }) => {
    await openApp(page, '/recurring', 'family', [], [
      mkRule({ id: 'r-rec', name: 'Property Tax', amount: 420, anchor_date: '2026-10-10' }),
    ])
    await expect.poll(() => page.locator('.rec-row').count(), { timeout: 20000 })
      .toBeGreaterThan(6)

    const taxRow = page.locator('.rec-row')
      .filter({ has: page.locator('.rec-name', { hasText: /^Property Tax$/ }) })
    await expect(taxRow).toHaveCount(1)
    // Due the 10th, today is the 14th, nothing paid against it.
    await expect(taxRow.locator('.rec-status')).toContainText('Overdue')
    await expect(taxRow.locator('.rec-status')).toContainText('Due Oct 10')
  })
})
