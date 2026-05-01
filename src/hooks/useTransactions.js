import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useHousehold } from '../lib/household'

function computeTag(t) {
  if (t.status === 'ghost')    return { kind: 'ghost',  key: 'ghost' }
  if (t.status === 'review')   return { kind: 'warn',   key: 'review' }
  if (t.status === 'duplicate')return { kind: 'warn',   key: 'duplicate' }
  if (t.type   === 'income')   return { kind: 'income', key: 'income' }
  if (t.type   === 'transfer') return { kind: 'ok',     key: 'transfer' }
  if (t.is_recurring)          return { kind: 'ok',     key: 'recurring' }
  return null
}

export function useTransactions() {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { isFamily, myUserId } = useHousehold()

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('transactions')
      .select('*, account:accounts(name), category:categories(name, color)')
      .order('occurred_at', { ascending: false })
      .limit(2000)
    if (!isFamily && myUserId) query = query.eq('user_id', myUserId)
    const { data, error } = await query

    if (error) {
      setError(error)
    } else {
      setTransactions((data || []).map(t => ({ ...t, tag: computeTag(t) })))
    }
    setLoading(false)
  }, [isFamily, myUserId])

  useEffect(() => { load() }, [load])

  async function addTransaction(values) {
    const { data: { session } } = await supabase.auth.getSession()
    const user_id = session?.user?.id
    const { error } = await supabase.from('transactions').insert([{ ...values, user_id }])
    if (error) throw error
    await load()
  }

  async function addTransactions(rows) {
    const { data: { session } } = await supabase.auth.getSession()
    const user_id = session?.user?.id
    const withUserId = rows.map(r => ({ ...r, user_id }))
    const { error } = await supabase.from('transactions').insert(withUserId)
    if (error) throw error
    await load()
  }

  async function updateTransaction(id, values) {
    const { error } = await supabase.from('transactions').update(values).eq('id', id)
    if (error) throw error
    await load()
  }

  async function deleteTransaction(id) {
    const { error } = await supabase.from('transactions').delete().eq('id', id)
    if (error) throw error
    await load()
  }

  return { transactions, loading, error, refresh: load, addTransaction, addTransactions, updateTransaction, deleteTransaction }
}
