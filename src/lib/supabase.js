import { createClient } from '@supabase/supabase-js'

// Singleton-klient – importeras i hela appen
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// ─── Auth-hjälpfunktioner ─────────────────────────────────────────────────────

export async function signUp(email, password, username) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  })
  if (error) throw error

  // Skapa profil-rad
  if (data.user) {
    await supabase.from('profiles').upsert({
      id:       data.user.id,
      username: username || email.split('@')[0],
    })
  }
  return data
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  await supabase.auth.signOut()
  // Rensa sparade tips från localStorage vid utloggning
  localStorage.removeItem('wc26-tips')
  localStorage.removeItem('wc26-bracket')
  localStorage.removeItem('wc26-locked')
  localStorage.removeItem('wc26-room')
}

export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  })
  if (error) throw error
}

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

// ─── Tips-sync ────────────────────────────────────────────────────────────────

// Läs in alla grupptips för inloggad användare
export async function loadGroupTips(userId) {
  const { data, error } = await supabase
    .from('group_tips')
    .select('match_id, tip')
    .eq('user_id', userId)
  if (error) throw error
  return Object.fromEntries(data.map(r => [r.match_id, r.tip]))
}

// Spara ett grupptips (upsert)
export async function saveGroupTip(userId, matchId, tip) {
  const { error } = await supabase
    .from('group_tips')
    .upsert({ user_id: userId, match_id: matchId, tip, updated_at: new Date().toISOString() },
             { onConflict: 'user_id,match_id' })
  if (error) throw error
}

// Ladda bracket-picks
export async function loadBracketPicks(userId) {
  const { data, error } = await supabase
    .from('bracket_picks')
    .select('slot_id, team_id')
    .eq('user_id', userId)
  if (error) throw error
  return Object.fromEntries(data.map(r => [r.slot_id, r.team_id]))
}

// Spara bracket-pick
export async function saveBracketPick(userId, slotId, teamId) {
  const { error } = await supabase
    .from('bracket_picks')
    .upsert({ user_id: userId, slot_id: slotId, team_id: teamId, updated_at: new Date().toISOString() },
             { onConflict: 'user_id,slot_id' })
  if (error) throw error
}

// Ladda spelar-tipsningar
export async function loadPlayerPredictions(userId) {
  const { data, error } = await supabase
    .from('player_predictions')
    .select('category, player_name, player_nation, confirmed')
    .eq('user_id', userId)
  if (error) throw error
  const selections = {}, confirmed = {}
  for (const r of data) {
    selections[r.category] = { name: r.player_name, nation: r.player_nation }
    confirmed[r.category]  = r.confirmed
  }
  return { selections, confirmed }
}

// Spara spelar-tipsning
export async function savePlayerPrediction(userId, category, player, isConfirmed) {
  const { error } = await supabase
    .from('player_predictions')
    .upsert({
      user_id:       userId,
      category,
      player_name:   player.name,
      player_nation: player.nation,
      confirmed:     isConfirmed,
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'user_id,category' })
  if (error) throw error
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

// Hämta global topplista (topp 50 profiler med poäng)
export async function fetchLeaderboard() {
  const { data, error } = await supabase
    .from('leaderboard_view')  // skapad som VIEW i schema.sql
    .select('*')
    .order('total_pts', { ascending: false })
    .limit(50)
  if (error) {
    console.warn('Leaderboard view ej tillgänglig, faller tillbaka på mock-data:', error.message)
    return null
  }
  return data
}

// ─── Vännerrum ────────────────────────────────────────────────────────────────

// Skapa nytt rum
export async function createRoom(userId) {
  const code = Math.floor(100000 + Math.random() * 900000).toString()
  const { data, error } = await supabase
    .from('friend_rooms')
    .insert({ code, created_by: userId })
    .select()
    .single()
  if (error) throw error

  // Lägg till skaparen som medlem
  await supabase.from('room_members').insert({ room_id: data.id, user_id: userId })
  return data
}

// Gå med i rum via kod
export async function joinRoom(userId, code) {
  const { data: room, error: re } = await supabase
    .from('friend_rooms')
    .select('id')
    .eq('code', code)
    .single()
  if (re) throw new Error('Rum hittades inte')

  await supabase
    .from('room_members')
    .upsert({ room_id: room.id, user_id: userId }, { onConflict: 'room_id,user_id' })
  return room
}

// Hämta rumsmedlemmar med deras tips-poäng
export async function getRoomMembers(roomId) {
  const { data, error } = await supabase
    .from('room_members')
    .select('user_id, profiles(username), joined_at')
    .eq('room_id', roomId)
  if (error) throw error
  return data
}
