import { useState, useEffect, useCallback, useMemo } from 'react'
import { TEAMS } from './data'
import Flag from './Flag'
import { supabase, fetchBracketMatches } from '../lib/supabase'
import { getCountdown, isMatchSoon } from '../lib/scoreCalculator'

// ─── Rundordning och pill-labels ─────────────────────────────────────────────
// `extra` anger en underrunda som visas som en separat sektion under samma pill.

const ROUND_DEFS = [
  { id: 'Sextondelsfinal', label: 'Sextondelsfinal', extra: null          },
  { id: 'Åttondelsfinal',  label: 'Åttondelsfinal',  extra: null          },
  { id: 'Kvartsfinal',     label: 'Kvartsfinal',      extra: null          },
  { id: 'Semifinal',       label: 'Semifinal',         extra: null          },
  { id: 'Final',           label: 'Final',             extra: 'Bronsmatch'  },
]

// ─── Hjälpfunktioner ─────────────────────────────────────────────────────────

function findTeamByName(name) {
  if (!name) return null
  const lower = name.toLowerCase()
  return Object.values(TEAMS).find(t => t.name.toLowerCase() === lower) ?? null
}

function splitTeamLabel(name) {
  if (!name) return { main: '', sub: null }
  const m = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  if (m) return { main: m[1].trim(), sub: m[2].trim() }
  return { main: name.trim(), sub: null }
}

// Identifierar platshållartext: "W12", "RU3", "L-SF1", "Argentina/Kap Verde"
function isPlaceholder(name) {
  if (!name) return true
  if (name.includes('/')) return true
  if (/^W\d+/i.test(name.trim())) return true
  if (/^(RU|L[-\s]?)\d*/i.test(name.trim())) return true
  return false
}

// Datum: "6 jul" — tid: "21:00"
function fmtDay(ts) {
  if (!ts) return null
  return new Date(ts).toLocaleString('sv-SE', {
    day: 'numeric', month: 'short', timeZone: 'Europe/Stockholm',
  })
}
function fmtClock(ts) {
  if (!ts) return null
  return new Date(ts).toLocaleString('sv-SE', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm',
  })
}

// ─── PlaceholderFlag ─────────────────────────────────────────────────────────

function PlaceholderFlag() {
  return (
    <span
      className="inline-flex items-center justify-center shrink-0 rounded"
      style={{
        width: 20, height: 15,
        background: '#1E293B',
        border: '1px solid #334155',
        color: '#64748B',
        fontSize: 9, fontWeight: 800, lineHeight: 1,
        boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
      }}
      aria-label="Lag ej fastställt"
    >?</span>
  )
}

// ─── TipButtons ──────────────────────────────────────────────────────────────

