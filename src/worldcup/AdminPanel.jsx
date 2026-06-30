import { useState, useEffect } from 'react'
import { supabase, syncMatchResultsFromAPI, syncPlayerStatsFromAPI, fetchMatchResults, fetchBracketMatches } from '../lib/supabase'

export default function AdminPanel({ demo = false, user = null, profile = null }) {
  const [matchId, setMatchId] = useState('')
  const [homeGoals, setHomeGoals] = useState('')
  const [awayGoals, setAwayGoals] = useState('')
  const [status, setStatus] = useState('FT')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [vmWinnerInput, setVmWinnerInput] = useState('')
  const [vmMessage, setVmMessage] = useState(null)
  const [syncMessage, setSyncMessage] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [matchResults, setMatchResults] = useState(null)
  const [diagLoading, setDiagLoading] = useState(false)

  // ─── Slutspelsresultat ────────────────────────────────────────────────────
  const [bracketMatches, setBracketMatches] = useState([])
  // { [match_id]: { home: string, away: string, saving: bool, msg: string|null } }
  const [bracketGoals, setBracketGoals] = useState({})

  // ─── Manuella bonuspoäng ───────────────────────────────────────────────────
  const [profiles, setProfiles] = useState([])
  const [bonusUserId, setBonusUserId] = useState('')
  const [bonusPoints, setBonusPoints] = useState(5)
  const [bonusNote, setBonusNote] = useState('')
  const [bonusLoading, setBonusLoading] = useState(false)
  const [bonusMessage, setBonusMessage] = useState(null)
  const [manualBonuses, setManualBonuses] = useState([])

  useEffect(() => {
    if (demo) return
    supabase.from('profiles').select('id, username').order('username').then(({ data }) => {
      if (data?.length) {
        setProfiles(data)
        setBonusUserId(data[0].id)
      }
    })
    loadManualBonuses()
    fetchBracketMatches().then(data => {
      setBracketMatches(data)
      const init = {}
      for (const m of data) {
        init[m.match_id] = { home: m.home_goals ?? '', away: m.away_goals ?? '', saving: false, msg: null }
      }
      setBracketGoals(init)
    }).catch(() => {})
  }, [demo])

  async function loadManualBonuses() {
    const { data } = await supabase
      .from('manual_bonus_points')
      .select('id, user_id, points, note, created_at, profiles(username)')
      .order('created_at', { ascending: false })
      .limit(30)
    setManualBonuses(data ?? [])
  }

  async function addManualBonus() {
    if (!bonusUserId) return setBonusMessage('Välj en användare')
    const pts = parseInt(bonusPoints, 10)
    if (!pts) return setBonusMessage('Ange giltigt poängtal')
    setBonusLoading(true); setBonusMessage(null)
    try {
      const { error } = await supabase.from('manual_bonus_points').insert({
        user_id: bonusUserId,
        points: pts,
        note: bonusNote.trim() || null,
      })
      if (error) throw error
      setBonusMessage('✓ Bonuspoäng tillagda')
      setBonusNote('')
      setBonusPoints(5)
      await loadManualBonuses()
    } catch (e) {
      setBonusMessage('Fel: ' + (e.message || e))
    } finally { setBonusLoading(false) }
  }

  async function deleteManualBonus(id) {
    const { error } = await supabase.from('manual_bonus_points').delete().eq('id', id)
    if (!error) await loadManualBonuses()
  }

  async function fetchResult() {
    if (!matchId) return setMessage('Ange match_id')
    setLoading(true); setMessage(null)
    try {
      if (demo) {
        const raw = localStorage.getItem('demo.match_results')
        const map = raw ? JSON.parse(raw) : {}
        const d = map[matchId]
        if (!d) throw new Error('Inget lokalt resultat')
        setHomeGoals(d.home_goals ?? '')
        setAwayGoals(d.away_goals ?? '')
        setStatus(d.status ?? '')
        setMessage('Hämtat lokalt resultat för ' + matchId)
      } else {
        const { data, error } = await supabase
          .from('match_results')
          .select('*')
          .eq('match_id', matchId)
          .single()
        if (error) throw error
        setHomeGoals(data.home_goals ?? '')
        setAwayGoals(data.away_goals ?? '')
        setStatus(data.status ?? '')
        setMessage('Hämtat resultat för ' + matchId)
      }
    } catch (e) {
      setMessage('Hittade inget resultat: ' + (e.message || e))
    } finally { setLoading(false) }
  }

  async function saveResult() {
    if (!matchId) return setMessage('Ange match_id')
    setLoading(true); setMessage(null)
    try {
      const payload = {
        match_id: matchId,
        home_goals: homeGoals === '' ? null : parseInt(homeGoals, 10),
        away_goals: awayGoals === '' ? null : parseInt(awayGoals, 10),
        status: status || null,
        updated_at: new Date().toISOString(),
      }
      if (demo) {
        const raw = localStorage.getItem('demo.match_results')
        const map = raw ? JSON.parse(raw) : {}
        map[matchId] = payload
        localStorage.setItem('demo.match_results', JSON.stringify(map))
        setMessage('Sparat lokalt resultat för ' + matchId)
      } else {
        const { error } = await supabase
          .from('match_results')
          .upsert(payload, { onConflict: 'match_id' })
        if (error) throw error
        setMessage('Sparat resultat för ' + matchId)
        await reloadDiag()
      }
    } catch (e) {
      setMessage('Fel vid sparande: ' + (e.message || e))
    } finally { setLoading(false) }
  }

  async function saveVmWinner() {
    const normalizedWinner = vmWinnerInput.trim()
    if (!normalizedWinner) return setVmMessage('Ange ett lagnamn')
    setLoading(true); setVmMessage(null)
    try {
      const { error } = await supabase
        .from('tournament_results')
        .update({ winner: normalizedWinner, updated_at: new Date().toISOString() })
        .eq('id', 1)
      if (error) throw error
      setVmMessage('✓ VM-vinnare sparad: ' + normalizedWinner)
    } catch (e) {
      setVmMessage('Fel: ' + (e.message || e))
    } finally { setLoading(false) }
  }

  async function reloadDiag() {
    try {
      const rows = await fetchMatchResults()
      setMatchResults(rows)
    } catch (e) {
      console.warn('fetchMatchResults fel:', e.message)
    }
  }

  async function loadDiagnostics() {
    setDiagLoading(true)
    try {
      await reloadDiag()
    } finally { setDiagLoading(false) }
  }

  function updateBracketGoal(matchId, patch) {
    setBracketGoals(prev => ({ ...prev, [matchId]: { ...prev[matchId], ...patch } }))
  }

  async function saveBracketResult(matchId) {
    const g = bracketGoals[matchId] ?? {}
    const homeG = parseInt(g.home, 10)
    const awayG = parseInt(g.away, 10)
    if (isNaN(homeG) || isNaN(awayG) || homeG < 0 || awayG < 0) {
      return updateBracketGoal(matchId, { msg: '⚠ Ange giltiga mål (0 eller mer)' })
    }
    updateBracketGoal(matchId, { saving: true, msg: null })
    const { error } = await supabase
      .from('bracket_matches')
      .update({ home_goals: homeG, away_goals: awayG, status: 'finished', updated_at: new Date().toISOString() })
      .eq('match_id', matchId)
    if (error) {
      updateBracketGoal(matchId, { saving: false, msg: '⚠ ' + error.message })
    } else {
      updateBracketGoal(matchId, { saving: false, msg: '✓ Sparat!' })
      setBracketMatches(prev => prev.map(m =>
        m.match_id === matchId ? { ...m, home_goals: homeG, away_goals: awayG, status: 'finished' } : m
      ))
      setTimeout(() => updateBracketGoal(matchId, { msg: null }), 3000)
    }
  }

  async function runApiSync() {
    setSyncing(true); setSyncMessage(null)
    try {
      const result = await syncMatchResultsFromAPI()
      await syncPlayerStatsFromAPI()

      if (result.error) {
        setSyncMessage(`Synk-fel: ${result.error}`)
      } else if (result.synced === 0 && result.total === 0) {
        setSyncMessage(`API returnerade 0 fixtures. Kontrollera att VITE_API_FOOTBALL_KEY är satt och att league=1/season=2026 finns i API-Football.`)
      } else {
        setSyncMessage(
          `✓ Synk klar – ${result.synced} matcher sparade till match_results` +
          ` (${result.matched} matchade av ${result.total} API-fixtures)` +
          (result.matchIds.length ? `. IDs: ${result.matchIds.join(', ')}` : '')
        )
      }
      await reloadDiag()
    } catch (e) {
      setSyncMessage('Synk-fel: ' + (e.message || e))
    } finally { setSyncing(false) }
  }

  async function pushDemoToSupabase() {
    setLoading(true); setMessage(null)
    try {
      if (!user) throw new Error('Du måste vara inloggad som admin för att pusha')
      if (!profile?.is_admin) throw new Error('Kräver admin-behörighet')
      const raw = localStorage.getItem('demo.match_results')
      if (!raw) throw new Error('Inga lokala resultat att pusha')
      const map = JSON.parse(raw)
      let count = 0
      for (const [mid, d] of Object.entries(map)) {
        const payload = {
          match_id: mid,
          home_goals: d.home_goals === '' ? null : d.home_goals,
          away_goals: d.away_goals === '' ? null : d.away_goals,
          status: d.status ?? null,
          updated_at: d.updated_at ?? new Date().toISOString(),
        }
        const { error } = await supabase.from('match_results').upsert(payload, { onConflict: 'match_id' })
        if (error) throw error
        count++
      }
      setMessage(`Pushed ${count} resultat till Supabase`)
      await reloadDiag()
    } catch (e) {
      setMessage('Push fel: ' + (e.message || e))
    } finally { setLoading(false) }
  }

  const withResult    = (matchResults ?? []).filter(r => r.result != null)
  const withoutResult = (matchResults ?? []).filter(r => r.result == null)

  return (
    <div className="p-4 rounded-2xl space-y-5" style={{ background:'#071025', border:'1px solid #223251' }}>
      <h2 className="font-bold text-lg" style={{ color:'#F1F5F9' }}>Admin — Matchresultat</h2>

      {/* ─ Diagnostik ─ */}
      {!demo && (
        <div className="rounded-xl p-3" style={{ background:'#0F172A', border:'1px solid #1E3A5F' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold" style={{ color:'#64748B' }}>DIAGNOSTIK — match_results-tabellen</p>
            <button
              onClick={loadDiagnostics}
              disabled={diagLoading}
              className="text-xs px-2 py-1 rounded"
              style={{ background:'#1E3A5F', color:'#93C5FD' }}
            >
              {diagLoading ? 'Läser...' : '🔍 Läs tabell'}
            </button>
          </div>

          {matchResults === null && (
            <p className="text-xs" style={{ color:'#475569' }}>Klicka "Läs tabell" för att se vad som finns i match_results.</p>
          )}

          {matchResults !== null && (
            <div className="space-y-2">
              <div className="flex gap-4 text-xs">
                <span style={{ color:'#94A3B8' }}>Totalt: <strong style={{ color:'#F1F5F9' }}>{matchResults.length}</strong> rader</span>
                <span style={{ color:'#94A3B8' }}>Med result: <strong style={{ color: withResult.length > 0 ? '#34D399' : '#F87171' }}>{withResult.length}</strong></span>
                <span style={{ color:'#94A3B8' }}>Utan result: <strong style={{ color: withoutResult.length > 0 ? '#F87171' : '#34D399' }}>{withoutResult.length}</strong></span>
              </div>

              {matchResults.length === 0 && (
                <p className="text-xs font-semibold" style={{ color:'#F87171' }}>
                  ⚠ Tabellen är TOM – inga matchresultat har synkats ännu. match_pts = 0 för alla.
                  Kör "Synka matchresultat nu" nedan.
                </p>
              )}

              {withResult.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-1" style={{ color:'#34D399' }}>Matcher med resultat (poänggrundande):</p>
                  <div className="flex flex-wrap gap-1">
                    {withResult.map(r => (
                      <span key={r.match_id} className="text-xs px-1.5 py-0.5 rounded"
                            style={{ background:'rgba(52,211,153,0.12)', color:'#34D399' }}>
                        {r.match_id}: {r.home_goals}–{r.away_goals} ({r.result})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {withoutResult.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-1" style={{ color:'#F59E0B' }}>Rader utan mål/result (räknas ej):</p>
                  <div className="flex flex-wrap gap-1">
                    {withoutResult.map(r => (
                      <span key={r.match_id} className="text-xs px-1.5 py-0.5 rounded"
                            style={{ background:'rgba(245,158,11,0.1)', color:'#F59E0B' }}>
                        {r.match_id} (status: {r.status ?? '?'})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─ Synk från API-Football ─ */}
      {!demo && (
        <div className="rounded-xl p-3" style={{ background:'#0F172A', border:'1px solid #1E3A5F' }}>
          <p className="text-xs font-semibold mb-1" style={{ color:'#64748B' }}>API-FOOTBALL SYNK (FT / AET / PEN)</p>
          <p className="text-xs mb-2" style={{ color:'#475569' }}>
            Kräver att VITE_API_FOOTBALL_KEY är satt i Vercel-miljön.
            Synkar match_id i format A1, B2 … mot league=1, season=2026.
          </p>
          <button
            onClick={runApiSync}
            disabled={syncing}
            className="px-4 py-2 rounded font-semibold text-sm"
            style={{ background: '#22C55E', color: '#052e16' }}
          >
            {syncing ? 'Synkar...' : '⚡ Synka matchresultat nu'}
          </button>
          {syncMessage && (
            <div className="text-xs mt-2 break-all" style={{ color: syncMessage.startsWith('✓') ? '#34D399' : '#F87171' }}>
              {syncMessage}
            </div>
          )}
        </div>
      )}

      {/* ─ Manuell inmatning ─ */}
      <div className="rounded-xl p-3" style={{ background:'#0F172A', border:'1px solid #1E3A5F' }}>
        <p className="text-xs font-semibold mb-2" style={{ color:'#64748B' }}>MANUELL INMATNING</p>
        <p className="text-xs mb-2" style={{ color:'#475569' }}>
          Ange match_id i appens format (t.ex. "A1", "F3") – INTE API-Football numeriska id:n.
        </p>
        <div className="space-y-2">
          <div className="flex gap-2">
            <input value={matchId} onChange={e => setMatchId(e.target.value)} placeholder="match_id (t.ex. A1)"
                   className="flex-1 rounded px-3 py-2" />
            <button onClick={fetchResult} className="px-3 py-2 rounded" disabled={loading}
                    style={{ background:'#334155', color:'#F1F5F9' }}>Hämta</button>
          </div>

          <div className="flex gap-2">
            <input value={homeGoals} onChange={e => setHomeGoals(e.target.value)} placeholder="Hemma mål"
                   className="w-24 rounded px-3 py-2" />
            <input value={awayGoals} onChange={e => setAwayGoals(e.target.value)} placeholder="Borta mål"
                   className="w-24 rounded px-3 py-2" />
            <select value={status} onChange={e => setStatus(e.target.value)} className="rounded px-3 py-2">
              <option>NS</option>
              <option>1H</option>
              <option>HT</option>
              <option>2H</option>
              <option>FT</option>
              <option>AET</option>
              <option>PEN</option>
            </select>
          </div>

          <div className="flex gap-2">
            <button onClick={saveResult} className="px-4 py-2 rounded font-semibold" style={{ background:'#F59E0B', color:'#0F172A' }} disabled={loading}>Spara</button>
            <button onClick={() => { setMatchId(''); setHomeGoals(''); setAwayGoals(''); setStatus('FT'); setMessage(null) }} className="px-3 py-2 rounded" style={{ background:'#334155', color:'#F1F5F9' }}>Rensa</button>
          </div>

          {demo && (
            <div className="mt-3">
              <p className="text-xs" style={{ color:'#94A3B8' }}>Demo-läge: spara lokala resultat i localStorage.</p>
              <div className="flex flex-col gap-2 mt-2">
                <button onClick={() => { localStorage.removeItem('demo.match_results'); setMessage('Rensade lokala demo-resultat'); }} className="px-3 py-2 rounded" style={{ background:'#334155', color:'#F1F5F9' }}>Rensa lokalt</button>
                <button onClick={pushDemoToSupabase} className="px-4 py-2 rounded font-semibold" style={{ background:'#06B6D4', color:'#042027' }} disabled={loading || !user || !profile?.is_admin}>Push lokala → Supabase</button>
              </div>
            </div>
          )}

          {message && <div className="text-xs mt-2" style={{ color: message.startsWith('Sparat') || message.startsWith('Pushed') || message.startsWith('Hämtat') ? '#34D399' : '#F87171' }}>{message}</div>}
        </div>
      </div>

      {/* ─ Slutspelsresultat ─ */}
      {!demo && (
        <div className="rounded-xl p-3" style={{ background:'#0F172A', border:'1px solid #1E3A5F' }}>
          <p className="text-xs font-semibold mb-3" style={{ color:'#64748B' }}>
            SLUTSPELSRESULTAT — bracket_matches
          </p>

          {bracketMatches.length === 0 && (
            <p className="text-xs" style={{ color:'#475569' }}>
              Inga slutspelsmatcher inlagda i bracket_matches ännu.
            </p>
          )}

          <div className="space-y-2">
            {bracketMatches.map(m => {
              const g   = bracketGoals[m.match_id] ?? { home:'', away:'', saving:false, msg:null }
              const num = m.match_number != null ? `#${m.match_number}` : null
              const alreadyDone = m.status === 'finished' && m.home_goals != null
              return (
                <div key={m.match_id}
                     className="rounded-lg px-3 py-2.5 flex flex-wrap items-center gap-2"
                     style={{ background:'#0F1E35', border:`1px solid ${alreadyDone ? 'rgba(52,211,153,0.25)' : '#1E3A5F'}` }}>

                  {/* Match-nummer */}
                  {num && (
                    <span className="text-xs font-black shrink-0 w-8 text-center rounded"
                          style={{ background:'rgba(245,158,11,0.12)', color:'#F59E0B' }}>
                      {num}
                    </span>
                  )}

                  {/* Lagnamn */}
                  <span className="text-xs font-semibold flex-1 min-w-[140px]"
                        style={{ color:'#F1F5F9' }}>
                    {m.home_team} <span style={{ color:'#475569' }}>vs</span> {m.away_team}
                  </span>

                  {/* Befintligt resultat */}
                  {alreadyDone && (
                    <span className="text-xs px-1.5 py-0.5 rounded font-mono shrink-0"
                          style={{ background:'rgba(52,211,153,0.12)', color:'#34D399' }}>
                      {m.home_goals}–{m.away_goals}
                    </span>
                  )}

                  {/* Mål-inputs */}
                  <input
                    type="number" min="0" value={g.home}
                    onChange={e => updateBracketGoal(m.match_id, { home: e.target.value })}
                    placeholder="H" aria-label="Hemmamål"
                    className="w-14 rounded px-2 py-1 text-sm text-center"
                    style={{ background:'#1E293B', color:'#F1F5F9', border:'1px solid #334155' }}
                  />
                  <span className="text-xs" style={{ color:'#475569' }}>–</span>
                  <input
                    type="number" min="0" value={g.away}
                    onChange={e => updateBracketGoal(m.match_id, { away: e.target.value })}
                    placeholder="B" aria-label="Bortamål"
                    className="w-14 rounded px-2 py-1 text-sm text-center"
                    style={{ background:'#1E293B', color:'#F1F5F9', border:'1px solid #334155' }}
                  />

                  {/* Spara-knapp */}
                  <button
                    onClick={() => saveBracketResult(m.match_id)}
                    disabled={g.saving}
                    className="px-3 py-1.5 rounded font-semibold text-xs shrink-0"
                    style={{ background: g.saving ? '#334155' : '#F59E0B', color: g.saving ? '#64748B' : '#0F172A' }}
                  >
                    {g.saving ? 'Sparar...' : 'Spara'}
                  </button>

                  {/* Feedback */}
                  {g.msg && (
                    <span className="text-xs shrink-0"
                          style={{ color: g.msg.startsWith('✓') ? '#34D399' : '#F87171' }}>
                      {g.msg}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ─ VM-vinnare ─ */}
      <div className="rounded-xl p-3" style={{ background:'#0F172A', border:'1px solid #1E3A5F' }}>
        <p className="text-xs font-semibold mb-1" style={{ color:'#64748B' }}>VM-VINNARE (20p)</p>
        <p className="text-xs mb-2" style={{ color:'#475569' }}>Sparas i tournament_results.winner – matcha exakt mot vm_picks.vm_winner (ej skiftlägeskänsligt).</p>
        <div className="flex gap-2">
          <input
            value={vmWinnerInput}
            onChange={e => setVmWinnerInput(e.target.value)}
            placeholder="t.ex. Brasilien"
            className="flex-1 rounded px-3 py-2"
          />
          <button
            onClick={saveVmWinner}
            disabled={loading}
            className="px-4 py-2 rounded font-semibold"
            style={{ background: '#F59E0B', color: '#0F172A' }}
          >
            Spara
          </button>
        </div>
        {vmMessage && (
          <div className="text-xs mt-2" style={{ color: vmMessage.startsWith('✓') ? '#34D399' : '#F87171' }}>
            {vmMessage}
          </div>
        )}
      </div>

      {/* ─ Manuella bonuspoäng ─ */}
      {!demo && (
        <div className="rounded-xl p-3" style={{ background:'#0F172A', border:'1px solid #1E3A5F' }}>
          <p className="text-xs font-semibold mb-2" style={{ color:'#64748B' }}>MANUELLA BONUSPOÄNG</p>

          <div className="space-y-2">
            {/* Användare */}
            <div className="flex gap-2 items-center">
              <label className="text-xs w-20 shrink-0" style={{ color:'#94A3B8' }}>Användare</label>
              <select
                value={bonusUserId}
                onChange={e => setBonusUserId(e.target.value)}
                className="flex-1 rounded px-3 py-2 text-sm"
                style={{ background:'#1E293B', color:'#F1F5F9', border:'1px solid #334155' }}
              >
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.username}</option>
                ))}
              </select>
            </div>

            {/* Poäng */}
            <div className="flex gap-2 items-center">
              <label className="text-xs w-20 shrink-0" style={{ color:'#94A3B8' }}>Poäng</label>
              <input
                type="number"
                value={bonusPoints}
                onChange={e => setBonusPoints(e.target.value)}
                className="w-24 rounded px-3 py-2 text-sm"
                style={{ background:'#1E293B', color:'#F1F5F9', border:'1px solid #334155' }}
              />
            </div>

            {/* Anledning */}
            <div className="flex gap-2 items-center">
              <label className="text-xs w-20 shrink-0" style={{ color:'#94A3B8' }}>Anledning</label>
              <input
                type="text"
                value={bonusNote}
                onChange={e => setBonusNote(e.target.value)}
                placeholder="Valfri"
                className="flex-1 rounded px-3 py-2 text-sm"
                style={{ background:'#1E293B', color:'#F1F5F9', border:'1px solid #334155' }}
              />
            </div>

            <button
              onClick={addManualBonus}
              disabled={bonusLoading}
              className="px-4 py-2 rounded font-semibold text-sm"
              style={{ background:'#6366F1', color:'#fff' }}
            >
              {bonusLoading ? 'Sparar...' : 'Lägg till poäng'}
            </button>

            {bonusMessage && (
              <div className="text-xs mt-1" style={{ color: bonusMessage.startsWith('✓') ? '#34D399' : '#F87171' }}>
                {bonusMessage}
              </div>
            )}
          </div>

          {/* Lista med senaste manuella bonuspoäng */}
          {manualBonuses.length > 0 && (
            <div className="mt-4 space-y-1">
              <p className="text-xs font-semibold mb-2" style={{ color:'#64748B' }}>SENAST TILLAGDA</p>
              {manualBonuses.map(b => (
                <div
                  key={b.id}
                  className="flex items-center justify-between rounded px-3 py-2 text-xs gap-2"
                  style={{ background:'#0F1E35', border:'1px solid #1E3A5F' }}
                >
                  <span style={{ color:'#93C5FD', minWidth: 80 }}>{b.profiles?.username ?? b.user_id}</span>
                  <span className="font-bold" style={{ color:'#34D399', minWidth: 30 }}>+{b.points}p</span>
                  <span className="flex-1 truncate" style={{ color:'#94A3B8' }}>{b.note ?? '—'}</span>
                  <span style={{ color:'#475569' }}>
                    {new Date(b.created_at).toLocaleDateString('sv-SE')}
                  </span>
                  <button
                    onClick={() => deleteManualBonus(b.id)}
                    className="px-2 py-0.5 rounded text-xs"
                    style={{ background:'#450A0A', color:'#F87171' }}
                  >
                    Ta bort
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
