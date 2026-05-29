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
  localStorage.removeItem('wc26-bracket-tips')
  localStorage.removeItem('vmWinner')
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

// Ta bort ett grupptips
export async function deleteGroupTip(userId, matchId) {
  const { error } = await supabase
    .from('group_tips')
    .delete()
    .eq('user_id', userId)
    .eq('match_id', matchId)
  if (error) throw error
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

// ─── Match Results Sync ───────────────────────────────────────────────────────

// Synka slutförda matchresultat från API-Football till Supabase
export async function syncMatchResultsFromAPI() {
  try {
    const { getFixtures, matchApiToAppId } = await import('./apiFootball.js')
    const { APP_MATCHES_FLAT } = await import('../worldcup/data.js')
    const fixtures = await getFixtures()

    if (!Array.isArray(fixtures)) {
      console.warn('syncMatchResultsFromAPI: getFixtures() returnerade inget array')
      return
    }

    // Mappa API-fixtures till appens "A1"-format via lag- och datumjämförelse
    const mapping = matchApiToAppId(fixtures, APP_MATCHES_FLAT)

    const rows = Object.entries(mapping)
      .filter(([, f]) => (f.fixture?.status?.short ?? 'NS') === 'FT')
      .map(([appMatchId, f]) => ({
        match_id:   appMatchId,
        api_id:     f.fixture.id,
        home_goals: f.goals?.home ?? null,
        away_goals: f.goals?.away ?? null,
        status:     'FT',
        updated_at: new Date().toISOString(),
      }))
    if (rows.length === 0) return
    const { error } = await supabase
      .from('match_results')
      .upsert(rows, { onConflict: 'match_id' })
    if (error) console.warn('Batch-upsert fel:', error.message)
    else console.log(`✓ Synkade ${rows.length} matchresultat från API-Football`)
  } catch (e) {
    console.warn('syncMatchResultsFromAPI fel:', e.message)
  }
}

// ─── Spelarstatistik-sync från API-Football ──────────────────────────────────

export async function syncPlayerStatsFromAPI() {
  try {
    const { getTopPlayersAll } = await import('./apiFootball.js')
    const all = await getTopPlayersAll()

    for (const [cat, key] of [['scorer','scorers'],['assist','assists'],['yellow','yellow'],['red','red']]) {
      const players = all[key] ?? []
      if (!players.length) continue

      // Hämta befintliga rader för kategorin för att undvika dubletter
      const { data: existing } = await supabase
        .from('player_stats')
        .select('id, player_name')
        .eq('category', cat)

      const existingByName = Object.fromEntries(
        (existing ?? []).map(r => [r.player_name.toLowerCase(), r.id])
      )

      const toUpdate = []
      const toInsert = []
      for (const r of players) {
        const row = {
          category:      cat,
          player_name:   r.name,
          player_nation: r.nation,
          value:         r.value,
          updated_at:    new Date().toISOString(),
        }
        const existingId = existingByName[r.name.toLowerCase()]
        if (existingId) toUpdate.push({ id: existingId, ...row })
        else            toInsert.push(row)
      }

      if (toUpdate.length) {
        const { error } = await supabase
          .from('player_stats')
          .upsert(toUpdate, { onConflict: 'id' })
        if (error) console.warn(`player_stats upsert ${cat} fel:`, error.message)
      }
      if (toInsert.length) {
        const { error } = await supabase.from('player_stats').insert(toInsert)
        if (error) console.warn(`player_stats insert ${cat} fel:`, error.message)
      }
    }
    console.log('✓ Synkade spelarstatistik från API-Football')
  } catch (e) {
    console.warn('syncPlayerStatsFromAPI fel:', e.message)
  }
}

// ─── VM-vinnartipp ────────────────────────────────────────────────────────────

export async function saveVmWinnerPick(userId, teamName) {
  const { error } = await supabase
    .from('vm_picks')
    .upsert({ user_id: userId, vm_winner: teamName, updated_at: new Date().toISOString() },
             { onConflict: 'user_id' })
  if (error) throw error
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

// Hämta global topplista (topp 50 profiler med poäng)
export async function fetchLeaderboard() {
  const { data, error } = await supabase
    .from('leaderboard_full_view')  // inkluderar spelar- och VM-vinnartippningspoäng
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

// Hämta total_pts från leaderboard_view för en lista av user_ids
export async function getRoomScores(userIds) {
  if (!userIds?.length) return {}
  const { data, error } = await supabase
    .from('leaderboard_view')
    .select('id, total_pts')
    .in('id', userIds)
  if (error) throw error
  return Object.fromEntries(data.map(r => [r.id, r.total_pts ?? 0]))
}

// ─── Profile helpers: get, avatar upload + profile update ────────────────

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, is_admin, created_at')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data
}

export async function uploadAvatar(userId, file) {
  const ext = file.name.split('.').pop()
  const path = `${userId}/avatar.${ext}`
  const { data, error: uploadErr } = await supabase.storage
    .from('avatars')
    .upload(path, file, { cacheControl: '3600', upsert: true })
  if (uploadErr) throw uploadErr

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
  const publicUrl = urlData.publicUrl

  // Try to persist avatar_url in profiles table
  try {
    await supabase.from('profiles').upsert({ id: userId, avatar_url: publicUrl, updated_at: new Date().toISOString() }, { onConflict: 'id' })
  } catch (e) {
    console.warn('Could not update profile avatar_url:', e.message)
  }

  return publicUrl
}

export async function updateProfile(userId, updates) {
  const payload = { id: userId, ...updates, updated_at: new Date().toISOString() }
  const { data, error } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single()
  if (error) throw error
  return data
}
