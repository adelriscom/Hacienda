import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { toObligation, buildSchedule, currentOccurrences } from '../lib/paymentSchedule'

const FREQUENCIES = [
  { days: 7,   label: 'Weekly' },
  { days: 14,  label: 'Biweekly' },
  { days: 15,  label: 'Semi-monthly' },
  { days: 30,  label: 'Monthly' },
  { days: 91,  label: 'Quarterly' },
  { days: 365, label: 'Annual' },
]

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
