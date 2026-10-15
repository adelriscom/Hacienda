// Unit tests for the payment-schedule derivation (src/lib/paymentSchedule.js).
// Pure logic, no Supabase — run with:  node tests/unit/payment-schedule.unit.mjs
// Kept out of *.spec.js so Playwright's testMatch doesn't pick it up.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  STATUS, buildSchedule, toObligation, groupByPeriod, groupByOwner, occurrenceDate,
  resolveStatus, startOfDay, isOutstanding, statusLabel, currentOccurrences,
  obligationFromRule, parseDateOnly,
} from '../../src/lib/paymentSchedule.js'

const day = (s) => startOfDay(new Date(`${s}T12:00:00`))

// Builds what useRecurring() hands back: the newest transaction in the group,
// plus `_txns` / `_freq`.
function recurringItem({
  id = 'o1', user_id = 'u1', description = 'Mortgage', amount = -2000,
  person = null, account = { name: 'BBVA', currency: 'CAD' },
  freq = { days: 30, label: 'Monthly' }, payments = [],
}) {
  const txns = payments.map(([d, amt, rate], i) => ({
    id: `${id}-t${i}`, user_id, description, person, account,
    amount: amt ?? amount, occurred_at: `${d}T12:00:00`,
    exchange_rate: rate ?? null,
  }))
  const newest = [...txns].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))[0]
  return {
    ...(newest || { id, user_id, description, person, account, amount, occurred_at: '2026-01-01T12:00:00' }),
    amount, _key: `${user_id}|${description.toLowerCase()}`, _freq: freq, _txns: txns,
  }
}

const schedule = (items, today, opts = {}) =>
  buildSchedule(items.map(toObligation), { today: day(today), ...opts })

const find = (occs, desc, ym) =>
  occs.find(o => o.obligation.description === desc && o.periodYm === ym)

// ── FR-05 · status table ─────────────────────────────────────────────────────

test('future unpaid occurrence is Upcoming, never Paid', () => {
  const occs = schedule([recurringItem({
    payments: [['2026-08-25'], ['2026-09-25'], ['2026-10-25']],
  })], '2026-10-28')
  const nov = find(occs, 'Mortgage', '2026-11')
  assert.equal(nov.status, STATUS.UPCOMING)
  assert.equal(nov.paid, 0)
  assert.equal(nov.remaining, 2000)
  assert.equal(nov.isOverdue, false)
})

test('occurrence due on the current date is Due Today', () => {
  const occs = schedule([recurringItem({
    payments: [['2026-08-25'], ['2026-09-25']],
  })], '2026-10-25')
  const oct = find(occs, 'Mortgage', '2026-10')
  assert.equal(oct.status, STATUS.DUE_TODAY)
  assert.equal(+oct.dueDate, +day('2026-10-25'))
})

test('unpaid occurrence past its due date is Overdue', () => {
  const occs = schedule([recurringItem({
    payments: [['2026-07-25'], ['2026-08-25'], ['2026-09-25']],
  })], '2026-11-01')
  const oct = find(occs, 'Mortgage', '2026-10')
  assert.equal(oct.status, STATUS.OVERDUE)
  assert.equal(oct.isOverdue, true)
  assert.equal(oct.remaining, 2000)
})

test('settled occurrence is Paid and no longer outstanding', () => {
  const occs = schedule([recurringItem({
    payments: [['2026-08-25'], ['2026-09-25'], ['2026-10-25']],
  })], '2026-11-01')
  const oct = find(occs, 'Mortgage', '2026-10')
  assert.equal(oct.status, STATUS.PAID)
  assert.equal(oct.remaining, 0)
  assert.equal(oct.isOverdue, false)
  assert.equal(isOutstanding(oct), false)
})

test('Paid is never inferred from the due date alone', () => {
  // No transaction has ever landed in November, so November cannot read as paid
  // even though its due date is still in the future.
  const occs = schedule([recurringItem({
    payments: [['2026-09-25'], ['2026-10-25']],
  })], '2026-11-01')
  assert.equal(occs.filter(o => o.status === STATUS.PAID).length, 2) // Sep + Oct only
  assert.equal(find(occs, 'Mortgage', '2026-11').status, STATUS.UPCOMING)
  assert.equal(find(occs, 'Mortgage', '2026-12').status, STATUS.UPCOMING)
})

