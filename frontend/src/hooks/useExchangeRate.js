import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const DEFAULT_RATE = 0.00032  // ≈ 3,125 COP per 1 CAD

export function useExchangeRate(month) {
  const [rate, setRate]       = useState(DEFAULT_RATE)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('exchange_rates')
      .select('cop_to_cad')
      .eq('month', `${month}-01`)
      .maybeSingle()
    if (data) setRate(Number(data.cop_to_cad))
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
    setRate(r)
  }

  return { rate, loading, saveRate }
}
