import { useState, useEffect, useCallback } from 'react'
import { KNOCKOUT_ROUNDS, formatDt } from './data'
import Flag from './Flag'
import { parseMatchTime, isMatchSoon, getCountdown, TOURNAMENT_START } from '../lib/scoreCalculator'
import { getKnockoutFixtures } from '../lib/apiFootball'

// ─── Nation (engelska) → iso2 för flag-icons ──────────────────────────────────

const NAME_TO_ISO2 = {
  Argentina:'ar', France:'fr', Spain:'es', Brazil:'br', England:'gb-eng',
  Portugal:'pt', Netherlands:'nl', Belgium:'be', Germany:'de', Uruguay:'uy',
  Croatia:'hr', Switzerland:'ch', Austria:'at', Sweden:'se', Scotland:'gb-sct',
  Turkey:'tr', 'Czech Republic':'cz', Czechia:'cz', Bosnia:'ba', Norway:'no',
  Mexico:'mx', 'United States':'us', Canada:'ca', Panama:'pa', Haiti:'ht',
  Curacao:'cw', Colombia:'co', Ecuador:'ec', Paraguay:'py', Qatar:'qa',
  Tunisia:'tn', 'Cape Verde':'cv', Morocco:'ma', Senegal:'sn', Egypt:'eg',
  "Ivory Coast":'ci', "Cote d'Ivoire":'ci', Ghana:'gh', 'South Africa':'za',
  Algeria:'dz', 'DR Congo':'cd', Japan:'jp', 'South Korea':'kr',
  'Korea Republic':'kr', 'Saudi Arabia':'sa', Iran:'ir', Australia:'au',
  Jordan:'jo', Uzbekistan:'uz', Iraq:'iq', 'New Zealand':'nz',
}

function iso2(name) { return NAME_TO_ISO2[name] ?? null }

// ─── Hook: hämta slutspelsfixtures från API med 5-min polling ────────────────

function useLiveKnockout() {
  const [data,        setData]        = useState(null)   // null = ej hämtat ännu
  const [lastUpdated, setLastUpdated] = useState(null)
  const [loading,     setLoading]     = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const rounds = await getKnockoutFixtures()
      // Har vi faktiskt några slutspelsmatcher?
      const hasData = Object.values(rounds).some(r => r.length > 0)
      setData(hasData ? rounds : {})
      setLastUpdated(new Date())
    } catch (e) {
      console.warn('Bracket API-fel:', e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Hämta bara om turneringen har börjat
    if (new Date() < TOURNAMENT_START) return
    fetch()
    let tid = null
    const schedule = () => {
      const h = new Date().getHours()
      const delay = (h >= 18 || h < 6) ? 5 * 60_000 : 30 * 60_000
      tid = setTimeout(() => { fetch(); schedule() }, delay)
    }
    schedule()
    return () => clearTimeout(tid)
  }, [fetch])

  return { data, lastUpdated, loading, refetch: fetch }
}

// ─── 1X2-knappar ─────────────────────────────────────────────────────────────

