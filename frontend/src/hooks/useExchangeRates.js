import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { buildRateMap } from '../lib/currency'

// Multi-currency rates for a given month, as a map { currency_code: rate_to_base }.
// Each currency uses its nearest saved rate (latest on/before the month, else the
// earliest ever saved), so every month converts. `inherited[code]` flags when the
// month has no rate of its own.
export function useExchangeRates(month) {
  const [rates, setRates]         = useState({})   // effective rate per currency
  const [inherited, setInherited] = useState({})   // { code: true } when carried forward
  const [loading, setLoading]     = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const monthStr = `${month}-01`

    // All saved rates; buildRateMap picks the nearest one per currency for this month.
    const { data: all } = await supabase
      .from('exchange_rates')
      .select('currency_code, rate_to_base, month')
      .order('month', { ascending: true })

    const effective = buildRateMap(all || [], monthStr)
    const exactThisMonth = new Set(
      (all || []).filter(r => r.month === monthStr).map(r => r.currency_code)
    )

    const inh = {}
    Object.keys(effective).forEach(code => { inh[code] = !exactThisMonth.has(code) })

    setRates(effective)
    setInherited(inh)
    setLoading(false)
  }, [month])

  useEffect(() => { load() }, [load])

  async function saveRate(currency_code, rateToBase) {
    const r = parseFloat(rateToBase)
    if (!r || r <= 0 || !currency_code) return
    const { data: { session } } = await supabase.auth.getSession()
    const user_id = session?.user?.id
    const { error } = await supabase
      .from('exchange_rates')
      .upsert([{ user_id, month: `${month}-01`, currency_code, rate_to_base: r }],
              { onConflict: 'user_id,month,currency_code' })
    if (error) throw error
    await load()
  }

  return { rates, inherited, loading, saveRate, refresh: load }
}
