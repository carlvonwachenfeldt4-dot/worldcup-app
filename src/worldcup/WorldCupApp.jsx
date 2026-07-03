import { useState, useEffect, useCallback, useRef } from 'react'
import { TOTAL_MATCHES } from './data'
import { supabase, signOut, loadGroupTips, saveGroupTip, deleteGroupTip,
         loadBracketTips, saveBracketTipFull, deleteBracketTip, loadPlayerPredictions, fetchLeaderboard, getProfile, syncMatchResultsFromAPI, syncPlayerStatsFromAPI, loadVmWinnerPick } from '../lib/supabase'
import BonusTab          from './BonusTab'
import GroupStage        from './GroupStage'
import Bracket           from './Bracket'
import Leaderboard       from './Leaderboard'
import AuthModal         from './AuthModal'
import Profile           from './Profile'
import AdminPanel        from './AdminPanel'
import ErrorBoundary     from './ErrorBoundary'

function loadLocal(key, fb) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fb }
  catch { return fb }
}

const TABS = [
  { id:'groups',      label:'Gruppspel / VM-Vinnare', mobileLabel:'Grupp',   icon:'🏟️' },
  { id:'bracket',     label:'Slutspel',               mobileLabel:'Slutspel',icon:'🏆' },
  { id:'bonus',        label:'Bonuspoäng',             mobileLabel:'Bonus',   icon:'⭐' },
  { id:'leaderboard', label:'Ranking',                mobileLabel:'Ranking', icon:'🌍' },
]

const DEMO_PREVIEW = typeof window !== 'undefined'
  && window.location.hostname === 'localhost'
  && new URLSearchParams(window.location.search).get('demo') === '1'

