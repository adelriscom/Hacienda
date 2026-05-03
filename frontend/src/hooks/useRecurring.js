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

    const groups = new Map()
    ;(data || []).forEach(t => {
      const key = t.description.toLowerCase().trim()
      if (!groups.has(key)) groups.set(key, { ...t, _dates: [t.occurred_at] })
      else groups.get(key)._dates.push(t.occurred_at)
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
