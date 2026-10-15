import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

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

export function predictNext(lastDateStr, frequencyDays) {
  const d = new Date(lastDateStr)
  d.setDate(d.getDate() + frequencyDays)
  return d
}

// `userId` scopes the result to one profile's own recurring transactions; pass
// null (the default) for the whole household, which is what RLS already allows.
export function useRecurring({ userId = null } = {}) {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)

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

    // Keyed by owner as well as description: two household members paying their
    // own "Internet" are two obligations, not one merged row.
    const groups = new Map()
    ;(data || []).forEach(t => {
      const key = `${t.user_id || ''}|${t.description.toLowerCase().trim()}`
      if (!groups.has(key))
        groups.set(key, { ...t, _key: key, _dates: [t.occurred_at], _txns: [t] })
      else {
        const g = groups.get(key)
        g._dates.push(t.occurred_at)
        g._txns.push(t)
      }
    })

    const result = [...groups.values()].map(item => {
      const freq = detectFrequency(item._dates)
      return {
        ...item,
        _count:    item._dates.length,
        _freq:     freq,
        _nextDate: predictNext(item.occurred_at, freq.days),
      }
    })

    result.sort((a, b) => {
      if ((a.amount > 0) !== (b.amount > 0)) return a.amount > 0 ? -1 : 1
      return Math.abs(b.amount) - Math.abs(a.amount)
    })

    setItems(result)
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  async function removeRecurring(id) {
    const { error } = await supabase
      .from('transactions').update({ is_recurring: false }).eq('id', id)
    if (error) throw error
    await load()
  }

  return { items, loading, removeRecurring, refresh: load }
}
