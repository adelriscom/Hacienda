import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useCategories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase.from('categories').select('*').order('name')
    setCategories(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Ensures all given names exist in the DB. Inserts missing ones and returns
  // a lowercase-name → id map covering both existing and newly created categories.
  async function ensureCategories(names) {
    const existingMap = {}
    categories.forEach(c => { existingMap[c.name.toLowerCase()] = c.id })

    const unique  = [...new Set(names.map(n => n.trim()).filter(Boolean))]
    const missing = unique.filter(n => !existingMap[n.toLowerCase()])

    if (missing.length > 0) {
      const { data: { session } } = await supabase.auth.getSession()
      const user_id = session?.user?.id
      const { data: inserted, error } = await supabase
        .from('categories')
        .insert(missing.map(name => ({ name, color: '#94a3b8', icon: '', user_id })))
        .select()
      if (error) throw error
      ;(inserted || []).forEach(c => { existingMap[c.name.toLowerCase()] = c.id })
      await load()
    }

    return existingMap
  }

  return { categories, loading, ensureCategories }
}
