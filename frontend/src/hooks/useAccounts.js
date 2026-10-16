import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useHousehold } from '../lib/household'
import { withDerivedBalances, anchorTo } from '../lib/balances'

export function useAccounts() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const { isFamily, myUserId } = useHousehold()

  const load = useCallback(async () => {
    let query = supabase.from('accounts').select('*').order('currency').order('name')
    if (!isFamily && myUserId) query = query.eq('user_id', myUserId)

    // A balance is its anchor plus everything that has happened on the account,
    // so the movement has to come along. Only the three columns the sum needs —
    // this runs on every screen that shows a balance.
    let movement = supabase
      .from('transactions')
      .select('account_id, amount, status')
      .not('account_id', 'is', null)
      .neq('status', 'ghost').neq('status', 'duplicate')
    if (!isFamily && myUserId) movement = movement.eq('user_id', myUserId)

    const [{ data }, { data: txs }] = await Promise.all([query, movement])

    // Before migration 020 there is no anchor, and withDerivedBalances leaves
    // those accounts exactly as they are.
    setAccounts(withDerivedBalances(data || [], txs || []))
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

  // Tells the app what the bank actually says. The anchor absorbs the
  // difference, so the derived balance matches without a single transaction
  // being edited — the honest answer to an incomplete import history.
  async function anchorBalance(account, actualBalance) {
    const opening_balance = anchorTo(actualBalance, account)
    const { error } = await supabase
      .from('accounts')
      .update({ opening_balance, balance: Number(actualBalance) })
      .eq('id', account.id)
    if (error) throw error
    await load()
    return opening_balance
  }

  async function toggleActive(id, current) {
    const { error } = await supabase.from('accounts').update({ is_active: !current }).eq('id', id)
    if (error) throw error
    await load()
  }

  return { accounts, loading, addAccount, updateAccount, anchorBalance, toggleActive, reload: load }
}