function TipButtons({ matchId, tip, homeName, awayName, onTip }) {
  const opts = [
    { val:'1', label:`1  ${homeName}` },
    { val:'X', label:'X  Oavgjort'   },
    { val:'2', label:`${awayName}  2` },
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

// ─── Matchrad (kollapsbar) ────────────────────────────────────────────────────

function MatchRow({ slotId, apiMatch, slotDt, seed1, seed2, tip, onTip, expanded, onToggle, now }) {
  // Använd API-data om tillgänglig, annars bara seed-etikett
  const hasTeams = !!apiMatch
  const homeName = apiMatch?.homeName ?? seed1
  const awayName = apiMatch?.awayName ?? seed2
  const dt       = apiMatch?.dt ?? slotDt  // API-tid prioriteras

  const locked    = dt ? now >= parseMatchTime(dt) : false
  const soon      = !locked && dt ? isMatchSoon(dt, 60) : false
  const countdown = !locked && dt ? getCountdown(dt) : null
  const homeIso   = apiMatch ? iso2(apiMatch.homeName) : null
  const awayIso   = apiMatch ? iso2(apiMatch.awayName) : null

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: locked ? 'rgba(255,255,255,0.01)' : expanded ? '#0F172A' : 'transparent',
        border:     `1px solid ${locked ? '#1E293B' : expanded ? '#334155' : 'transparent'}`,
        opacity:    locked && !tip ? 0.55 : 1,
      }}
    >
      <button
        onClick={() => hasTeams && !locked && onToggle(slotId)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
        style={{
          background: expanded ? '#0F172A' : 'rgba(255,255,255,0.02)',
          cursor: hasTeams && !locked ? 'pointer' : 'default',
        }}
      >
        {/* Hemmalag */}
        {homeIso
          ? <Flag iso2={homeIso} size="sm" />
          : <span className="w-5 h-3.5 rounded shrink-0 inline-block" style={{ background:'#334155' }} />
        }
        <span className="text-xs font-semibold truncate max-w-[72px] hidden sm:block"
              style={{ color: hasTeams ? (locked ? '#64748B' : '#F1F5F9') : '#475569' }}>
          {homeName}
        </span>

        <span className="text-xs mx-1" style={{ color:'#475569' }}>vs</span>

        {awayIso
          ? <Flag iso2={awayIso} size="sm" />
          : <span className="w-5 h-3.5 rounded shrink-0 inline-block" style={{ background:'#334155' }} />
        }
        <span className="text-xs font-semibold truncate max-w-[72px] hidden sm:block"
              style={{ color: hasTeams ? (locked ? '#64748B' : '#F1F5F9') : '#475569' }}>
          {awayName}
        </span>

        <div className="flex-1" />

        <div className="flex items-center gap-1.5 shrink-0">
          {countdown && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-mono hidden sm:inline"
                  style={{ background: soon ? 'rgba(239,68,68,0.15)' : 'rgba(52,211,153,0.1)',
                           color: soon ? '#F87171' : '#34D399', fontSize:9 }}>
              {soon ? '⚡ ':''}{countdown}
            </span>
          )}
          {dt && (
            <span className="text-xs font-mono" style={{ color: locked ? '#475569' : '#F59E0B' }}>
              {formatDt(dt)}
            </span>
          )}
          {locked
            ? tip && <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black"
                           style={{ background:'#334155', color:'#94A3B8' }}>{tip}</span>
            : tip && <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black"
                           style={{ background:'#F59E0B', color:'#0F172A' }}>{tip}</span>
          }
          {hasTeams && !locked && (
            <span className="text-xs ml-1" style={{ color:'#475569' }}>{expanded ? '▲' : '▼'}</span>
          )}
        </div>
      </button>

      {expanded && hasTeams && !locked && (
        <div className="px-3 pb-3 pt-1">
          <TipButtons
            matchId={slotId}
            tip={tip}
            homeName={homeName}
            awayName={awayName}
            onTip={onTip}
          />
        </div>
      )}
    </div>
  )
}

// ─── Runda ────────────────────────────────────────────────────────────────────

