import { useState, useEffect, useCallback } from 'react'
import { TEAMS, TOTAL_MATCHES } from './data'
import Flag from './Flag'
import { supabase, createRoom, joinRoom, getRoomMembers, getRoomScores } from '../lib/supabase'

const ROOM_KEY = 'wc26-room'

function calcScore(groupTips, bracketTips) {
  return Object.values(groupTips).filter(Boolean).length * 3
       + Object.values(bracketTips ?? {}).filter(Boolean).length * 3
}

// ─── Rumsvy ───────────────────────────────────────────────────────────────────

function RoomView({ room, user, myPts, myChamp, onLeave }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)

  const loadMembers = useCallback(async () => {
    try {
      const data = await getRoomMembers(room.id ?? room.code)
      const userIds = data.map(m => m.user_id)
      const scores = userIds.length > 0 ? await getRoomScores(userIds) : {}
      setMembers(data.map(m => ({ ...m, pts: scores[m.user_id] ?? 0 })))
    } catch {
      // Faller tillbaka på mock om rummet är lokalt
      setMembers([])
    } finally {
      setLoading(false)
    }
  }, [room])

  useEffect(() => {
    loadMembers()

    // Realtidsprenumeration – uppdatera när nya medlemmar går med
    const channel = supabase
      .channel(`room-${room.id ?? room.code}`)
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'room_members' },
          () => loadMembers()
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [loadMembers])

  // Kombinera DB-medlemmar med "mig" (för offline-läge)
  const myEntry = {
    id: user?.id ?? 'me',
    name: user?.user_metadata?.username ?? 'Du',
    pts: myPts,
    champ: myChamp,
    isMe: true,
  }

  const allMembers = members.length > 0
    ? members.map(m => ({
        id:    m.user_id,
        name:  m.profiles?.username ?? 'Spelare',
        pts:   m.pts ?? 0,
        champ: null,
        isMe:  m.user_id === user?.id,
      }))
    : [myEntry, ...mockFriends(room.code)]

  const sorted = allMembers.sort((a, b) => b.pts - a.pts)
  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="space-y-4 max-w-lg mx-auto">

      {/* Rum-header */}
      <div
        className="rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap"
        style={{ background: '#1E293B', border: '1px solid rgba(245,158,11,0.3)' }}
      >
        <div>
          <p className="text-xs font-bold mb-1" style={{ color: '#F59E0B' }}>PRIVAT RUM</p>
          <p className="text-2xl font-black tracking-widest" style={{ color: '#F1F5F9' }}>
            {room.code}
          </p>
          <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
            Dela koden med vänner
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigator.clipboard?.writeText(room.code)}
            className="px-3 py-2 rounded-xl text-xs font-semibold"
            style={{ background: '#334155', color: '#F1F5F9' }}
          >
            📋 Kopiera
          </button>
          <button
            onClick={onLeave}
            className="px-3 py-2 rounded-xl text-xs font-semibold"
            style={{ color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            Lämna
          </button>
        </div>
      </div>

      {/* Rankingslista */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: '#1E293B', border: '1px solid #334155' }}
      >
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{ background: '#0F172A', borderBottom: '1px solid #334155' }}
        >
          <p className="font-bold text-sm" style={{ color: '#F1F5F9' }}>
            👥 {sorted.length} deltagare
          </p>
          {loading && <span className="text-xs" style={{ color: '#64748B' }}>Laddar...</span>}
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(59,130,246,0.15)', color: '#3B82F6', fontSize: 10 }}
          >
            🔴 Live
          </span>
        </div>

        <div className="divide-y" style={{ borderColor: '#334155' }}>
          {sorted.map((m, i) => {
            const chTeam = m.champ ? TEAMS[m.champ] : null
            return (
              <div
                key={m.id}
                className="flex items-center gap-3 px-4 py-3"
                style={{
                  background: m.isMe ? 'rgba(245,158,11,0.07)' : 'transparent',
                  borderLeft: `3px solid ${m.isMe ? '#F59E0B' : 'transparent'}`,
                }}
              >
                <span className="text-xl w-8 text-center shrink-0">
                  {medals[i] ?? <span className="text-sm font-bold" style={{ color: '#475569' }}>#{i+1}</span>}
                </span>
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                  style={{ background: m.isMe ? '#F59E0B' : '#334155',
                           color:      m.isMe ? '#0F172A' : '#94A3B8' }}
                >
                  {m.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: m.isMe ? '#F59E0B' : '#F1F5F9' }}>
                    {m.name}
                  </p>
                  <p className="text-xs flex items-center gap-1" style={{ color: '#64748B' }}>
                    Vinnare:{' '}
                    {chTeam
                      ? <><Flag iso2={chTeam.iso2} size="sm" />{chTeam.name}</>
                      : <em>Ej valt</em>}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black" style={{ color: m.isMe ? '#F59E0B' : '#F1F5F9' }}>
                    {m.pts}
                  </p>
                  <p className="text-xs" style={{ color: '#475569' }}>pts</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <p className="text-center text-xs" style={{ color: '#334155' }}>
        Uppdateras via Supabase Realtime
      </p>
    </div>
  )
}

// Lokalt mock om Supabase inte är tillgänglig
function mockFriends(code) {
  const seed = parseInt(code, 10) || 0
  return ['Emma K.', 'Johan N.', 'Sara L.'].slice(0, (seed % 3) + 1).map((name, i) => ({
    id: `mock-${i}`, name, pts: 30 + ((seed + i * 17) % 60), champ: null, isMe: false,
  }))
}

// ─── Huvudkomponent: FriendsRoom ─────────────────────────────────────────────

export default function FriendsRoom({ groupTips, bracketTips, user }) {
  const [room, setRoom]         = useState(() => {
    try { return JSON.parse(localStorage.getItem(ROOM_KEY)) ?? null }
    catch { return null }
  })
  const [joinCode, setJoinCode] = useState('')
  const [error, setError]       = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (room) localStorage.setItem(ROOM_KEY, JSON.stringify(room))
    else      localStorage.removeItem(ROOM_KEY)
  }, [room])

  const myPts   = calcScore(groupTips, bracketTips)
  const myChamp = bracketTips?.['F'] ?? null

  async function handleCreate() {
    setCreating(true)
    try {
      if (user) {
        const r = await createRoom(user.id)
        setRoom(r)
      } else {
        // Offline-rum (utan Supabase)
        const code = Math.floor(100000 + Math.random() * 900000).toString()
        setRoom({ code, id: null, offline: true })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleJoin(e) {
    e.preventDefault()
    if (joinCode.length !== 6 || isNaN(parseInt(joinCode))) {
      setError('Ange en giltig 6-siffrig kod'); return
    }
    try {
      if (user) {
        const r = await joinRoom(user.id, joinCode.trim())
        setRoom({ ...r, code: joinCode.trim() })
      } else {
        setRoom({ code: joinCode.trim(), id: null, offline: true })
      }
      setJoinCode(''); setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  if (room) {
    return (
      <RoomView
        room={room}
        user={user}
        myPts={myPts}
        myChamp={myChamp}
        onLeave={() => setRoom(null)}
      />
    )
  }

  return (
    <div className="max-w-md mx-auto space-y-5">

      {/* Skapa rum */}
      <div className="rounded-2xl p-6 space-y-4"
           style={{ background: '#1E293B', border: '1px solid #334155' }}>
        <div>
          <h3 className="font-bold text-base" style={{ color: '#F1F5F9' }}>🏟️ Skapa privat rum</h3>
          <p className="text-sm mt-1" style={{ color: '#64748B' }}>
            {user ? 'Sparat i databasen – vänner kan gå med via koden' : 'Lokalt rum utan konto'}
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="w-full py-3 rounded-xl font-bold text-sm active:scale-95 transition-all"
          style={{ background: 'linear-gradient(135deg,#F59E0B,#D97706)', color: '#0F172A' }}
        >
          {creating ? '⏳ Skapar...' : '✨ Skapa nytt rum'}
        </button>
      </div>

      {/* Gå med i rum */}
      <div className="rounded-2xl p-6 space-y-4"
           style={{ background: '#1E293B', border: '1px solid #334155' }}>
        <div>
          <h3 className="font-bold text-base" style={{ color: '#F1F5F9' }}>🔑 Gå med i ett rum</h3>
          <p className="text-sm mt-1" style={{ color: '#64748B' }}>
            Ange 6-siffrig kod från en vän
          </p>
        </div>
        <form onSubmit={handleJoin} className="space-y-3">
          <input
            type="text"
            value={joinCode}
            maxLength={6}
            onChange={e => { setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
            placeholder="123456"
            className="w-full text-center text-2xl font-black tracking-widest py-4 rounded-xl outline-none"
            style={{ background: '#0F172A',
                     border: `1.5px solid ${error ? '#EF4444' : '#334155'}`,
                     color: '#F1F5F9' }}
          />
          {error && <p className="text-xs text-center" style={{ color: '#EF4444' }}>{error}</p>}
          <button
            type="submit"
            className="w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-95"
            style={{ background: '#3B82F6', color: '#fff' }}
          >
            Gå med
          </button>
        </form>
      </div>

      {!user && (
        <div className="rounded-2xl p-4 flex gap-3"
             style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <span className="text-xl shrink-0">💡</span>
          <p className="text-xs" style={{ color: '#94A3B8' }}>
            Logga in för att skapa riktiga rum med Supabase Realtime – dina vänner kan då
            gå med med koden och ni ser varandras tips live.
          </p>
        </div>
      )}
    </div>
  )
}
