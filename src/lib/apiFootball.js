// API-Football (api-sports.io) – hämtar riktiga matchresultat för VM 2026
// Dokumentation: https://www.api-football.com/documentation-v3

const API_KEY  = import.meta.env.VITE_API_FOOTBALL_KEY
const BASE_URL = 'https://v3.football.api-sports.io'
const VM_2026_LEAGUE_ID = 1    // FIFA World Cup
const VM_2026_SEASON    = 2026

// Cache i minnet för att minska API-anrop (250 req/dag på gratis-tier)
const cache = new Map()

async function apiFetch(endpoint, params = {}) {
  const query  = new URLSearchParams({ league: VM_2026_LEAGUE_ID, season: VM_2026_SEASON, ...params })
  const url    = `${BASE_URL}/${endpoint}?${query}`
  const cacheKey = url

  if (cache.has(cacheKey)) return cache.get(cacheKey)

  const res = await fetch(url, {
    headers: {
      'x-apisports-key': API_KEY,
      'x-rapidapi-host': 'v3.football.api-sports.io',
    },
  })

  if (!res.ok) throw new Error(`API-Football fel: ${res.status}`)
  const json = await res.json()

  // Kontrollera API-quotan
  const remaining = res.headers.get('x-ratelimit-requests-remaining')
  if (remaining !== null && parseInt(remaining) < 10) {
    console.warn(`API-Football: ${remaining} anrop kvar idag`)
  }

  cache.set(cacheKey, json.response)
  return json.response
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

// ─── Slutspelsmatcher från API-Football ──────────────────────────────────────
// Hämtar faktiska knockout-fixtures och returnerar { matchId: { t1, t2 } }
// för att fylla i bracket med riktiga lag efter gruppspelet.
// API-Football round-format: "Round of 32", "Round of 16", etc.

const ROUND_LABELS = {
  'R32': 'Round of 32',
  'R16': 'Round of 16',
  'QF':  'Quarter-finals',
  'SF':  'Semi-finals',
  'F':   'Final',
}

// Hämtar faktiska slutspelsfixtures från API-Football.
// Returnerar { R32: [...], R16: [...], QF: [...], SF: [...], F: [...] }
// där varje lista är sorterad kronologiskt.
// Returnerar {} om data ej finns ännu (grupper ej klara).

export async function getKnockoutFixtures() {
  const CACHE_KEY = 'knockoutFixtures'
  const TTL_MS    = 60 * 60 * 1000  // 1h cache

  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY))
    if (cached && Date.now() - cached.timestamp < TTL_MS) return cached.data
  } catch { /* ignorera */ }

  const fixtures = await apiFetch('fixtures')
  if (!Array.isArray(fixtures)) return {}

  const rounds = {}
  for (const f of fixtures) {
    const apiRound = f.league?.round ?? ''
    const roundId  = Object.entries(ROUND_LABELS).find(([, lbl]) => apiRound === lbl)?.[0]
    if (!roundId) continue

    if (!rounds[roundId]) rounds[roundId] = []
    rounds[roundId].push({
      apiId:    f.fixture.id,
      dt:       f.fixture.date?.slice(0, 16) ?? null,  // "2026-06-29T21:00"
      status:   f.fixture.status?.short ?? 'NS',        // NS/1H/HT/2H/FT
      homeName: f.teams.home.name,
      awayName: f.teams.away.name,
      homeLogo: f.teams.home.logo,
      awayLogo: f.teams.away.logo,
      homeGoals: f.goals?.home ?? null,
      awayGoals: f.goals?.away ?? null,
    })
  }

  // Sortera kronologiskt inom varje runda
  for (const list of Object.values(rounds)) {
    list.sort((a, b) => (a.dt ?? '').localeCompare(b.dt ?? ''))
  }

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data: rounds, timestamp: Date.now() }))
  } catch { /* ignorera */ }

  return rounds
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
    status:    f.fixture.status.short,  // NS/1H/HT/2H/FT etc.
    homeTeam:  f.teams.home.name,
    awayTeam:  f.teams.away.name,
    homeGoals: f.goals.home,
    awayGoals: f.goals.away,
    // Härledd 1X2-vinst för poängberäkning
    result:    f.goals.home == null ? null
               : f.goals.home > f.goals.away ? '1'
               : f.goals.home < f.goals.away ? '2'
               : 'X',
  }))
}

// ─── Matcha API-fixture mot appens matchId ────────────────────────────────────
// Används för att räkna ut om ett tips var rätt

export function matchApiToAppId(apiFixtures, appMatches) {
  const result = {}
  for (const appMatch of appMatches) {
    const home = appMatch.home
    const away = appMatch.away
    // Hitta motsvarande API-fixture via lag och datum
    const apiFix = apiFixtures.find(f => {
      const h = f.teams.home.name.toLowerCase()
      const a = f.teams.away.name.toLowerCase()
      return (h.includes(home.toLowerCase()) || home.toLowerCase().includes(h)) &&
             (a.includes(away.toLowerCase()) || away.toLowerCase().includes(a))
    })
    if (apiFix) result[appMatch.id] = apiFix
  }
  return result
}