export default function WorldCupApp() {
  const DEMO_USER = {
    id: 'demo-user',
    email: 'demo@localhost',
    user_metadata: { username: 'DemoUser' },
  }
  const DEMO_PROFILE = {
    username: 'Demo User',
    is_admin: true,
    avatar_url: 'https://api.dicebear.com/6.x/avataaars/svg?seed=worldcup-demo',
  }

  const [tab, setTab] = useState('groups')

  // Grupptips: { matchId: '1'|'X'|'2' }
  const [tips, setTips] = useState(() => loadLocal('wc26-tips', {}))

  // Bracket-tips: { matchId: '1'|'X'|'2' } – 1X2 på varje knockout-match
  const [bracketTips, setBracketTips] = useState(() => loadLocal('wc26-bracket-tips', {}))

  // Auth
  const [user,      setUser]      = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [showAuth,  setShowAuth]  = useState(false)
  const [profile, setProfile] = useState(null)
  const [userPredictions, setUserPredictions] = useState({ selections: {}, confirmed: {} })
  const [rankInfo, setRankInfo] = useState(null)
  const [vmWinner, setVmWinner] = useState(() => {
    try { return localStorage.getItem('vmWinner') ?? null }
    catch { return null }
  })
  const [menuOpen,         setMenuOpen]         = useState(false)
  const [showPasswordReset, setShowPasswordReset] = useState(false)
  const [newPassword,       setNewPassword]       = useState('')
  const [resetLoading,      setResetLoading]      = useState(false)
  const [resetError,        setResetError]        = useState(null)
  const [saveError,         setSaveError]         = useState(null)
  const [syncing,           setSyncing]           = useState(false)
  const menuRef = useRef(null)
  const tipDebounce = useRef({})
  const bracketTipDebounce = useRef({})
  // Ref för att alltid läsa senaste bracketTips i debounce-callbacken
  const bracketTipsRef = useRef({})

  // ─── Auth: lyssna på session-förändringar ────────────────────────────────
  useEffect(() => {
    if (DEMO_PREVIEW) {
      setUser(DEMO_USER)
      setProfile(DEMO_PROFILE)
      setUserPredictions({
        selections: {
          scorer: { name: 'Mbappé' },
          assist: { name: 'Messi' },
          yellow: { name: 'Casemiro' },
          red: { name: 'Ramos' },
        },
        confirmed: {},
      })
      setRankInfo({ position: 4, points: 68 })
      setVmWinner('Brazil')
      setAuthReady(true)
      return
    }
    let authReadyTimeout = setTimeout(() => setAuthReady(true), 8000)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === 'PASSWORD_RECOVERY') { setShowPasswordReset(true); return }
      if (_event === 'INITIAL_SESSION') {
        clearTimeout(authReadyTimeout)
        setAuthReady(true)
      }
      setUser(session?.user ?? null)
      if (session?.user) syncFromSupabase(session.user.id)
    })
    return () => {
      clearTimeout(authReadyTimeout)
      subscription.unsubscribe()
    }
  }, [])

  // ─── Matchresultat-sync från API-Football ─────────────────────────────────
  // Körs bara för admin-användare – RLS blockerar skrivning för övriga
  useEffect(() => {
    if (!profile?.is_admin) return
    syncMatchResultsFromAPI()
    syncPlayerStatsFromAPI()
    const syncInterval = setInterval(() => {
      syncMatchResultsFromAPI()
      syncPlayerStatsFromAPI()
    }, 60 * 60 * 1000) // max 1 sync/timme i samma admin-session
    return () => clearInterval(syncInterval)
  }, [profile?.is_admin, profile?.id])

  useEffect(() => {
    let mounted = true
    async function loadProfile() {
      if (!user) { setProfile(null); setUserPredictions({ selections: {}, confirmed: {} }); setVmWinner(null); return }
      try {
        const [p, predictions, leaderboard, dbVmWinner] = await Promise.all([
          getProfile(user.id),
          loadPlayerPredictions(user.id),
          fetchLeaderboard(),
          loadVmWinnerPick(user.id),
        ])
        if (!mounted) return
        setProfile(p)
        setUserPredictions(predictions)
        const index = leaderboard?.findIndex(row => row.id === user.id)
        setRankInfo(index >= 0 ? {
          position: index + 1,
          points: leaderboard[index]?.total_pts ?? 0,
          total: leaderboard.length,
        } : null)
        const localVmWinner = (() => { try { return localStorage.getItem('vmWinner') ?? null } catch { return null } })()
        setVmWinner(dbVmWinner ?? localVmWinner)
      } catch (e) {
        console.warn('Could not load profile, predictions or ranking', e.message)
      }
    }
    loadProfile()
    return () => { mounted = false }
  }, [user])

  useEffect(() => {
    if (window.location.pathname === '/profil') {
      if (user) setTab('profile')
      else {
        window.history.replaceState({}, '', '/')
        setShowAuth(true)
      }
    }
  }, [user])

  useEffect(() => {
    if (vmWinner) localStorage.setItem('vmWinner', vmWinner)
    else localStorage.removeItem('vmWinner')
  }, [vmWinner])

  function handleVmWinnerChange(next) {
    setVmWinner(next)
  }

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuOpen && menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }
    function handleEsc(event) {
      if (menuOpen && event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [menuOpen])

  async function syncFromSupabase(userId) {
    setSyncing(true)
    try {
      const [dbTips, dbBracket, dbPredictions, dbVmWinner] = await Promise.all([
        loadGroupTips(userId),
        loadBracketTips(userId),
        loadPlayerPredictions(userId),
        loadVmWinnerPick(userId),
      ])
      setTips(dbTips ?? {})
      setBracketTips(dbBracket ?? {})
      setUserPredictions(dbPredictions ?? { selections: {}, confirmed: {} })
      setVmWinner(dbVmWinner ?? null)
    } catch (err) {
      console.warn('Kunde inte ladda från Supabase:', err.message)
    } finally {
      setSyncing(false)
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
        const op = val
          ? saveGroupTip(user.id, matchId, val)
          : deleteGroupTip(user.id, matchId)
        op.catch(() => setSaveError('Tipset kunde inte sparas – kontrollera uppkopplingen och försök igen.'))
      }, 600)
    }
  }, [user])

  // Håll ref synkad med state för att undvika stale closure i debounce
  useEffect(() => { bracketTipsRef.current = bracketTips }, [bracketTips])

  // ─── Bracket 1X2-tips + övertid/straffar ──────────────────────────────────
  // field: 'tip' | 'et_tip' | 'pen_tip'
  const handleBracketTip = useCallback((matchId, field, val) => {
    setBracketTips(prev => {
      const curr = prev[matchId]
      const base = (curr && typeof curr === 'object')
        ? curr
        : { tip: curr ?? null, et_tip: null, pen_tip: null }
      return { ...prev, [matchId]: { ...base, [field]: val } }
    })
    if (user) {
      clearTimeout(bracketTipDebounce.current[matchId])
      bracketTipDebounce.current[matchId] = setTimeout(() => {
        const entry   = bracketTipsRef.current[matchId] ?? {}
        const tip     = (entry && typeof entry === 'object') ? entry.tip     : (entry ?? null)
        const et_tip  = (entry && typeof entry === 'object') ? entry.et_tip  : null
        const pen_tip = (entry && typeof entry === 'object') ? entry.pen_tip : null
        const op = (!tip && !et_tip && !pen_tip)
          ? deleteBracketTip(user.id, matchId)
          : saveBracketTipFull(user.id, matchId, tip, et_tip, pen_tip)
        op.catch(() => setSaveError('Tipset kunde inte sparas – kontrollera uppkopplingen och försök igen.'))
      }, 600)
    }
  }, [user])

  async function handleSignOut() {
    await signOut()
    setMenuOpen(false)
    setUser(null)
    setProfile(null)
    setUserPredictions({ selections: {}, confirmed: {} })
    setRankInfo(null)
    setVmWinner(null)
    setTab('groups')
    window.history.pushState({}, '', '/')
  }

  async function handlePasswordReset(e) {
    e.preventDefault()
    if (newPassword.length < 8) { setResetError('Lösenordet måste vara minst 8 tecken'); return }
    setResetLoading(true); setResetError(null)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setShowPasswordReset(false)
      setNewPassword('')
    } catch (err) {
      setResetError(err.message || 'Något gick fel. Försök igen.')
    } finally {
      setResetLoading(false)
    }
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

      {showPasswordReset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
        >
          <div
            className="w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ background: '#1E293B', border: '1px solid #334155',
                     boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}
          >
            <div className="px-6 pt-6 pb-4 text-center" style={{ borderBottom: '1px solid #334155' }}>
              <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-2xl font-black mb-3"
                   style={{ background: 'linear-gradient(135deg,#F59E0B,#D97706)' }}>🔑</div>
              <h2 className="text-xl font-black" style={{ color: '#F1F5F9' }}>Nytt lösenord</h2>
              <p className="text-xs mt-1" style={{ color: '#64748B' }}>
                Ange ditt nya lösenord för att slutföra återställningen
              </p>
            </div>
            <form onSubmit={handlePasswordReset} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: '#94A3B8' }}>
                  Nytt lösenord
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => { setNewPassword(e.target.value); setResetError(null) }}
                  placeholder="Minst 8 tecken"
                  minLength={8}
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                  style={{ background: '#0F172A', border: '1.5px solid #334155', color: '#F1F5F9' }}
                  autoFocus
                />
              </div>
              {resetError && (
                <p className="text-xs px-3 py-2 rounded-lg"
                   style={{ background: 'rgba(239,68,68,0.1)', color: '#F87171' }}>
                  ⚠️ {resetError}
                </p>
              )}
              <button
                type="submit"
                disabled={resetLoading}
                className="w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-95"
                style={{
                  background: resetLoading ? '#334155' : 'linear-gradient(135deg,#F59E0B,#D97706)',
                  color:      resetLoading ? '#64748B' : '#0F172A',
                }}
              >
                {resetLoading ? '⏳ Sparar...' : 'Spara nytt lösenord'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─── Header ────────────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(180deg,#1E293B,#0F172A)', borderBottom: '1px solid #334155' }}>
        <div className="max-w-4xl mx-auto px-4 py-4">

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl font-black"
                   style={{ background: 'linear-gradient(135deg,#F59E0B,#D97706)' }}>⚽</div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-black text-lg leading-tight" style={{ color: '#F1F5F9' }}>
                    VM-tippning 2026
                  </h1>
                  {syncing && (
                    <span className="text-[11px] font-semibold uppercase rounded-full px-2 py-1"
                          style={{ background: 'rgba(255,255,255,0.12)', color: '#F59E0B' }}>
                      Synkar...
                    </span>
                  )}
                </div>
                <p className="text-xs" style={{ color: '#64748B' }}>
                  FIFA World Cup · USA / Kanada / Mexiko · Svensk tid
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {user ? (
                <div className="relative" ref={menuRef}>
                  {(profile?.is_admin || DEMO_PREVIEW) && (
                    <button onClick={() => setTab('admin')}
                      className="mr-2 px-3 py-1.5 rounded-xl text-xs font-semibold"
                      style={{ background:'#183046', color:'#F1F5F9' }}>
                      Admin
                    </button>
                  )}
                  <button
                    onClick={() => setMenuOpen(prev => !prev)}
                    className="rounded-full overflow-hidden flex items-center justify-center gap-1.5 px-1.5 h-11 transition-transform active:scale-95"
                    style={{ border: '2px solid #F59E0B', background: '#0F172A' }}
                    aria-haspopup="true"
                    aria-expanded={menuOpen}
                  >
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="Profilbild" style={{ width:40, height:40, objectFit:'cover', borderRadius:999 }} />
                    ) : (
                      <div style={{ width:40, height:40, display:'flex', alignItems:'center', justifyContent:'center', background:'#334155', color:'#F1F5F9', fontWeight:700, fontSize:14, borderRadius:999 }}>
                        {(profile?.username ?? user.user_metadata?.username ?? user.email?.split('@')[0] ?? '??').slice(0,2).toUpperCase()}
                      </div>
                    )}
                    <span style={{ color: '#F59E0B', fontSize: 12, lineHeight: 1 }}>⌄</span>
                  </button>

                  {menuOpen && (
                    <div className="absolute right-0 top-full mt-3 w-full max-w-[320px] min-w-[260px] rounded-[28px] border border-[#334155] bg-[#0F172A] shadow-[0_20px_60px_rgba(15,23,42,0.35)] p-4 text-sm"
                         style={{ transition: 'opacity 180ms ease, transform 180ms ease', opacity: 1, transform: 'translateY(0)' }}>
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <p className="text-xs uppercase tracking-[0.18em] text-[#64748B]">Profil</p>
                          <p className="font-bold text-white">{profile?.username ?? user.user_metadata?.username ?? 'Användare'}</p>
                          <p className="text-xs text-[#94A3B8]">{user.email}</p>
                        </div>

                        <div className="grid gap-2 text-xs text-[#CBD5E1]">
                          <div className="flex items-center justify-between rounded-2xl bg-[#12233B] p-3">
                            <span>Ranking</span>
                            <span className="font-semibold text-white">{rankInfo?.position ?? '-'}</span>
                          </div>
                          <div className="flex items-center justify-between rounded-2xl bg-[#12233B] p-3">
                            <span>Poäng</span>
                            <span className="font-semibold text-white">{rankInfo?.points ?? '-'}</span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-xs uppercase tracking-[0.18em] text-[#64748B]">Förturneringstips</div>
                          <div className="space-y-2 rounded-3xl border border-[#334155] bg-[#111827] p-3">
                            <div className="text-sm text-white font-semibold">Snabböversikt</div>
                            <div className="space-y-1 text-xs text-[#CBD5E1]">
                              <div className="flex items-center justify-between gap-2">
                                <span>🏆 Vinnare av VM</span>
                                <span className="text-right text-[#F8FAFC]">{vmWinner || 'Ej valt'}</span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span>⚽ Skyttekung</span>
                                <span className="text-right text-[#F8FAFC]">{userPredictions.selections?.scorer?.name || 'Ej valt'}</span>
                              </div>
                              {userPredictions.selections?.assist?.name && (
                                <div className="flex items-center justify-between gap-2">
                                  <span>🎯 Assistkung</span>
                                  <span className="text-right text-[#F8FAFC]">{userPredictions.selections.assist.name}</span>
                                </div>
                              )}
                              {userPredictions.selections?.yellow?.name && (
                                <div className="flex items-center justify-between gap-2">
                                  <span>🟨 Flest gula kort</span>
                                  <span className="text-right text-[#F8FAFC]">{userPredictions.selections.yellow.name}</span>
                                </div>
                              )}
                              {userPredictions.selections?.red?.name && (
                                <div className="flex items-center justify-between gap-2">
                                  <span>🟥 Flest röda kort</span>
                                  <span className="text-right text-[#F8FAFC]">{userPredictions.selections.red.name}</span>
                                </div>
                              )}
                              {!userPredictions.selections?.scorer?.name && !userPredictions.selections?.assist?.name
                                && !userPredictions.selections?.yellow?.name && !userPredictions.selections?.red?.name && !vmWinner && (
                                <p className="text-xs text-[#64748B]">Inga förturneringstips sparade ännu.</p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => { setTab('profile'); window.history.pushState({}, '', '/profil'); setMenuOpen(false) }}
                            className="w-full rounded-2xl bg-[#F59E0B] px-4 py-2 text-sm font-semibold text-[#0F172A]"
                          >
                            Visa profil
                          </button>
                          <button
                            onClick={handleSignOut}
                            className="w-full rounded-2xl border border-[#334155] bg-[#111827] px-4 py-2 text-sm font-semibold text-[#F1F5F9]"
                          >
                            Logga ut
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
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
                <span className="hidden sm:inline">{t.label}</span>
                <span className="sm:hidden">{t.mobileLabel}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Sidinnehåll ─────────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-4 py-6">

        {saveError && (
          <div className="mb-4 rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
               style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <p className="text-sm" style={{ color: '#F87171' }}>⚠️ {saveError}</p>
            <button
              onClick={() => setSaveError(null)}
              className="shrink-0 text-lg leading-none"
              style={{ color: '#64748B' }}
            >×</button>
          </div>
        )}

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
          <ErrorBoundary>
            <GroupStage
              tips={tips}
              onTip={handleTip}
              filledCount={filledCount}
              user={user}
              vmWinner={vmWinner}
              onVmWinnerChange={handleVmWinnerChange}
            />
          </ErrorBoundary>
        )}
        {tab === 'bracket' && (
          <ErrorBoundary>
            <Bracket
              bracketTips={bracketTips}
              onTip={handleBracketTip}
            />
          </ErrorBoundary>
        )}
        {tab === 'bonus' && <ErrorBoundary><BonusTab user={user} /></ErrorBoundary>}
        {tab === 'leaderboard'  && <ErrorBoundary><Leaderboard groupTips={tips} bracketTips={bracketTips} user={user} /></ErrorBoundary>}
        {tab === 'profile'      && <ErrorBoundary><Profile user={user} onBack={() => { setTab('groups'); window.history.pushState({}, '', '/') }} onSignOut={handleSignOut} profile={profile} rankInfo={rankInfo} tips={tips} bracketTips={bracketTips} userPredictions={userPredictions} /></ErrorBoundary>}
        {tab === 'admin'        && <ErrorBoundary><AdminPanel demo={DEMO_PREVIEW} user={user} profile={profile} /></ErrorBoundary>}
      </div>
    </div>
  )
}
