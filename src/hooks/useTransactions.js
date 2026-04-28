import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

function computeTag(t) {
  if (t.status === 'ghost')    return { kind: 'ghost',  txt: 'Cargo fantasma' }
  if (t.status === 'review')   return { kind: 'warn',   txt: 'Por revisar' }
  if (t.status === 'duplicate')return { kind: 'warn',   txt: 'Duplicado' }
  if (t.type   === 'income')   return { kind: 'income', txt: 'Ingreso' }
  if (t.type   === 'transfer') return { kind: 'ok',     txt: 'Transferencia' }
  if (t.is_recurring)          return { kind: 'ok',     txt: 'Recurrente' }
  return null
}

export function useTransactions() {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('transactions')
      .select('*, account:accounts(name), category:categories(name, color)')
      .order('occurred_at', { ascending: false })
      .limit(200)

    if (error) {
      setError(error)
    } else {
      setTransactions((data || []).map(t => ({ ...t, tag: computeTag(t) })))
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function addTransaction(values) {
    const { error } = await supabase.from('transactions').insert([values])
    if (error) throw error
    await load()
  }

  async function addTransactions(rows) {
    const { error } = await supabase.from('transactions').insert(rows)
    if (error) throw error
    await load()
  }

  return { transactions, loading, error, refresh: load, addTransaction, addTransactions }
}
