import { useState, useEffect, useCallback } from 'react'
import { TEAMS, GROUPS, MATCHES_BY_GROUP, TOTAL_MATCHES, calcStandings, formatDt } from './data'
import Flag from './Flag'
import { getCountdown, isMatchSoon, parseMatchTime, TOURNAMENT_START, isVmWinnerLocked } from '../lib/scoreCalculator'
import { fetchTeamLogos } from '../lib/apiFootball'
import { saveVmWinnerPick } from '../lib/supabase'

// ─── Alla 48 VM-lag för vinnartippning ────────────────────────────────────────

// iso2 = flag-icons CSS-kod (samma bibliotek som resten av appen)
const VM_TEAMS = [
  { name:'Argentina',       iso2:'ar',     group:'J' },
  { name:'Frankrike',       iso2:'fr',     group:'I' },
  { name:'Spanien',         iso2:'es',     group:'H' },
  { name:'Brasilien',       iso2:'br',     group:'C' },
  { name:'England',         iso2:'gb-eng', group:'L' },
  { name:'Portugal',        iso2:'pt',     group:'K' },
  { name:'Nederländerna',   iso2:'nl',     group:'F' },
  { name:'Belgien',         iso2:'be',     group:'G' },
  { name:'Tyskland',        iso2:'de',     group:'E' },
  { name:'Uruguay',         iso2:'uy',     group:'H' },
  { name:'Kroatien',        iso2:'hr',     group:'L' },
  { name:'Schweiz',         iso2:'ch',     group:'B' },
  { name:'Österrike',       iso2:'at',     group:'J' },
  { name:'Sverige',         iso2:'se',     group:'F' },
  { name:'Skottland',       iso2:'gb-sct', group:'C' },
  { name:'Turkiet',         iso2:'tr',     group:'D' },
  { name:'Tjeckien',        iso2:'cz',     group:'A' },
  { name:'Bosnien',         iso2:'ba',     group:'B' },
  { name:'Norge',           iso2:'no',     group:'I' },
  { name:'Mexiko',          iso2:'mx',     group:'A' },
  { name:'USA',             iso2:'us',     group:'D' },
  { name:'Kanada',          iso2:'ca',     group:'B' },
  { name:'Panama',          iso2:'pa',     group:'L' },
  { name:'Haiti',           iso2:'ht',     group:'C' },
  { name:'Curaçao',         iso2:'cw',     group:'E' },
  { name:'Colombia',        iso2:'co',     group:'K' },
  { name:'Ecuador',         iso2:'ec',     group:'E' },
  { name:'Paraguay',        iso2:'py',     group:'D' },
  { name:'Qatar',           iso2:'qa',     group:'B' },
  { name:'Tunisien',        iso2:'tn',     group:'F' },
  { name:'Kap Verde',       iso2:'cv',     group:'H' },
  { name:'Marocko',         iso2:'ma',     group:'C' },
  { name:'Senegal',         iso2:'sn',     group:'I' },
  { name:'Egypten',         iso2:'eg',     group:'G' },
  { name:'Elfenbenskusten', iso2:'ci',     group:'E' },
  { name:'Ghana',           iso2:'gh',     group:'L' },
  { name:'Sydafrika',       iso2:'za',     group:'A' },
  { name:'Algeriet',        iso2:'dz',     group:'J' },
  { name:'DR Kongo',        iso2:'cd',     group:'K' },
  { name:'Japan',           iso2:'jp',     group:'F' },
  { name:'Sydkorea',        iso2:'kr',     group:'A' },
  { name:'Saudiarabien',    iso2:'sa',     group:'H' },
  { name:'Iran',            iso2:'ir',     group:'G' },
  { name:'Australien',      iso2:'au',     group:'D' },
  { name:'Jordanien',       iso2:'jo',     group:'J' },
  { name:'Uzbekistan',      iso2:'uz',     group:'K' },
  { name:'Irak',            iso2:'iq',     group:'I' },
  { name:'Nya Zeeland',     iso2:'nz',     group:'G' },
]

