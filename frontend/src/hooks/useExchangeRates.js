import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Multi-currency rates for a given month, as a map { currency_code: rate_to_base }.
// Each currency carries forward its most recent saved rate (so a month with no
// explicit rate still converts), and `inherited[code]` flags when that happened.
export function useExchangeRates(month) {
  const [rates, setRates]         = useState({})   // effective rate per currency
  const [inherited, setInherited] = useState({})   // { code: true } when carried forward
  const [loading, setLoading]     = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const monthStr = `${month}-01`

    // All rates up to and including this month; latest month wins per currency.
    const { data: hist } = await supabase
      .from('exchange_rates')
      .select('currency_code, rate_to_base, month')
      .lte('month', monthStr)
      .order('month', { ascending: true })

    const effective = {}
    const exactThisMonth = new Set()
    ;(hist || []).forEach(r => {
      effective[r.currency_code] = Number(r.rate_to_base)
      if (r.month === monthStr) exactThisMonth.add(r.currency_code)
    })

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