function RoundSection({ round, apiMatches, bracketTips, onTip, openMatch, onToggle, now }) {
  const filled = round.matches.filter(m => bracketTips[m.id]).length
  const hasAnyTeams = apiMatches && apiMatches.length > 0

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background:'#1E293B', border:'1px solid #334155' }}>
      <div className="px-4 py-3 flex items-center justify-between"
           style={{ background:'#0F172A', borderBottom:'1px solid #334155' }}>
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm" style={{ color:'#F59E0B' }}>{round.label}</span>
          {!hasAnyTeams && (
            <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background:'rgba(71,85,105,0.4)', color:'#64748B', fontSize:10 }}>
              Fastställs via API
            </span>
          )}
        </div>
        {hasAnyTeams && (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{
                  background: filled === round.matches.length ? 'rgba(52,211,153,0.15)' : '#1E293B',
                  color:      filled === round.matches.length ? '#34D399' : '#64748B',
                  border:     `1px solid ${filled === round.matches.length ? '#34D399' : '#334155'}`,
                }}>
            {filled}/{round.matches.length}
          </span>
        )}
      </div>

      <div className="p-2 space-y-1">
        {round.matches.map((slot, i) => (
          <MatchRow
            key={slot.id}
            slotId={slot.id}
            apiMatch={apiMatches?.[i] ?? null}   // API-match i kronologisk ordning
            slotDt={slot.dt}
            seed1={slot.seed1}
            seed2={slot.seed2}
            tip={bracketTips[slot.id] ?? null}
            onTip={onTip}
            expanded={openMatch === slot.id}
            onToggle={onToggle}
            now={now}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Huvudkomponent ───────────────────────────────────────────────────────────

const ROUND_TABS = KNOCKOUT_ROUNDS.map(r => ({
  id: r.id, label: r.label,
  icon: {R32:'⚡',R16:'🔥',QF:'💥',SF:'⭐',F:'🏆'}[r.id] ?? '⚽',
}))

export default function Bracket({ groupTips, bracketTips, onTip, onEditGroups }) {
  const [activeRound, setActiveRound] = useState('R32')
  const [openMatch,   setOpenMatch]   = useState(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  const toggle = useCallback(id => setOpenMatch(prev => prev === id ? null : id), [])

  const { data: apiRounds, lastUpdated, loading, refetch } = useLiveKnockout()

  const tournamentStarted = new Date() >= TOURNAMENT_START
  const currentRound = KNOCKOUT_ROUNDS.find(r => r.id === activeRound)
  const apiMatches   = apiRounds?.[activeRound] ?? null  // null = ej tillgängligt

  const fmtTime = d => d.toLocaleTimeString('sv-SE', { hour:'2-digit', minute:'2-digit' })

  return (
    <div className="space-y-5">

      {/* ─ Statusbanner ─ */}
      {!tournamentStarted ? (
        <div className="rounded-2xl px-4 py-4 text-center"
             style={{ background:'rgba(71,85,105,0.2)', border:'1px solid #334155' }}>
          <div className="text-3xl mb-2">⏳</div>
          <p className="font-bold text-sm" style={{ color:'#F1F5F9' }}>
            Slutspelet fylls i automatiskt
          </p>
          <p className="text-xs mt-1" style={{ color:'#64748B' }}>
            Lagen hämtas från API-Football när gruppspelet är klart (ca 5 juli 2026).
            Tills dess visas inga lag här.
          </p>
        </div>
      ) : apiRounds && Object.keys(apiRounds).length === 0 ? (
        <div className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
             style={{ background:'rgba(59,130,246,0.08)', border:'1px solid rgba(59,130,246,0.2)' }}>
          <div className="flex items-center gap-2">
            <span>🔄</span>
            <p className="text-sm" style={{ color:'#94A3B8' }}>
              Gruppspelet pågår – slutspelslagen fastställs av API-Football när alla grupper är klara.
            </p>
          </div>
          <button onClick={refetch} disabled={loading}
                  className="text-xs px-3 py-1.5 rounded-xl font-semibold shrink-0"
                  style={{ background:'#334155', color: loading ? '#475569' : '#F1F5F9' }}>
            {loading ? '↻ Laddar...' : '↻ Uppdatera'}
          </button>
        </div>
      ) : apiRounds ? (
        <div className="rounded-2xl px-4 py-2 flex items-center justify-between"
             style={{ background:'rgba(52,211,153,0.08)', border:'1px solid rgba(52,211,153,0.2)' }}>
          <span className="text-xs flex items-center gap-1.5" style={{ color:'#34D399' }}>
            ☁️ Live-data från API-Football
            {lastUpdated && ` · ${fmtTime(lastUpdated)}`}
          </span>
          <button onClick={refetch} disabled={loading}
                  className="text-xs px-2 py-1 rounded-lg"
                  style={{ background:'#334155', color:'#94A3B8' }}>
            {loading ? '↻' : '↻ Uppdatera'}
          </button>
        </div>
      ) : null}

      {/* Rund-tabs */}
      <div className="flex gap-1 overflow-x-auto pb-px">
        {ROUND_TABS.map(t => {
          const round  = KNOCKOUT_ROUNDS.find(r => r.id === t.id)
          const filled = round?.matches.filter(m => bracketTips[m.id]).length ?? 0
          const total  = round?.matches.length ?? 0
          const done   = filled === total && total > 0
          const hasApi = apiRounds?.[t.id]?.length > 0
          return (
            <button key={t.id} onClick={() => setActiveRound(t.id)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all"
                    style={activeRound === t.id
                      ? { background:'#F59E0B', color:'#0F172A' }
                      : { background:'#1E293B', color:'#64748B', border:'1px solid #334155' }}>
              <span>{t.icon}</span>
              <span>{t.label}</span>
              {hasApi && (
                <span className="text-xs px-1 py-0.5 rounded-full"
                      style={{ background: done ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.1)',
                               color: done ? '#34D399' : '#94A3B8', fontSize:9 }}>
                  {filled}/{total}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Rundinnehåll */}
      {currentRound && (
        <RoundSection
          round={currentRound}
          apiMatches={apiMatches}
          bracketTips={bracketTips}
          onTip={onTip}
          openMatch={openMatch}
          onToggle={toggle}
          now={now}
        />
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
