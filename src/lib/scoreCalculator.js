// ─── Turneringsstart (svensk sommartid CEST = UTC+2) ─────────────────────────
export const TOURNAMENT_START = new Date("2026-06-11T21:00:00+02:00")

// Alla VM-matcher spelas under CEST (juni–juli 2026).
// Om dt-strängen redan innehåller tidszon används den direkt.
export function parseMatchTime(dt) {
  if (!dt) return new Date('')
  const s = String(dt).trim()
  if (/[+-]\d{2}:\d{2}$|Z$/i.test(s)) {
    return new Date(s)
  }
  // Tolkar ofullständig lokal tid som CEST
  return new Date(s + ':00+02:00')
}

// ─── Låsningskontroll ─────────────────────────────────────────────────────────

export function isTournamentStarted() {
  return new Date() >= TOURNAMENT_START
}

export function isMatchLocked(dt) {
  return new Date() >= parseMatchTime(dt)
}

// ─── Nedräkning per match ─────────────────────────────────────────────────────
// Returnerar null om matchen redan är låst eller mer än 7 dagar bort

export function getCountdown(dt) {
  const diff = parseMatchTime(dt) - new Date()
  if (diff <= 0) return null

  const totalMinutes = Math.floor(diff / 60000)
  const totalHours   = Math.floor(diff / 3600000)
  const days         = Math.floor(totalHours / 24)

  // Visa ingen nedräkning för matcher mer än 7 dagar bort
  if (days >= 7) return null

  if (days >= 2)  return `${days}d ${totalHours % 24}h`
  if (days === 1) return `1d ${totalHours % 24}h`
  if (totalHours >= 1) return `${totalHours}h ${totalMinutes % 60}min`
  if (totalMinutes > 0) return `${totalMinutes}min`
  return 'Strax'
}

// Avgör om matchen startar inom X minuter (för urgent-highlight)
export function isMatchSoon(dt, withinMinutes = 60) {
  const diff = parseMatchTime(dt) - new Date()
  return diff > 0 && diff <= withinMinutes * 60000
}

// ─── Poängberäkning ───────────────────────────────────────────────────────────

// Matchpoäng: null-tips ger automatiskt 0 – kasserar ALDRIG error
export function calcMatchPoints(tip, actualResult) {
  if (!tip || !actualResult) return 0   // missad match = 0, ej diskvalificering
  return tip === actualResult ? 3 : 0   // 3p per rätt 1X2
}

// Spelarpoäng – beräknas enbart på API-data, OBEROENDE av matchresultat
// null-tips för en match påverkar aldrig spelarpoängen
const PLAYER_POINTS = { scorer: 10, assist: 12, yellow: 8, red: 10 }

export function calcPlayerPoints(category, userPlayerName, apiWinnerName) {
  if (!userPlayerName || !apiWinnerName) return 0
  return userPlayerName.toLowerCase() === apiWinnerName.toLowerCase()
    ? (PLAYER_POINTS[category] ?? 0)
    : 0
}

// Totalpoäng: matchresultat + spelarprediktion
// actualResults:     { matchId: '1'|'X'|'2' } (från API-Football)
// playerPredictions: { scorer, assist, yellow, red } – spelarnamn
// apiStats:          { scorer, assist, yellow, red } – faktiska vinnare
export function calcTotalScore(groupTips, actualResults, playerPredictions, apiStats) {
  let total = 0

  // Matchpoäng 3p/rätt 1X2 (null-safe)
  for (const [matchId, tip] of Object.entries(groupTips)) {
    total += calcMatchPoints(tip, actualResults?.[matchId] ?? null)
  }

  // Spelarpoäng (oberoende av matchresultat)
  if (playerPredictions && apiStats) {
    for (const cat of ['scorer', 'assist', 'yellow', 'red']) {
      total += calcPlayerPoints(cat, playerPredictions[cat]?.name, apiStats[cat])
    }
  }

  return total
}

// ─── VM-vinnare: 20p för rätt lag ────────────────────────────────────────────
// vmWinner:     string | null  – användarens tippade lagnamn
// actualWinner: string | null  – faktisk vinnare från API-Football
export function calcVMWinnerPoints(vmWinner, actualWinner) {
  if (!vmWinner || !actualWinner) return 0
  return vmWinner.toLowerCase() === actualWinner.toLowerCase() ? 20 : 0
}
