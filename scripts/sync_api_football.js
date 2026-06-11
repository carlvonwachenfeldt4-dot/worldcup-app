import { createClient } from '@supabase/supabase-js'
import { APP_MATCHES_FLAT } from '../src/worldcup/data.js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const API_KEY = process.env.API_FOOTBALL_KEY
const BASE_URL = 'https://v3.football.api-sports.io'
const VM_2026_LEAGUE_ID = 1
const VM_2026_SEASON = 2026

if (!SUPABASE_URL) {
  throw new Error('SUPABASE_URL saknas. Ställ in SUPABASE_URL i miljön.')
}
if (!SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY saknas. Ställ in den i miljön.')
}
if (!API_KEY) {
  throw new Error('API_FOOTBALL_KEY saknas. Ställ in den i miljön.')
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function apiFetch(endpoint, params = {}) {
  const query = new URLSearchParams({ league: VM_2026_LEAGUE_ID, season: VM_2026_SEASON, ...params })
  const url = `${BASE_URL}/${endpoint}?${query}`

  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          'x-apisports-key': API_KEY,
          'x-rapidapi-host': 'v3.football.api-sports.io',
        },
      })

      if (res.ok) {
        const json = await res.json()
        return json.response
      }

      if (res.status === 401 || res.status === 403) {
        throw new Error(`API-Football auktorisering misslyckades (${res.status}). Kontrollera API_FOOTBALL_KEY.`)
      }

      if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts) {
        const retryAfter = parseInt(res.headers.get('retry-after') ?? '', 10)
        const delay = Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000 * 2 ** (attempt - 1)
        console.warn(`API-Football svarade ${res.status}; försöker igen om ${delay} ms (${attempt}/${maxAttempts})`)
        await sleep(delay)
        continue
      }

      throw new Error(`API-Football fel: ${res.status}`)
    } catch (err) {
      if (attempt >= maxAttempts) throw err
      console.warn(`API-Football nätverksfel: ${err.message}; försöker igen (${attempt}/${maxAttempts})`)
      await sleep(1000 * 2 ** (attempt - 1))
    }
  }

  throw new Error('API-Football misslyckades efter flera försök.')
}

const API_TO_SWEDISH = {
  'France':            'Frankrike',
  'Spain':             'Spanien',
  'Germany':           'Tyskland',
  'Netherlands':       'Nederländerna',
  'Belgium':           'Belgien',
  'Brazil':            'Brasilien',
  'Croatia':           'Kroatien',
  'Switzerland':       'Schweiz',
  'Austria':           'Österrike',
  'Sweden':            'Sverige',
  'Scotland':          'Skottland',
  'Turkey':            'Turkiet',
  'Czech Republic':    'Tjeckien',
  'Czechia':           'Tjeckien',
  'Bosnia':            'Bosnien',
  'Norway':            'Norge',
  'Mexico':            'Mexiko',
  'United States':     'USA',
  'Curacao':           'Curaçao',
  'Cape Verde':        'Kap Verde',
  'Morocco':           'Marocko',
  'Egypt':             'Egypten',
  "Ivory Coast":       'Elfenbenskusten',
  "Cote d'Ivoire":     'Elfenbenskusten',
  'South Africa':      'Sydafrika',
  'Algeria':           'Algeriet',
  'DR Congo':          'DR Kongo',
  'South Korea':       'Sydkorea',
  'Korea Republic':    'Sydkorea',
  'Saudi Arabia':      'Saudiarabien',
  'Australia':         'Australien',
  'Jordan':            'Jordanien',
  'Iraq':              'Irak',
  'New Zealand':       'Nya Zeeland',
  'Tunisia':           'Tunisien',
}

const ROUND_LABELS = {
  'R32': ['round of 32', 'r32', 'round 32', '1/16 final', '1/16-finals', 'last 32', 'round of thirty-two'],
  'R16': ['round of 16', 'r16', 'round 16', '1/8 final', '1/8-finals', 'last 16', 'round of sixteen'],
  'QF':  ['quarter-finals', 'quarterfinals', 'qf', 'quarter final'],
  'SF':  ['semi-finals', 'semifinals', 'sf', 'semi final'],
  'F':   ['final', 'f'],
}