// ─── 1X2-knappar ─────────────────────────────────────────────────────────────

function TipButtons({ matchId, tip, home, away, onTip }) {
  const opts = [
    { val:'1', label: `1  ${home.name}` },
    { val:'X', label: 'X  Oavgjort'    },
    { val:'2', label: `${away.name}  2` },
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
// now = Date-objekt från föräldern, uppdateras var 30:e sekund

function MatchRow({ match, tip, onTip, expanded, onToggle, now }) {
  const home    = TEAMS[match.home]
  const away    = TEAMS[match.away]
  const dateStr = formatDt(match.dt)

  // Härledd lock-status baserad på now (re-renderas när föräldern uppdaterar now)
  const locked  = now >= parseMatchTime(match.dt)
  const soon    = !locked && isMatchSoon(match.dt, 60)
  const countdown = !locked ? getCountdown(match.dt) : null

  const isSimultaneous = MATCHES_BY_GROUP[match.id[0]]
    ?.filter(m => m.dt === match.dt).length > 1

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
        onClick={() => !locked && onToggle(match.id)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
        style={{
          background: expanded ? '#0F172A' : 'rgba(255,255,255,0.02)',
          cursor: locked ? 'default' : 'pointer',
        }}
      >
        {/* Hemmalag */}
        <Flag iso2={home.iso2} size="sm" />
        <span className="text-xs font-semibold truncate max-w-[64px] hidden sm:block"
              style={{ color: locked ? '#64748B' : '#F1F5F9' }}>{home.name}</span>
        <span className="text-xs font-semibold truncate max-w-[48px] sm:hidden"
              style={{ color: locked ? '#64748B' : '#F1F5F9' }}>{home.name.slice(0,6)}</span>

        <span className="text-xs mx-1" style={{ color:'#475569' }}>vs</span>

        {/* Bortalag */}
        <Flag iso2={away.iso2} size="sm" />
        <span className="text-xs font-semibold truncate max-w-[64px] hidden sm:block"
              style={{ color: locked ? '#64748B' : '#F1F5F9' }}>{away.name}</span>
        <span className="text-xs font-semibold truncate max-w-[48px] sm:hidden"
              style={{ color: locked ? '#64748B' : '#F1F5F9' }}>{away.name.slice(0,6)}</span>

        <div className="flex-1" />

        {/* Tid + status-badges */}
        <div className="flex items-center gap-1.5 shrink-0">
          {match.note && !locked && (
            <span className="text-xs px-1.5 py-0.5 rounded-full hidden sm:inline"
                  style={{ background:'rgba(245,158,11,0.12)', color:'#F59E0B', fontSize:9 }}>
              {match.note}
            </span>
          )}
          {isSimultaneous && !match.note && !locked && (
            <span className="text-xs px-1.5 py-0.5 rounded-full hidden sm:inline"
                  style={{ background:'rgba(59,130,246,0.12)', color:'#3B82F6', fontSize:9 }}>
              Simultan
            </span>
          )}

          {/* Nedräkning (visas när matchen är inom 7 dagar och inte låst) */}
          {countdown && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full font-mono hidden sm:inline"
              style={{
                background: soon ? 'rgba(239,68,68,0.15)' : 'rgba(52,211,153,0.10)',
                color:      soon ? '#F87171' : '#34D399',
                fontSize: 9,
              }}
            >
              {soon ? '⚡ ' : ''}{countdown}
            </span>
          )}

          {/* Datum/tid */}
          <span className="text-xs font-mono" style={{ color: locked ? '#475569' : '#F59E0B' }}>
            {dateStr}
          </span>

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
          <TipButtons matchId={match.id} tip={tip} home={home} away={away} onTip={onTip} />
        </div>
      )}
    </div>
  )
}

