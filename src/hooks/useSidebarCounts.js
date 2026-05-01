import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useSidebarCounts() {
  const [counts, setCounts] = useState({ expenses: null, income: null, review: null })

  useEffect(() => {
    async function load() {
      const now   = new Date()
      const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const next  = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      const end   = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`

      const [{ count: expenses }, { count: income }, { count: review }] = await Promise.all([
        supabase.from('transactions').select('*', { count: 'exact', head: true })
          .eq('type', 'expense').gte('occurred_at', start).lt('occurred_at', end),
        supabase.from('transactions').select('*', { count: 'exact', head: true })
          .eq('type', 'income').gte('occurred_at', start).lt('occurred_at', end),
        supabase.from('transactions').select('*', { count: 'exact', head: true })
          .eq('status', 'review').gte('occurred_at', start).lt('occurred_at', end),
      ])

      setCounts({ expenses: expenses || 0, income: income || 0, review: review || 0 })
    }
    load()
  }, [])

  return counts
}
