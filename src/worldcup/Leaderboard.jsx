import { useState, useEffect, Fragment } from 'react'
import { TOTAL_MATCHES } from './data'
import { fetchLeaderboard, supabase } from '../lib/supabase'
import UserProfileModal from './UserProfileModal'

function calcMyScore(groupTips, bracketTips) {
  return Object.values(groupTips).filter(Boolean).length * 3
       + Object.values(bracketTips ?? {}).filter(v => (v && typeof v === 'object') ? !!v.tip : !!v).length * 3
}

const TIERS = [
  { min:200, label:'⚡ Legendarisk', color:'#F59E0B' },
  { min:140, label:'🔥 Expert',      color:'#F87171' },
  { min:80,  label:'⚽ Proffs',      color:'#3B82F6' },
  { min:0,   label:'🌱 Nybörjare',   color:'#34D399' },
]
const getTier = pts => TIERS.find(t => pts >= t.min) ?? TIERS[TIERS.length - 1]

export default function Leaderboard({ groupTips, bracketTips, user }) {
  const [dbBoard, setDbBoard] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [profileUser, setProfileUser] = useState(null)

  useEffect(() => {
    if (!user) return

    const reloadLeaderboard = async () => {
      setLoading(true)
      try {
        const data = await fetchLeaderboard()
        if (!data) throw new Error('Leaderboard-data kunde inte hämtas')
        setDbBoard(data)
        setError(null)
      } catch (err) {
        setDbBoard([])
        setError(`Leaderboard kunde inte laddas: ${err?.message ?? 'Okänt fel'}`)
      } finally {
        setLoading(false)
      }
    }

    reloadLeaderboard()

    // Polling var 30:e sekund som fallback om realtid inte levererar
    const interval = setInterval(() => {
      reloadLeaderboard()
    }, 30_000)

    // Realtidslyssnare: ny fetch direkt när relevanta tabeller ändras
    let channel = null
    const subscribeChannel = () => {
      const reload = async () => {
        try {
          const data = await fetchLeaderboard()
          if (data) {
            setDbBoard(data)
            setError(null)
          }
        } catch (err) {
          setError(`Leaderboard kunde inte laddas: ${err?.message ?? 'Okänt fel'}`)
        }
      }

      channel = supabase
        .channel('leaderboard_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'match_results' }, reload)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'group_tips' }, reload)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bracket_tips' }, reload)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bracket_matches' }, reload)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'player_predictions' }, reload)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vm_picks' }, reload)
        .subscribe(status => {
          if (status === 'CHANNEL_ERROR' || status === 'ERROR') {
            console.warn('Realtime leaderboard prenumeration fel:', status)
          }
          if (status === 'CLOSED' || status === 'TIMED_OUT') {
            console.warn('Realtime leaderboard koppling stängd, försöker igen...')
            setTimeout(() => {
              if (channel?.state !== 'SUBSCRIBED') subscribeChannel()
            }, 5000)
          }
        })
    }

    subscribeChannel()

    return () => {
      clearInterval(interval)
      if (channel) supabase.removeChannel(channel)
    }
  }, [user])

  const myScore = calcMyScore(groupTips, bracketTips)

  const rawSorted = (dbBoard ?? [])
    .map(u => ({
      id:          u.id,
      name:        u.username ?? u.name,
      country:     u.country ?? '🌍',
      pts:         u.total_pts ?? u.pts,
      match_pts:   u.match_pts   ?? 0,
      bracket_pts: u.bracket_pts ?? 0,
      player_pts:  u.player_pts  ?? 0,
      vm_pts:      u.vm_pts      ?? 0,
      isMe:        user ? u.id === user.id : false,
    }))
    .sort((a, b) => b.pts - a.pts)

  const combined = rawSorted.map((u, i) => ({
    ...u,
    rank:              i + 1,
    medal:             i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null,
    totalParticipants: rawSorted.length,
  }))

  const myEntry    = combined.find(u => u.isMe)
  const displayPts = myEntry?.pts ?? myScore
  const tier       = getTier(displayPts)

  return (
    <div className="space-y-5 max-w-2xl mx-auto">

      {/* Profilmodal */}
      {profileUser && (
        <UserProfileModal profileUser={profileUser} onClose={() => setProfileUser(null)} />
      )}

      {/* Min sammanfattning */}
      <div
        className="rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap"
        style={{ background: 'linear-gradient(135deg,#1E3A5F 0%,#1E293B 100%)',
                 border: '1px solid rgba(245,158,11,0.25)' }}
      >
        <div>
          <p className="text-xs font-bold mb-1" style={{ color: '#F59E0B' }}>DIN PLACERING</p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black" style={{ color: '#F1F5F9' }}>
              #{myEntry?.rank ?? '–'}
            </span>
            <span className="text-sm" style={{ color: '#94A3B8' }}>
              av {combined.length} deltagare
            </span>
          </div>
          <p className="text-xs mt-1" style={{ color: tier.color }}>{tier.label}</p>
          {!user && (
            <p className="text-xs mt-1" style={{ color: '#475569' }}>
              Logga in för att synas i den globala rankinglistan
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs" style={{ color: '#94A3B8' }}>POÄNG</p>
          <p className="text-4xl font-black" style={{ color: '#F59E0B' }}>{displayPts}</p>
          <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
            {Object.values(groupTips).filter(Boolean).length}/{TOTAL_MATCHES} matcher
          </p>
        </div>
      </div>

      {/* Rankinglista */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: '#1E293B', border: '1px solid #334155' }}
      >
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{ background: '#0F172A', borderBottom: '1px solid #334155' }}
        >
          <div className="flex items-center gap-2">
            <span>🌍</span>
            <span className="font-bold text-sm" style={{ color: '#F1F5F9' }}>
              {error ? 'Leaderboard-fel' : dbBoard ? 'Live-ranking' : 'Laddar...'}
            </span>
          </div>
          {loading && <span className="text-xs" style={{ color: '#64748B' }}>Laddar...</span>}
          {dbBoard && (
            <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(52,211,153,0.15)', color: '#34D399', fontSize: 10 }}>
              ☁️ Live
            </span>
          )}
        </div>

        {error && (
          <div className="px-4 py-4 text-sm text-red-200" style={{ background:'#441414', border:'1px solid #991B1B' }}>
            {error}
          </div>
        )}

        <div>
          {combined.length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="text-sm" style={{ color: '#64748B' }}>
                Inga deltagare ännu – du kan vara den första!
              </p>
            </div>
          )}
          {combined.map((u, idx) => {
            const t = getTier(u.pts)
            const isExpanded = expandedId === u.id
            return (
              <div
                key={u.id}
                style={{ borderTop: idx === 0 ? 'none' : '1px solid #334155' }}
              >
                {/* Klickbar huvud-rad */}
                <div
                  className="flex items-center gap-4 px-4 py-3 cursor-pointer select-none"
                  style={{
                    background: u.isMe ? 'rgba(245,158,11,0.07)' : 'transparent',
                    borderLeft: `3px solid ${u.isMe ? '#F59E0B' : 'transparent'}`,
                  }}
                  onClick={() => setExpandedId(isExpanded ? null : u.id)}
                >
                  <div className="w-8 text-center shrink-0">
                    {u.medal
                      ? <span className="text-xl">{u.medal}</span>
                      : <span className="text-sm font-bold" style={{ color: '#475569' }}>#{u.rank}</span>}
                  </div>

                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                    style={{ background: u.isMe ? '#F59E0B' : '#334155',
                             color:      u.isMe ? '#0F172A' : '#94A3B8' }}
                  >
                    {u.isMe ? '🧑' : u.name.charAt(0)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <button
                      className="text-sm font-semibold truncate block max-w-full text-left hover:underline underline-offset-2"
                      style={{ color: u.isMe ? '#F59E0B' : '#F1F5F9', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                      onClick={e => { e.stopPropagation(); setProfileUser(u) }}
                      title={`Visa ${u.name}s profil`}
                    >
                      {u.name} {u.country}
                    </button>
                    <p className="text-xs" style={{ color: t.color }}>{t.label}</p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="font-black" style={{ color: u.isMe ? '#F59E0B' : '#F1F5F9' }}>
                      {u.pts}
                    </p>
                    <div className="w-16 h-1.5 rounded-full mt-1 overflow-hidden"
                         style={{ background: '#334155' }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (u.pts / 250) * 100)}%`,
                          background: u.isMe ? '#F59E0B' : '#3B82F6',
                        }}
                      />
                    </div>
                  </div>

                  <div className="shrink-0 w-4 text-center" style={{ color: '#475569', fontSize: 10 }}>
                    {isExpanded ? '▲' : '▼'}
                  </div>
                </div>

                {/* Expanderad poänguppdelning */}
                {isExpanded && (
                  <div
                    className="px-4 py-3"
                    style={{ background: 'rgba(15,23,42,0.6)', borderTop: '1px solid #1E293B' }}
                  >
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 max-w-xs">
                      {[
                        ['🎯 Matchresultat (1X2)', u.match_pts,   '#34D399'],
                        ['🏆 Slutspel',            u.bracket_pts, '#3B82F6'],
                        ['⚽ Spelare',              u.player_pts,  '#F59E0B'],
                        ['🌟 VM-vinnare',           u.vm_pts,      '#F87171'],
                      ].map(([label, pts, color]) => (
                        <Fragment key={label}>
                          <span className="text-xs" style={{ color: '#94A3B8' }}>{label}</span>
                          <span className="text-xs font-bold" style={{ color }}>{pts}p</span>
                        </Fragment>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Poängsystem */}
      <div className="rounded-2xl p-4" style={{ background: '#1E293B', border: '1px solid #334155' }}>
        <p className="text-xs font-bold mb-3" style={{ color: '#64748B' }}>POÄNGSYSTEM</p>
        <div className="space-y-2">
          {[
            ['Rätt 1X2-tips (grupp + slutspel)', '3p',  '#34D399'],
            ['Rätt VM-vinnare (bonus)',           '20p', '#F59E0B'],
            ['Skyttekung',                        '10p', '#F59E0B'],
            ['Assistkung',                        '12p', '#3B82F6'],
            ['Flest gula kort',                   '8p',  '#EAB308'],
            ['Flest röda kort',                   '10p', '#EF4444'],
          ].map(([lbl, pts, c]) => (
            <div key={lbl} className="flex items-center justify-between">
              <span className="text-xs" style={{ color: '#94A3B8' }}>{lbl}</span>
              <span className="text-xs font-bold" style={{ color: c }}>{pts}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
