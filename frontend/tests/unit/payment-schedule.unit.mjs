// Unit tests for the payment-schedule derivation (src/lib/paymentSchedule.js).
// Pure logic, no Supabase — run with:  node tests/unit/payment-schedule.unit.mjs
// Kept out of *.spec.js so Playwright's testMatch doesn't pick it up.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  STATUS, buildSchedule, toObligation, groupByPeriod, occurrenceDate,
  resolveStatus, startOfDay, isOutstanding, statusLabel,
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
