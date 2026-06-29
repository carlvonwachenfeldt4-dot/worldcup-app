import { useState, useEffect } from 'react'
import { fetchUserPublicProfile } from '../lib/supabase'

const CAT_META = {
  scorer: { label: 'Skyttekung',       icon: '⚽', color: '#F59E0B' },
  assist: { label: 'Assistkung',       icon: '🎯', color: '#3B82F6' },
  yellow: { label: 'Flest gula kort',  icon: '🟨', color: '#EAB308' },
  red:    { label: 'Flest röda kort',  icon: '🟥', color: '#EF4444' },
}

export default function UserProfileModal({ profileUser, onClose }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null); setData(null)
    fetchUserPublicProfile(profileUser.id)
      .then(d  => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false) } })
    return () => { cancelled = true }
  }, [profileUser.id])

  // Stäng på Escape
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const initials = (profileUser.name ?? '?').slice(0, 2).toUpperCase()

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{
          background:  '#1E293B',
          border:      '1px solid #334155',
          boxShadow:   '0 24px 64px rgba(0,0,0,0.65)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div
          className="px-5 pt-5 pb-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid #334155' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center font-black text-base shrink-0"
              style={{
                background: profileUser.isMe ? '#F59E0B' : '#334155',
                color:      profileUser.isMe ? '#0F172A' : '#F1F5F9',
              }}
            >
              {profileUser.isMe ? '🧑' : initials}
            </div>
            <div>
              <p className="font-bold text-base leading-tight" style={{ color: '#F1F5F9' }}>
                {profileUser.name}
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                {profileUser.medal ? `${profileUser.medal} ` : `#${profileUser.rank} `}
                av {profileUser.totalParticipants} deltagare
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors"
            style={{ background: '#334155', color: '#94A3B8' }}
            aria-label="Stäng"
          >
            ✕
          </button>
        </div>

        {/* ── Poänguppdelning ─────────────────────────────────────────────── */}
        <div className="px-5 py-4" style={{ borderBottom: '1px solid #334155' }}>
          <p className="text-xs font-bold mb-3" style={{ color: '#64748B' }}>POÄNGUPPDELNING</p>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {[
              ['🎯 Matchresultat', profileUser.match_pts,   '#34D399'],
              ['🏆 Slutspel',      profileUser.bracket_pts, '#3B82F6'],
              ['⚽ Spelare',        profileUser.player_pts,  '#F59E0B'],
              ['🌟 VM-vinnare',     profileUser.vm_pts,      '#F87171'],
            ].map(([label, pts, color]) => (
              <div key={label} className="rounded-xl px-3 py-2.5" style={{ background: '#0F172A' }}>
                <p className="text-xs mb-0.5" style={{ color: '#64748B' }}>{label}</p>
                <p className="text-xl font-black" style={{ color }}>{pts}p</p>
              </div>
            ))}
          </div>
          <div
            className="rounded-xl px-4 py-2.5 flex items-center justify-between"
            style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}
          >
            <span className="text-xs font-semibold" style={{ color: '#94A3B8' }}>Totalt</span>
            <span className="text-2xl font-black" style={{ color: '#F59E0B' }}>{profileUser.pts}p</span>
          </div>
        </div>

        {/* ── Förturneringstips ────────────────────────────────────────────── */}
        <div className="px-5 py-4">
          <p className="text-xs font-bold mb-3" style={{ color: '#64748B' }}>FÖRTURNERINGSTIPS</p>

          {loading && (
            <div className="text-center py-6">
              <span className="text-2xl animate-spin inline-block">⚽</span>
            </div>
          )}

          {error && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#F87171' }}>
              Kunde inte ladda tips: {error}
            </p>
          )}

          {data && (
            <div className="space-y-2">
              {/* VM-vinnare */}
              <div
                className="rounded-xl px-3 py-2.5 flex items-center justify-between"
                style={{ background: '#0F172A' }}
              >
                <span className="text-xs" style={{ color: '#94A3B8' }}>🏆 VM-vinnare</span>
                <span
                  className="text-sm font-semibold"
                  style={{ color: data.vmWinner ? '#F59E0B' : '#475569' }}
                >
                  {data.vmWinner ?? 'Ej valt'}
                </span>
              </div>

              {/* Spelarval */}
              {Object.entries(CAT_META).map(([cat, meta]) => {
                const pred = data.predictions[cat]
                return (
                  <div
                    key={cat}
                    className="rounded-xl px-3 py-2.5 flex items-center justify-between"
                    style={{ background: '#0F172A' }}
                  >
                    <span className="text-xs" style={{ color: '#94A3B8' }}>
                      {meta.icon} {meta.label}
                    </span>
                    <span
                      className="text-sm font-semibold max-w-[55%] text-right truncate"
                      style={{ color: pred ? meta.color : '#475569' }}
                    >
                      {pred ? pred.name : 'Ej valt'}
                    </span>
                  </div>
                )
              })}

              {!data.vmWinner && Object.values(data.predictions).length === 0 && (
                <p className="text-xs text-center py-2" style={{ color: '#475569' }}>
                  Inga förturneringstips sparade
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
