/**
 * Dashboard · Upcoming Payments — profile filtering, monthly periods, statuses.
 *
 * Runs against the shared fixture household with the clock pinned to
 * 2026-10-14, so every payment status is exercised deterministically.
 *
 *   npx playwright test tests/dashboard-payments.spec.js
 */
import { test } from '@playwright/test'
import { expect, openDashboard, profileSwitch } from './fixtures/hacienda-stub.js'

// ── Accordion helpers ───────────────────────────────────────────────────────
// Level 1 is a month; level 2 (Family only) is a member. Month titles are
// uppercased by CSS, so headers are compared via innerText.
const month = (page, title) => page.locator('.pay-card .pay-month')
  .filter({ has: page.locator('.pay-period-title', { hasText: title }) })

const october = (page) => month(page, 'OCTOBER 2026')

const member = (scope, name) => scope.locator('.pay-member')
  .filter({ has: scope.page().locator('.pay-member-name', { hasText: new RegExp(`^${name}$`) }) })

function row(scope, name) {
  return scope.locator('.pay-row')
    .filter({ has: scope.page().locator('.up-name', { hasText: new RegExp(`^${name}$`) }) })
}

// Same obligation anywhere in the card, regardless of period or member.
const anyRow = (page, name) => page.locator('.pay-row')
  .filter({ has: page.locator('.up-name', { hasText: new RegExp(`^${name}$`) }) })

const chipsOf = (locator) => locator.locator('.pay-chip').allInnerTexts()
const toggle  = (page, name) => page.getByRole('button', { name, exact: true })
const totsOf  = (header) => header.locator('.pay-tot').allInnerTexts()

// Only the current month opens by default; the rest must be expanded.
async function expandMonth(page, title) {
  const m = month(page, title)
  const header = m.locator('.pay-month-h')
  if (await header.getAttribute('aria-expanded') === 'false') await header.click()
  await expect(m.locator('.pay-month-body')).toBeVisible()
  return m
}

