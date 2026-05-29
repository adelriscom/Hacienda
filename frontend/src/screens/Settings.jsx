import { useState, useEffect } from 'react'
import Icon from '../components/Icon'
import Topbar from '../components/Topbar'
import { supabase } from '../lib/supabase'
import { useHousehold } from '../lib/household'

export default function Settings() {
  const { household, members, myUserId, reload } = useHousehold()
  const [view, setView] = useState('main')  // 'main' | 'create' | 'join'

  const [activeCode, setActiveCode] = useState(null)
  const [codeExpiry, setCodeExpiry] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [copied,     setCopied]     = useState(false)

  const [householdName, setHouseholdName] = useState('')
  const [displayName,   setDisplayName]   = useState('')
  const [joinCode,      setJoinCode]      = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)

  // Load active invite if we're already in a household
  useEffect(() => {
    if (!household) return
    supabase
      .from('household_invites')
      .select('code, expires_at')
      .eq('household_id', household.id)
      .is('used_by', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) { setActiveCode(data.code); setCodeExpiry(data.expires_at) }
      })
  }, [household])

  async function generateCode() {
    setGenerating(true); setError(null)
    const { data, error } = await supabase.rpc('create_household_invite')
    setGenerating(false)
    if (error) { setError(error.message); return }
    setActiveCode(data)
    setCodeExpiry(new Date(Date.now() + 7 * 86400000).toISOString())
  }

  function copyCode() {
    navigator.clipboard.writeText(activeCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleCreate() {
    if (!householdName.trim()) return
    setSaving(true); setError(null)
    const { data, error } = await supabase.rpc('create_my_household', {
      household_name: householdName.trim(),
      display_name:   displayName.trim() || null,
    })
    setSaving(false)
    if (error || data?.error) { setError(data?.error || error.message); return }
    await reload()
    setView('main')
  }

  async function handleJoin() {
    if (!joinCode.trim()) return
    setSaving(true); setError(null)
    const { data, error } = await supabase.rpc('join_household_by_code', {
      invite_code: joinCode.trim(),
      member_name: displayName.trim() || null,
    })
    setSaving(false)
    if (error || data?.error) { setError(data?.error || error.message); return }
    await reload()
    setView('main')
  }

  function reset(nextView) { setError(null); setView(nextView) }

  const expiryLabel = codeExpiry
    ? new Date(codeExpiry).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
    : null

  return (
    <>
      <Topbar greet="Settings" date="Household & account management" />

      <div style={{ maxWidth: 560 }}>

        {/* ── Household ─────────────────────────────────────────────────── */}
        <SectionLabel>Household</SectionLabel>

        {!household ? (
          /* No household yet */
          view === 'main' ? (
            <div className="card" style={{ padding: '20px 24px' }}>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 18 }}>
                You're not in a household yet. Create one or join with an invite code.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn primary sm" onClick={() => reset('create')}>
                  <Icon name="plus" size={12} /> Create household
                </button>
                <button className="btn ghost sm" onClick={() => reset('join')}>
                  Join with code
                </button>
              </div>
            </div>
          ) : view === 'create' ? (
            <div className="card" style={{ padding: '20px 24px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-0)', marginBottom: 16 }}>Create a household</div>
              <div className="form-grid">
                <div className="form-field span-2">
                  <label>Household name</label>
                  <input value={householdName} onChange={e => setHouseholdName(e.target.value)}
                    placeholder="e.g. Delrisco-Falla" autoFocus />
                </div>
                <div className="form-field span-2">
                  <label>Your display name</label>
                  <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                    placeholder="e.g. Alexander" />
                </div>
              </div>
              {error && <p style={{ color: 'var(--neg)', fontSize: 12, marginTop: 8 }}>{error}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn primary sm" disabled={!householdName.trim() || saving} onClick={handleCreate}>
                  {saving ? 'Creating…' : 'Create'}
                </button>
                <button className="btn ghost sm" onClick={() => reset('main')}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: '20px 24px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-0)', marginBottom: 16 }}>Join with invite code</div>
              <div className="form-grid">
                <div className="form-field span-2">
                  <label>Invite code</label>
                  <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="e.g. FAM7X2K4" autoFocus
                    style={{ fontFamily: 'monospace', letterSpacing: '0.12em', fontSize: 15 }} />
                </div>
                <div className="form-field span-2">
                  <label>Your display name</label>
                  <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                    placeholder="e.g. Marcela" />
                </div>
              </div>
              {error && <p style={{ color: 'var(--neg)', fontSize: 12, marginTop: 8 }}>{error}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn primary sm" disabled={!joinCode.trim() || saving} onClick={handleJoin}>
                  {saving ? 'Joining…' : 'Join household'}
                </button>
                <button className="btn ghost sm" onClick={() => reset('main')}>Cancel</button>
              </div>
            </div>
          )
        ) : (
          /* Has household */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Household card */}
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontSize: 18, fontWeight: 700,
                }}>
                  {household.name.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-0)' }}>{household.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                    {members.length} member{members.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {members.map(m => (
                  <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                      background: m.display_name === 'Alexander'
                        ? 'linear-gradient(135deg,#6366f1,#a855f7)'
                        : 'linear-gradient(135deg,#ec4899,#f97316)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: 'white',
                    }}>
                      {m.display_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--ink-1)' }}>
                      {m.display_name}
                      {m.user_id === myUserId && (
                        <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 400, marginLeft: 6 }}>· you</span>
                      )}
                    </div>
                    <span style={{
                      fontSize: 10.5, fontWeight: 600, padding: '1px 7px', borderRadius: 4,
                      background: m.role === 'owner' ? 'rgba(99,102,241,.15)' : 'var(--bg-2)',
                      color: m.role === 'owner' ? 'var(--accent)' : 'var(--ink-3)',
                    }}>
                      {m.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Invite code card */}
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-1)', marginBottom: 12 }}>
                Invite someone to join
              </div>
              {activeCode ? (
                <>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 8 }}>
                    Share this code — valid until {expiryLabel}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{
                      flex: 1, padding: '10px 14px', borderRadius: 8,
                      background: 'var(--bg-2)', border: '1px solid var(--line)',
                      fontFamily: 'monospace', fontSize: 20, fontWeight: 700,
                      letterSpacing: '0.18em', color: 'var(--ink-0)', textAlign: 'center',
                    }}>
                      {activeCode}
                    </div>
                    <button className="btn ghost sm" onClick={copyCode} style={{ flexShrink: 0, minWidth: 80 }}>
                      {copied
                        ? <><Icon name="check" size={12} /> Copied!</>
                        : <><Icon name="link"  size={12} /> Copy</>}
                    </button>
                  </div>
                  <button className="btn ghost sm" style={{ marginTop: 10, fontSize: 11 }}
                    onClick={generateCode} disabled={generating}>
                    {generating ? 'Generating…' : 'Generate new code'}
                  </button>
                </>
              ) : (
                <button className="btn primary sm" onClick={generateCode} disabled={generating}>
                  {generating ? 'Generating…' : 'Generate invite code'}
                </button>
              )}
              {error && <p style={{ color: 'var(--neg)', fontSize: 12, marginTop: 8 }}>{error}</p>}
            </div>

          </div>
        )}

      </div>
    </>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em',
      color: 'var(--ink-3)', marginBottom: 10, paddingLeft: 2,
    }}>
      {children}
    </div>
  )
}
