import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  groupRecurring, toObligation, buildSchedule, currentOccurrences,
} from '../lib/paymentSchedule'

// `userId` scopes the result to one profile's own recurring transactions; pass
// null (the default) for the whole household, which is what RLS already allows.
export function useRecurring({ userId = null } = {}) {
  const [items,       setItems]       = useState([])
  const [occurrences, setOccurrences] = useState([])
  const [loading,     setLoading]     = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('transactions')
      .select('*, account:accounts(name, currency), category:categories(name, color)')
      .eq('is_recurring', true)
      // Ghost and duplicate rows aren't real money, so they can't settle an
      // obligation or inflate its history.
      .neq('status', 'ghost').neq('status', 'duplicate')
      .order('occurred_at', { ascending: false })
    if (userId) query = query.eq('user_id', userId)
    const { data } = await query

    const grouped  = groupRecurring(data)
    const schedule = buildSchedule(grouped.map(toObligation))
    const current  = currentOccurrences(schedule)

    setItems(grouped.map(item => ({ ...item, _occurrence: current.get(item._key) || null })))
    setOccurrences(schedule)
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  // Takes a grouped item and unflags every transaction in the series. Clearing
  // only the group's representative would leave the rest flagged, and the series
  // would simply reappear behind an older transaction.
  async function removeRecurring(item) {
    const ids = item?._txns?.length ? item._txns.map(t => t.id) : [item?.id ?? item]
    const { error } = await supabase
      .from('transactions').update({ is_recurring: false }).in('id', ids)
    if (error) throw error
    await load()
  }

  return { items, occurrences, loading, removeRecurring, refresh: load }
}