test.describe('Dashboard · Upcoming Payments', () => {
  test('groups payments by month with the exact period and due date', async ({ page }) => {
    await openDashboard(page)

    await expect(page.locator('.pay-card .insight-sub'))
      .toHaveText('Family · Delrisco-Falla · 2 overdue · $2,677 outstanding in October 2026')

    const titles = await page.locator('.pay-period-title').allInnerTexts()
    expect(titles).toEqual(['OCTOBER 2026', 'NOVEMBER 2026', 'DECEMBER 2026'])

    const spans = await page.locator('.pay-period-span').allInnerTexts()
    expect(spans[0]).toBe('Payment period · Oct 1 – Oct 31 · 6 payments · 2 overdue')
    expect(spans[1]).toBe('Payment period · Nov 1 – Nov 30 · 6 payments')

    // Every visible row states its exact, year-qualified due date.
    for (const s of await page.locator('.pay-row .up-sub').allInnerTexts())
      expect(s).toMatch(/^Due [A-Za-z]{3} \d{1,2}, 20\d{2}/)

    await expect(row(october(page), 'Mortgage').locator('.up-sub'))
      .toContainText('Due Oct 10, 2026')
    await expect(row(october(page), 'Celular').locator('.up-sub'))
      .toContainText('Due Oct 20, 2026')

    const nov = await expandMonth(page, 'NOVEMBER 2026')
    await expect(row(nov, 'Mortgage').locator('.up-sub')).toContainText('Due Nov 10, 2026')
  })

  test('only the current month is expanded on load', async ({ page }) => {
    await openDashboard(page)

    await expect(october(page).locator('.pay-month-h')).toHaveAttribute('aria-expanded', 'true')
    await expect(october(page).locator('.pay-month-body')).toBeVisible()
    for (const title of ['NOVEMBER 2026', 'DECEMBER 2026']) {
      await expect(month(page, title).locator('.pay-month-h')).toHaveAttribute('aria-expanded', 'false')
      await expect(month(page, title).locator('.pay-month-body')).toHaveCount(0)
    }
    // Totals stay readable while collapsed.
    expect(await totsOf(month(page, 'NOVEMBER 2026').locator('.pay-month-h')))
      .toEqual(['SCHEDULED$3,457', 'PAID$0', 'OUTSTANDING$3,457', 'EXPECTED IN$5,000'])
  })

  test('months collapse and expand independently', async ({ page }) => {
    await openDashboard(page)
    const dec = month(page, 'DECEMBER 2026')

    await dec.locator('.pay-month-h').click()
    await expect(dec.locator('.pay-month-body')).toBeVisible()
    // October stays open — sections are independent.
    await expect(october(page).locator('.pay-month-body')).toBeVisible()

    await october(page).locator('.pay-month-h').click()
    await expect(october(page).locator('.pay-month-body')).toHaveCount(0)
    await expect(dec.locator('.pay-month-body')).toBeVisible()
  })

  test('month header reports scheduled, paid, outstanding and counts', async ({ page }) => {
    await openDashboard(page)
    const header = october(page).locator('.pay-month-h')

    // Paid 780 = Internet 80 settled + Rent 700 partial.
    // Outstanding 2677 = Mortgage 2000 + Gym 45 + Celular 132 + Rent balance 500.
    expect(await totsOf(header)).toEqual([
      'SCHEDULED$3,457', 'PAID$780', 'OUTSTANDING$2,677', 'EXPECTED IN$5,000',
    ])
    await expect(header.locator('.pay-period-span')).toContainText('6 payments')
    await expect(header.locator('.pay-period-span')).toContainText('2 overdue')
  })

  test('family mode groups each month by member with subtotals', async ({ page }) => {
    await openDashboard(page, 'family')
    const oct = october(page)

    expect(await oct.locator('.pay-member-name').allInnerTexts()).toEqual(['Alexander', 'Marcela'])

    // Subtotals describe everything the member owns, and add up to the month.
    expect(await totsOf(member(oct, 'Alexander').locator('.pay-member-h')))
      .toEqual(['OBLIGATIONS$2,125', 'PAID$80', 'REMAINING$2,045'])
    expect(await totsOf(member(oct, 'Marcela').locator('.pay-member-h')))
      .toEqual(['OBLIGATIONS$1,332', 'PAID$700', 'REMAINING$632'])

    await expect(member(oct, 'Alexander').locator('.pay-member-meta')).toContainText('4 payments')
    await expect(member(oct, 'Marcela').locator('.pay-member-meta')).toContainText('2 payments')

    // Each member's payments sit under their own section.
    await expect(row(member(oct, 'Alexander'), 'Mortgage')).toBeVisible()
    await expect(row(member(oct, 'Marcela'), 'Rent')).toBeVisible()
    await expect(row(member(oct, 'Alexander'), 'Rent')).toHaveCount(0)
  })

  test('member sections expand and collapse independently', async ({ page }) => {
    await openDashboard(page, 'family')
    const oct = october(page)
    const alex = member(oct, 'Alexander')

    await expect(alex.locator('.pay-member-body')).toBeVisible()
    await alex.locator('.pay-member-h').click()
    await expect(alex.locator('.pay-member-body')).toHaveCount(0)
    // Marcela is untouched, and Alexander's subtotals survive the collapse.
    await expect(member(oct, 'Marcela').locator('.pay-member-body')).toBeVisible()
    expect(await totsOf(alex.locator('.pay-member-h')))
      .toEqual(['OBLIGATIONS$2,125', 'PAID$80', 'REMAINING$2,045'])
  })

  test('derives each payment status from real transactions', async ({ page }) => {
    await openDashboard(page)
    const oct = october(page)

    // Unpaid and past due → Overdue, still filed under October.
    expect(await chipsOf(row(oct, 'Mortgage'))).toEqual(['Overdue'])
    await expect(row(oct, 'Mortgage').locator('.up-sub')).toContainText('4d late')

    // Due on the pinned date.
    expect(await chipsOf(row(oct, 'Gym'))).toEqual(['Due today'])

    // Future due date → Upcoming. Never "Paid" just because the date hasn't passed.
    expect(await chipsOf(row(oct, 'Celular'))).toEqual(['Upcoming'])

    // Recurring income gets inflow wording.
    expect(await chipsOf(row(oct, 'Salary'))).toEqual(['Expected'])

    // October's Internet is settled → gone from the Outstanding view, while its
    // unpaid November occurrence remains.
    await expect(row(oct, 'Internet')).toHaveCount(0)
    const nov = await expandMonth(page, 'NOVEMBER 2026')
    expect(await chipsOf(row(nov, 'Internet'))).toEqual(['Upcoming'])
  })

  test('a partially paid overdue obligation shows progress, balance and both states', async ({ page }) => {
    await openDashboard(page)

    const rent = row(october(page), 'Rent')
    expect(await chipsOf(rent)).toEqual(['Partially paid', 'Overdue'])
    await expect(rent.locator('.pay-progress-txt'))
      .toHaveText('58% · $700.00 of $1,200.00 · $500.00 left')
    // Scheduled amount survives the short payment.
    await expect(rent.locator('.up-amt')).toHaveText('−$1,200.00')
    // Due date and the date money actually moved are both reported.
    await expect(rent.locator('.up-sub')).toContainText('Due Oct 8, 2026')
    await expect(rent.locator('.up-sub')).toContainText('paid Oct 8')

    // November's Rent is back to the full scheduled amount, unpaid.
    const nov = await expandMonth(page, 'NOVEMBER 2026')
    expect(await chipsOf(row(nov, 'Rent'))).toEqual(['Upcoming'])
    await expect(row(nov, 'Rent').locator('.pay-progress')).toHaveCount(0)
  })

  test('COP amounts are shown natively and converted only in totals', async ({ page }) => {
    await openDashboard(page)
    const celular = row(october(page), 'Celular')
    await expect(celular.locator('.up-amt')).toHaveText('−$400.000')
    await expect(celular.locator('.pay-amt-sub')).toHaveText('COP')
    // A CAD row carries no currency suffix.
    await expect(row(october(page), 'Mortgage').locator('.pay-amt-sub')).toHaveCount(0)
    // 400,000 COP enters Marcela's subtotal as 132 CAD, never raw.
    const tots = await totsOf(member(october(page), 'Marcela').locator('.pay-member-h'))
    expect(tots[0]).toBe('OBLIGATIONS$1,332')
  })

  test('the All toggle reveals settled rows without changing the totals', async ({ page }) => {
    await openDashboard(page)
    const before = await page.locator('.pay-row').count()
    const octTots = await totsOf(october(page).locator('.pay-month-h'))

    await toggle(page, 'All').click()
    await expect
      .poll(() => page.locator('.pay-period-title').first().innerText())
      .toBe('AUGUST 2026')

    expect(await page.locator('.pay-row').count()).toBeGreaterThan(before)
    const internet = row(october(page), 'Internet')
    expect(await chipsOf(internet)).toEqual(['Paid'])
    await expect(internet.locator('.up-sub')).toContainText('paid Oct 12')
    // Filtering rows must never move the money.
    expect(await totsOf(october(page).locator('.pay-month-h'))).toEqual(octTots)
  })

  test('personal profile shows payments directly, with no member level', async ({ page }) => {
    await openDashboard(page, 'personal')

    await expect(page.locator('.pay-card .insight-sub'))
      .toHaveText('Alexander · 1 overdue · $2,045 outstanding in October 2026')

    // No member accordion for an individual profile.
    await expect(page.locator('.pay-member')).toHaveCount(0)
    await expect(october(page).locator('.pay-month-body .pay-row').first()).toBeVisible()

    // Alexander's obligations only.
    await expect(row(october(page), 'Mortgage')).toBeVisible()
    await expect(row(october(page), 'Gym')).toBeVisible()
    await expect(anyRow(page, 'Rent')).toHaveCount(0)
    await expect(anyRow(page, 'Celular')).toHaveCount(0)

    expect(await totsOf(october(page).locator('.pay-month-h')))
      .toEqual(['SCHEDULED$2,125', 'PAID$80', 'OUTSTANDING$2,045', 'EXPECTED IN$5,000'])
  })

  test('switching profiles refreshes the payments without a reload', async ({ page }) => {
    await openDashboard(page, 'family')
    await expect(anyRow(page, 'Rent').first()).toBeVisible()
    await expect(page.locator('.pay-member')).not.toHaveCount(0)

    await profileSwitch(page, 'Personal').click()
    await expect(anyRow(page, 'Rent')).toHaveCount(0)
    await expect(page.locator('.pay-member')).toHaveCount(0)
    await expect(page.locator('.pay-card .insight-sub')).toContainText('1 overdue')

    await profileSwitch(page, 'Family').click()
    await expect(anyRow(page, 'Rent').first()).toBeVisible()
    await expect(page.locator('.pay-card .insight-sub')).toContainText('2 overdue')
  })

  test('the accordion stays readable at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openDashboard(page)

    const overflow = await page.evaluate(() => {
      const el = document.querySelector('.pay-card')
      return {
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        card: el.scrollWidth - el.clientWidth,
      }
    })
    expect(overflow.page).toBeLessThanOrEqual(1)
    expect(overflow.card).toBeLessThanOrEqual(1)

    await expect(october(page).locator('.pay-period-title')).toBeVisible()
    await expect(member(october(page), 'Marcela').locator('.pay-member-name')).toBeVisible()
    await expect(row(october(page), 'Rent').locator('.pay-progress-bar')).toBeVisible()
    await expect(toggle(page, 'Outstanding')).toBeVisible()

    // Collapsing still works on a touch-sized target.
    await october(page).locator('.pay-month-h').click()
    await expect(october(page).locator('.pay-month-body')).toHaveCount(0)
  })

  test('accordion headers are keyboard operable', async ({ page }) => {
    await openDashboard(page)
    const header = month(page, 'DECEMBER 2026').locator('.pay-month-h')

    await header.focus()
    await page.keyboard.press('Enter')
    await expect(month(page, 'DECEMBER 2026').locator('.pay-month-body')).toBeVisible()
    await expect(header).toHaveAttribute('aria-expanded', 'true')

    await page.keyboard.press(' ')
    await expect(month(page, 'DECEMBER 2026').locator('.pay-month-body')).toHaveCount(0)
    await expect(header).toHaveAttribute('aria-expanded', 'false')
  })

})
