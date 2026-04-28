import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useAccounts() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .order('currency')
      .order('name')
    setAccounts(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function addAccount(values) {
    const { data: { session } } = await supabase.auth.getSession()
    const user_id = session?.user?.id
    const { error } = await supabase.from('accounts').insert([{ ...values, user_id }])
    if (error) throw error
    await load()
  }

  async function updateAccount(id, values) {
    const { error } = await supabase.from('accounts').update(values).eq('id', id)
    if (error) throw error
    await load()
  }

  async function toggleActive(id, current) {
    const { error } = await supabase.from('accounts').update({ is_active: !current }).eq('id', id)
    if (error) throw error
    await load()
  }

  return { accounts, loading, addAccount, updateAccount, toggleActive, reload: load }
}
