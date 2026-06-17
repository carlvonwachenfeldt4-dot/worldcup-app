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

// Spara ett grupptips via server-side konfliktkontroll.
export async function saveGroupTip(userId, matchId, tip) {
  const { data, error } = await supabase.rpc('safe_save_group_tip', {
    p_user_id: userId,
    p_match_id: matchId,
    p_tip: tip,
  })
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('Uppdatering av grupptips avvisades eftersom en nyare ändring redan sparats.')
  }
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

// Spara bracket-pick via server-side konfliktkontroll.
export async function saveBracketPick(userId, slotId, teamId) {
  const { data, error } = await supabase.rpc('safe_save_bracket_pick', {
    p_user_id: userId,
    p_slot_id: slotId,
    p_team_id: teamId,
  })
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('Uppdatering av bracket-pick avvisades eftersom en nyare ändring redan sparats.')
  }
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

// Spara spelar-tipsning via server-side konfliktkontroll.
export async function savePlayerPrediction(userId, category, player, isConfirmed) {
  const { data, error } = await supabase.rpc('safe_save_player_prediction', {
    p_user_id: userId,
    p_category: category,
    p_player_name: player.name,
    p_player_nation: player.nation,
    p_confirmed: isConfirmed,
  })
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('Uppdatering av spelar-tipsning avvisades eftersom en nyare ändring redan sparats.')
  }
}

// ─── Match Results Sync ───────────────────────────────────────────────────────

// Hämta alla rader från match_results (diagnostik och admin)
export async function fetchMatchResults() {
  const { data, error } = await supabase
    .from('match_results')
    .select('match_id, home_goals, away_goals, status, result')
    .order('match_id')
  if (error) throw error
  return data ?? []
}

// Synka slutförda matchresultat från API-Football till Supabase.
// Returnerar { synced, matched, total, matchIds, error } för diagnostik.
export async function syncMatchResultsFromAPI() {
  try {
    if (!import.meta.env.VITE_API_FOOTBALL_KEY) {
      const msg = 'VITE_API_FOOTBALL_KEY saknas – kan inte synka matchresultat'
      console.warn(msg)
      return { synced: 0, matched: 0, total: 0, matchIds: [], error: msg }
    }

    const { getFixtures, matchApiToAppId } = await import('./apiFootball.js')
    const { APP_MATCHES_FLAT } = await import('../worldcup/data.js')
    const fixtures = await getFixtures()

    if (!Array.isArray(fixtures) || fixtures.length === 0) {
      const msg = `API-Football returnerade ${Array.isArray(fixtures) ? 0 : 'ogiltigt svar'} fixtures för league=1, season=2026`
      console.warn(msg)
      return { synced: 0, matched: 0, total: 0, matchIds: [], error: msg }
    }

    // Mappa API-fixtures till appens "A1"-format via lag- och datumjämförelse
    const mapping = matchApiToAppId(fixtures, APP_MATCHES_FLAT)
    const matched = Object.keys(mapping).length

    const FINISHED = new Set(['FT', 'AET', 'PEN'])
    const rows = Object.entries(mapping)
      .filter(([, f]) => FINISHED.has(f.fixture?.status?.short ?? 'NS'))
      .map(([appMatchId, f]) => ({
        match_id:   appMatchId,
        api_id:     f.fixture.id,
        home_goals: f.goals?.home ?? null,
        away_goals: f.goals?.away ?? null,
        status:     f.fixture.status?.short ?? 'FT',
        updated_at: new Date().toISOString(),
      }))

    if (rows.length === 0) {
      return { synced: 0, matched, total: fixtures.length, matchIds: [], error: null }
    }

    const { error } = await supabase
      .from('match_results')
      .upsert(rows, { onConflict: 'match_id' })

    if (error) {
      console.warn('Batch-upsert fel:', error.message)
      return { synced: 0, matched, total: fixtures.length, matchIds: [], error: error.message }
    }

    const matchIds = rows.map(r => r.match_id)
    if (import.meta.env.DEV) console.log(`✓ Synkade ${rows.length} matchresultat:`, matchIds)
    return { synced: rows.length, matched, total: fixtures.length, matchIds, error: null }
  } catch (e) {
    console.warn('syncMatchResultsFromAPI fel:', e.message)
    return { synced: 0, matched: 0, total: 0, matchIds: [], error: e.message }
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

      const rows = players.map(r => ({
        category:      cat,
        player_name:   r.name,
        player_nation: r.nation,
        value:         r.value,
        updated_at:    new Date().toISOString(),
      }))

      const { error } = await supabase
        .from('player_stats')
        .upsert(rows, { onConflict: 'category,player_name' })
      if (error) console.warn(`player_stats upsert ${cat} fel:`, error.message)
    }
    if (import.meta.env.DEV) console.log('✓ Synkade spelarstatistik från API-Football')
  } catch (e) {
    console.warn('syncPlayerStatsFromAPI fel:', e.message)
  }
}

