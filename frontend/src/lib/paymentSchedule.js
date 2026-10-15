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

// A bare YYYY-MM-DD parses as UTC, so in any negative offset startOfDay() would
// pull it back to the previous day and shift every due date by one. Date-only
// columns (anchor_date, ends_on) are calendar dates, not instants.
export function parseDateOnly(value) {
  if (value instanceof Date) return startOfDay(value)
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value))
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return startOfDay(new Date(value))
}

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
export function resolveStatus({ scheduled, paid, dueDate, today, isVariable = false }) {
  const expected = Math.abs(scheduled)
  const got      = Math.abs(paid)
  const tol      = Math.max(0.01, expected * SETTLED_TOLERANCE)
  const overdue  = dueDate < today

  // On a variable obligation the amount is only an estimate, so any payment in
  // the cycle settles it. Measuring hydro against an estimate would report
  // Partially paid every month the bill came in low.
  if (isVariable && got > CENT)
    return { status: STATUS.PAID, isOverdue: false, remaining: 0, progress: 1 }
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

// Frequencies a series can be detected as. Days are what the projection steps
// by; the label is what the UI shows.
const FREQUENCIES = [
  { days: 7,   label: 'Weekly' },
  { days: 14,  label: 'Biweekly' },
  { days: 15,  label: 'Semi-monthly' },
  { days: 30,  label: 'Monthly' },
  { days: 91,  label: 'Quarterly' },
  { days: 365, label: 'Annual' },
]

// scheduled_payments stores a word; the projection steps in days.
const FREQUENCY_DAYS = {
  weekly: 7, biweekly: 14, semimonthly: 15, monthly: 30, quarterly: 91, yearly: 365,
}
const FREQUENCY_LABEL = {
  weekly: 'Weekly', biweekly: 'Biweekly', semimonthly: 'Semi-monthly',
  monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Annual',
}

// Infers a cadence from observed dates: the median gap, snapped to the nearest
// known frequency. A single observation can't show a gap, so it defaults monthly.
export function detectFrequency(dates) {
  if (dates.length < 2) return { days: 30, label: 'Monthly' }
  const sorted = [...dates].map(d => new Date(d)).sort((a, b) => a - b)
  const gaps = []
  for (let i = 1; i < sorted.length; i++)
    gaps.push((sorted[i] - sorted[i - 1]) / 86400000)
  gaps.sort((a, b) => a - b)
  const median = gaps[Math.floor(gaps.length / 2)]
  return FREQUENCIES.reduce((best, f) =>
    Math.abs(f.days - median) < Math.abs(best.days - median) ? f : best
  )
}

// Collapses recurring transaction rows into one series each, keyed by owner as
// well as description: two household members paying their own "Internet" are two
// obligations, not one merged row. Exported so the notification bell builds the
// same series the screens do.
export function groupRecurring(rows) {
  const groups = new Map()
  ;(rows || []).forEach(t => {
    const key = `${t.user_id || ''}|${t.description.toLowerCase().trim()}`
    const g   = groups.get(key)
    if (g) {
      g._dates.push(t.occurred_at)
      g._txns.push(t)
    } else {
      groups.set(key, { ...t, _key: key, _dates: [t.occurred_at], _txns: [t] })
    }
  })

  return [...groups.values()]
    .map(item => ({ ...item, _count: item._dates.length, _freq: detectFrequency(item._dates) }))
    .sort((a, b) => {
      if ((a.amount > 0) !== (b.amount > 0)) return a.amount > 0 ? -1 : 1
      return Math.abs(b.amount) - Math.abs(a.amount)
    })
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

// Builds an obligation from a declared scheduled_payments row plus whatever
// transactions have been linked to it. Produces exactly the shape toObligation()
// produces for an inferred series, so everything downstream — projection,
// settlement, status, grouping, the UI — is unchanged and cannot tell them apart.
//
// The difference is what the rule knows for itself: its own anchor, its own
// amount, when it ends, and whether that amount is an estimate. An inferred
// series has to guess all four from its payment history.
export function obligationFromRule(rule, linked = []) {
  const isIncome = rule.type === 'income'
  return {
    id:            rule.id,
    key:           `rule:${rule.id}`,
    declared:      true,
    description:   rule.name,
    ownerUserId:   rule.user_id || null,
    person:        rule.person || null,
    accountName:   rule.account?.name || null,
    currency:      rule.account?.currency || null,
    categoryName:  rule.category?.name || null,
    categoryColor: rule.category?.color || null,
    freqDays:      FREQUENCY_DAYS[rule.frequency] ?? 30,
    freqLabel:     FREQUENCY_LABEL[rule.frequency] ?? 'Monthly',
    isIncome,
    // The rule states these; nothing has to be inferred from history.
    anchorDate:     rule.anchor_date ? parseDateOnly(rule.anchor_date) : null,
    endsOn:         rule.ends_on     ? parseDateOnly(rule.ends_on)     : null,
    isActive:       rule.is_active !== false,
    isVariable:     rule.is_variable === true,
    declaredAmount: Math.abs(Number(rule.amount)),
    payments: linked.map(t => ({
      id:           t.id,
      date:         startOfDay(new Date(t.occurred_at)),
      amount:       Number(t.amount),
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
    // An inferred series exists only through its transactions. A declared rule
    // stands on its own — which is the whole point: a bill you have never paid
    // can finally be scheduled.
    if (!ob.declared && !ob.payments?.length) return
    const freq = ob.freqDays || 30
    const half = Math.max(1, Math.round(freq / 2))
    // A declared anchor is stated, not guessed, so it never drifts when a
    // payment lands late.
    const anchor = ob.anchorDate
      ? startOfDay(ob.anchorDate)
      : resolveAnchor(ob.payments.map(p => p.date), freq)

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
    const newest = ob.payments.length
      ? ob.payments.reduce((a, p) => (p.date > a.date ? p : a), ob.payments[0])
      : null
    // A declared amount is what the obligation is worth. The median of recent
    // settled occurrences is the inferred series' best guess at the same thing.
    const scheduled = ob.declaredAmount != null
      ? ob.declaredAmount
      : (history.length ? median(history) : Math.abs(newest.amount))

    // Nothing was owed before the obligation began. A rule says when that was;
    // an inferred series can only point at its first payment, so allow half a
    // cycle there in case that payment was itself late.
    const earliest = ob.anchorDate
      ? startOfDay(ob.anchorDate)
      : (() => {
          const first = ob.payments.reduce((a, p) => (p.date < a ? p.date : a), ob.payments[0].date)
          const d = startOfDay(first); d.setDate(d.getDate() - half)
          return d
        })()

    // A paused rule stops projecting from today; an ended one stops at its last
    // due date. Either way history stays visible — only the future is cut off.
    const latest = ob.endsOn ? startOfDay(ob.endsOn)
                 : ob.isActive === false ? t0
                 : null

    dates.forEach((dueDate, i) => {
      if (dueDate < from || dueDate > to || dueDate < earliest) return
      if (latest && dueDate > latest) return
      const payments = [...buckets[i]].sort((a, b) => a.date - b.date)
      const paid     = payments.reduce((s, p) => s + Math.abs(p.amount), 0)
      // A variable bill that has been paid is worth what it actually cost, so
      // past periods total accurately and only the future stays an estimate.
      const worth = ob.isVariable && paid > CENT ? paid : scheduled
      out.push({
        ...resolveStatus({ scheduled: worth, paid, dueDate, today: t0, isVariable: ob.isVariable }),
        id: `${ob.key}@${ymOf(dueDate)}-${String(dueDate.getDate()).padStart(2, '0')}`,
        obligation: ob,
        periodYm:   ymOf(dueDate),
        dueDate,
        scheduled: worth,
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

function emptyGroup(extra) {
  return {
    ...extra, occurrences: [],
    scheduledBase: 0, paidBase: 0, outstandingBase: 0, inflowBase: 0,
    counts: { paid: 0, partial: 0, overdue: 0, due_today: 0, upcoming: 0 },
    overdueCount: 0,
  }
}

// Income is kept out of the obligation totals: a salary isn't money owed.
function accumulate(g, o, convert) {
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
}

// Groups occurrences into payment periods. Totals run through
// `convert(amount, currency)` — the app's base-currency conversion — so amounts
// in different currencies are never summed raw.
export function groupByPeriod(occurrences, convert = a => a) {
  const map = new Map()
  occurrences.forEach(o => {
    if (!map.has(o.periodYm)) map.set(o.periodYm, emptyGroup({ ym: o.periodYm }))
    accumulate(map.get(o.periodYm), o, convert)
  })
  return [...map.values()].sort((a, b) => a.ym.localeCompare(b.ym))
}

// Groups occurrences by who owns the obligation, with the same totals as a
// period group. Ownership follows the transaction's user_id, so a shared bill
// belongs to the one member who pays it and is counted once.
export function groupByOwner(occurrences, convert = a => a) {
  const map = new Map()
  occurrences.forEach(o => {
    const { ownerUserId, person } = o.obligation
    const key = ownerUserId || person || ''
    if (!map.has(key)) map.set(key, emptyGroup({ key, ownerUserId, person }))
    accumulate(map.get(key), o, convert)
  })
  return [...map.values()]
}

export const isOutstanding = o => o.status !== STATUS.PAID

// The one occurrence per obligation that needs attention now: the earliest that
// is still outstanding, or — when the whole window is settled — the next one
// due. Keyed by obligation key. This is what a per-series view (the Recurring
// screen, the notification bell) should show, so every surface reads the same
// schedule the Dashboard does.
export function currentOccurrences(occurrences, today = new Date()) {
  const t0     = startOfDay(today)
  const groups = new Map()
  occurrences.forEach(o => {
    const list = groups.get(o.obligation.key)
    if (list) list.push(o)
    else groups.set(o.obligation.key, [o])
  })

  const out = new Map()
  groups.forEach((list, key) => {
    // buildSchedule returns occurrences in due-date order, so find() takes the
    // earliest match in both passes.
    out.set(key, list.find(isOutstanding)
               || list.find(o => o.dueDate >= t0)
               || list[list.length - 1])
  })
  return out
}
