// Payment schedule & status for recurring obligations.
//
// Hacienda has no payments table: a `transactions` row IS the record that money
// moved (`transactions.status` in 001_schema.sql is a reconciliation state, not
// a payment state). So an obligation's schedule is projected from the dates it
// has actually occurred on, and every projected occurrence is then settled by
// matching real transactions against it.
//
// That keeps the two concepts apart:
//   · payment period — the calendar month the occurrence's due date falls in.
//     Fixed once projected: an unpaid October bill stays in October forever.
//   · payment status — derived only from transactions that exist, so a due date
//     that hasn't passed never implies the obligation was paid.

export const STATUS = {
  PAID:      'paid',
  PARTIAL:   'partial',
  OVERDUE:   'overdue',
  DUE_TODAY: 'due_today',
  UPCOMING:  'upcoming',
}

const OUTFLOW_LABELS = {
  paid: 'Paid', partial: 'Partially paid', overdue: 'Overdue',
  due_today: 'Due today', upcoming: 'Upcoming',
}
const INFLOW_LABELS = {
  paid: 'Received', partial: 'Partly received', overdue: 'Not received',
  due_today: 'Expected today', upcoming: 'Expected',
}

export function statusLabel(status, isIncome) {
  return (isIncome ? INFLOW_LABELS : OUTFLOW_LABELS)[status] || status
}

// An occurrence counts as settled within 2% of the scheduled amount — recurring
// bills (interest, usage, FX) rarely land on the exact cent.
const SETTLED_TOLERANCE = 0.02
const CENT = 0.005
// Safety stop for the projection walk (~65 years of monthly occurrences).
const MAX_STEPS = 800
// How many past occurrences feed the scheduled-amount median.
const HISTORY_WINDOW = 6

// Monthly-family frequencies step by calendar months, so the day of month is
// kept across differing month lengths and year boundaries. Shorter cycles
// (weekly, biweekly, semi-monthly) step by days.
const MONTH_STEP = { 30: 1, 91: 3, 365: 12 }

export function startOfDay(d) {
  const x = new Date(d)
  return new Date(x.getFullYear(), x.getMonth(), x.getDate())
}

export function ymOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function shiftYm(ym, delta) {
  const [y, m] = ym.split('-').map(Number)
  return ymOf(new Date(y, m - 1 + delta, 1))
}

export function periodBounds(ym) {
  const [y, m] = ym.split('-').map(Number)
  return { first: new Date(y, m - 1, 1), last: new Date(y, m, 0) }
}