// ─── VM-vinnartipp ────────────────────────────────────────────────────────────

export async function saveVmWinnerPick(userId, teamName) {
  if (teamName === null) {
    const { error } = await supabase
      .from('vm_picks')
      .delete()
      .eq('user_id', userId)
    if (error) throw error
    return
  }

  const normalizedWinner = teamName.trim()
  const { data, error } = await supabase.rpc('safe_save_vm_winner_pick', {
    p_user_id: userId,
    p_vm_winner: normalizedWinner,
  })
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('Uppdatering av VM-vinnartippningen avvisades eftersom en nyare ändring redan sparats.')
  }
}

export async function loadVmWinnerPick(userId) {
  const { data } = await supabase
    .from('vm_picks')
    .select('vm_winner')
    .eq('user_id', userId)
    .single()
  return data?.vm_winner ?? null
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

// Hämta global topplista (topp 50 profiler med poäng)
export async function fetchLeaderboard() {
  const { data, error } = await supabase.rpc('get_leaderboard')
  if (error) {
    console.warn('Leaderboard RPC ej tillgänglig:', error.message)
    return null
  }
  return data?.slice(0, 50) ?? null
}

// Hämta spelarstatistik för livetabeller (används av icke-admin-användare)
export async function fetchPlayerStats() {
  const { data, error } = await supabase
    .from('player_stats')
    .select('category, player_name, player_nation, value')
    .order('value', { ascending: false })
  if (error) throw error
  const CAT_MAP = { scorer: 'scorers', assist: 'assists', yellow: 'yellow', red: 'red' }
  const result = { scorers: [], assists: [], yellow: [], red: [] }
  for (const r of data) {
    const key = CAT_MAP[r.category]
    if (key) result[key].push({ name: r.player_name, nation: r.player_nation, value: r.value })
  }
  return result
}

// ─── Publik användarprofil (visas via profilmodal i leaderboard) ─────────────

// Hämtar en annan användares spelar-tipsningar och VM-vinnartips.
// Möjligt tack vare FOR SELECT USING (true) på player_predictions och vm_picks.
export async function fetchUserPublicProfile(userId) {
  const [predsRes, vmRes] = await Promise.all([
    supabase
      .from('player_predictions')
      .select('category, player_name, player_nation')
      .eq('user_id', userId),
    supabase
      .from('vm_picks')
      .select('vm_winner')
      .eq('user_id', userId)
      .maybeSingle(),
  ])
  if (predsRes.error) throw predsRes.error
  const predictions = {}
  for (const r of predsRes.data ?? []) {
    predictions[r.category] = { name: r.player_name, nation: r.player_nation }
  }
  return {
    predictions,
    vmWinner: vmRes.data?.vm_winner ?? null,
  }
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

// ─── Bonuspoäng ───────────────────────────────────────────────────────────────

export async function loadBonusQuestions() {
  const { data, error } = await supabase
    .from('bonus_questions')
    .select('id, match_label, option_number, option_text, correct_option')
    .order('match_label')
    .order('option_number')
  if (error) throw error
  return data ?? []
}

export async function loadBonusPicks(userId) {
  console.log('[supabase] loadBonusPicks → user_id:', userId)
  const { data, error } = await supabase
    .from('bonus_picks')
    .select('bonus_question_id, chosen_option')
    .eq('user_id', userId)
  console.log('[supabase] loadBonusPicks ←', { count: data?.length ?? 0, data, error })
  if (error) throw error
  return data ?? []
}

// RLS requirement for bonus_picks:
//   INSERT: (user_id = auth.uid())
//   UPDATE: (user_id = auth.uid())
//   SELECT: (user_id = auth.uid())
export async function saveBonusPick(userId, bonusQuestionId, chosenOption) {
  console.log('[supabase] saveBonusPick →', { userId, bonusQuestionId, chosenOption })
  const { data, error } = await supabase
    .from('bonus_picks')
    .upsert(
      { user_id: userId, bonus_question_id: bonusQuestionId, chosen_option: chosenOption },
      { onConflict: 'user_id,bonus_question_id' }
    )
    .select()
  console.log('[supabase] saveBonusPick ←', { data, error })
  if (error) throw error
}

export async function setBonusCorrectOption(matchLabel, correctOption) {
  console.log('[supabase] setBonusCorrectOption →', { matchLabel, correctOption })
  const { data, error } = await supabase
    .from('bonus_questions')
    .update({ correct_option: correctOption })
    .eq('match_label', matchLabel)
    .select('id, match_label, correct_option')
  console.log('[supabase] setBonusCorrectOption ←', { updatedRows: data?.length ?? 0, data, error })
  if (error) throw error
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
