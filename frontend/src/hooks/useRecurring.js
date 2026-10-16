import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  groupRecurring, toObligation, obligationFromRule, ruleFromObligation,
  buildSchedule, currentOccurrences,
} from '../lib/paymentSchedule'

// `userId` scopes the result to one profile's own recurring transactions; pass
// null (the default) for the whole household, which is what RLS already allows.
export function useRecurring({ userId = null } = {}) {
  const [items,       setItems]       = useState([])
  const [occurrences, setOccurrences] = useState([])
  const [loading,     setLoading]     = useState(true)

  const load = useCallback(async () => {
    setLoading(true)

    // Anything flagged recurring, plus anything linked to a rule — a linked
    // transaction need not carry the legacy flag.
    let txQuery = supabase
      .from('transactions')
      .select('*, account:accounts(name, currency), category:categories(name, color)')
      .or('is_recurring.eq.true,obligation_id.not.is.null')
      // Ghost and duplicate rows aren't real money, so they can't settle an
      // obligation or inflate its history.
      .neq('status', 'ghost').neq('status', 'duplicate')
      .order('occurred_at', { ascending: false })
    if (userId) txQuery = txQuery.eq('user_id', userId)

    let ruleQuery = supabase
      .from('scheduled_payments')
      .select('*, account:accounts(name, currency), category:categories(name, color)')
    if (userId) ruleQuery = ruleQuery.eq('user_id', userId)

    let [txResult, { data: rules, error: ruleError }] =
      await Promise.all([txQuery, ruleQuery])

    // `is_recurring` only exists to find series that haven't been adopted yet.
    // Once migration 019 drops it the or(...) above fails, and linked
    // transactions are all that matter — so fall back to those.
    if (txResult.error) {
      let linkedOnly = supabase
        .from('transactions')
        .select('*, account:accounts(name, currency), category:categories(name, color)')
        .not('obligation_id', 'is', null)
        .neq('status', 'ghost').neq('status', 'duplicate')
        .order('occurred_at', { ascending: false })
      if (userId) linkedOnly = linkedOnly.eq('user_id', userId)
      txResult = await linkedOnly
    }
    let txs = txResult.data

    // Before migration 018 the column and table aren't there yet. Fall back to
    // the inferred-only path rather than rendering nothing.
    if (ruleError) {
      console.warn('Declared obligations unavailable, inferring only:', ruleError.message)
      rules = []
      const { data: legacy } = await (userId
        ? supabase.from('transactions')
            .select('*, account:accounts(name, currency), category:categories(name, color)')
            .eq('is_recurring', true).neq('status', 'ghost').neq('status', 'duplicate')
            .eq('user_id', userId).order('occurred_at', { ascending: false })
        : supabase.from('transactions')
            .select('*, account:accounts(name, currency), category:categories(name, color)')
            .eq('is_recurring', true).neq('status', 'ghost').neq('status', 'duplicate')
            .order('occurred_at', { ascending: false }))
      txs = legacy
    }

    const rows = txs || []

    // Two producers of the same obligation shape. A transaction that belongs to
    // a rule is settled by that rule and must not also form an inferred series,
    // or it would be counted under both.
    const linked = new Map()
    rows.forEach(t => {
      if (!t.obligation_id) return
      const list = linked.get(t.obligation_id)
      if (list) list.push(t); else linked.set(t.obligation_id, [t])
    })

    const declaredObs = (rules || []).map(r => obligationFromRule(r, linked.get(r.id) || []))
    const inferred    = groupRecurring(rows.filter(t => !t.obligation_id && t.is_recurring))
    const schedule    = buildSchedule([...declaredObs, ...inferred.map(toObligation)])
    const current     = currentOccurrences(schedule)

    // Rules first: a declared obligation is the real thing, an inferred series
    // is a leftover waiting to be adopted.
    const declaredItems = (rules || []).map(r => ({
      id:          r.id,
      _key:        `rule:${r.id}`,
      _rule:       r,
      _declared:   true,
      _txns:       linked.get(r.id) || [],
      _count:      (linked.get(r.id) || []).length,
      _freq:       { days: 0, label: '' },   // replaced below from the occurrence
      description: r.name,
      amount:      r.type === 'income' ? Math.abs(r.amount) : -Math.abs(r.amount),
      person:      r.person,
      account:     r.account,
      category:    r.category,
      user_id:     r.user_id,
      occurred_at: (linked.get(r.id) || [])[0]?.occurred_at || r.anchor_date,
    }))

    const items = [...declaredItems, ...inferred].map(item => {
      const occ = current.get(item._key) || null
      return {
        ...item,
        _occurrence: occ,
        _freq: occ ? { days: occ.obligation.freqDays, label: occ.obligation.freqLabel } : item._freq,
      }
    })

    items.sort((a, b) => {
      if ((a.amount > 0) !== (b.amount > 0)) return a.amount > 0 ? -1 : 1
      return Math.abs(b.amount) - Math.abs(a.amount)
    })

    setItems(items)
    setOccurrences(schedule)
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  // ── Rule management ────────────────────────────────────────────────────
  // Only the columns a rule owns. Anything derived — occurrences, status,
  // what has been paid — stays derived.
  const RULE_COLUMNS = [
    'name', 'amount', 'type', 'frequency', 'anchor_date', 'ends_on',
    'account_id', 'category_id', 'person', 'is_variable', 'is_active',
  ]
  const ruleColumns = (values) => Object.fromEntries(
    Object.entries(values).filter(([k]) => RULE_COLUMNS.includes(k)))

  async function createObligation(values) {
    const { data: { session } } = await supabase.auth.getSession()
    const { data, error } = await supabase
      .from('scheduled_payments')
      .insert([{ ...ruleColumns(values), user_id: session?.user?.id }])
      .select('id').single()
    if (error) throw error
    await load()
    return data?.id
  }

  async function updateObligation(id, values) {
    const { error } = await supabase
      .from('scheduled_payments').update(ruleColumns(values)).eq('id', id)
    if (error) throw error
    await load()
  }

  // Deleting a rule leaves its transactions alone — the foreign key is
  // ON DELETE SET NULL, so history survives with the link cleared.
  async function deleteObligation(id) {
    const { error } = await supabase.from('scheduled_payments').delete().eq('id', id)
    if (error) throw error
    await load()
  }

  // Pausing stops projection from today forward without touching history.
  async function setObligationActive(id, is_active) {
    const { error } = await supabase
      .from('scheduled_payments').update({ is_active }).eq('id', id)
    if (error) throw error
    await load()
  }

  // Turns an inferred series into a real rule and links its transactions —
  // the per-item equivalent of the backfill script, sharing its derivation.
  async function adoptSeries(item, { refresh = true } = {}) {
    const { data: { session } } = await supabase.auth.getSession()
    const rule = ruleFromObligation(toObligation(item))
    const { data, error } = await supabase
      .from('scheduled_payments')
      .insert([{
        ...ruleColumns(rule),
        account_id:  item.account_id ?? null,
        category_id: item.category_id ?? null,
        user_id:     item.user_id || session?.user?.id,
      }])
      .select('id').single()
    if (error) throw error

    const ids = (item._txns || []).map(t => t.id)
    if (ids.length) {
      const { error: linkError } = await supabase
        .from('transactions').update({ obligation_id: data.id }).in('id', ids)
      if (linkError) throw linkError
    }
    if (refresh) await load()
    return data.id
  }

  // Converges the whole screen in one go. Sequential on purpose: each adopt is
  // an insert plus a link, and a failure halfway should leave the series it
  // already converted intact rather than racing a dozen half-finished writes.
  async function adoptAll(seriesItems) {
    let adopted = 0
    for (const item of seriesItems) {
      if (item._declared) continue
      await adoptSeries(item, { refresh: false })
      adopted++
    }
    await load()
    return adopted
  }

  // Unflags every transaction in an inferred series. Only reachable for series
  // that were never adopted — a declared obligation is deleted, not unflagged —
  // and goes away with the column in migration 019.
  async function removeRecurring(item) {
    const ids = item?._txns?.length ? item._txns.map(t => t.id) : [item?.id ?? item]
    const { error } = await supabase
      .from('transactions').update({ is_recurring: false }).in('id', ids)
    if (error) throw error
    await load()
  }

  return {
    items, occurrences, loading, refresh: load,
    removeRecurring,
    createObligation, updateObligation, deleteObligation, setObligationActive,
    adoptSeries, adoptAll,
  }
}
