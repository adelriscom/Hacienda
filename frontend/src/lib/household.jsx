import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

const HouseholdContext = createContext(null)

export function HouseholdProvider({ children }) {
  const { session } = useAuth()
  const [household, setHousehold] = useState(null)
  const [members,   setMembers]   = useState([])
  const [viewMode,  setViewModeState] = useState(
    () => localStorage.getItem('hacienda_viewMode') || 'family'
  )

  useEffect(() => {
    if (!session) { setHousehold(null); setMembers([]); return }
    async function load() {
      const { data: mine } = await supabase
        .from('household_members')
        .select('*, household:households(id, name)')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (!mine) return
      setHousehold(mine.household)

      const { data: all } = await supabase
        .from('household_members')
        .select('*')
        .eq('household_id', mine.household.id)
      setMembers(all || [])
    }
    load()
  }, [session])

  function setViewMode(mode) {
    localStorage.setItem('hacienda_viewMode', mode)
    setViewModeState(mode)
  }

  const isFamily  = viewMode === 'family' && household !== null
  const myUserId  = session?.user?.id ?? null
  const myName    = members.find(m => m.user_id === myUserId)?.display_name ?? ''
  const otherMembers = members.filter(m => m.user_id !== myUserId)

  return (
    <HouseholdContext.Provider value={{
      household, members, myName, otherMembers,
      viewMode, setViewMode, isFamily, myUserId,
    }}>
      {children}
    </HouseholdContext.Provider>
  )
}

export function useHousehold() {
  return useContext(HouseholdContext)
}
