import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const DEFAULT_RATE = 0.00032  // ≈ 3,125 COP per 1 CAD — last-resort fallback only

// COP → CAD convenience wrapper around the generalized `exchange_rates` table
// (currency_code = 'COP'). Kept for screens that only deal with COP; new
// multi-currency code should use useExchangeRates() instead.
export function useExchangeRate(month) {
  const [rate, setRate]           = useState(DEFAULT_RATE)
  const [inherited, setInherited] = useState(false) // true when no rate is saved for `month`
  const [loading, setLoading]     = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const monthStr = `${month}-01`

    // Exact COP rate saved for this month
    const { data: exact } = await supabase
      .from('exchange_rates')
      .select('rate_to_base')
      .eq('currency_code', 'COP')
      .eq('month', monthStr)
      .maybeSingle()
    if (exact) {
      setRate(Number(exact.rate_to_base)); setInherited(false); setLoading(false); return
    }

    // Otherwise carry forward the most recent saved COP rate
    const { data: prior } = await supabase
      .from('exchange_rates')
      .select('rate_to_base')
      .eq('currency_code', 'COP')
      .lte('month', monthStr)
      .order('month', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (prior) {
      setRate(Number(prior.rate_to_base)); setInherited(true); setLoading(false); return
    }

    // No prior COP rate → newest one ever saved
    const { data: newest } = await supabase
      .from('exchange_rates')
      .select('rate_to_base')
      .eq('currency_code', 'COP')
      .order('month', { ascending: false })
      .limit(1)
      .maybeSingle()
    setRate(newest ? Number(newest.rate_to_base) : DEFAULT_RATE)
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
      .upsert([{ user_id, month: `${month}-01`, currency_code: 'COP', rate_to_base: r }],
              { onConflict: 'user_id,month,currency_code' })
    if (error) throw error
    setRate(r); setInherited(false)
  }

  return { rate, loading, inherited, saveRate }
}
