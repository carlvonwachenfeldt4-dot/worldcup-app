import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

export default function BonusPoang({ user }) {
  const [questions,      setQuestions]      = useState([])
  const [userPick,       setUserPick]       = useState({})  // { [groupId]: chosen_option } – from DB
  const [selectedOption, setSelectedOption] = useState({})  // { [groupId]: chosen_option } – local clicks
  const [loading,        setLoading]        = useState(true)
  const [saving,         setSaving]         = useState({})  // { [groupId]: bool }
  const [saveError,      setSaveError]      = useState(null)
  const [saveSuccess,    setSaveSuccess]    = useState({})  // { [groupId]: bool }

  useEffect(() => {
    async function load() {
      const [{ data: qs }, picksRes] = await Promise.all([
        supabase
          .from('bonus_questions')
          .select('id, match_label, option_number, option_text')
          .order('match_label')
          .order('option_number'),
        user?.id
          ? supabase.from('bonus_picks').select('bonus_question_id, chosen_option').eq('user_id', user.id)
          : Promise.resolve({ data: [] }),
      ])
      setQuestions(qs ?? [])
      const map = {}
      for (const p of picksRes.data ?? []) map[p.bonus_question_id] = p.chosen_option
      setUserPick(map)
    }
    load()
      .catch(e => console.warn('[BonusPoang] load fel:', e.message))
      .finally(() => setLoading(false))
  }, [user?.id])

  const groups = useMemo(() => {
    const map = new Map()
    for (const q of questions) {
      if (!map.has(q.match_label)) map.set(q.match_label, [])
      map.get(q.match_label).push(q)
    }
    return [...map.entries()].map(([label, opts]) => {
      const sorted = [...opts].sort((a, b) => a.option_number - b.option_number)
      return { label, options: sorted, groupId: sorted[0]?.id }
    })
  }, [questions])

  async function handleSave(group) {
    const chosen = selectedOption[group.groupId]
    if (!chosen || !user?.id) return
    setSaving(p => ({ ...p, [group.groupId]: true }))
    try {
      const { error } = await supabase
        .from('bonus_picks')
        .upsert(
          { user_id: user.id, bonus_question_id: group.groupId, chosen_option: chosen },
          { onConflict: 'user_id,bonus_question_id' }
        )
      if (error) {
        setSaveError(`Kunde inte spara: ${error.message}`)
      } else {
        setUserPick(p => ({ ...p, [group.groupId]: chosen }))
        setSaveSuccess(p => ({ ...p, [group.groupId]: true }))
        setTimeout(() => setSaveSuccess(p => ({ ...p, [group.groupId]: false })), 2000)
      }
    } finally {
      setSaving(p => ({ ...p, [group.groupId]: false }))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-3xl animate-spin">⭐</div>
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {saveError && (
        <div className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
             style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <p className="text-sm" style={{ color: '#F87171' }}>⚠️ {saveError}</p>
          <button onClick={() => setSaveError(null)}
                  className="text-lg leading-none shrink-0"
                  style={{ color: '#64748B' }}>×</button>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-black" style={{ color: '#F1F5F9' }}>Bonuspoäng</h1>
        <p className="text-sm mt-1" style={{ color: '#64748B' }}>
          Specialtips på matchhändelser – välj ett alternativ per fråga
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-4xl mb-4">⭐</div>
          <p className="font-semibold" style={{ color: '#F1F5F9' }}>Bonuspoäng</p>
          <p className="text-sm mt-1" style={{ color: '#64748B' }}>Specialtips – kommer snart</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(group => {
            // Show local click first; fall back to saved DB pick for amber highlight
            const displayed = selectedOption[group.groupId] ?? userPick[group.groupId]
            const canSave   = !!selectedOption[group.groupId] && !saving[group.groupId]
            const isSuccess = saveSuccess[group.groupId]

            return (
              <div key={group.label}
                   className="rounded-2xl overflow-hidden"
                   style={{ background: '#1E293B', border: '1px solid #334155' }}>

                <div className="px-4 py-3"
                     style={{ background: '#0F172A', borderBottom: '1px solid #334155' }}>
                  <h3 className="font-bold text-sm" style={{ color: '#F1F5F9' }}>{group.label}</h3>
                </div>

                <div className="p-3 space-y-2">
                  {group.options.map(opt => {
                    const isSelected = displayed === opt.option_number
                    return (
                      <button
                        key={opt.id}
                        onClick={() => setSelectedOption(p => ({ ...p, [group.groupId]: opt.option_number }))}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all active:scale-[0.98]"
                        style={{
                          background: isSelected ? 'rgba(245,158,11,0.08)' : 'transparent',
                          border:     `1.5px solid ${isSelected ? '#F59E0B' : '#334155'}`,
                          cursor:     'pointer',
                        }}
                      >
                        <span className="text-sm font-black shrink-0 w-5 text-center"
                              style={{ color: isSelected ? '#F59E0B' : '#475569' }}>
                          {opt.option_number}
                        </span>
                        <span className="text-sm flex-1"
                              style={{ color: isSelected ? '#F1F5F9' : '#94A3B8' }}>
                          {opt.option_text}
                        </span>
                        {isSelected && (
                          <span className="text-base shrink-0" style={{ color: '#F59E0B' }}>●</span>
                        )}
                      </button>
                    )
                  })}
                </div>

                <div className="px-3 pb-3">
                  {user ? (
                    <button
                      onClick={() => handleSave(group)}
                      disabled={!canSave}
                      className="w-full py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98]"
                      style={{
                        background: isSuccess ? 'rgba(34,197,94,0.15)' : canSave ? 'linear-gradient(135deg,#F59E0B,#D97706)' : '#1E293B',
                        color:      isSuccess ? '#4ADE80'               : canSave ? '#0F172A'                                  : '#475569',
                        border:     isSuccess ? '1px solid #22C55E'     : canSave ? 'none'                                     : '1px solid #334155',
                        cursor:     canSave ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {saving[group.groupId] ? '⏳ Sparar...' : isSuccess ? '✓ Sparat!' : 'Spara mitt val'}
                    </button>
                  ) : (
                    <p className="text-xs text-center" style={{ color: '#475569' }}>
                      Logga in för att spara ditt svar
                    </p>
                  )}
                </div>

              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
