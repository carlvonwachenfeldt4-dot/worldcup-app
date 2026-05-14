import { useState, useEffect, useCallback, useRef } from 'react'
import { TOTAL_MATCHES } from './data'
import { supabase, signOut, loadGroupTips, saveGroupTip,
         loadBracketPicks, saveBracketPick } from '../lib/supabase'
import GroupStage        from './GroupStage'
import Bracket           from './Bracket'
import Leaderboard       from './Leaderboard'
import FriendsRoom       from './FriendsRoom'
import SpelerPredictions from './SpelerPredictions'
import AuthModal         from './AuthModal'

function loadLocal(key, fb) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fb }
  catch { return fb }
}

const TABS = [
  { id:'groups',      label:'Gruppspel / VM-Vinnare', icon:'🏟️' },
  { id:'bracket',     label:'Slutspel',               icon:'🏆' },
  { id:'players',     label:'Spelare',                icon:'⚽' },
  { id:'leaderboard', label:'Ranking',                icon:'🌍' },
  { id:'friends',     label:'Vänner',                 icon:'👥' },
]

export default function WorldCupApp() {
  const [tab, setTab] = useState('groups')

  // Grupptips: { matchId: '1'|'X'|'2' }
  const [tips, setTips] = useState(() => loadLocal('wc26-tips', {}))

  // Bracket-tips: { matchId: '1'|'X'|'2' } – 1X2 på varje knockout-match
  const [bracketTips, setBracketTips] = useState(() => loadLocal('wc26-bracket-tips', {}))

  // Auth
  const [user,      setUser]      = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [showAuth,  setShowAuth]  = useState(false)
  const tipDebounce = useRef({})

  // ─── Auth: lyssna på session-förändringar ────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthReady(true)
      if (session?.user) syncFromSupabase(session.user.id)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) syncFromSupabase(session.user.id)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function syncFromSupabase(userId) {
    try {
      const [dbTips, dbBracket] = await Promise.all([
        loadGroupTips(userId),
        loadBracketPicks(userId),
      ])
      setTips(prev => ({ ...prev, ...dbTips }))
      setBracketTips(prev => ({ ...prev, ...dbBracket }))
    } catch (err) {
      console.warn('Kunde inte ladda från Supabase:', err.message)
    }
  }

  // ─── Persistens ──────────────────────────────────────────────────────────
  useEffect(() => { localStorage.setItem('wc26-tips',         JSON.stringify(tips))        }, [tips])
  useEffect(() => { localStorage.setItem('wc26-bracket-tips', JSON.stringify(bracketTips)) }, [bracketTips])

  // ─── Grupptips ────────────────────────────────────────────────────────────
  const handleTip = useCallback((matchId, val) => {
    setTips(prev => ({ ...prev, [matchId]: val }))
    if (user) {
      clearTimeout(tipDebounce.current[matchId])
      tipDebounce.current[matchId] = setTimeout(() => {
        saveGroupTip(user.id, matchId, val).catch(console.warn)
      }, 600)
    }
  }, [user])

  // ─── Bracket 1X2-tips ─────────────────────────────────────────────────────
  const handleBracketTip = useCallback((matchId, val) => {
    setBracketTips(prev => ({ ...prev, [matchId]: val }))
    if (user) {
      saveBracketPick(user.id, matchId, val).catch(console.warn)
    }
  }, [user])

  async function handleSignOut() {
    await signOut()
    setUser(null)
  }

  const filledCount = Object.values(tips).filter(Boolean).length

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0F172A' }}>
        <div className="text-2xl animate-spin">⚽</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0F172A' }}>

      {showAuth && !user && (
        <AuthModal
          onSuccess={() => setShowAuth(false)}
          onClose={() => setShowAuth(false)}
        />
      )}

      {/* ─── Header ────────────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(180deg,#1E293B,#0F172A)', borderBottom: '1px solid #334155' }}>
        <div className="max-w-4xl mx-auto px-4 py-4">

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl font-black"
                   style={{ background: 'linear-gradient(135deg,#F59E0B,#D97706)' }}>⚽</div>
              <div>
                <h1 className="font-black text-lg leading-tight" style={{ color: '#F1F5F9' }}>
                  VM-tippning 2026
                </h1>
                <p className="text-xs" style={{ color: '#64748B' }}>
                  FIFA World Cup · USA / Kanada / Mexiko · Svensk tid
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {user ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs hidden sm:block" style={{ color: '#64748B' }}>
                    {user.user_metadata?.username ?? user.email?.split('@')[0]}
                  </span>
                  <button onClick={handleSignOut}
                          className="text-xs px-3 py-1.5 rounded-xl font-semibold transition-all"
                          style={{ background: '#334155', color: '#94A3B8' }}>
                    Logga ut
                  </button>
                </div>
              ) : (
                <button onClick={() => setShowAuth(true)}
                        className="text-xs px-3 py-1.5 rounded-xl font-bold transition-all active:scale-95"
                        style={{ background: 'linear-gradient(135deg,#F59E0B,#D97706)', color: '#0F172A' }}>
                  🔑 Logga in
                </button>
              )}
            </div>
          </div>

          {user && (
            <p className="text-xs mt-1.5" style={{ color: '#1E40AF' }}>
              ☁️ Tips sparas automatiskt till molnet
            </p>
          )}

          {/* Progress */}
          <div className="mt-3">
            <div className="flex justify-between text-xs mb-1" style={{ color: '#64748B' }}>
              <span>Tippade gruppmatcher</span>
              <span style={{ color: filledCount === TOTAL_MATCHES ? '#34D399' : '#64748B' }}>
                {filledCount} / {TOTAL_MATCHES}
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1E293B' }}>
              <div className="h-full rounded-full transition-all duration-500"
                   style={{
                     width: `${(filledCount / TOTAL_MATCHES) * 100}%`,
                     background: filledCount === TOTAL_MATCHES
                       ? '#34D399' : 'linear-gradient(to right,#3B82F6,#F59E0B)',
                   }} />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 overflow-x-auto pb-px">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all"
                style={tab === t.id
                  ? { background: '#F59E0B', color: '#0F172A' }
                  : { background: 'transparent', color: '#64748B' }}
                onMouseEnter={e => { if (tab !== t.id) e.currentTarget.style.color = '#F1F5F9' }}
                onMouseLeave={e => { if (tab !== t.id) e.currentTarget.style.color = '#64748B' }}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Sidinnehåll ─────────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-4 py-6">

        {!user && (
          <div className="mb-5 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
               style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <div className="flex items-center gap-2">
              <span>💡</span>
              <p className="text-sm" style={{ color: '#94A3B8' }}>
                <span style={{ color: '#F1F5F9', fontWeight: 600 }}>Logga in</span>
                {' '}för att spara dina tips och synas i världsrankinglistan
              </p>
            </div>
            <button onClick={() => setShowAuth(true)}
                    className="text-xs px-4 py-2 rounded-xl font-bold transition-all active:scale-95 shrink-0"
                    style={{ background: '#F59E0B', color: '#0F172A' }}>
              Logga in / Registrera
            </button>
          </div>
        )}

        {tab === 'groups' && (
          <GroupStage
            tips={tips}
            onTip={handleTip}
            filledCount={filledCount}
          />
        )}
        {tab === 'bracket' && (
          <Bracket
            groupTips={tips}
            bracketTips={bracketTips}
            onTip={handleBracketTip}
            onEditGroups={() => setTab('groups')}
          />
        )}
        {tab === 'players'      && <SpelerPredictions user={user} />}
        {tab === 'leaderboard'  && <Leaderboard groupTips={tips} bracketTips={bracketTips} user={user} />}
        {tab === 'friends'      && <FriendsRoom groupTips={tips} bracketTips={bracketTips} user={user} />}
      </div>
    </div>
  )
}
