// API-Football (api-sports.io) – hämtar riktiga matchresultat för VM 2026
// Dokumentation: https://www.api-football.com/documentation-v3

import { TEAMS } from '../worldcup/data.js'

const API_KEY  = import.meta.env.VITE_API_FOOTBALL_KEY
const BASE_URL = 'https://v3.football.api-sports.io'
const VM_2026_LEAGUE_ID = 1    // FIFA World Cup
const VM_2026_SEASON    = 2026

// Cache i minnet för att minska API-anrop (250 req/dag på gratis-tier)
const cache = new Map()

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function apiFetch(endpoint, params = {}) {
  if (!API_KEY) {
    throw new Error('API-Football nyckel saknas. Ställ in VITE_API_FOOTBALL_KEY i miljön.')
  }

  const query  = new URLSearchParams({ league: VM_2026_LEAGUE_ID, season: VM_2026_SEASON, ...params })
  const url    = `${BASE_URL}/${endpoint}?${query}`
  const cacheKey = url

  if (cache.has(cacheKey)) return cache.get(cacheKey)

  const maxAttempts = 3
  let attempt = 0

  while (attempt < maxAttempts) {
    attempt += 1
    try {
      const res = await fetch(url, {
        headers: {
          'x-apisports-key': API_KEY,
          'x-rapidapi-host': 'v3.football.api-sports.io',
        },
      })

      if (res.ok) {
        const json = await res.json()
        const remaining = res.headers.get('x-ratelimit-requests-remaining')
        if (remaining !== null && parseInt(remaining, 10) < 10) {
          console.warn(`API-Football: ${remaining} anrop kvar idag`)
        }
        cache.set(cacheKey, json.response)
        return json.response
      }

      if (res.status === 401 || res.status === 403) {
        throw new Error(`API-Football auktorisering misslyckades (${res.status}). Kontrollera VITE_API_FOOTBALL_KEY.`)
      }

      if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts) {
        const retryAfter = parseInt(res.headers.get('retry-after') ?? '', 10)
        const delay = Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000 * 2 ** (attempt - 1)
        await sleep(delay)
        continue
      }

      throw new Error(`API-Football fel: ${res.status}`)
    } catch (err) {
      if (attempt >= maxAttempts) throw err
      if (err instanceof Error && /auktorisering misslyckades|401|403/.test(err.message)) throw err
      await sleep(1000 * 2 ** (attempt - 1))
    }
  }

  throw new Error('API-Football misslyckades efter flera försök')
}

// ─── Lagloggor ────────────────────────────────────────────────────────────────

// Mappning: API-Football engelska namn → appens svenska namn
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

// Hämtar laglista för VM 2026 och returnerar { "Sverige": logoUrl, ... }
// Cachelagras i localStorage med 24h giltighetstid
export async function fetchTeamLogos() {
  const CACHE_KEY = 'teamLogos'
  const TTL_MS    = 24 * 60 * 60 * 1000  // 24 timmar

  // Kolla om giltig cache finns
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY))
    if (cached && Date.now() - cached.timestamp < TTL_MS) {
      return cached.data
    }
  } catch { /* ignorera korrupt cache */ }

  // Hämta från API
  const teams = await apiFetch('teams')
  if (!Array.isArray(teams)) return {}

  // Bygg { svensktNamn: logoUrl }
  const logoMap = {}
  for (const item of teams) {
    const apiName  = item.team?.name ?? ''
    const logoUrl  = item.team?.logo ?? null
    if (!logoUrl) continue

    // Försök matcha mot svensk namnmappning, annars använd API-namnet direkt
    const swedishName = API_TO_SWEDISH[apiName] ?? apiName
    logoMap[swedishName] = logoUrl

    // Spara även originalet för robusthet
    if (apiName !== swedishName) logoMap[apiName] = logoUrl
  }

  // Lagra i localStorage
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data: logoMap, timestamp: Date.now() }))
  } catch { /* ignorera om localStorage är full */ }

  return logoMap
}

// ─── Matchschema ──────────────────────────────────────────────────────────────

// Hämta alla VM 2026-matcher
export async function getFixtures() {
  return apiFetch('fixtures')
}

// Hämta live-matcher just nu
export async function getLiveFixtures() {
  return apiFetch('fixtures', { live: 'all' })
}

// Hämta resultat för en specifik match
export async function getFixtureById(fixtureId) {
  return apiFetch('fixtures', { id: fixtureId })
}

// ─── Spelarstatistik ──────────────────────────────────────────────────────────

// Toppskytt i VM 2026
export async function getTopScorers() {
  return apiFetch('players/topscorers')
}

// Toppassare
export async function getTopAssists() {
  return apiFetch('players/topassists')
}

// Mest gula kort
export async function getTopYellowCards() {
  return apiFetch('players/topyellowcards')
}

// Mest röda kort
export async function getTopRedCards() {
  return apiFetch('players/topredcards')
}

// ─── Grupptabeller ────────────────────────────────────────────────────────────

export async function getStandings() {
  return apiFetch('standings')
}

// ─── Normalisera spelarstatistik från API-Football ───────────────────────────
// category: 'goals' | 'assists' | 'yellow' | 'red'
// Returnerar topp 10 som { rank, name, nation, value }

export function normalizeTopPlayers(apiData, category) {
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
      photo:  item.player?.photo          ?? null,
      value,
    }
  })
}

// Hämta alla fyra livetabeller parallellt
export async function getTopPlayersAll() {
  const [scorers, assists, yellow, red] = await Promise.allSettled([
    getTopScorers(),
    getTopAssists(),
    getTopYellowCards(),
    getTopRedCards(),
  ])
  return {
    scorers: normalizeTopPlayers(scorers.status === 'fulfilled' ? scorers.value : [], 'goals'),
    assists: normalizeTopPlayers(assists.status === 'fulfilled' ? assists.value : [], 'assists'),
    yellow:  normalizeTopPlayers(yellow.status  === 'fulfilled' ? yellow.value  : [], 'yellow'),
    red:     normalizeTopPlayers(red.status     === 'fulfilled' ? red.value     : [], 'red'),
  }
}

// ─── Normalisera matchresultat till appens format ─────────────────────────────
// Omvandlar API-Football-svar till { matchId, homeGoals, awayGoals, status }

export function normalizeFixtures(fixtures) {
  return fixtures.map(f => ({
    apiId:     f.fixture.id,
    date:      f.fixture.date,
    status:    f.fixture.status?.short,  // NS/1H/HT/2H/FT etc.
    homeTeam:  f.teams.home.name,
    awayTeam:  f.teams.away.name,
    homeGoals: f.goals?.home,
    awayGoals: f.goals?.away,
    // Härledd 1X2-vinst för poängberäkning
    result:    f.goals?.home == null ? null
               : f.goals?.home > f.goals?.away ? '1'
               : f.goals?.home < f.goals?.away ? '2'
               : 'X',
  }))
}

// ─── Matcha API-fixture mot appens matchId ────────────────────────────────────
// Används för att räkna ut om ett tips var rätt

const normalizeId = str => String(str ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

export function matchApiToAppId(apiFixtures, appMatches) {
  const result = {}
  for (const appMatch of appMatches) {
    const appHomeName = normalizeId(TEAMS[appMatch.home]?.name ?? appMatch.home)
    const appAwayName = normalizeId(TEAMS[appMatch.away]?.name ?? appMatch.away)
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