function normalizeId(str) {
  return String(str ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function resolveRoundId(rawRound) {
  if (!rawRound) return null
  const normalized = String(rawRound).trim().toLowerCase()
  for (const [roundId, labels] of Object.entries(ROUND_LABELS)) {
    if (labels.some(label => normalized.includes(label))) return roundId
  }
  return null
}

function matchApiToAppId(apiFixtures, appMatches) {
  const result = {}
  for (const appMatch of appMatches) {
    const appHomeName = normalizeId(appMatch.home)
    const appAwayName = normalizeId(appMatch.away)
    const appHomeCode = normalizeId(appMatch.home)
    const appAwayCode = normalizeId(appMatch.away)

    const apiFix = apiFixtures.find(f => {
      const apiHomeName = normalizeId(API_TO_SWEDISH[f.teams.home.name] ?? f.teams.home.name)
      const apiAwayName = normalizeId(API_TO_SWEDISH[f.teams.away.name] ?? f.teams.away.name)
      const apiHomeCode = normalizeId(f.teams.home.code ?? '')
      const apiAwayCode = normalizeId(f.teams.away.code ?? '')

      const homeMatch = apiHomeCode && apiHomeCode === appHomeCode
        ? true
        : apiHomeName === appHomeName || apiHomeName.includes(appHomeName) || appHomeName.includes(apiHomeName)
      const awayMatch = apiAwayCode && apiAwayCode === appAwayCode
        ? true
        : apiAwayName === appAwayName || apiAwayName.includes(appAwayName) || appAwayName.includes(apiAwayName)

      return homeMatch && awayMatch
    })
    if (apiFix) result[appMatch.id] = apiFix
  }
  return result
}

async function getFixtures() {
  return apiFetch('fixtures')
}

async function getTopScorers() {
  return apiFetch('players/topscorers')
}

async function getTopAssists() {
  return apiFetch('players/topassists')
}

async function getTopYellowCards() {
  return apiFetch('players/topyellowcards')
}

async function getTopRedCards() {
  return apiFetch('players/topredcards')
}

function normalizeTopPlayers(apiData, category) {
  if (!Array.isArray(apiData)) return []
  return apiData.slice(0, 10).map((item, idx) => {
    const stats = item.statistics?.[0] ?? {}
    let value = 0
    if (category === 'goals')   value = stats.goals?.total    ?? 0
    if (category === 'assists') value = stats.goals?.assists   ?? 0
    if (category === 'yellow')  value = stats.cards?.yellow    ?? 0
    if (category === 'red')     value = stats.cards?.red       ?? 0
    return {
      rank:   idx + 1,
      name:   item.player?.name           ?? 'Okänd',
      nation: item.player?.nationality    ?? '',
      value,
    }
  })
}

async function getTopPlayersAll() {
  const [scorers, assists, yellow, red] = await Promise.allSettled([
    getTopScorers(),
    getTopAssists(),
    getTopYellowCards(),
    getTopRedCards(),
  ])
  return {
    scorers: scorers.status === 'fulfilled' ? normalizeTopPlayers(scorers.value, 'goals') : [],
    assists: assists.status === 'fulfilled' ? normalizeTopPlayers(assists.value, 'assists') : [],
    yellow:  yellow.status  === 'fulfilled' ? normalizeTopPlayers(yellow.value, 'yellow') : [],
    red:     red.status     === 'fulfilled' ? normalizeTopPlayers(red.value, 'red') : [],
  }
}

async function syncMatchResults() {
  const fixtures = await getFixtures()
  if (!Array.isArray(fixtures)) {
    throw new Error('getFixtures() returnerade inte en array.')
  }

  const mapping = matchApiToAppId(fixtures, APP_MATCHES_FLAT)
  const rows = Object.entries(mapping)
    .filter(([, f]) => (f.fixture?.status?.short ?? 'NS') === 'FT')
    .map(([appMatchId, f]) => ({
      match_id:   appMatchId,
      api_id:     f.fixture.id,
      home_goals: f.goals?.home ?? null,
      away_goals: f.goals?.away ?? null,
      status:     f.fixture.status?.short ?? null,
      updated_at: new Date().toISOString(),
    }))

  if (rows.length === 0) {
    console.log('Ingen färdigmatchad fixture att uppdatera.')
    return
  }

  const { error } = await supabase
    .from('match_results')
    .upsert(rows, { onConflict: 'match_id' })

  if (error) throw error
  console.log(`Synkade ${rows.length} matchresultat till Supabase.`)
}

async function syncPlayerStats() {
  const all = await getTopPlayersAll()
  const categories = [
    ['scorer', 'scorers'],
    ['assist',  'assists'],
    ['yellow',  'yellow'],
    ['red',     'red'],
  ]

  for (const [cat, key] of categories) {
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

    if (error) throw error
    console.log(`Synkade ${rows.length} spelarstatistikrader för kategori ${cat}.`)
  }
}

async function main() {
  try {
    console.log('Startar server-side API-Football synk...')
    await syncMatchResults()
    await syncPlayerStats()
    console.log('Server-side synk slutförd.')
  } catch (error) {
    console.error('Synk-fel:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

main()
