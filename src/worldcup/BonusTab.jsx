import { useState, useEffect, useRef, memo } from 'react'
import { supabase } from '../lib/supabase'

function BonusTab({ user }) {
  const [groups,     setGroups]     = useState([])
  const [localPicks, setLocalPicks] = useState({})  // { bonus_question_id: chosen_option }
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState({})  // { bonus_question_id: bool }
  const [err,        setErr]        = useState(null)
  const hasFetched = useRef(false)

  useEffect(() => {
    if (!user?.id) {
      setLocalPicks({})
      setGroups([])
      hasFetched.current = false
      setLoading(false)
      return
    }
    if (hasFetched.current) return  // already loaded for this user, never overwrite localPicks
    hasFetched.current = true

    async function load() {
      const [{ data: qs }, picksRes] = await Promise.all([
        supabase.from('bonus_questions')
          .select('id, match_label, option_number, option_text')
          .order('match_label').order('option_number'),
        supabase.from('bonus_picks')
          .select('bonus_question_id, chosen_option')
          .eq('user_id', user.id),
      ])
      const map = new Map()
      for (const q of qs ?? []) {
        if (!map.has(q.match_label)) map.set(q.match_label, [])
        map.get(q.match_label).push(q)
      }
      setGroups([...map.entries()].map(([label, opts]) => {
        const sorted = [...opts].sort((a, b) => a.option_number - b.option_number)
        return { label, options: sorted, groupId: sorted[0].id }
      }))
      const pm = {}
      for (const p of picksRes.data ?? []) pm[p.bonus_question_id] = p.chosen_option
      setLocalPicks(pm)
    }
    load().catch(e => setErr(e.message)).finally(() => setLoading(false))
  }, [user?.id])

  async function pick(groupId, optionNum) {
    if (!user?.id) return
    setSaving(p => ({ ...p, [groupId]: true }))
    const { error } = await supabase
      .from('bonus_picks')
      .upsert(
        { user_id: user.id, bonus_question_id: groupId, chosen_option: optionNum },
        { onConflict: 'user_id,bonus_question_id' }
      )
    if (error) {
      setErr(error.message)
    } else {
      setLocalPicks(prev => ({ ...prev, [groupId]: optionNum }))
    }
    setSaving(p => ({ ...p, [groupId]: false }))
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '5rem 0', color: '#64748B' }}>Laddar...</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#F1F5F9', margin: 0 }}>Bonuspoäng</h1>
        <p style={{ fontSize: '0.875rem', color: '#64748B', marginTop: 4, marginBottom: 0 }}>
          Specialtips – klicka ett alternativ för att spara
        </p>
      </div>

      {err && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '0.75rem 1rem', color: '#F87171', fontSize: '0.875rem', display: 'flex', justifyContent: 'space-between' }}>
          ⚠️ {err}
          <button onClick={() => setErr(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: '1rem' }}>×</button>
        </div>
      )}

      {groups.length === 0 && (
        <div style={{ textAlign: 'center', padding: '5rem 0', color: '#64748B' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>⭐</div>
          <p style={{ margin: 0 }}>Specialtips – kommer snart</p>
        </div>
      )}

      {groups.map(group => (
        <div key={group.label} style={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ background: '#0F172A', padding: '0.75rem 1rem', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#F1F5F9' }}>{group.label}</span>
            {saving[group.groupId] && <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Sparar...</span>}
          </div>
          <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {group.options.map(opt => {
              const sel = localPicks[group.groupId] === opt.option_number
              return (
                <button
                  key={opt.id}
                  onClick={() => pick(group.groupId, opt.option_number)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '0.625rem 0.75rem', borderRadius: 12,
                    cursor: user ? 'pointer' : 'default', textAlign: 'left', width: '100%',
                    background: sel ? 'rgba(245,158,11,0.08)' : 'transparent',
                    border: `1.5px solid ${sel ? '#F59E0B' : '#334155'}`,
                  }}
                >
                  <span style={{ fontSize: '0.875rem', fontWeight: 900, width: 20, textAlign: 'center', flexShrink: 0, color: sel ? '#F59E0B' : '#475569' }}>
                    {opt.option_number}
                  </span>
                  <span style={{ fontSize: '0.875rem', flex: 1, color: sel ? '#F1F5F9' : '#94A3B8' }}>
                    {opt.option_text}
                  </span>
                  {sel && <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4ADE80', flexShrink: 0 }}>✓ Valt</span>}
                </button>
              )
            })}
          </div>
          {!user && (
            <p style={{ margin: 0, padding: '0 0.75rem 0.75rem', textAlign: 'center', fontSize: '0.75rem', color: '#475569' }}>
              Logga in för att spara ditt svar
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

// Only re-render when user.id changes – parent re-renders do not affect this component
export default memo(BonusTab, (prev, next) => prev.user?.id === next.user?.id)