function TipButtons({ matchId, tip, home, away, onTip }) {
  const opts = [
    { val:'1', label: `1  ${home}` },
    { val:'X', label: 'X'          },
    { val:'2', label: `${away}  2` },
  ]
  return (
    <div className="flex gap-2 pt-2 pb-1">
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

// ─── TipButtonsPenalty – enbart 1/2, ingen X (straffar kan ej sluta lika) ───

function TipButtonsPenalty({ matchId, tip, home, away, onTip }) {
  const opts = [
    { val:'1', label: `1  ${home}` },
    { val:'2', label: `${away}  2` },
  ]
  return (
    <div className="flex gap-2">
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

// ─── TipResultRow – visa tips + rätt/fel när matchen är avgjord ─────────────

function TipResultRow({ label, tip, result }) {
  if (!tip) return null
  const decided = result != null
  const correct = decided && tip === result
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[10px] uppercase tracking-wider font-semibold"
            style={{ color:'#475569' }}>
        {label}
      </span>
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold px-2 py-0.5 rounded-lg"
              style={{
                background: !decided ? 'rgba(255,255,255,0.05)'
                  : correct ? 'rgba(52,211,153,0.15)'
                  : 'rgba(248,113,113,0.12)',
                color: !decided ? '#94A3B8' : correct ? '#34D399' : '#F87171',
              }}>
          {tip}
        </span>
        {decided ? (
          <span className="text-[10px]" style={{ color: correct ? '#34D399' : '#F87171' }}>
            {correct ? '✓' : `✗ (${result})`}
          </span>
        ) : (
          <span className="text-[10px]" style={{ color:'#334155' }}>— ej avgjort</span>
        )}
      </div>
    </div>
  )
}

// ─── MatchCard (FotMob-inspirerad layout) ────────────────────────────────────

// Rundor där övertid och straffar är möjliga
const KNOCKOUT_OT_ROUNDS = new Set(['Kvartsfinal', 'Semifinal', 'Bronsmatch', 'Final'])

function MatchCard({ match, tip, etTip, penTip, onTip, expanded, onToggle, now }) {
  const finished        = match.status === 'finished'
  const kickedOff       = match.kickoff ? now >= new Date(match.kickoff) : false
  const locked          = finished || kickedOff
  const hasResult       = finished && match.home_goals != null && match.away_goals != null
  const correct         = hasResult && !!tip && tip === match.result
  const teamsKnown      = !isPlaceholder(match.home_team) && !isPlaceholder(match.away_team)
  const isKnockoutWithOT = KNOCKOUT_OT_ROUNDS.has(match.round)
  // Tillåt expansion av låsta KV+-matcher för att visa tips/resultat-jämförelse
  const canToggle       = teamsKnown && (!locked || (isKnockoutWithOT && hasResult))
  const countdown       = !locked && match.kickoff ? getCountdown(match.kickoff) : null
  const soon            = !locked && match.kickoff ? isMatchSoon(match.kickoff, 60) : false

  const homeLabel  = splitTeamLabel(match.home_team)
  const awayLabel  = splitTeamLabel(match.away_team)
  const homeTeam   = findTeamByName(homeLabel.main)
  const awayTeam   = findTeamByName(awayLabel.main)
  const homeWon    = hasResult && match.result === '1'
  const awayWon    = hasResult && match.result === '2'

  // Tips-badge-färg beror på om resultatet är känt
  const tipStyle = hasResult
    ? correct
      ? { background:'rgba(52,211,153,0.15)', color:'#34D399'  }  // rätt
      : { background:'rgba(255,255,255,0.06)', color:'#64748B' }  // fel
    : locked
      ? { background:'#334155',  color:'#94A3B8' }                // låst, ej klart
      : { background:'#F59E0B',  color:'#0F172A' }                // aktiv

  // Visuell "expanded"-effekt enbart när kortet faktiskt kan öppnas
  const showExpanded = expanded && canToggle
  // View-only: låst kvartsfinal+ med känt resultat — visas utan redigeringsknappar
  const viewOnly = locked && isKnockoutWithOT && showExpanded

  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{
        background: showExpanded ? '#0F172A' : 'transparent',
        border: `1px solid ${showExpanded ? '#334155' : '#1E293B'}`,
      }}
    >
      <button
        onClick={() => canToggle && onToggle(match.match_id)}
        className="w-full flex items-stretch text-left"
        style={{
          background: showExpanded ? '#0F172A' : 'rgba(255,255,255,0.025)',
          cursor: canToggle ? 'pointer' : 'default',
          minHeight: 64,
        }}
      >
        {/* ── Vänsterkolumn: datum/tid ELLER bara "FT" ── */}
        <div
          className="flex flex-col items-center justify-center shrink-0 px-2 gap-0.5"
          style={{ width: 56, borderRight: '1px solid #1E293B' }}
        >
          {finished ? (
            <span className="text-[10px] font-bold uppercase tracking-wide"
                  style={{ color:'#475569' }}>FT</span>
          ) : match.kickoff ? (
            <>
              <span className="text-[10px] font-medium leading-none"
                    style={{ color:'#94A3B8' }}>
                {fmtDay(match.kickoff)}
              </span>
              <span className="text-sm font-bold font-mono leading-none"
                    style={{ color: locked ? '#475569' : '#F59E0B' }}>
                {fmtClock(match.kickoff)}
              </span>
              {countdown && (
                <span className="text-[9px] font-mono mt-0.5 px-1 rounded-full"
                      style={{
                        background: soon ? 'rgba(239,68,68,0.15)' : 'rgba(52,211,153,0.10)',
                        color:      soon ? '#F87171' : '#34D399',
                        lineHeight: 1.6,
                      }}>
                  {soon ? '⚡' : ''}{countdown}
                </span>
              )}
            </>
          ) : (
            <span className="text-xs" style={{ color:'#334155' }}>–</span>
          )}
        </div>

        {/* ── Lag + målkolumn ── */}
        <div className="flex-1 min-w-0 flex items-stretch">

          {/* Lagnamn (flagga + namn staplade) */}
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-1 px-3 py-2.5">

            {/* Hemmalag */}
            <div className="flex items-center gap-2 min-w-0">
              {!isPlaceholder(match.home_team) && homeTeam
                ? <Flag iso2={homeTeam.iso2} size="sm" />
                : <PlaceholderFlag />}
              <span className="text-sm truncate"
                    style={{
                      color:      hasResult ? (homeWon ? '#F1F5F9' : awayWon ? '#475569' : '#94A3B8') : '#F1F5F9',
                      fontWeight: homeWon ? 700 : 500,
                    }}>
                {homeLabel.main}
              </span>
            </div>

            {/* Bortalag */}
            <div className="flex items-center gap-2 min-w-0">
              {!isPlaceholder(match.away_team) && awayTeam
                ? <Flag iso2={awayTeam.iso2} size="sm" />
                : <PlaceholderFlag />}
              <span className="text-sm truncate"
                    style={{
                      color:      hasResult ? (awayWon ? '#F1F5F9' : homeWon ? '#475569' : '#94A3B8') : '#F1F5F9',
                      fontWeight: awayWon ? 700 : 500,
                    }}>
                {awayLabel.main}
              </span>
            </div>

            {/* "Lag ej klara"-notering */}
            {!teamsKnown && (
              <span className="text-[10px] mt-0.5" style={{ color:'#475569' }}>
                Lag ej klara – tippning stängt
              </span>
            )}
          </div>

          {/* Mål per lag (bara vid färdigt resultat) */}
          {hasResult && (
            <div className="flex flex-col justify-center items-center shrink-0 pr-3 gap-1 py-2.5"
                 style={{ width: 28 }}>
              <span className="text-sm font-black font-mono"
                    style={{ color: homeWon ? '#F1F5F9' : awayWon ? '#475569' : '#94A3B8' }}>
                {match.home_goals}
              </span>
              <span className="text-sm font-black font-mono"
                    style={{ color: awayWon ? '#F1F5F9' : homeWon ? '#475569' : '#94A3B8' }}>
                {match.away_goals}
              </span>
            </div>
          )}
        </div>

        {/* ── Statuskolumn: tip-badge / låsikon / pil ── */}
        <div className="flex flex-col items-center justify-center shrink-0 px-3 gap-1"
             style={{ minWidth: 40 }}>
          {/* Huvud-tipsbadge */}
          {tip ? (
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black"
                  style={tipStyle}>
              {tip}
            </span>
          ) : locked && !canToggle ? (
            <span className="text-xs" style={{ color:'#334155' }}>🔒</span>
          ) : null}
          {/* Expandpil – synlig även för låsta KV+-matcher med resultat */}
          {canToggle && (
            <span className="text-[10px]" style={{ color:'#475569' }}>
              {showExpanded ? '▲' : '▼'}
            </span>
          )}
        </div>
      </button>

      {/* ── Expanderad: edit-läge eller view-only-läge ── */}
      {showExpanded && (
        <div className="px-3 pb-3 pt-2 space-y-3">
          {viewOnly ? (
            /* ── View-only: tips + rätt/fel per sektion (låst KV+) ── */
            <div className="space-y-1.5">
              <TipResultRow label="Fulltid"  tip={tip}    result={match.result}     />
              <TipResultRow label="Övertid"  tip={etTip}  result={match.et_result}  />
              <TipResultRow label="Straffar" tip={penTip}  result={match.pen_result} />
              {!tip && !etTip && !penTip && (
                <p className="text-xs text-center" style={{ color:'#475569' }}>Inget tips lämnades</p>
              )}
            </div>
          ) : (
            /* ── Edit-läge: tippningsknappar ── */
            <>
              {/* Fulltid */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                   style={{ color:'#64748B' }}>Fulltid</p>
                <TipButtons matchId={match.match_id} tip={tip}
                            home={homeLabel.main} away={awayLabel.main}
                            onTip={(id, val) => onTip(id, 'tip', val)} />
              </div>

              {isKnockoutWithOT && (
                <>
                  <div style={{ height:1, background:'#1E293B' }} />

                  {/* Övertid */}
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider"
                         style={{ color:'#64748B' }}>Övertid</p>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full"
                            style={{ background:'rgba(99,102,241,0.12)', color:'#818CF8' }}>
                        frivillig · +2p om det sker
                      </span>
                    </div>
                    <TipButtons matchId={match.match_id} tip={etTip}
                                home={homeLabel.main} away={awayLabel.main}
                                onTip={(id, val) => onTip(id, 'et_tip', val)} />
                  </div>

                  <div style={{ height:1, background:'#1E293B' }} />

                  {/* Straffar */}
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider"
                         style={{ color:'#64748B' }}>Straffar</p>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full"
                            style={{ background:'rgba(99,102,241,0.12)', color:'#818CF8' }}>
                        frivillig · +2p om det sker
                      </span>
                    </div>
                    <TipButtonsPenalty matchId={match.match_id} tip={penTip}
                                       home={homeLabel.main} away={awayLabel.main}
                                       onTip={(id, val) => onTip(id, 'pen_tip', val)} />
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── RoundSection ─────────────────────────────────────────────────────────────

function RoundSection({ label, matches, tips, onTip, openMatch, onToggle, now }) {
  const tippable = matches.filter(m => !isPlaceholder(m.home_team) && !isPlaceholder(m.away_team))
  // Progress räknar bara fulltidstippet (req 6: övertid/straffar är frivilliga)
  const filled   = tippable.filter(m => tips[m.match_id]?.tip).length
  const total    = tippable.length

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background:'#1E293B', border:'1px solid #334155' }}>
      <div className="px-4 py-2.5 flex items-center justify-between"
           style={{ background:'#0F172A', borderBottom:'1px solid #334155' }}>
        <span className="font-bold text-sm" style={{ color:'#F59E0B' }}>{label}</span>
        {total > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{
                  background: filled === total ? 'rgba(52,211,153,0.15)' : '#1E293B',
                  color:      filled === total ? '#34D399' : '#64748B',
                  border:     `1px solid ${filled === total ? '#34D399' : '#334155'}`,
                }}>
            {filled}/{total}
          </span>
        )}
      </div>
      <div className="p-2 space-y-1.5">
        {matches.map(m => {
          const entry = tips[m.match_id]
          const tip    = (entry && typeof entry === 'object') ? entry.tip     : (entry ?? null)
          const etTip  = (entry && typeof entry === 'object') ? entry.et_tip  : null
          const penTip = (entry && typeof entry === 'object') ? entry.pen_tip : null
          return (
            <MatchCard
              key={m.match_id}
              match={m}
              tip={tip}
              etTip={etTip}
              penTip={penTip}
              onTip={onTip}
              expanded={openMatch === m.match_id}
              onToggle={onToggle}
              now={now}
            />
          )
        })}
      </div>
    </div>
  )
}

// ─── Bracket (Huvudkomponent) ─────────────────────────────────────────────────

export default function Bracket({ bracketTips, onTip }) {
  const [matches,     setMatches]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [openMatch,   setOpenMatch]   = useState(null)
  const [activeRound, setActiveRound] = useState('Sextondelsfinal')

  // Klocka var 30:e sekund – samma mönster som GroupStage/BonusTab
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

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

  // Realtid: uppdatera när admin sätter resultat
  useEffect(() => {
    const channel = supabase
      .channel('bracket_matches_changes')
      .on('postgres_changes', { event:'*', schema:'public', table:'bracket_matches' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [load])

  const toggle = useCallback(id => setOpenMatch(prev => prev === id ? null : id), [])

  // Gruppera matcher per round-id (redan sorterade av DB på sort_order)
  const byRound = useMemo(() => {
    const map = {}
    for (const m of matches) {
      const r = m.round || 'Övriga'
      if (!map[r]) map[r] = []
      map[r].push(m)
    }
    return map
  }, [matches])

  // Vilka rundor har matcher (inkl. extra)?
  const availableRounds = ROUND_DEFS.filter(rd =>
    (byRound[rd.id]?.length > 0) || (rd.extra && byRound[rd.extra]?.length > 0)
  )

  // Auto-välj runda vid första laddning: den äldsta rundan med olåsta tippningsbara matcher,
  // annars den äldsta rundan med matcher alls.
  useEffect(() => {
    if (!matches.length) return
    for (const rd of ROUND_DEFS) {
      const ms = byRound[rd.id] ?? []
      const hasOpen = ms.some(m =>
        !isPlaceholder(m.home_team) && !isPlaceholder(m.away_team) &&
        m.status !== 'finished' &&
        !(m.kickoff && now >= new Date(m.kickoff))
      )
      if (hasOpen) { setActiveRound(rd.id); return }
    }
    for (const rd of ROUND_DEFS) {
      if ((byRound[rd.id]?.length ?? 0) + (rd.extra ? (byRound[rd.extra]?.length ?? 0) : 0) > 0) {
        setActiveRound(rd.id); return
      }
    }
  }, [matches]) // now avsiktligt utelämnat – auto-select sker bara vid data-laddning

  // Progress: bara tippningsbara matcher (ej platshållare)
  const tippableAll = matches.filter(m => !isPlaceholder(m.home_team) && !isPlaceholder(m.away_team))
  const tippedTotal = tippableAll.filter(m => {
    const e = bracketTips[m.match_id]
    return (e && typeof e === 'object') ? !!e.tip : !!e
  }).length

  const activeDef = ROUND_DEFS.find(r => r.id === activeRound)
  const activeMs  = byRound[activeRound] ?? []
  const extraMs   = activeDef?.extra ? (byRound[activeDef.extra] ?? []) : []

  return (
    <div className="space-y-4">

      {/* ─ Laddning / Fel / Tomt ─ */}
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
          {/* ─ Progress (totalt) ─ */}
          <div className="flex items-center justify-between px-1">
            <span className="text-xs" style={{ color:'#64748B' }}>Tippade slutspelsmatcher</span>
            <span className="text-xs font-semibold"
                  style={{ color: tippedTotal === tippableAll.length && tippableAll.length > 0
                    ? '#34D399' : '#64748B' }}>
              {tippedTotal} / {tippableAll.length}
            </span>
          </div>

          {/* ─ Rund-tabs (horisontellt scrollbar) ─ */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth:'none' }}>
            {availableRounds.map(rd => {
              const isActive = activeRound === rd.id
              return (
                <button
                  key={rd.id}
                  onClick={() => setActiveRound(rd.id)}
                  className="px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-all"
                  style={isActive
                    ? { background:'#F59E0B', color:'#0F172A' }
                    : { background:'#1E293B', color:'#64748B', border:'1px solid #334155' }}
                >
                  {rd.label}
                </button>
              )
            })}
          </div>

          {/* ─ Final (aktiv runda) visas FÖRE Bronsmatch ─ */}
          {activeMs.length > 0 ? (
            <RoundSection
              label={activeDef?.label ?? activeRound}
              matches={activeMs}
              tips={bracketTips}
              onTip={onTip}
              openMatch={openMatch}
              onToggle={toggle}
              now={now}
            />
          ) : (
            <div className="rounded-2xl px-4 py-6 text-center"
                 style={{ background:'rgba(71,85,105,0.15)', border:'1px solid #334155' }}>
              <p className="text-sm" style={{ color:'#64748B' }}>
                Matcherna i den här rundan är inte fastställda ännu.
              </p>
            </div>
          )}

          {/* ─ Bronsmatch (extra sektion, visas UNDER Final) ─ */}
          {extraMs.length > 0 && (
            <RoundSection
              label={activeDef.extra}
              matches={extraMs}
              tips={bracketTips}
              onTip={onTip}
              openMatch={openMatch}
              onToggle={toggle}
              now={now}
            />
          )}
        </>
      )}

      {/* ─ Poängsystem ─ */}
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
