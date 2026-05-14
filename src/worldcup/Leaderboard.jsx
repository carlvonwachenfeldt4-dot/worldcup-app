import { useState, useEffect } from 'react'
import { MOCK_LEADERBOARD, TOTAL_MATCHES } from './data'
import { fetchLeaderboard } from '../lib/supabase'

function calcMyScore(groupTips, bracketTips) {
  return Object.values(groupTips).filter(Boolean).length * 3
       + Object.values(bracketTips ?? {}).filter(Boolean).length * 3
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

  useEffect(() => {
    if (!user) return
    setLoading(true)
    fetchLeaderboard()
      .then(data => setDbBoard(data))
      .catch(() => setDbBoard(null))
      .finally(() => setLoading(false))
  }, [user])

  const myScore = calcMyScore(groupTips, bracketTips)

  // Bygg leaderboard: Supabase-data om tillgänglig, annars mock + "Du"
  const combined = (dbBoard ?? MOCK_LEADERBOARD)
    .map(u => ({
      id:       u.id,
      name:     u.username ?? u.name,
      country:  u.country ?? '🌍',
      pts:      u.total_pts ?? u.pts,
      isMe:     user ? u.id === user.id : false,
    }))
    .concat(!dbBoard ? [{ id: 0, name: 'Du', country: '🇸🇪', pts: myScore, isMe: true }] : [])
    .sort((a, b) => b.pts - a.pts)
    .map((u, i) => ({
      ...u,
      rank:  i + 1,
      medal: i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null,
    }))

  const myEntry = combined.find(u => u.isMe)
  const tier    = getTier(myScore)

  return (
    <div className="space-y-5 max-w-2xl mx-auto">

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
          <p className="text-4xl font-black" style={{ color: '#F59E0B' }}>{myScore}</p>
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
              {dbBoard ? 'Live-ranking' : 'Världsranking (demo)'}
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

        <div className="divide-y" style={{ borderColor: '#334155' }}>
          {combined.map(u => {
            const t = getTier(u.pts)
            return (
              <div
                key={u.id}
                className="flex items-center gap-4 px-4 py-3"
                style={{
                  background: u.isMe ? 'rgba(245,158,11,0.07)' : 'transparent',
                  borderLeft: `3px solid ${u.isMe ? '#F59E0B' : 'transparent'}`,
                }}
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
                  <p className="text-sm font-semibold truncate"
                     style={{ color: u.isMe ? '#F59E0B' : '#F1F5F9' }}>
                    {u.name} {u.country}
                  </p>
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