test('a payment short of the scheduled amount is Partially Paid with a balance', () => {
  const occs = schedule([recurringItem({
    payments: [['2026-07-25'], ['2026-08-25'], ['2026-09-25'], ['2026-10-27', -1200]],
  })], '2026-10-28')
  const oct = find(occs, 'Mortgage', '2026-10')
  assert.equal(oct.status, STATUS.PARTIAL)
  assert.equal(oct.scheduled, 2000)      // the short payment didn't redefine it
  assert.equal(oct.paid, 1200)
  assert.equal(oct.remaining, 800)
  assert.equal(Math.round(oct.progress * 100), 60)
})

test('a partially paid occurrence past its due date is also flagged overdue', () => {
  const occs = schedule([recurringItem({
    payments: [['2026-07-25'], ['2026-08-25'], ['2026-09-25'], ['2026-10-27', -1200]],
  })], '2026-11-05')
  const oct = find(occs, 'Mortgage', '2026-10')
  assert.equal(oct.status, STATUS.PARTIAL)
  assert.equal(oct.isOverdue, true)
  assert.equal(oct.remaining, 800)
})

test('several transactions settle one occurrence cumulatively', () => {
  const occs = schedule([recurringItem({
    payments: [['2026-08-25'], ['2026-09-25'], ['2026-10-20', -800], ['2026-10-27', -1200]],
  })], '2026-11-05')
  const oct = find(occs, 'Mortgage', '2026-10')
  assert.equal(oct.paid, 2000)
  assert.equal(oct.status, STATUS.PAID)
  assert.equal(oct.payments.length, 2)
})

test('overpayment clamps progress and cannot drive the balance negative', () => {
  const s = resolveStatus({ scheduled: 2000, paid: 2500, dueDate: day('2026-10-25'), today: day('2026-11-01') })
  assert.equal(s.status, STATUS.PAID)
  assert.equal(s.remaining, 0)
  assert.equal(s.progress, 1)
})

test('income obligations get inflow wording', () => {
  assert.equal(statusLabel(STATUS.PAID, false), 'Paid')
  assert.equal(statusLabel(STATUS.PAID, true), 'Received')
  assert.equal(statusLabel(STATUS.OVERDUE, true), 'Not received')
})

// ── FR-04 · period independent of status ─────────────────────────────────────

test('an overdue occurrence keeps its original period and due date', () => {
  const occs = schedule([recurringItem({
    payments: [['2026-07-25'], ['2026-08-25'], ['2026-09-25']],
  })], '2026-11-01')
  const oct = find(occs, 'Mortgage', '2026-10')
  assert.equal(oct.periodYm, '2026-10')               // not pulled into November
  assert.equal(+oct.dueDate, +day('2026-10-25'))
  assert.equal(find(occs, 'Mortgage', '2026-11').status, STATUS.UPCOMING)
})

test('paying late settles the original period and records the actual payment date', () => {
  const occs = schedule([recurringItem({
    payments: [['2026-08-25'], ['2026-09-25'], ['2026-11-03', -2000]],
  })], '2026-11-10')
  const oct = find(occs, 'Mortgage', '2026-10')
  assert.equal(oct.status, STATUS.PAID)
  assert.equal(+oct.dueDate, +day('2026-10-25'))        // due date unchanged
  assert.equal(+oct.lastPaymentDate, +day('2026-11-03')) // payment date kept apart
  assert.equal(find(occs, 'Mortgage', '2026-11').status, STATUS.UPCOMING)
})

