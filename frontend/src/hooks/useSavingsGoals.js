import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useHousehold } from '../lib/household'

export function useSavingsGoals() {
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const { isFamily, myUserId } = useHousehold()

  const load = useCallback(async () => {
    let query = supabase.from('savings_goals').select('*').order('created_at')
    if (!isFamily && myUserId) query = query.eq('user_id', myUserId)
    const { data } = await query
    setGoals(data || [])
    setLoading(false)
  }, [isFamily, myUserId])

  useEffect(() => { load() }, [load])

  async function addGoal(values) {
    const { data: { session } } = await supabase.auth.getSession()
    const user_id = session?.user?.id
    const { error } = await supabase.from('savings_goals').insert([{ ...values, user_id }])
    if (error) throw error
    await load()
  }

  async function updateGoal(id, values) {
    const { error } = await supabase.from('savings_goals').update(values).eq('id', id)
    if (error) throw error
    await load()
  }

  async function deleteGoal(id) {
    const { error } = await supabase.from('savings_goals').delete().eq('id', id)
    if (error) throw error
    await load()
  }

  return { goals, loading, addGoal, updateGoal, deleteGoal, reload: load }
}
