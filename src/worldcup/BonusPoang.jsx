import { useState, useEffect, useMemo } from 'react'
import { loadBonusQuestions, loadBonusPicks, saveBonusPick, setBonusCorrectOption } from '../lib/supabase'

export default function BonusPoang({ user, isAdmin }) {
  const [questions,        setQuestions]        = useState([])
  const [savedPicks,       setSavedPicks]       = useState({})  // { [groupId]: chosenOption } – from DB
  const [localSelections,  setLocalSelections]  = useState({})  // { [groupId]: optionNum } – UI only
  const [loading,          setLoading]          = useState(true)
  const [saveError,        setSaveError]        = useState(null)
  const [pickSaving,       setPickSaving]       = useState({})  // { [groupId]: bool }
  const [pickSuccess,      setPickSuccess]      = useState({})  // { [groupId]: bool }
  const [adminInputs,      setAdminInputs]      = useState({})  // { [matchLabel]: string }
  const [adminSaving,      setAdminSaving]      = useState({})  // { [matchLabel]: bool }

  useEffect(() => {
    loadBonusQuestions()
      .then(setQuestions)
      .catch(e => console.warn('Kunde inte hämta bonusfrågor:', e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!user?.id) { setSavedPicks({}); setLocalSelections({}); return }
    loadBonusPicks(user.id)
      .then(data => {
        const map = {}
        for (const p of data) map[p.bonus_question_id] = p.chosen_option
        setSavedPicks(map)
        setLocalSelections(map)  // pre-populate so user sees their saved pick highlighted
      })
      .catch(e => console.warn('Kunde inte hämta bonussvar:', e.message))
  }, [user?.id])

  const groups = useMemo(() => {
    const map = new Map()
    for (const q of questions) {
      if (!map.has(q.match_label)) map.set(q.match_label, [])
      map.get(q.match_label).push(q)
    }
    return [...map.entries()].map(([label, opts]) => {
      const sorted = [...opts].sort((a, b) => a.option_number - b.option_number)
      return {
        label,
        options:       sorted,
        groupId:       sorted[0]?.id,
        correctOption: sorted[0]?.correct_option ?? null,
      }
    })
  }, [questions])

  function handleSelect(group, optionNum) {
    setLocalSelections(p => ({ ...p, [group.groupId]: optionNum }))
  }

  async function handleSavePick(group) {
    const selected = localSelections[group.groupId]
    if (!selected || !user) return
    setPickSaving(p => ({ ...p, [group.groupId]: true }))
    try {
      await saveBonusPick(user.id, group.groupId, selected)
      setSavedPicks(p => ({ ...p, [group.groupId]: selected }))
      setPickSuccess(p => ({ ...p, [group.groupId]: true }))
      setTimeout(() => setPickSuccess(p => ({ ...p, [group.groupId]: false })), 2000)
    } catch (err) {
      setSaveError(`Kunde inte spara: ${err.message}`)
    } finally {
      setPickSaving(p => ({ ...p, [group.groupId]: false }))
    }
  }

  async function handleAdminSave(group) {
    const raw = adminInputs[group.label] ?? String(group.correctOption ?? '')
    const val = parseInt(raw, 10)
    console.log('[BonusPoang] handleAdminSave', { matchLabel: group.label, raw, val })
    if (![1, 2, 3, 4].includes(val)) {
      console.warn('[BonusPoang] Ogiltigt värde – avbryter (måste vara 1–4):', raw)
      setSaveError('Ange ett heltal 1–4 innan du sparar')
      return
    }
    setAdminSaving(p => ({ ...p, [group.label]: true }))
    try {
      console.log('[BonusPoang] Anropar setBonusCorrectOption', { matchLabel: group.label, val })
      await setBonusCorrectOption(group.label, val)
      console.log('[BonusPoang] ✓ Sparades korrekt')
      setQuestions(prev =>
        prev.map(q => q.match_label === group.label ? { ...q, correct_option: val } : q)
      )
    } catch (err) {
      console.error('[BonusPoang] setBonusCorrectOption fel:', err)
      setSaveError(`Kunde inte spara rätt svar: ${err.message}`)
    } finally {
      setAdminSaving(p => ({ ...p, [group.label]: false }))
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
            const localSel  = localSelections[group.groupId]
            const savedPick = savedPicks[group.groupId]
            const correct   = group.correctOption
            const isSaving  = pickSaving[group.groupId]
            const isSuccess = pickSuccess[group.groupId]

            return (
              <div key={group.label}
                   className="rounded-2xl overflow-hidden"
                   style={{ background: '#1E293B', border: '1px solid #334155' }}>

                {/* Header */}
                <div className="px-4 py-3"
                     style={{ background: '#0F172A', borderBottom: '1px solid #334155' }}>
                  <h3 className="font-bold text-sm" style={{ color: '#F1F5F9' }}>{group.label}</h3>
                  {correct !== null && (
                    <p className="text-xs mt-0.5 font-semibold" style={{ color: '#4ADE80' }}>
                      ✓ Rätt svar: alternativ {correct}
                    </p>
                  )}
                </div>

                {/* Options */}
                <div className="p-3 space-y-2">
                  {group.options.map(opt => {
                    const isLocalSelected = localSel === opt.option_number
                    const isSavedPick     = savedPick === opt.option_number
                    const isCorrect       = correct === opt.option_number
                    const isWrong         = isSavedPick && correct !== null && !isCorrect

                    let border    = '#334155'
                    let bg        = 'transparent'
                    let numColor  = '#475569'
                    let textColor = '#94A3B8'
                    let opacity   = 1

                    if (correct !== null) {
                      if (isCorrect) {
                        border = '#22C55E'; bg = 'rgba(34,197,94,0.08)'
                        numColor = '#4ADE80'; textColor = '#4ADE80'
                      } else if (isWrong) {
                        border = '#EF4444'; bg = 'rgba(239,68,68,0.08)'
                        numColor = '#F87171'; textColor = '#F87171'
                      } else if (isLocalSelected) {
                        border = '#F59E0B'
                        numColor = '#F59E0B'; textColor = '#CBD5E1'
                      } else {
                        opacity = 0.35
                      }
                    } else if (isLocalSelected) {
                      border = '#F59E0B'; bg = 'rgba(245,158,11,0.08)'
                      numColor = '#F59E0B'; textColor = '#F1F5F9'
                    }

                    return (
                      <button
                        key={opt.id}
                        onClick={() => handleSelect(group, opt.option_number)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all active:scale-[0.98]"
                        style={{
                          background: bg,
                          border:     `1.5px solid ${border}`,
                          cursor:     'pointer',
                          opacity,
                        }}
                      >
                        <span className="text-sm font-black shrink-0 w-5 text-center"
                              style={{ color: numColor }}>
                          {opt.option_number}
                        </span>
                        <span className="text-sm flex-1" style={{ color: textColor }}>
                          {opt.option_text}
                        </span>
                        {isLocalSelected && !isCorrect && !isWrong && (
                          <span className="text-base shrink-0" style={{ color: '#F59E0B' }}>●</span>
                        )}
                        {isCorrect && (
                          <span className="text-base shrink-0 font-black" style={{ color: '#22C55E' }}>✓</span>
                        )}
                        {isWrong && (
                          <span className="text-base shrink-0 font-black" style={{ color: '#EF4444' }}>✗</span>
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* User save button */}
                <div className="px-3 pb-3">
                  {user ? (
                    <button
                      onClick={() => handleSavePick(group)}
                      disabled={!localSel || isSaving}
                      className="w-full py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98]"
                      style={{
                        background: isSuccess
                          ? 'rgba(34,197,94,0.15)'
                          : (!localSel || isSaving)
                            ? '#1E293B'
                            : 'linear-gradient(135deg,#F59E0B,#D97706)',
                        color: isSuccess
                          ? '#4ADE80'
                          : (!localSel || isSaving)
                            ? '#475569'
                            : '#0F172A',
                        border: (!localSel || isSaving) && !isSuccess
                          ? '1px solid #334155'
                          : isSuccess
                            ? '1px solid #22C55E'
                            : 'none',
                        cursor: (!localSel || isSaving) ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {isSaving ? '⏳ Sparar...' : isSuccess ? '✓ Sparat!' : 'Spara mitt val'}
                    </button>
                  ) : (
                    <p className="text-xs text-center" style={{ color: '#475569' }}>
                      Logga in för att spara ditt svar
                    </p>
                  )}
                </div>

                {/* Admin controls */}
                {isAdmin && (
                  <div className="px-3 pb-3 pt-1 flex items-center gap-2 flex-wrap"
                       style={{ borderTop: '1px solid #0F172A' }}>
                    <span className="text-xs font-semibold" style={{ color: '#64748B' }}>
                      Admin – rätt svar (1–4):
                    </span>
                    <input
                      type="number"
                      min={1} max={4}
                      value={adminInputs[group.label] ?? (group.correctOption !== null ? String(group.correctOption) : '')}
                      onChange={e => setAdminInputs(p => ({ ...p, [group.label]: e.target.value }))}
                      placeholder="1–4"
                      className="w-14 px-2 py-1 rounded-lg text-sm text-center outline-none"
                      style={{ background: '#0F172A', border: '1px solid #475569', color: '#F1F5F9' }}
                    />
                    <button
                      onClick={() => handleAdminSave(group)}
                      disabled={adminSaving[group.label]}
                      className="px-3 py-1 rounded-lg text-xs font-bold transition-all"
                      style={{
                        background: adminSaving[group.label] ? '#334155' : '#F59E0B',
                        color:      adminSaving[group.label] ? '#64748B' : '#0F172A',
                      }}
                    >
                      {adminSaving[group.label] ? '...' : 'Sätt rätt svar'}
                    </button>
                    {group.correctOption !== null && (
                      <span className="text-xs font-semibold" style={{ color: '#4ADE80' }}>
                        ✓ Satt till {group.correctOption}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
