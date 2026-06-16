import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const DEFAULT_RATE = 0.00032  // ≈ 3,125 COP per 1 CAD — last-resort fallback only

export function useExchangeRate(month) {
  const [rate, setRate]           = useState(DEFAULT_RATE)
  const [inherited, setInherited] = useState(false) // true when no rate is saved for `month`
  const [loading, setLoading]     = useState(true)

  const load = useCallback(async () => {
    setLoading(true)

    // 1. Exact rate saved for this month
    const { data: exact } = await supabase
      .from('exchange_rates')
      .select('cop_to_cad')
      .eq('month', `${month}-01`)
      .maybeSingle()
    if (exact) {
      setRate(Number(exact.cop_to_cad)); setInherited(false); setLoading(false); return
    }

    // 2. Otherwise carry forward the most recent saved rate (keeps it "as current as
    //    possible" instead of snapping back to a stale hard-coded default)
    const { data: prior } = await supabase
      .from('exchange_rates')
      .select('cop_to_cad')
      .lte('month', `${month}-01`)
      .order('month', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (prior) {
      setRate(Number(prior.cop_to_cad)); setInherited(true); setLoading(false); return
    }

    // 3. No prior rate (month precedes all saved rates) → newest one ever saved
    const { data: newest } = await supabase
      .from('exchange_rates')
      .select('cop_to_cad')
      .order('month', { ascending: false })
      .limit(1)
      .maybeSingle()
    setRate(newest ? Number(newest.cop_to_cad) : DEFAULT_RATE)
    setInherited(true)
    setLoading(false)
  }, [month])

  useEffect(() => { load() }, [load])

  async function saveRate(newRate) {
    const r = parseFloat(newRate)
    if (!r || r <= 0) return
    const { data: { session } } = await supabase.auth.getSession()
    const user_id = session?.user?.id
    const { error } = await supabase
      .from('exchange_rates')
      .upsert([{ user_id, month: `${month}-01`, cop_to_cad: r }],
              { onConflict: 'user_id,month' })
    if (error) throw error
    setRate(r); setInherited(false)
  }

  return { rate, loading, inherited, saveRate }
}
