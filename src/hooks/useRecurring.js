import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

function predictNext(lastDateStr) {
  const d = new Date(lastDateStr)
  return new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

export function useRecurring() {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('transactions')
      .select('*, account:accounts(name), category:categories(name, color)')
      .eq('is_recurring', true)
      .order('occurred_at', { ascending: false })

    // Group by normalized description to surface unique recurring items
    const groups = new Map()
    ;(data || []).forEach(t => {
      const key = t.description.toLowerCase().trim()
      if (!groups.has(key)) {
        groups.set(key, { ...t, _dates: [t.occurred_at] })
      } else {
        groups.get(key)._dates.push(t.occurred_at)
      }
    })

    const result = [...groups.values()].map(item => ({
      ...item,
      _count:    item._dates.length,
      _nextDate: predictNext(item.occurred_at),
    }))

    // Sort: income first (amount > 0), then by absolute amount desc
    result.sort((a, b) => {
      if ((a.amount > 0) !== (b.amount > 0)) return a.amount > 0 ? -1 : 1
      return Math.abs(b.amount) - Math.abs(a.amount)
    })

    setItems(result)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function removeRecurring(id) {
    const { error } = await supabase
      .from('transactions').update({ is_recurring: false }).eq('id', id)
    if (error) throw error
    await load()
  }

  return { items, loading, removeRecurring, refresh: load }
}
