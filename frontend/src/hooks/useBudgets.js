import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useBudgets(month) {
  const [budgets,  setBudgets]  = useState([])
  const [spending, setSpending] = useState({})  // { category_id: { CAD: n, COP: n } }
  const [loading,  setLoading]  = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [y, m] = month.split('-').map(Number)
    const start    = `${month}-01`
    const nextDate = new Date(y, m, 1)
    const monthEnd = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-01`

    const [{ data: budgetData }, { data: txData }] = await Promise.all([
      supabase.from('budgets')
        .select('*, category:categories(name, color)')
        .eq('month', start),
      supabase.from('transactions')
        .select('category_id, amount, account:accounts(currency)')
        .gte('occurred_at', start)
        .lt('occurred_at', monthEnd)
        .eq('type', 'expense')
        .lt('amount', 0),
    ])

    setBudgets(budgetData || [])

    const spendMap = {}
    ;(txData || []).forEach(t => {
      if (!t.category_id) return
      const currency = t.account?.currency || 'CAD'
      if (!spendMap[t.category_id]) spendMap[t.category_id] = { CAD: 0, COP: 0 }
      spendMap[t.category_id][currency] += Math.abs(t.amount)
    })
    setSpending(spendMap)
    setLoading(false)
  }, [month])

  useEffect(() => { load() }, [load])

  async function addBudget(category_id, amount, currency = 'CAD') {
    const { data: { session } } = await supabase.auth.getSession()
    const user_id = session?.user?.id
    const { error } = await supabase.from('budgets')
      .upsert(
        [{ user_id, category_id, month: `${month}-01`, amount: parseFloat(amount), currency }],
        { onConflict: 'user_id,category_id,month' }
      )
    if (error) throw error
    await load()
  }

  async function updateBudget(id, amount, currency) {
    const updates = { amount: parseFloat(amount) }
    if (currency) updates.currency = currency
    const { error } = await supabase.from('budgets').update(updates).eq('id', id)
    if (error) throw error
    await load()
  }

  async function deleteBudget(id) {
    const { error } = await supabase.from('budgets').delete().eq('id', id)
    if (error) throw error
    await load()
  }

  return { budgets, spending, loading, addBudget, updateBudget, deleteBudget, refresh: load }
}
