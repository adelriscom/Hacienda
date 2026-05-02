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

  async function addCategory(name, color) {
    const { data: { session } } = await supabase.auth.getSession()
    const user_id = session?.user?.id
    const { error } = await supabase.from('categories').insert([{ name: name.trim(), color, icon: '', user_id }])
    if (error) throw error
    await load()
  }

  async function updateCategory(id, values) {
    const { error } = await supabase.from('categories').update(values).eq('id', id)
    if (error) throw error
    await load()
  }

  async function deleteCategory(id) {
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) throw error
    await load()
  }

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

  return { categories, loading, addCategory, updateCategory, deleteCategory, ensureCategories }
}