function median(nums) {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

const daysBetween = (a, b) => Math.round((a - b) / 86400000)

// The i-th occurrence after `anchor` (i may be negative for earlier periods).
export function occurrenceDate(anchor, freqDays, i) {
  const months = MONTH_STEP[freqDays]
  if (!months) {
    const d = startOfDay(anchor)
    d.setDate(d.getDate() + freqDays * i)
    return d
  }
  const day     = anchor.getDate()
  const probe   = new Date(anchor.getFullYear(), anchor.getMonth() + months * i, 1)
  const lastDay = new Date(probe.getFullYear(), probe.getMonth() + 1, 0).getDate()
  return new Date(probe.getFullYear(), probe.getMonth(), Math.min(day, lastDay))
}

// One late payment shouldn't drag the whole projection sideways: monthly-family
// obligations anchor on the median day of month, carried onto the latest month
// they were seen in. Shorter cycles step straight from the latest date.
function resolveAnchor(dates, freqDays) {
  const days  = dates.map(startOfDay).sort((a, b) => a - b)
  const latest = days[days.length - 1]
  if (!MONTH_STEP[freqDays]) return latest
  const day     = median(days.map(d => d.getDate()))
  const lastDay = new Date(latest.getFullYear(), latest.getMonth() + 1, 0).getDate()
  return new Date(latest.getFullYear(), latest.getMonth(), Math.min(day, lastDay))
}

function occurrenceDatesIn(anchor, freqDays, from, to) {
  const back = []
  for (let i = 0; i >= -MAX_STEPS; i--) {
    const d = occurrenceDate(anchor, freqDays, i)
    if (d < from) break
    if (d <= to) back.push(d)
  }
  const out = back.reverse()
  for (let i = 1; i <= MAX_STEPS; i++) {
    const d = occurrenceDate(anchor, freqDays, i)
    if (d > to) break
    if (d >= from) out.push(d)
  }
  return out
}

// Status comes from money actually received against the occurrence, never from
// the due date alone. A partially paid occurrence past its due date reports
// both: status 'partial' plus isOverdue.
export function resolveStatus({ scheduled, paid, dueDate, today }) {
  const expected = Math.abs(scheduled)
  const got      = Math.abs(paid)
  const tol      = Math.max(0.01, expected * SETTLED_TOLERANCE)
  const overdue  = dueDate < today

  if (expected > CENT && got >= expected - tol)
    return { status: STATUS.PAID, isOverdue: false, remaining: 0, progress: 1 }
  if (got > CENT)
    return {
      status: STATUS.PARTIAL, isOverdue: overdue,
      remaining: Math.max(0, expected - got),
      progress: expected > CENT ? Math.min(got / expected, 1) : 0,
    }
  if (overdue)
    return { status: STATUS.OVERDUE, isOverdue: true, remaining: expected, progress: 0 }
  if (+dueDate === +today)
    return { status: STATUS.DUE_TODAY, isOverdue: false, remaining: expected, progress: 0 }
  return { status: STATUS.UPCOMING, isOverdue: false, remaining: expected, progress: 0 }
}

// Maps one grouped entry from useRecurring() — the newest transaction in the
// group, plus `_txns` (every transaction in it) and `_freq` — to an obligation.
export function toObligation(item) {
  const rows = item._txns?.length ? item._txns : [item]
  return {
    id:            item.id,
    key:           item._key || `${item.user_id || ''}|${item.description}`,
    description:   item.description,
    ownerUserId:   item.user_id || null,
    person:        item.person || null,
    accountName:   item.account?.name || null,
    currency:      item.account?.currency || null,
    categoryName:  item.category?.name || null,
    categoryColor: item.category?.color || null,
    freqDays:      item._freq?.days ?? 30,
    freqLabel:     item._freq?.label ?? 'Monthly',
    isIncome:      Number(item.amount) > 0,
    payments: rows.map(t => ({
      id:           t.id,
      date:         startOfDay(new Date(t.occurred_at)),
      amount:       Number(t.amount),
      // Rate captured when the transaction was recorded, preferred over the
      // month's effective rate (same precedence as the rest of the app).
      exchangeRate: t.exchange_rate ? Number(t.exchange_rate) : null,
    })),
  }
}

// Projects every obligation across [monthsBack, monthsAhead] around `today` and
// settles each occurrence from its real transactions.
export function buildSchedule(obligations, { today = new Date(), monthsBack = 3, monthsAhead = 2 } = {}) {
  const t0   = startOfDay(today)
  const from = periodBounds(shiftYm(ymOf(t0), -monthsBack)).first
  const to   = periodBounds(shiftYm(ymOf(t0),  monthsAhead)).last
  const out  = []

  obligations.forEach(ob => {
    if (!ob.payments?.length) return
    const freq   = ob.freqDays || 30
    const half   = Math.max(1, Math.round(freq / 2))
    const anchor = resolveAnchor(ob.payments.map(p => p.date), freq)

    // Project a cycle past each edge so a bill paid early or late at the window
    // boundary still settles against its own occurrence instead of a neighbour's.
    const padFrom = startOfDay(from); padFrom.setDate(padFrom.getDate() - freq)
    const padTo   = startOfDay(to);   padTo.setDate(padTo.getDate() + freq)
    const dates   = occurrenceDatesIn(anchor, freq, padFrom, padTo)
    if (!dates.length) return

    // Each transaction settles exactly one occurrence — the nearest due date
    // within half a cycle — so no payment is ever counted twice.
    const buckets = dates.map(() => [])
    ob.payments.forEach(p => {
      let best = -1, bestGap = Infinity
      dates.forEach((d, i) => {
        const gap = Math.abs(daysBetween(p.date, d))
        if (gap < bestGap) { bestGap = gap; best = i }
      })
      if (best >= 0 && bestGap <= half) buckets[best].push(p)
    })

    // What the obligation is worth per cycle: the median of past occurrences
    // that saw money, so a single short payment can't redefine it. Falls back to
    // the newest transaction when there is no settled history yet.
    const history = dates
      .map((d, i) => ({ d, total: buckets[i].reduce((s, p) => s + Math.abs(p.amount), 0) }))
      .filter(o => o.d < t0 && o.total > CENT)
      .slice(-HISTORY_WINDOW)
      .map(o => o.total)
    const newest    = ob.payments.reduce((a, p) => (p.date > a.date ? p : a), ob.payments[0])
    const scheduled = history.length ? median(history) : Math.abs(newest.amount)

    // Nothing was owed before the obligation first appeared, so don't project
    // backwards past it — allowing half a cycle in case that first payment was
    // itself late.
    const firstSeen = ob.payments.reduce((a, p) => (p.date < a ? p.date : a), ob.payments[0].date)
    const earliest  = startOfDay(firstSeen); earliest.setDate(earliest.getDate() - half)

    dates.forEach((dueDate, i) => {
      if (dueDate < from || dueDate > to || dueDate < earliest) return
      const payments = [...buckets[i]].sort((a, b) => a.date - b.date)
      const paid     = payments.reduce((s, p) => s + Math.abs(p.amount), 0)
      out.push({
        ...resolveStatus({ scheduled, paid, dueDate, today: t0 }),
        id: `${ob.key}@${ymOf(dueDate)}-${String(dueDate.getDate()).padStart(2, '0')}`,
        obligation: ob,
        periodYm:   ymOf(dueDate),
        dueDate,
        scheduled,
        paid,
        payments,
        // The date money actually moved, kept separate from the due date.
        lastPaymentDate: payments.length ? payments[payments.length - 1].date : null,
        daysFromDue: daysBetween(dueDate, t0),
      })
    })
  })

  out.sort((a, b) =>
    a.dueDate - b.dueDate ||
    a.obligation.description.localeCompare(b.obligation.description))
  return out
}

// Converts an occurrence's settled amount to base currency, preferring each
// transaction's own captured rate over the month's effective rate.
export function paidInBase(occurrence, convert) {
  const cur = occurrence.obligation.currency
  return occurrence.payments.reduce((s, p) => s + (
    p.exchangeRate ? Math.abs(p.amount) * p.exchangeRate : convert(Math.abs(p.amount), cur)
  ), 0)
}

// Groups occurrences into payment periods. Totals run through
// `convert(amount, currency)` — the app's base-currency conversion — so amounts
// in different currencies are never summed raw.
export function groupByPeriod(occurrences, convert = a => a) {
  const map = new Map()
  occurrences.forEach(o => {
    if (!map.has(o.periodYm)) map.set(o.periodYm, {
      ym: o.periodYm, occurrences: [],
      scheduledBase: 0, paidBase: 0, outstandingBase: 0, inflowBase: 0,
      counts: { paid: 0, partial: 0, overdue: 0, due_today: 0, upcoming: 0 },
      overdueCount: 0,
    })
    const g   = map.get(o.periodYm)
    const cur = o.obligation.currency
    g.occurrences.push(o)
    g.counts[o.status] = (g.counts[o.status] || 0) + 1
    if (o.isOverdue) g.overdueCount++
    if (o.obligation.isIncome) {
      g.inflowBase += convert(o.scheduled, cur)
    } else {
      g.scheduledBase   += convert(o.scheduled, cur)
      g.paidBase        += paidInBase(o, convert)
      g.outstandingBase += convert(o.remaining, cur)
    }
  })
  return [...map.values()].sort((a, b) => a.ym.localeCompare(b.ym))
}

export const isOutstanding = o => o.status !== STATUS.PAID
