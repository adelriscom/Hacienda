import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useHousehold } from '../lib/household'

// Just enough of each obligation to offer it in a picker. The full schedule
// lives in useRecurring; loading it here would be wasted work in a modal.
export function useObligationOptions() {
  const [options, setOptions] = useState([])
  const { isFamily, myUserId } = useHousehold()

  useEffect(() => {
    let cancelled = false
    async function load() {
      let q = supabase
        .from('scheduled_payments')
        .select('id, name, type, amount, is_active, user_id')
        .order('name')
      if (!isFamily && myUserId) q = q.eq('user_id', myUserId)
      const { data, error } = await q
      // Before migration 018 the table isn't readable; the picker simply has
      // nothing to offer and the form falls back to the plain flag.
      if (!cancelled) setOptions(error ? [] : (data || []))
    }
    load()
    return () => { cancelled = true }
  }, [isFamily, myUserId])

  return { options }
}
