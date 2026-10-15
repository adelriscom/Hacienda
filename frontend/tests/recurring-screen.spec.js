/**
 * Recurring screen — profile scoping and whole-series removal.
 *
 * Covers the two defects the integration audit raised:
 *   1. "Remove from recurring" unflagged only the group's newest transaction,
 *      so the series reappeared behind an older one.
 *   2. The screen ignored the profile selector and always listed the whole
 *      household, unlike every other screen.
 *
 *   npx playwright test tests/recurring-screen.spec.js
 */
import { test } from '@playwright/test'
import { expect, openApp, profileSwitch, idsFor, MEMBERS } from './fixtures/hacienda-stub.js'

const ALL_SERIES  = ['Salary', 'Mortgage', 'Rent', 'Celular', 'Internet', 'Gym']
const ALEX_SERIES = ['Salary', 'Mortgage', 'Internet', 'Gym']

const rows      = (page) => page.locator('.rec-row')
const seriesOf  = (page) => page.locator('.rec-name').allInnerTexts()
const seriesRow = (page, name) => page.locator('.rec-row')
  .filter({ has: page.locator('.rec-name', { hasText: new RegExp(`^${name}$`) }) })

async function openRecurring(page, viewMode = 'family', writes = []) {
  await openApp(page, '/recurring', viewMode, writes)
  // The household resolves asynchronously, so the first render is always
  // personal-scoped. Wait for the list to settle on the profile under test.
  const expected = viewMode === 'family' ? ALL_SERIES.length : ALEX_SERIES.length
  await expect.poll(() => rows(page).count(), { timeout: 20000 }).toBe(expected)
}

// Removes a series through the two-step confirm in its row.
async function removeSeries(page, name) {
  const row = seriesRow(page, name)
  await row.getByTitle('Remove from recurring').click()
  await row.getByRole('button', { name: /Confirm/i }).click()
}

const patchesIn = (writes) =>
  writes.filter(w => w.method === 'PATCH' && w.table === 'transactions')

test.describe('Recurring screen · profile scoping', () => {
  test('family mode lists every member’s series', async ({ page }) => {
    await openRecurring(page, 'family')
    expect((await seriesOf(page)).sort()).toEqual([...ALL_SERIES].sort())

    // Same-named obligations stay separate per owner rather than merging.
    await expect(seriesRow(page, 'Rent')).toHaveCount(1)
    await expect(seriesRow(page, 'Rent')).toContainText('Marcela')
  })

  test('personal mode lists only the signed-in member’s series', async ({ page }) => {
    await openRecurring(page, 'personal')
    expect((await seriesOf(page)).sort()).toEqual([...ALEX_SERIES].sort())

    // Marcela's obligations are absent entirely.
    await expect(seriesRow(page, 'Rent')).toHaveCount(0)
    await expect(seriesRow(page, 'Celular')).toHaveCount(0)
  })

  test('switching profile refetches the list', async ({ page }) => {
    await openRecurring(page, 'family')
    await expect(seriesRow(page, 'Rent')).toHaveCount(1)

    await profileSwitch(page, 'Personal').click()
    await expect(seriesRow(page, 'Rent')).toHaveCount(0)
    await expect(rows(page)).toHaveCount(ALEX_SERIES.length)
    await expect(seriesRow(page, 'Mortgage')).toHaveCount(1)

    await profileSwitch(page, 'Family').click()
    await expect(seriesRow(page, 'Rent')).toHaveCount(1)
    await expect(rows(page)).toHaveCount(ALL_SERIES.length)
  })

  test('KPI totals follow the selected profile', async ({ page }) => {
    await openRecurring(page, 'personal')
    const personal = await page.locator('.kpi-grid .num').allInnerTexts()

    await profileSwitch(page, 'Family').click()
    await expect(rows(page)).toHaveCount(ALL_SERIES.length)
    const family = await page.locator('.kpi-grid .num').allInnerTexts()

    // Last KPI is the series count: 4 for Alexander alone, 6 for the household.
    expect(personal[personal.length - 1]).toBe(String(ALEX_SERIES.length))
    expect(family[family.length - 1]).toBe(String(ALL_SERIES.length))
    expect(personal).not.toEqual(family)
  })
})

test.describe('Recurring screen · removing a series', () => {
  test('removal unflags every transaction in the series, not just the newest', async ({ page }) => {
    const writes = []
    await openRecurring(page, 'family', writes)

    // Internet has three transactions; removing it must clear all three.
    const ids = idsFor('Internet')
    expect(ids).toHaveLength(3)

    await removeSeries(page, 'Internet')
    await expect.poll(() => patchesIn(writes).length).toBe(1)

    const patch = patchesIn(writes)[0]
    expect(patch.body).toEqual({ is_recurring: false })

    const targeted = decodeURIComponent(patch.query)
    expect(targeted).toMatch(/id=in\./)       // the defect sent id=eq.<one row>
    for (const id of ids) expect(targeted).toContain(id)
  })

  test('removal targets only the chosen series', async ({ page }) => {
    const writes = []
    await openRecurring(page, 'family', writes)

    await removeSeries(page, 'Gym')
    await expect.poll(() => patchesIn(writes).length).toBe(1)

    const targeted = decodeURIComponent(patchesIn(writes)[0].query)
    for (const id of idsFor('Gym'))      expect(targeted).toContain(id)
    for (const id of idsFor('Mortgage')) expect(targeted).not.toContain(id)
    for (const id of idsFor('Rent'))     expect(targeted).not.toContain(id)
  })

  test('cancelling the confirm writes nothing', async ({ page }) => {
    const writes = []
    await openRecurring(page, 'family', writes)

    const row = seriesRow(page, 'Gym')
    await row.getByTitle('Remove from recurring').click()
    await row.getByRole('button', { name: '✕' }).click()

    await expect(row.getByTitle('Remove from recurring')).toBeVisible()
    expect(patchesIn(writes)).toHaveLength(0)
  })
})