// ─── Grupptabell ──────────────────────────────────────────────────────────────

function StandingsTable({ groupId, tips }) {
  const rows = calcStandings(groupId, tips)
  return (
    <div className="mt-3 rounded-xl overflow-hidden" style={{ border:'1px solid #334155' }}>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background:'#0F172A', color:'#64748B' }}>
            {['#','Lag','S','V','O','F','P'].map(h => (
              <th key={h} className="px-2 py-2 font-semibold text-center first:text-left">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const team = TEAMS[row.id]
            const adv  = i < 2
            return (
              <tr key={row.id}
                  style={{ background: adv ? 'rgba(59,130,246,0.06)' : 'transparent',
                           borderTop:'1px solid #1E293B', color:'#F1F5F9' }}>
                <td className="px-2 py-2">
                  <span className="inline-flex w-5 h-5 items-center justify-center rounded-full text-xs font-bold"
                        style={adv ? {background:'#3B82F6',color:'#fff'} : {color:'#64748B'}}>
                    {i+1}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <span className="flex items-center gap-1.5">
                    <Flag iso2={team.iso2} size="sm" />
                    <span className="font-medium truncate max-w-[90px]">{team.name}</span>
                  </span>
                </td>
                <td className="px-2 py-2 text-center" style={{color:'#94A3B8'}}>{row.played}</td>
                <td className="px-2 py-2 text-center" style={{color:'#34D399'}}>{row.w}</td>
                <td className="px-2 py-2 text-center" style={{color:'#94A3B8'}}>{row.d}</td>
                <td className="px-2 py-2 text-center" style={{color:'#F87171'}}>{row.l}</td>
                <td className="px-2 py-2 text-center font-black" style={{color:'#F59E0B'}}>{row.pts}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Hook: hämta lagloggor från API-Football (cachas 24h i localStorage) ─────

function useTeamLogos() {
  const [logos, setLogos] = useState(() => {
    // Ladda cachad data om den finns och är färsk
    try {
      const cached = JSON.parse(localStorage.getItem('teamLogos'))
      if (cached && Date.now() - cached.timestamp < 24 * 3600 * 1000) {
        return cached.data ?? {}
      }
    } catch { /* ignorera */ }
    return {}
  })

  useEffect(() => {
    // Hämta bara om inget finns i cachen
    if (Object.keys(logos).length > 0) return
    fetchTeamLogos()
      .then(data => setLogos(data))
      .catch(e => console.warn('Kunde inte hämta lagloggor:', e.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return logos
}

// ─── Lagkort med logo + flagg-fallback ────────────────────────────────────────

function TeamCard({ team, logoUrl, selected, locked, onSelect }) {
  const [imgError, setImgError] = useState(false)
  const showLogo = logoUrl && !imgError

  return (
    <button
      onClick={() => !locked && onSelect(team.name)}
      disabled={locked}
      className="flex flex-col items-center justify-center gap-2 rounded-2xl py-4 px-2 transition-all"
      style={{
        background: selected ? '#F59E0B' : '#1E293B',
        border:     `1.5px solid ${selected ? '#F59E0B' : '#334155'}`,
        cursor:     locked ? 'default' : 'pointer',
        boxShadow:  selected ? '0 0 14px rgba(245,158,11,0.35)' : 'none',
        minHeight:  110,
      }}
      onMouseEnter={e => { if (!locked && !selected) e.currentTarget.style.borderColor = '#F59E0B' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = '#334155' }}
    >
      {/* Logo eller flagg-fallback */}
      {showLogo ? (
        <img
          src={logoUrl}
          width={56}
          height={56}
          alt={team.name}
          style={{ objectFit:'contain', width:56, height:56 }}
          onError={() => setImgError(true)}
        />
      ) : (
        <Flag iso2={team.iso2} size="xl" />
      )}

      {/* Lagnamn – ingen flaggemoji, ingen landskod */}
      <span
        className="text-xs font-semibold text-center leading-tight"
        style={{ color: selected ? '#0F172A' : '#94A3B8', maxWidth: 90 }}
      >
        {team.name}
      </span>

      {selected && (
        <span className="text-sm font-black" style={{ color:'#0F172A' }}>✓</span>
      )}
    </button>
  )
}

// ─── VM-vinnarsidan ───────────────────────────────────────────────────────────

function VMWinnerSection({ vmWinner, onSelect, logos }) {
  const [query, setQuery] = useState('')

  // Låsning: separat deadline för VM-vinnare/tippningar
  const [locked, setLocked] = useState(() => isVmWinnerLocked())
  useEffect(() => {
    if (locked) return
    const id = setInterval(() => {
      if (isVmWinnerLocked()) { setLocked(true); clearInterval(id) }
    }, 60_000)
    return () => clearInterval(id)
  }, [locked])

  const filtered = VM_TEAMS.filter(t =>
    t.name.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="space-y-4">

      {/* Rubrik */}
      <div
        className="rounded-2xl p-5 text-center"
        style={{ background:'linear-gradient(135deg,#1E293B,#0F172A)', border:'1px solid rgba(245,158,11,0.25)' }}
      >
        <div className="text-3xl mb-2">🏆</div>
        <h2 className="font-black text-lg" style={{ color:'#F1F5F9' }}>Vem vinner VM 2026?</h2>
        <p className="text-sm mt-1" style={{ color:'#94A3B8' }}>
          Välj det lag du tror lyfter bucklan
        </p>
        <div className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold"
             style={{ background:'rgba(245,158,11,0.15)', color:'#F59E0B' }}>
          20 poäng för rätt svar
        </div>
      </div>

      {/* Lås-banner */}
      {locked && (
        <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
             style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)' }}>
          <span className="text-xl shrink-0">🔒</span>
          <div>
            <p className="font-bold text-sm" style={{ color:'#F87171' }}>
              Tippningen är stängd – deadline 12 juni 23:59 har passerat
            </p>
            <p className="text-xs mt-0.5" style={{ color:'#64748B' }}>12 jun 23:59</p>
          </div>
        </div>
      )}

      {/* Sökfält – döljs när låst */}
      {!locked && (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color:'#475569' }}>
            🔍
          </span>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Sök lag..."
            className="w-full pl-9 pr-9 py-2.5 rounded-xl text-sm outline-none transition-all"
            style={{ background:'#1E293B', border:'1.5px solid #334155', color:'#F1F5F9' }}
          />
          {query && (
            <button onClick={() => setQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold"
                    style={{ color:'#64748B' }}>
              ×
            </button>
          )}
        </div>
      )}

      {/* Lagkort-grid: auto-fill → 4 kolumner desktop, 2–3 mobil */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(110px, 1fr))', gap:10 }}>
        {filtered.map(team => (
          <TeamCard
            key={team.name}
            team={team}
            logoUrl={logos[team.name] ?? null}
            selected={vmWinner === team.name}
            locked={locked}
            onSelect={onSelect}
          />
        ))}
      </div>

      {/* Valt lag – bekräftelse */}
      {vmWinner && (
        <div className="rounded-2xl p-4 flex items-center gap-3"
             style={{ background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.3)' }}>
          {VM_TEAMS.find(t => t.name === vmWinner) && (
            <Flag iso2={VM_TEAMS.find(t => t.name === vmWinner).iso2} size="xl" />
          )}
          <div>
            <p className="text-xs font-semibold" style={{ color:'#F59E0B' }}>
              {locked ? '🔒 Ditt tips är låst' : '✓ Ditt val'}
            </p>
            <p className="font-black text-base" style={{ color:'#F1F5F9' }}>{vmWinner}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Gruppkort ────────────────────────────────────────────────────────────────

function GroupCard({ group, tips, onTip, openMatch, onToggle, now }) {
  // Sortera matcher kronologiskt
  const matches = [...MATCHES_BY_GROUP[group.id]]
    .sort((a, b) => new Date(a.dt) - new Date(b.dt))

  const filledInGroup = matches.filter(m => tips[m.id]).length

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background:'#1E293B', border:'1px solid #334155' }}>
      {/* Rubrik */}
      <div className="px-4 py-3 flex items-center justify-between"
           style={{ background:'#0F172A', borderBottom:'1px solid #334155' }}>
        <div className="flex items-center gap-2">
          <span className="font-black text-sm" style={{ color:'#F59E0B' }}>{group.name}</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{
                  background: filledInGroup === 6 ? 'rgba(52,211,153,0.15)' : '#1E293B',
                  color:      filledInGroup === 6 ? '#34D399' : '#64748B',
                  border:     `1px solid ${filledInGroup === 6 ? '#34D399' : '#334155'}`,
                }}>
            {filledInGroup}/6
          </span>
        </div>
        <div className="flex gap-1">
          {group.teams.map(id => <Flag key={id} iso2={TEAMS[id].iso2} size="sm" />)}
        </div>
      </div>

      {/* Matchlista + tabell */}
      <div className="p-2 space-y-1">
        {matches.map(m => (
          <MatchRow
            key={m.id}
            match={m}
            tip={tips[m.id]}
            onTip={onTip}
            expanded={openMatch === m.id}
            onToggle={onToggle}
            now={now}
          />
        ))}
        <StandingsTable groupId={group.id} tips={tips} />
      </div>
    </div>
  )
}

// ─── "Alla matcher" – kronologisk vy över alla grupper ───────────────────────

function AllMatchesView({ tips, onTip, openMatch, onToggle, now }) {
  const allSorted = Object.values(MATCHES_BY_GROUP)
    .flat()
    .sort((a, b) => new Date(a.dt) - new Date(b.dt))

  // Gruppera per datum för tydliga dagssektioner
  const byDate = allSorted.reduce((acc, m) => {
    const day = m.dt.slice(0, 10)
    if (!acc[day]) acc[day] = []
    acc[day].push(m)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {Object.entries(byDate).map(([day, matches]) => {
        const d = new Date(day + 'T12:00:00')
        const label = `${d.getDate()} ${['','jan','feb','mar','apr','maj','jun','jul'][d.getMonth()+1]} 2026`
        return (
          <div key={day}>
            <p className="text-xs font-bold mb-2 px-1" style={{ color:'#64748B' }}>
              📅 {label}
            </p>
            <div className="rounded-2xl overflow-hidden space-y-px"
                 style={{ background:'#1E293B', border:'1px solid #334155', padding:'8px' }}>
              {matches.map(m => {
                const grp = GROUPS.find(g => g.id === m.id[0])
                return (
                  <div key={m.id}>
                    <div className="flex items-center gap-1.5 px-3 pt-1.5">
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded"
                            style={{ background:'rgba(245,158,11,0.15)', color:'#F59E0B', fontSize:9 }}>
                        {grp?.name}
                      </span>
                    </div>
                    <MatchRow
                      match={m}
                      tip={tips[m.id]}
                      onTip={onTip}
                      expanded={openMatch === m.id}
                      onToggle={onToggle}
                      now={now}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Huvudkomponent: GroupStage ───────────────────────────────────────────────

export default function GroupStage({ tips, onTip, filledCount, user, vmWinner, onVmWinnerChange }) {
  const [activeGroup, setActiveGroup] = useState('ALL')
  const [openMatch,   setOpenMatch]   = useState(null)
  const [saveError,   setSaveError]   = useState(null)

  // Lagloggor från API-Football (cachas 24h)
  const teamLogos = useTeamLogos()

  const selectVMWinner = useCallback(name => {
    const next = name === vmWinner ? null : name
    if (onVmWinnerChange) onVmWinnerChange(next)
    setSaveError(null)
    if (user) {
      saveVmWinnerPick(user.id, next)
        .catch(err => {
          setSaveError('VM-vinnartippningen kunde inte sparas – kontrollera uppkopplingen och försök igen.')
          console.warn(err)
        })
    }
  }, [user, vmWinner, onVmWinnerChange])

  // Klockslag uppdateras var 30:e sekund → matchrader re-renderas och låser sig i realtid
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  const toggle = useCallback(id => {
    setOpenMatch(prev => prev === id ? null : id)
  }, [])

  return (
    <div className="space-y-5">


      {/* Grupp-selector */}
      <div className="flex flex-wrap gap-1.5">
        {['ALL', ...GROUPS.map(g => g.id), 'WINNER'].map(id => {
          if (id === 'WINNER') {
            return (
              <button
                key="WINNER"
                onClick={() => setActiveGroup('WINNER')}
                className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                style={activeGroup === 'WINNER'
                  ? { background:'#F59E0B', color:'#0F172A' }
                  : { background:'#1E293B', color:'#64748B', border:'1px solid #334155' }}
              >
                🏆 Vinnare
                {vmWinner && <span>✓</span>}
              </button>
            )
          }
          const filled = id === 'ALL'
            ? filledCount
            : MATCHES_BY_GROUP[id]?.filter(m => tips[m.id]).length ?? 0
          const total = id === 'ALL' ? TOTAL_MATCHES : 6
          const done  = filled === total
          return (
            <button
              key={id}
              onClick={() => setActiveGroup(id)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
              style={activeGroup === id
                ? { background:'#F59E0B', color:'#0F172A' }
                : { background:'#1E293B', color:'#64748B', border:'1px solid #334155' }}
            >
              {id === 'ALL' ? 'Alla' : id}
              {done && <span>✓</span>}
            </button>
          )
        })}
      </div>

      {/* Innehåll */}
      {activeGroup === 'WINNER' ? (
        <>
        <VMWinnerSection vmWinner={vmWinner} onSelect={selectVMWinner} logos={teamLogos} />
        {saveError && (
          <div className="rounded-2xl px-4 py-3 mt-4 flex items-center justify-between gap-3"
               style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)' }}>
            <p className="text-sm" style={{ color:'#F87171' }}>⚠️ {saveError}</p>
            <button onClick={() => setSaveError(null)} className="shrink-0 text-lg leading-none" style={{ color: '#64748B' }}>×</button>
          </div>
        )}
      </>
      ) : activeGroup === 'ALL' ? (
        <AllMatchesView tips={tips} onTip={onTip} openMatch={openMatch} onToggle={toggle} now={now} />
      ) : (
        <GroupCard
          group={GROUPS.find(g => g.id === activeGroup)}
          tips={tips}
          onTip={onTip}
          openMatch={openMatch}
          onToggle={toggle}
          now={now}
        />
      )}

      {/* Bekräfta-knapp */}

      {/* Poängsystem – komplett översikt */}
      <div style={{ width: '100%', marginTop: 32 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            ['3p',  '⚽ Rätt 1X2-tips',   '#34D399'],
            ['20p', '🏆 Rätt VM-vinnare', '#F59E0B'],
            ['10p', '🥇 Flest mål',            '#F59E0B'],
            ['12p', '🎯 Flest assist',          '#3B82F6'],
            ['8p',  '🟨 Flest gula kort',      '#EAB308'],
            ['10p', '🟥 Flest röda kort',      '#EF4444'],
          ].map(([pts, lbl, c]) => (
            <div
              key={lbl}
              style={{
                background:   '#1E293B',
                border:       '1px solid #334155',
                borderRadius: 12,
                padding:      '12px 10px',
                textAlign:    'center',
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 900, color: c, lineHeight: 1 }}>{pts}</div>
              <div style={{ fontSize: 11, color: '#64748B', marginTop: 5, lineHeight: 1.3 }}>{lbl}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
