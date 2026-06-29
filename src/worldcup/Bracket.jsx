import { useState, useEffect, useCallback } from 'react'
import { TEAMS } from './data'
import Flag from './Flag'
import { supabase, fetchBracketMatches } from '../lib/supabase'

// ─── Slå upp flagg-iso2 för ett lagnamn (matchar mot TEAMS i data.js) ────────

function findTeamByName(name) {
  if (!name) return null
  const lower = name.toLowerCase()
  return Object.values(TEAMS).find(t => t.name.toLowerCase() === lower) ?? null
}

// ─── 1X2-knappar – identiska med gruppspelets TipButtons ─────────────────────

function TipButtons({ matchId, tip, home, away, onTip }) {
  const opts = [
    { val:'1', label: `1  ${home}` },
    { val:'X', label: 'X  Oavgjort' },
    { val:'2', label: `${away}  2` },
  ]
  return (
    <div className="flex gap-2 pt-3 pb-1">
      {opts.map(o => (
        <button
          key={o.val}
          onClick={e => { e.stopPropagation(); onTip(matchId, tip === o.val ? null : o.val) }}
          className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95"
          style={{
            background: tip === o.val ? '#F59E0B' : '#1E293B',
            color:      tip === o.val ? '#0F172A' : '#64748B',
            border:     `1.5px solid ${tip === o.val ? '#F59E0B' : '#334155'}`,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ─── Enskild kollapsbar matchrad ──────────────────────────────────────────────

function MatchRow({ match, tip, onTip, expanded, onToggle }) {
  const homeTeam = findTeamByName(match.home_team)
  const awayTeam = findTeamByName(match.away_team)
  const locked   = match.status === 'finished'
  const hasResult = locked && match.home_goals != null && match.away_goals != null
  const correct   = hasResult && tip && tip === match.result

  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{
        background: locked ? 'rgba(255,255,255,0.01)' : expanded ? '#0F172A' : 'transparent',
        border: `1px solid ${locked ? '#1E293B' : expanded ? '#334155' : 'transparent'}`,
        opacity: locked && !tip ? 0.6 : 1,
      }}
    >
      {/* ─ Kollapsad rubrik ─ */}
      <button
        onClick={() => !locked && onToggle(match.match_id)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
        style={{
          background: expanded ? '#0F172A' : 'rgba(255,255,255,0.02)',
          cursor: locked ? 'default' : 'pointer',
        }}
      >
        {/* Hemmalag */}
        {homeTeam
          ? <Flag iso2={homeTeam.iso2} size="sm" />
          : <span className="w-5 h-3.5 rounded shrink-0 inline-block" style={{ background:'#334155' }} />
        }
        <span className="text-xs font-semibold truncate max-w-[64px] hidden sm:block"
              style={{ color: locked ? '#64748B' : '#F1F5F9' }}>{match.home_team}</span>
        <span className="text-xs font-semibold truncate max-w-[48px] sm:hidden"
              style={{ color: locked ? '#64748B' : '#F1F5F9' }}>{match.home_team.slice(0,6)}</span>

        <span className="text-xs mx-1" style={{ color:'#475569' }}>vs</span>

        {/* Bortalag */}
        {awayTeam
          ? <Flag iso2={awayTeam.iso2} size="sm" />
          : <span className="w-5 h-3.5 rounded shrink-0 inline-block" style={{ background:'#334155' }} />
        }
        <span className="text-xs font-semibold truncate max-w-[64px] hidden sm:block"
              style={{ color: locked ? '#64748B' : '#F1F5F9' }}>{match.away_team}</span>
        <span className="text-xs font-semibold truncate max-w-[48px] sm:hidden"
              style={{ color: locked ? '#64748B' : '#F1F5F9' }}>{match.away_team.slice(0,6)}</span>

        <div className="flex-1" />

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Riktigt resultat när matchen är spelad */}
          {hasResult && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-mono"
                  style={{
                    background: correct ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.06)',
                    color:      correct ? '#34D399' : '#94A3B8',
                  }}>
              {match.home_goals}–{match.away_goals}
            </span>
          )}

          {/* Låst-indikator */}
          {locked ? (
            tip ? (
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black"
                    style={{ background:'#334155', color:'#94A3B8' }}>
                {tip}
              </span>
            ) : (
              <span className="text-xs" style={{ color:'#475569' }}>🔒</span>
            )
          ) : (
            tip ? (
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black"
                    style={{ background:'#F59E0B', color:'#0F172A' }}>
                {tip}
              </span>
            ) : null
          )}

          {!locked && (
            <span className="text-xs ml-1" style={{ color:'#475569' }}>
              {expanded ? '▲' : '▼'}
            </span>
          )}
        </div>
      </button>

      {/* ─ Expanderad del med 1X2-knappar (endast när ej låst) ─ */}
      {expanded && !locked && (
        <div className="px-3 pb-3 pt-1">
          <TipButtons matchId={match.match_id} tip={tip} home={match.home_team} away={match.away_team} onTip={onTip} />
        </div>
      )}
    </div>
  )
}

// ─── Rundsektion – matcher grupperade efter "round"-etiketten ───────────────

function RoundSection({ round, matches, tips, onTip, openMatch, onToggle }) {
  const filled = matches.filter(m => tips[m.match_id]).length

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background:'#1E293B', border:'1px solid #334155' }}>
      <div className="px-4 py-3 flex items-center justify-between"
           style={{ background:'#0F172A', borderBottom:'1px solid #334155' }}>
        <span className="font-bold text-sm" style={{ color:'#F59E0B' }}>{round}</span>
        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{
                background: filled === matches.length ? 'rgba(52,211,153,0.15)' : '#1E293B',
                color:      filled === matches.length ? '#34D399' : '#64748B',
                border:     `1px solid ${filled === matches.length ? '#34D399' : '#334155'}`,
              }}>
          {filled}/{matches.length}
        </span>
      </div>

      <div className="p-2 space-y-1">
        {matches.map(m => (
          <MatchRow
            key={m.match_id}
            match={m}
            tip={tips[m.match_id] ?? null}
            onTip={onTip}
            expanded={openMatch === m.match_id}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Huvudkomponent: Bracket (Slutspel) ───────────────────────────────────────

export default function Bracket({ bracketTips, onTip }) {
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [openMatch, setOpenMatch] = useState(null)

  const load = useCallback(async () => {
    try {
      const data = await fetchBracketMatches()
      setMatches(data)
      setError(null)
    } catch (e) {
      setError(e.message || 'Slutspelsmatcherna kunde inte hämtas')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Realtid: uppdatera direkt när admin sätter resultat eller status
  useEffect(() => {
    const channel = supabase
      .channel('bracket_matches_changes')
      .on('postgres_changes', { event:'*', schema:'public', table:'bracket_matches' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [load])

  const toggle = useCallback(id => setOpenMatch(prev => prev === id ? null : id), [])

  const filledCount = matches.filter(m => bracketTips[m.match_id]).length

  // Gruppera i sort_order-ordning per "round"-etikett (eller en gemensam lista om ingen finns)
  const rounds = []
  for (const m of matches) {
    const label = m.round || 'Slutspel'
    let bucket = rounds.find(r => r.label === label)
    if (!bucket) { bucket = { label, matches: [] }; rounds.push(bucket) }
    bucket.matches.push(m)
  }

  return (
    <div className="space-y-5">

      {loading && (
        <div className="rounded-2xl px-4 py-6 text-center"
             style={{ background:'#1E293B', border:'1px solid #334155' }}>
          <p className="text-sm" style={{ color:'#64748B' }}>Laddar slutspelsmatcher...</p>
        </div>
      )}

      {error && (
        <div className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
             style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)' }}>
          <p className="text-sm" style={{ color:'#F87171' }}>⚠️ {error}</p>
          <button onClick={load} className="text-xs px-3 py-1.5 rounded-xl font-semibold shrink-0"
                  style={{ background:'#334155', color:'#F1F5F9' }}>
            Försök igen
          </button>
        </div>
      )}

      {!loading && !error && matches.length === 0 && (
        <div className="rounded-2xl px-4 py-6 text-center"
             style={{ background:'rgba(71,85,105,0.2)', border:'1px solid #334155' }}>
          <div className="text-3xl mb-2">⏳</div>
          <p className="font-bold text-sm" style={{ color:'#F1F5F9' }}>Slutspelet är inte klart ännu</p>
          <p className="text-xs mt-1" style={{ color:'#64748B' }}>
            Matcherna dyker upp här så snart de är fastställda.
          </p>
        </div>
      )}

      {!loading && matches.length > 0 && (
        <>
          <div className="flex items-center justify-between px-1">
            <span className="text-xs" style={{ color:'#64748B' }}>Tippade slutspelsmatcher</span>
            <span className="text-xs font-semibold" style={{ color: filledCount === matches.length ? '#34D399' : '#64748B' }}>
              {filledCount} / {matches.length}
            </span>
          </div>

          {rounds.map(r => (
            <RoundSection
              key={r.label}
              round={r.label}
              matches={r.matches}
              tips={bracketTips}
              onTip={onTip}
              openMatch={openMatch}
              onToggle={toggle}
            />
          ))}
        </>
      )}

      {/* Poängsystem */}
      <div className="rounded-2xl p-4 grid grid-cols-2 gap-3 text-center"
           style={{ background:'#1E293B', border:'1px solid #334155' }}>
        {[['3p','Rätt 1X2 (grupp + slutspel)','#34D399'],
          ['20p','Rätt VM-vinnare','#F59E0B']].map(([pts,lbl,c]) => (
          <div key={lbl}>
            <div className="text-xl font-black" style={{ color:c }}>{pts}</div>
            <div className="text-xs mt-0.5" style={{ color:'#64748B' }}>{lbl}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
