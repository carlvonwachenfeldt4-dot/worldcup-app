import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AdminPanel({ demo = false, user = null, profile = null }) {
  const [matchId, setMatchId] = useState('')
  const [homeGoals, setHomeGoals] = useState('')
  const [awayGoals, setAwayGoals] = useState('')
  const [status, setStatus] = useState('FT')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [vmWinnerInput, setVmWinnerInput] = useState('')
  const [vmMessage, setVmMessage] = useState(null)

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
    } catch (e) {
      setMessage('Push fel: ' + (e.message || e))
    } finally { setLoading(false) }
  }

  return (
    <div className="p-4 rounded-2xl" style={{ background:'#071025', border:'1px solid #223251' }}>
      <h2 className="font-bold text-lg" style={{ color:'#F1F5F9' }}>Admin — Testa matchresultat</h2>
      <p className="text-xs" style={{ color:'#94A3B8' }}>Skriv in `match_id` (t.ex. "F3") för att simulera ett resultat.</p>

      <div className="mt-3 space-y-2">
        <div className="flex gap-2">
          <input value={matchId} onChange={e => setMatchId(e.target.value)} placeholder="match_id (t.ex. F3)"
                 className="flex-1 rounded px-3 py-2" />
          <button onClick={fetchResult} className="px-3 py-2 rounded" disabled={loading}
                  style={{ background:'#334155', color:'#F1F5F9' }}>Hämta</button>
        </div>

        <div className="flex gap-2">
          <input value={homeGoals} onChange={e => setHomeGoals(e.target.value)} placeholder="home goals"
                 className="w-24 rounded px-3 py-2" />
          <input value={awayGoals} onChange={e => setAwayGoals(e.target.value)} placeholder="away goals"
                 className="w-24 rounded px-3 py-2" />
          <select value={status} onChange={e => setStatus(e.target.value)} className="rounded px-3 py-2">
            <option>NS</option>
            <option>1H</option>
            <option>HT</option>
            <option>2H</option>
            <option>FT</option>
          </select>
        </div>

        <div className="flex gap-2">
          <button onClick={saveResult} className="px-4 py-2 rounded font-semibold" style={{ background:'#F59E0B', color:'#0F172A' }} disabled={loading}>Spara</button>
          <button onClick={() => { setMatchId(''); setHomeGoals(''); setAwayGoals(''); setStatus('FT'); setMessage(null) }} className="px-3 py-2 rounded" style={{ background:'#334155', color:'#F1F5F9' }}>Rensa</button>
        </div>

        {demo && (
          <div className="mt-3">
            <p className="text-xs" style={{ color:'#94A3B8' }}>Demo-läge: spara lokala resultat i `localStorage`.</p>
            <div className="flex flex-col gap-2 mt-2">
              <button onClick={() => { localStorage.removeItem('demo.match_results'); setMessage('Rensade lokala demo-resultat'); }} className="px-3 py-2 rounded" style={{ background:'#334155', color:'#F1F5F9' }}>Rensa lokalt</button>
              <button onClick={pushDemoToSupabase} className="px-4 py-2 rounded font-semibold" style={{ background:'#06B6D4', color:'#042027' }} disabled={loading || !user || !profile?.is_admin}>Push lokala → Supabase</button>
              {!user && (
                <p className="text-xs text-[#94A3B8]">Du behöver inte logga in för att använda demo-läget. Push till Supabase kräver dock verklig admin-inloggning.</p>
              )}
            </div>
          </div>
        )}

        {message && <div className="text-xs mt-2" style={{ color:'#CBD5E1' }}>{message}</div>}

        {/* ─ VM-vinnare ─ */}
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid #223251' }}>
          <p className="text-xs font-semibold mb-2" style={{ color: '#94A3B8' }}>VM-vinnare (20p) – sparas i tournament_results</p>
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
      </div>
    </div>
  )
}
