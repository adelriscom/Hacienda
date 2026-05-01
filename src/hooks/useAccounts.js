import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useHousehold } from '../lib/household'

export function useAccounts() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const { isFamily, myUserId } = useHousehold()

  const load = useCallback(async () => {
    let query = supabase.from('accounts').select('*').order('currency').order('name')
    if (!isFamily && myUserId) query = query.eq('user_id', myUserId)
    const { data } = await query
    setAccounts(data || [])
    setLoading(false)
  }, [isFamily, myUserId])

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
