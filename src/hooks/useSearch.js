import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export function useSearch() {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open,    setOpen]    = useState(false)
  const timer = useRef(null)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setOpen(false)
      return
    }

    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('transactions')
        .select('id, description, amount, occurred_at, type, category:categories(name, color), account:accounts(name)')
        .ilike('description', `%${q}%`)
        .order('occurred_at', { ascending: false })
        .limit(8)

      setResults(data || [])
      setOpen(true)
      setLoading(false)
    }, 300)

    return () => clearTimeout(timer.current)
  }, [query])

  function clear() {
    setQuery('')
    setResults([])
    setOpen(false)
  }

  return { query, setQuery, results, loading, open, setOpen, clear }
}
