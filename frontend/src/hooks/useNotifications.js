import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useHousehold } from '../lib/household'

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

      setItems(notifications)
      setLoading(false)
    }
    load()
  }, [isFamily, myUserId])

  return { items, count: items.length, loading }
}
