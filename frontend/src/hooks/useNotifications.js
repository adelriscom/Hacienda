import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useHousehold } from '../lib/household'
import {
  groupRecurring, toObligation, obligationFromRule, buildSchedule,
  currentOccurrences, statusLabel, isOutstanding, STATUS,
} from '../lib/paymentSchedule'

function nowMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function useNotifications() {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const { isFamily, myUserId } = useHousehold()

  useEffect(() => {
    async function load() {
      const ym    = nowMonth()
      const [y, m] = ym.split('-').map(Number)
      const start = `${ym}-01`
      const end   = new Date(y, m, 1).toISOString()

      function base() {
        let q = supabase.from('transactions').select('*', { count: 'exact', head: true })
        if (!isFamily && myUserId) q = q.eq('user_id', myUserId)
        return q
      }

      const notifications = []

      // 1. Review queue
      const { count: reviewCount } = await base().eq('status', 'review')
      if (reviewCount > 0) {
        notifications.push({
          id:       'review',
          type:     'review',
          title:    `${reviewCount} transaction${reviewCount !== 1 ? 's' : ''} to review`,
          body:     'Needs categorization or approval',
          path:     '/review',
          severity: 'warn',
        })
      }

      // 2. Budget alerts for current month
      const { data: budgets } = await supabase
        .from('budgets')
        .select('id, amount, category_id, category:categories(name, color)')
        .eq('month', start)

      if (budgets?.length) {
        let txQ = supabase
          .from('transactions')
          .select('category_id, amount')
          .gte('occurred_at', start)
          .lt('occurred_at', end)
          .lt('amount', 0)
        if (!isFamily && myUserId) txQ = txQ.eq('user_id', myUserId)
        const { data: txs } = await txQ

        const spending = {}
        ;(txs || []).forEach(t => {
          if (t.category_id) spending[t.category_id] = (spending[t.category_id] || 0) + Math.abs(t.amount)
        })

        budgets.forEach(b => {
          const spent = spending[b.category_id] || 0
          const pct   = b.amount > 0 ? (spent / b.amount) * 100 : 0
          const name  = b.category?.name || 'Budget'
          const fmtAmt = n => '$' + Math.round(n).toLocaleString('en-CA')

          if (pct >= 100) {
            notifications.push({
              id:       `budget-over-${b.id}`,
              type:     'budget',
              title:    `${name} over budget`,
              body:     `${fmtAmt(spent)} spent of ${fmtAmt(b.amount)} (${Math.round(pct)}%)`,
              path:     '/budgets',
              severity: 'neg',
            })
          } else if (pct >= 80) {
            notifications.push({
              id:       `budget-warn-${b.id}`,
              type:     'budget',
              title:    `${name} at ${Math.round(pct)}%`,
              body:     `${fmtAmt(spent)} of ${fmtAmt(b.amount)} used this month`,
              path:     '/budgets',
              severity: 'warn',
            })
          }
        })
      }

      // 3. Recurring obligations that are still owed and due within 3 days.
      //    Same grouping and same schedule the screens use, so the bell can't
      //    disagree with the Dashboard about when a bill is due or whether it
      //    has already been paid.
      let txQuery = supabase
        .from('transactions')
        .select('*, account:accounts(name, currency)')
        .or('is_recurring.eq.true,obligation_id.not.is.null')
        .neq('status', 'ghost').neq('status', 'duplicate')
        .order('occurred_at', { ascending: false })
      if (!isFamily && myUserId) txQuery = txQuery.eq('user_id', myUserId)

      let ruleQuery = supabase
        .from('scheduled_payments')
        .select('*, account:accounts(name, currency)')
      if (!isFamily && myUserId) ruleQuery = ruleQuery.eq('user_id', myUserId)

      let [txResult, { data: rules }] = await Promise.all([txQuery, ruleQuery])

      // `is_recurring` is only how unadopted series are found; once migration
      // 019 drops it the or(...) fails and the links are all that matter.
      if (txResult.error) {
        let linkedOnly = supabase
          .from('transactions')
          .select('*, account:accounts(name, currency)')
          .not('obligation_id', 'is', null)
          .neq('status', 'ghost').neq('status', 'duplicate')
          .order('occurred_at', { ascending: false })
        if (!isFamily && myUserId) linkedOnly = linkedOnly.eq('user_id', myUserId)
        txResult = await linkedOnly
      }
      const recurringTxs = txResult.data || []

      if (recurringTxs.length || rules?.length) {
        // Same two producers the screens use, so a declared obligation raises a
        // notification and an unadopted series still does too.
        const linked = new Map()
        recurringTxs.forEach(t => {
          if (!t.obligation_id) return
          const list = linked.get(t.obligation_id)
          if (list) list.push(t); else linked.set(t.obligation_id, [t])
        })
        const declaredObs = (rules || []).map(r => obligationFromRule(r, linked.get(r.id) || []))
        const grouped     = groupRecurring(recurringTxs.filter(t => !t.obligation_id && t.is_recurring))
        const byKey       = new Map([
          ...grouped.map(g => [g._key, g]),
          ...(rules || []).map(r => [`rule:${r.id}`, { description: r.name }]),
        ])
        const current = currentOccurrences(
          buildSchedule([...declaredObs, ...grouped.map(toObligation)]))

        for (const [key, occ] of current) {
          // A settled obligation is not a notification, however close its due
          // date is — this is what the old date-only check got wrong.
          if (!isOutstanding(occ)) continue
          if (occ.daysFromDue > 3) continue

          const item   = byKey.get(key)
          const d      = occ.daysFromDue
          const amount = occ.status === STATUS.PARTIAL ? occ.remaining : occ.scheduled
          const fmtAmt = '$' + Math.abs(amount).toLocaleString('en-CA', { minimumFractionDigits: 2 })
          const when   = d < 0  ? `${Math.abs(d)}d overdue`
                       : d === 0 ? 'due today'
                       : d === 1 ? 'due tomorrow'
                       : `due in ${d} days`
          const label  = occ.status === STATUS.PARTIAL
            ? `${statusLabel(occ.status, occ.obligation.isIncome)} · ${fmtAmt} left`
            : fmtAmt

          notifications.push({
            id:       `recurring-${occ.id}`,
            type:     'recurring',
            title:    item?.description || occ.obligation.description,
            body:     `${label} · ${occ.obligation.freqLabel} · ${when}`,
            path:     '/recurring',
            severity: occ.isOverdue ? 'neg' : 'warn',
          })
        }
      }

      setItems(notifications)
      setLoading(false)
    }
    load()
  }, [isFamily, myUserId])

  return { items, count: items.length, loading }
}