test('historical periods stay in the window', () => {
  const occs = schedule([recurringItem({
    payments: [['2026-07-25'], ['2026-08-25'], ['2026-09-25'], ['2026-10-25']],
  })], '2026-11-01', { monthsBack: 3, monthsAhead: 2 })
  const periods = [...new Set(occs.map(o => o.periodYm))]
  assert.deepEqual(periods, ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01'])
})

test('nothing is projected before the obligation first appeared', () => {
  // The window reaches back to July, but the obligation starts in September —
  // July and August were never owed and must not show up as overdue.
  const occs = schedule([recurringItem({
    payments: [['2026-09-25'], ['2026-10-25']],
  })], '2026-10-28', { monthsBack: 3, monthsAhead: 1 })
  assert.deepEqual([...new Set(occs.map(o => o.periodYm))], ['2026-09', '2026-10', '2026-11'])
  assert.equal(occs.filter(o => o.status === STATUS.OVERDUE).length, 0)
})

test('a first payment made late still settles its own occurrence', () => {
  // Due the 25th, first ever payment landed on the 29th: that occurrence is
  // kept (not clamped away) and reads as paid.
  const occs = schedule([recurringItem({
    payments: [['2026-09-29'], ['2026-10-25']],
  })], '2026-10-28')
  const sep = find(occs, 'Mortgage', '2026-09')
  assert.ok(sep, 'September occurrence should survive the start-date clamp')
  assert.equal(sep.status, STATUS.PAID)
})

// ── FR-03 · monthly organisation & boundaries ────────────────────────────────

test('monthly occurrences keep day of month across short months and year ends', () => {
  const jan31 = day('2026-01-31')
  assert.equal(+occurrenceDate(jan31, 30, 1), +day('2026-02-28'))
  assert.equal(+occurrenceDate(jan31, 30, 2), +day('2026-03-31'))
  const dec15 = day('2026-12-15')
  assert.equal(+occurrenceDate(dec15, 30, 1), +day('2027-01-15'))
  assert.equal(+occurrenceDate(dec15, 365, 1), +day('2027-12-15'))
  assert.equal(+occurrenceDate(dec15, 91, 1), +day('2027-03-15'))
})

test('recurring obligations cross the year boundary with correct periods', () => {
  const occs = schedule([recurringItem({
    description: 'Internet', amount: -80,
    payments: [['2026-10-18'], ['2026-11-18'], ['2026-12-18']],
  })], '2026-12-20')
  assert.equal(find(occs, 'Internet', '2027-01').periodYm, '2027-01')
  assert.equal(+find(occs, 'Internet', '2027-01').dueDate, +day('2027-01-18'))
  assert.equal(+find(occs, 'Internet', '2027-02').dueDate, +day('2027-02-18'))
})

test('weekly obligations produce several occurrences per period', () => {
  const occs = schedule([recurringItem({
    description: 'Groceries', amount: -150, freq: { days: 7, label: 'Weekly' },
    payments: [['2026-10-05'], ['2026-10-12'], ['2026-10-19']],
  })], '2026-10-20')
  const oct = occs.filter(o => o.periodYm === '2026-10')
  assert.ok(oct.length >= 4, `expected weekly occurrences in October, got ${oct.length}`)
  assert.equal(new Set(oct.map(o => +o.dueDate)).size, oct.length) // all distinct
})

test('each transaction settles exactly one occurrence', () => {
  const occs = schedule([recurringItem({
    description: 'Internet', amount: -80,
    payments: [['2026-09-18'], ['2026-10-18'], ['2026-11-18']],
  })], '2026-11-20')
  const ids = occs.flatMap(o => o.payments.map(p => p.id))
  assert.equal(ids.length, new Set(ids).size, 'a transaction was counted twice')
})

// ── FR-01 / FR-02 · profile filtering & ownership ────────────────────────────

test('same description under two members stays two obligations with distinct owners', () => {
  const occs = schedule([
    recurringItem({ id: 'a', user_id: 'alex', description: 'Internet', amount: -80,
      person: 'Alexander', payments: [['2026-09-18'], ['2026-10-18']] }),
    recurringItem({ id: 'm', user_id: 'marcela', description: 'Internet', amount: -60,
      person: 'Marcela', payments: [['2026-09-20'], ['2026-10-20']] }),
  ], '2026-10-25')
  const oct = occs.filter(o => o.periodYm === '2026-10')
  assert.equal(oct.length, 2)
  assert.deepEqual(oct.map(o => o.obligation.ownerUserId).sort(), ['alex', 'marcela'])
  assert.deepEqual(oct.map(o => o.scheduled).sort((a, b) => a - b), [60, 80])
})

test('family totals sum both members once; individual totals only one', () => {
  const items = [
    recurringItem({ id: 'a', user_id: 'alex', description: 'Internet', amount: -80,
      payments: [['2026-09-18'], ['2026-10-18']] }),
    recurringItem({ id: 'm', user_id: 'marcela', description: 'Rent', amount: -1200,
      payments: [['2026-09-01'], ['2026-10-01']] }),
  ]
  const family = groupByPeriod(schedule(items, '2026-10-25').filter(o => o.periodYm === '2026-10'))
  assert.equal(family[0].scheduledBase, 1280)

  const alexOnly = items.filter(i => i.user_id === 'alex')
  const mine = groupByPeriod(schedule(alexOnly, '2026-10-25').filter(o => o.periodYm === '2026-10'))
  assert.equal(mine[0].scheduledBase, 80)
})

test('a shared obligation is counted once, not once per member', () => {
  // A shared bill is one transaction stream owned by one member, tagged Shared.
  const occs = schedule([recurringItem({
    id: 's', user_id: 'alex', description: 'Hydro', amount: -140, person: 'Shared',
    payments: [['2026-09-10'], ['2026-10-10']],
  })], '2026-10-25')
  const oct = occs.filter(o => o.periodYm === '2026-10')
  assert.equal(oct.length, 1)
  assert.equal(oct[0].obligation.person, 'Shared')
  assert.equal(groupByPeriod(oct)[0].scheduledBase, 140)
})

// ── FR-08 · totals & currency ────────────────────────────────────────────────

test('monthly totals separate scheduled, paid and outstanding', () => {
  const occs = schedule([
    recurringItem({ id: 'a', description: 'Mortgage', amount: -2000,
      payments: [['2026-08-25'], ['2026-09-25'], ['2026-10-27', -1200]] }),
    recurringItem({ id: 'b', description: 'Internet', amount: -80,
      payments: [['2026-09-18'], ['2026-10-18']] }),
  ], '2026-10-28')
  const oct = groupByPeriod(occs.filter(o => o.periodYm === '2026-10'))[0]
  assert.equal(oct.scheduledBase, 2080)
  assert.equal(oct.paidBase, 1280)        // 1200 partial + 80 settled
  assert.equal(oct.outstandingBase, 800)  // balance only, not the full 2000
  assert.equal(oct.counts.partial, 1)
  assert.equal(oct.counts.paid, 1)
})

test('fully paid occurrences are excluded from the outstanding total', () => {
  const occs = schedule([recurringItem({
    payments: [['2026-08-25'], ['2026-09-25'], ['2026-10-25']],
  })], '2026-10-28')
  const oct = groupByPeriod(occs.filter(o => o.periodYm === '2026-10'))[0]
  assert.equal(oct.outstandingBase, 0)
  assert.equal(oct.scheduledBase, 2000)
})

test('currencies convert to base instead of being summed raw', () => {
  const convert = (a, cur) => (cur === 'COP' ? a * 0.00032 : a)
  const occs = schedule([
    recurringItem({ id: 'a', description: 'Internet', amount: -80,
      account: { name: 'Scotia', currency: 'CAD' },
      payments: [['2026-09-18'], ['2026-10-18']] }),
    recurringItem({ id: 'b', description: 'Celular', amount: -400000,
      account: { name: 'Bancolombia', currency: 'COP' },
      payments: [['2026-09-10'], ['2026-10-10']] }),
  ], '2026-10-25')
  const oct = groupByPeriod(occs.filter(o => o.periodYm === '2026-10'), convert)[0]
  assert.equal(Math.round(oct.scheduledBase * 100) / 100, 208)  // 80 + 128
  assert.notEqual(oct.scheduledBase, 400080)                    // never summed raw
})

test("a transaction's own captured rate wins over the month's rate", () => {
  const convert = (a, cur) => (cur === 'COP' ? a * 0.00032 : a)
  const occs = schedule([recurringItem({
    description: 'Celular', amount: -400000,
    account: { name: 'Bancolombia', currency: 'COP' },
    payments: [['2026-09-10', -400000, 0.0003], ['2026-10-10', -400000, 0.00035]],
  })], '2026-10-25')
  const oct = groupByPeriod(occs.filter(o => o.periodYm === '2026-10'), convert)[0]
  assert.equal(Math.round(oct.paidBase * 100) / 100, 140)  // 400000 × 0.00035
})

test('income occurrences are tracked apart from obligation totals', () => {
  const occs = schedule([
    recurringItem({ id: 'i', description: 'Salary', amount: 5000,
      payments: [['2026-09-30', 5000], ['2026-10-30', 5000]] }),
    recurringItem({ id: 'e', description: 'Internet', amount: -80,
      payments: [['2026-09-18'], ['2026-10-18']] }),
  ], '2026-10-31')
  const oct = groupByPeriod(occs.filter(o => o.periodYm === '2026-10'))[0]
  assert.equal(oct.scheduledBase, 80)     // income excluded from obligations
  assert.equal(oct.inflowBase, 5000)
})

// ── Member grouping (accordion level 2) ──────────────────────────────────────

test('groupByOwner splits a period by owner with per-member subtotals', () => {
  const occs = schedule([
    recurringItem({ id: 'a', user_id: 'alex', description: 'Mortgage', amount: -2000,
      person: 'Alexander', payments: [['2026-08-25'], ['2026-09-25']] }),
    recurringItem({ id: 'b', user_id: 'alex', description: 'Internet', amount: -80,
      person: 'Alexander', payments: [['2026-09-18'], ['2026-10-18']] }),
    recurringItem({ id: 'c', user_id: 'marcela', description: 'Insurance', amount: -250,
      person: 'Marcela', payments: [['2026-09-05'], ['2026-10-05']] }),
  ], '2026-10-28')

  const groups = groupByOwner(occs.filter(o => o.periodYm === '2026-10'), a => a)
  const byUser = Object.fromEntries(groups.map(g => [g.ownerUserId, g]))

  assert.equal(groups.length, 2)
  // Alexander: 2000 unpaid (Oct mortgage overdue) + 80 settled
  assert.equal(byUser.alex.scheduledBase, 2080)
  assert.equal(byUser.alex.paidBase, 80)
  assert.equal(byUser.alex.outstandingBase, 2000)
  assert.equal(byUser.alex.overdueCount, 1)
  assert.equal(byUser.alex.occurrences.length, 2)
  // Marcela: fully settled
  assert.equal(byUser.marcela.scheduledBase, 250)
  assert.equal(byUser.marcela.outstandingBase, 0)
  assert.equal(byUser.marcela.overdueCount, 0)
})

test('member subtotals add up to the period total without duplication', () => {
  const items = [
    recurringItem({ id: 'a', user_id: 'alex', description: 'Mortgage', amount: -2000,
      payments: [['2026-08-25'], ['2026-09-25'], ['2026-10-27', -1200]] }),
    recurringItem({ id: 'b', user_id: 'marcela', description: 'Rent', amount: -1200,
      payments: [['2026-09-08'], ['2026-10-08']] }),
    // Shared bill: one member pays it, so it belongs to that member only.
    recurringItem({ id: 'c', user_id: 'alex', description: 'Hydro', amount: -140,
      person: 'Shared', payments: [['2026-09-10'], ['2026-10-10']] }),
  ]
  const oct = schedule(items, '2026-10-28').filter(o => o.periodYm === '2026-10')
  const period  = groupByPeriod(oct)[0]
  const members = groupByOwner(oct)

  const sum = k => members.reduce((s, g) => s + g[k], 0)
  assert.equal(sum('scheduledBase'),   period.scheduledBase)
  assert.equal(sum('paidBase'),        period.paidBase)
  assert.equal(sum('outstandingBase'), period.outstandingBase)
  assert.equal(members.reduce((s, g) => s + g.occurrences.length, 0), period.occurrences.length)
  // The shared bill lands under its payer once, not under every member.
  const alex = members.find(g => g.ownerUserId === 'alex')
  assert.equal(alex.occurrences.filter(o => o.obligation.person === 'Shared').length, 1)
})

test('groupByOwner converts currencies the same way groupByPeriod does', () => {
  const convert = (a, cur) => (cur === 'COP' ? a * 0.00032 : a)
  const occs = schedule([
    recurringItem({ id: 'a', user_id: 'alex', description: 'Internet', amount: -80,
      account: { name: 'Scotia', currency: 'CAD' },
      payments: [['2026-09-18'], ['2026-10-18']] }),
    recurringItem({ id: 'b', user_id: 'marcela', description: 'Celular', amount: -400000,
      account: { name: 'Bancolombia', currency: 'COP' },
      payments: [['2026-09-10'], ['2026-10-10']] }),
  ], '2026-10-25')
  const oct = occs.filter(o => o.periodYm === '2026-10')
  const marcela = groupByOwner(oct, convert).find(g => g.ownerUserId === 'marcela')
  assert.equal(Math.round(marcela.scheduledBase * 100) / 100, 128)
  assert.equal(groupByOwner(oct, convert).reduce((s, g) => s + g.scheduledBase, 0),
               groupByPeriod(oct, convert)[0].scheduledBase)
})

test('an unassigned obligation still forms its own group', () => {
  const occs = schedule([recurringItem({
    id: 'x', user_id: null, description: 'Storage', amount: -60, person: null,
    payments: [['2026-09-14'], ['2026-10-14']],
  })], '2026-10-20')
  const groups = groupByOwner(occs.filter(o => o.periodYm === '2026-10'))
  assert.equal(groups.length, 1)
  assert.equal(groups[0].ownerUserId, null)
})

// ── currentOccurrences — what a per-series view should show ─────────────────

const currentFor = (items, today) =>
  currentOccurrences(schedule(items, today), day(today))

test('an unpaid past-due occurrence is the one that needs attention', () => {
  const current = currentFor([recurringItem({
    payments: [['2026-07-25'], ['2026-08-25'], ['2026-09-25']],
  })], '2026-11-01')
  const occ = [...current.values()][0]
  assert.equal(occ.status, STATUS.OVERDUE)
  assert.equal(occ.periodYm, '2026-10')   // not the already-settled September
})

test('with everything settled, the next one due is shown', () => {
  const current = currentFor([recurringItem({
    description: 'Internet', amount: -80,
    payments: [['2026-08-12'], ['2026-09-12'], ['2026-10-12']],
  })], '2026-10-14')
  const occ = [...current.values()][0]
  assert.equal(occ.status, STATUS.UPCOMING)
  assert.equal(+occ.dueDate, +day('2026-11-12'))
  // The old engine added 30 days to the last payment and landed on Nov 11.
  assert.notEqual(+occ.dueDate, +day('2026-11-11'))
})

test('an outstanding occurrence wins over a later unpaid one', () => {
  const current = currentFor([recurringItem({
    payments: [['2026-08-25'], ['2026-09-25']],
  })], '2026-11-20')
  const occ = [...current.values()][0]
  // October and November are both unpaid; October is what is owed first.
  assert.equal(occ.periodYm, '2026-10')
  assert.equal(occ.status, STATUS.OVERDUE)
})

test('a partly paid occurrence stays current until it is settled', () => {
  const current = currentFor([recurringItem({
    payments: [['2026-07-25'], ['2026-08-25'], ['2026-09-25'], ['2026-10-27', -1200]],
  })], '2026-11-05')
  const occ = [...current.values()][0]
  assert.equal(occ.status, STATUS.PARTIAL)
  assert.equal(occ.isOverdue, true)
  assert.equal(occ.remaining, 800)
  assert.equal(occ.periodYm, '2026-10')
})

test('each obligation gets exactly one current occurrence', () => {
  const current = currentFor([
    recurringItem({ id: 'a', user_id: 'alex', description: 'Mortgage', amount: -2000,
      payments: [['2026-08-10'], ['2026-09-10']] }),
    recurringItem({ id: 'b', user_id: 'marcela', description: 'Rent', amount: -1200,
      payments: [['2026-09-08'], ['2026-10-08']] }),
    // Same description, different owner — still its own series.
    recurringItem({ id: 'c', user_id: 'alex', description: 'Rent', amount: -900,
      payments: [['2026-09-03'], ['2026-10-03']] }),
  ], '2026-10-14')
  assert.equal(current.size, 3)
  assert.equal(new Set([...current.values()].map(o => o.obligation.key)).size, 3)
})

test('due today is reported as due today, not overdue', () => {
  const current = currentFor([recurringItem({
    description: 'Gym', amount: -45,
    payments: [['2026-08-14'], ['2026-09-14']],
  })], '2026-10-14')
  assert.equal([...current.values()][0].status, STATUS.DUE_TODAY)
})

test('a settled series never reports overdue', () => {
  // The defect: the Recurring screen called a paid bill overdue because it only
  // looked at the predicted date.
  const current = currentFor([recurringItem({
    description: 'Internet', amount: -80,
    payments: [['2026-08-12'], ['2026-09-12'], ['2026-10-12']],
  })], '2026-10-20')
  const occ = [...current.values()][0]
  assert.equal(occ.isOverdue, false)
  assert.notEqual(occ.status, STATUS.OVERDUE)
})

// ── Declared obligations (phase 3) ──────────────────────────────────────────

// A scheduled_payments row as the hook hands it over.
function rule({
  id = 'r1', user_id = 'alex', name = 'Mortgage', amount = 2000, type = 'expense',
  frequency = 'monthly', anchor_date = '2026-08-10', ends_on = null,
  is_active = true, is_variable = false, person = null,
  account = { name: 'Scotia', currency: 'CAD' },
}) {
  return { id, user_id, name, amount, type, frequency, anchor_date, ends_on,
           is_active, is_variable, person, account }
}

const txn = (id, date, amount) => ({ id, occurred_at: `${date}T12:00:00`, amount })

const declaredSchedule = (rules, today, opts = {}) =>
  buildSchedule(rules.map(([r, linked]) => obligationFromRule(r, linked || [])),
                { today: day(today), ...opts })

test('a declared rule projects with no payments at all', () => {
  // The thing an inferred series could never do: schedule a bill never paid.
  const occs = declaredSchedule([[rule({ anchor_date: '2026-10-10' })]], '2026-10-14')
  assert.ok(occs.length >= 3, `expected future occurrences, got ${occs.length}`)
  assert.equal(occs[0].periodYm, '2026-10')
  assert.equal(occs[0].status, STATUS.OVERDUE)   // due the 10th, today is the 14th
  assert.equal(occs[0].scheduled, 2000)
  assert.equal(find(occs, 'Mortgage', '2026-11').status, STATUS.UPCOMING)
})

test('the declared amount wins over the median of history', () => {
  // Three payments of 1800, but the rule says the obligation is worth 2000.
  const occs = declaredSchedule([[
    rule({ amount: 2000 }),
    [txn('t1', '2026-08-10', -1800), txn('t2', '2026-09-10', -1800)],
  ]], '2026-10-14')
  const sep = find(occs, 'Mortgage', '2026-09')
  assert.equal(sep.scheduled, 2000)
  assert.equal(sep.paid, 1800)
  assert.equal(sep.status, STATUS.PARTIAL)
  assert.equal(sep.remaining, 200)
})

test('a declared anchor does not drift when a payment lands late', () => {
  // Paid on the 27th; an inferred series would re-anchor toward it, a rule won't.
  const occs = declaredSchedule([[
    rule({ anchor_date: '2026-08-10' }),
    [txn('t1', '2026-08-10', -2000), txn('t2', '2026-09-27', -2000)],
  ]], '2026-10-14')
  assert.equal(+find(occs, 'Mortgage', '2026-09').dueDate, +day('2026-09-10'))
  assert.equal(+find(occs, 'Mortgage', '2026-10').dueDate, +day('2026-10-10'))
})

test('nothing is projected before the rule starts', () => {
  const occs = declaredSchedule([[rule({ anchor_date: '2026-10-10' })]], '2026-10-14',
                                { monthsBack: 3, monthsAhead: 1 })
  assert.deepEqual([...new Set(occs.map(o => o.periodYm))], ['2026-10', '2026-11'])
})

test('an ended rule keeps its history and stops projecting', () => {
  const occs = declaredSchedule([[
    rule({ name: 'Old Gym', amount: 45, anchor_date: '2026-08-20', ends_on: '2026-09-20' }),
    [txn('t1', '2026-08-20', -45), txn('t2', '2026-09-20', -45)],
  ]], '2026-10-14')
  const periods = [...new Set(occs.map(o => o.periodYm))]
  assert.deepEqual(periods, ['2026-08', '2026-09'])   // nothing from October on
  assert.ok(occs.every(o => o.status === STATUS.PAID))
})

test('a paused rule stops at today but keeps what came before', () => {
  const occs = declaredSchedule([[
    rule({ anchor_date: '2026-08-10', is_active: false }),
    [txn('t1', '2026-08-10', -2000), txn('t2', '2026-09-10', -2000)],
  ]], '2026-10-14')
  const periods = [...new Set(occs.map(o => o.periodYm))]
  assert.ok(periods.includes('2026-08') && periods.includes('2026-09'))
  assert.ok(!periods.includes('2026-11'), 'a paused rule must not project forward')
})

test('any payment settles a variable obligation', () => {
  // Hydro: estimate 140, actual 90. Not a shortfall — that is just the bill.
  const occs = declaredSchedule([[
    rule({ name: 'Hydro', amount: 140, is_variable: true, anchor_date: '2026-08-05' }),
    [txn('t1', '2026-08-05', -90), txn('t2', '2026-09-05', -205)],
  ]], '2026-10-14')
  const aug = find(occs, 'Hydro', '2026-08')
  const sep = find(occs, 'Hydro', '2026-09')
  assert.equal(aug.status, STATUS.PAID)
  assert.equal(aug.remaining, 0)
  // A settled variable period is worth what it actually cost, so totals are real.
  assert.equal(aug.scheduled, 90)
  assert.equal(sep.scheduled, 205)
  // The future stays an estimate.
  assert.equal(find(occs, 'Hydro', '2026-11').scheduled, 140)
})

test('a variable obligation still goes overdue when nothing is paid', () => {
  const occs = declaredSchedule([[
    rule({ name: 'Hydro', amount: 140, is_variable: true, anchor_date: '2026-08-05' }),
    [txn('t1', '2026-08-05', -90)],
  ]], '2026-10-14')
  assert.equal(find(occs, 'Hydro', '2026-09').status, STATUS.OVERDUE)
  assert.equal(find(occs, 'Hydro', '2026-10').status, STATUS.OVERDUE)
})

test('every scheduled_payments frequency maps to a cadence', () => {
  const expect = { weekly: 7, biweekly: 14, semimonthly: 15, monthly: 30, quarterly: 91, yearly: 365 }
  for (const [word, days] of Object.entries(expect)) {
    const ob = obligationFromRule(rule({ frequency: word }))
    assert.equal(ob.freqDays, days, `${word} should step ${days} days`)
    assert.ok(ob.freqLabel.length > 0)
  }
  // An unknown word falls back to monthly rather than producing NaN dates.
  assert.equal(obligationFromRule(rule({ frequency: 'fortnightly' })).freqDays, 30)
})

test('income rules carry inflow wording', () => {
  const ob = obligationFromRule(rule({ name: 'Salary', amount: 5000, type: 'income' }))
  assert.equal(ob.isIncome, true)
  assert.equal(statusLabel(STATUS.PAID, ob.isIncome), 'Received')
})

test('declared and inferred obligations coexist in one schedule', () => {
  const declared = obligationFromRule(
    rule({ id: 'r1', name: 'Mortgage', amount: 2000, anchor_date: '2026-08-10' }),
    [txn('t1', '2026-08-10', -2000), txn('t2', '2026-09-10', -2000)])
  const legacy = toObligation(recurringItem({
    id: 'x', user_id: 'alex', description: 'Internet', amount: -80,
    payments: [['2026-09-12'], ['2026-10-12']],
  }))
  const occs = buildSchedule([declared, legacy], { today: day('2026-10-14') })

  assert.equal(find(occs, 'Mortgage', '2026-10').status, STATUS.OVERDUE)
  assert.equal(find(occs, 'Internet', '2026-10').status, STATUS.PAID)
  // Totals add both without the declared one being counted twice.
  const oct = groupByPeriod(occs.filter(o => o.periodYm === '2026-10'))[0]
  assert.equal(oct.scheduledBase, 2080)
  assert.equal(oct.occurrences.length, 2)
})

test('a linked transaction settles its rule and nothing else', () => {
  const occs = declaredSchedule([
    [rule({ id: 'r1', name: 'Mortgage', amount: 2000, anchor_date: '2026-08-10' }),
     [txn('t1', '2026-08-10', -2000)]],
    [rule({ id: 'r2', name: 'Rent', amount: 1200, anchor_date: '2026-08-08' }), []],
  ], '2026-10-14')
  const ids = occs.flatMap(o => o.payments.map(p => p.id))
  assert.equal(ids.length, new Set(ids).size)
  assert.equal(find(occs, 'Rent', '2026-08').paid, 0)
  assert.equal(find(occs, 'Mortgage', '2026-08').paid, 2000)
})

test('a date-only column is a calendar date, not a UTC instant', () => {
  // `new Date('2026-08-10')` is UTC midnight, which is 9 August anywhere west of
  // Greenwich. Left unhandled, every declared due date shifts a day earlier.
  assert.equal(+parseDateOnly('2026-08-10'), +day('2026-08-10'))
  assert.equal(parseDateOnly('2026-08-10').getDate(), 10)
  assert.equal(parseDateOnly('2026-01-01').getMonth(), 0)
  assert.equal(parseDateOnly('2026-12-31').getDate(), 31)

  const ob = obligationFromRule(rule({ anchor_date: '2026-08-10', ends_on: '2026-12-10' }))
  assert.equal(ob.anchorDate.getDate(), 10)
  assert.equal(ob.endsOn.getDate(), 10)
})

test('direction comes from type, never from the sign of the stored amount', () => {
  // scheduled_payments.amount is a positive magnitude. Reading its sign would
  // make every expense rule look like income and drop it from obligation totals.
  const expense = obligationFromRule(rule({ amount: 2000, type: 'expense' }))
  assert.equal(expense.isIncome, false)

  const income = obligationFromRule(rule({ amount: 5000, type: 'income' }))
  assert.equal(income.isIncome, true)

  const occs = buildSchedule([obligationFromRule(
    rule({ amount: 2000, type: 'expense', anchor_date: '2026-08-10' }))],
    { today: day('2026-10-14') })
  const oct = groupByPeriod(occs.filter(o => o.periodYm === '2026-10'))[0]
  assert.equal(oct.scheduledBase, 2000)   // counted as an obligation
  assert.equal(oct.inflowBase, 0)         // not as income
})
