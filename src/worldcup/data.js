// ─── 48 lag ───────────────────────────────────────────────────────────────────
// iso2 = flag-icons CSS-kod

export const TEAMS = {
  MEX:{id:'MEX',name:'Mexiko',         iso2:'mx'    }, ZAF:{id:'ZAF',name:'Sydafrika',      iso2:'za'    },
  KOR:{id:'KOR',name:'Sydkorea',        iso2:'kr'    }, CZE:{id:'CZE',name:'Tjeckien',        iso2:'cz'    },
  SUI:{id:'SUI',name:'Schweiz',         iso2:'ch'    }, BIH:{id:'BIH',name:'Bosnien',         iso2:'ba'    },
  CAN:{id:'CAN',name:'Kanada',          iso2:'ca'    }, QAT:{id:'QAT',name:'Qatar',           iso2:'qa'    },
  SCO:{id:'SCO',name:'Skottland',       iso2:'gb-sct'}, BRA:{id:'BRA',name:'Brasilien',       iso2:'br'    },
  HAI:{id:'HAI',name:'Haiti',           iso2:'ht'    }, MAR:{id:'MAR',name:'Marocko',         iso2:'ma'    },
  TUR:{id:'TUR',name:'Turkiet',         iso2:'tr'    }, PAR:{id:'PAR',name:'Paraguay',        iso2:'py'    },
  USA:{id:'USA',name:'USA',             iso2:'us'    }, AUS:{id:'AUS',name:'Australien',      iso2:'au'    },
  GER:{id:'GER',name:'Tyskland',        iso2:'de'    }, ECU:{id:'ECU',name:'Ecuador',         iso2:'ec'    },
  CIV:{id:'CIV',name:'Elfenbenskusten',iso2:'ci'    }, CUW:{id:'CUW',name:'Curaçao',          iso2:'cw'    },
  SWE:{id:'SWE',name:'Sverige',         iso2:'se'    }, NED:{id:'NED',name:'Nederländerna',   iso2:'nl'    },
  TUN:{id:'TUN',name:'Tunisien',        iso2:'tn'    }, JPN:{id:'JPN',name:'Japan',           iso2:'jp'    },
  BEL:{id:'BEL',name:'Belgien',         iso2:'be'    }, EGY:{id:'EGY',name:'Egypten',         iso2:'eg'    },
  IRN:{id:'IRN',name:'Iran',            iso2:'ir'    }, NZL:{id:'NZL',name:'Nya Zeeland',     iso2:'nz'    },
  ESP:{id:'ESP',name:'Spanien',         iso2:'es'    }, URU:{id:'URU',name:'Uruguay',         iso2:'uy'    },
  CPV:{id:'CPV',name:'Kap Verde',       iso2:'cv'    }, SAU:{id:'SAU',name:'Saudiarabien',    iso2:'sa'    },
  FRA:{id:'FRA',name:'Frankrike',       iso2:'fr'    }, NOR:{id:'NOR',name:'Norge',           iso2:'no'    },
  SEN:{id:'SEN',name:'Senegal',         iso2:'sn'    }, IRQ:{id:'IRQ',name:'Irak',            iso2:'iq'    },
  AUT:{id:'AUT',name:'Österrike',       iso2:'at'    }, ARG:{id:'ARG',name:'Argentina',       iso2:'ar'    },
  ALG:{id:'ALG',name:'Algeriet',        iso2:'dz'    }, JOR:{id:'JOR',name:'Jordanien',       iso2:'jo'    },
  POR:{id:'POR',name:'Portugal',        iso2:'pt'    }, COL:{id:'COL',name:'Colombia',        iso2:'co'    },
  COD:{id:'COD',name:'Kongo',           iso2:'cd'    }, UZB:{id:'UZB',name:'Uzbekistan',      iso2:'uz'    },
  CRO:{id:'CRO',name:'Kroatien',        iso2:'hr'    }, ENG:{id:'ENG',name:'England',         iso2:'gb-eng'},
  GHA:{id:'GHA',name:'Ghana',           iso2:'gh'    }, PAN:{id:'PAN',name:'Panama',          iso2:'pa'    },
}

// ─── 12 grupper ───────────────────────────────────────────────────────────────

export const GROUPS = [
  {id:'A',name:'Grupp A',teams:['MEX','ZAF','KOR','CZE']},
  {id:'B',name:'Grupp B',teams:['SUI','BIH','CAN','QAT']},
  {id:'C',name:'Grupp C',teams:['SCO','BRA','HAI','MAR']},
  {id:'D',name:'Grupp D',teams:['TUR','PAR','USA','AUS']},
  {id:'E',name:'Grupp E',teams:['GER','ECU','CIV','CUW']},
  {id:'F',name:'Grupp F',teams:['SWE','NED','TUN','JPN']},
  {id:'G',name:'Grupp G',teams:['BEL','EGY','IRN','NZL']},
  {id:'H',name:'Grupp H',teams:['ESP','URU','CPV','SAU']},
  {id:'I',name:'Grupp I',teams:['FRA','NOR','SEN','IRQ']},
  {id:'J',name:'Grupp J',teams:['AUT','ARG','ALG','JOR']},
  {id:'K',name:'Grupp K',teams:['POR','COL','COD','UZB']},
  {id:'L',name:'Grupp L',teams:['CRO','ENG','GHA','PAN']},
]

// ─── 72 matcher – dt = ISO-datetime för kronologisk sortering ─────────────────
// Varje grupp: 6 unika parningar (alla kombinationer av 4 lag)
// Omgång 3-matcher delar samma dt (simultana gruppfinaler)

export const MATCHES_BY_GROUP = {
  A:[
    {id:'A1',dt:'2026-06-11T21:00',home:'MEX',away:'ZAF'},
    {id:'A2',dt:'2026-06-12T04:00',home:'KOR',away:'CZE'},
    {id:'A3',dt:'2026-06-18T18:00',home:'CZE',away:'ZAF'},
    {id:'A4',dt:'2026-06-19T03:00',home:'MEX',away:'KOR'},
    {id:'A5',dt:'2026-06-25T03:00',home:'CZE',away:'MEX'},
    {id:'A6',dt:'2026-06-25T03:00',home:'ZAF',away:'KOR'},
  ],
  B:[
    {id:'B1',dt:'2026-06-12T21:00',home:'CAN',away:'BIH'},
    {id:'B2',dt:'2026-06-13T21:00',home:'QAT',away:'SUI'},
    {id:'B3',dt:'2026-06-18T21:00',home:'SUI',away:'BIH'},
    {id:'B4',dt:'2026-06-19T00:00',home:'CAN',away:'QAT'},
    {id:'B5',dt:'2026-06-24T21:00',home:'SUI',away:'CAN'},
    {id:'B6',dt:'2026-06-24T21:00',home:'BIH',away:'QAT'},
  ],
  C:[
    {id:'C1',dt:'2026-06-14T00:00',home:'BRA',away:'MAR'},
    {id:'C2',dt:'2026-06-14T03:00',home:'HAI',away:'SCO'},
    {id:'C3',dt:'2026-06-20T00:00',home:'SCO',away:'MAR'},
    {id:'C4',dt:'2026-06-20T03:00',home:'BRA',away:'HAI'},
    {id:'C5',dt:'2026-06-25T00:00',home:'SCO',away:'BRA'},
    {id:'C6',dt:'2026-06-25T00:00',home:'MAR',away:'HAI'},
  ],
  D:[
    {id:'D1',dt:'2026-06-13T03:00',home:'USA',away:'PAR'},
    {id:'D2',dt:'2026-06-14T06:00',home:'AUS',away:'TUR'},
    {id:'D3',dt:'2026-06-19T21:00',home:'USA',away:'AUS'},
    {id:'D4',dt:'2026-06-20T05:00',home:'TUR',away:'PAR'},
    {id:'D5',dt:'2026-06-26T04:00',home:'PAR',away:'AUS'},
    {id:'D6',dt:'2026-06-26T04:00',home:'TUR',away:'USA'},
  ],
  E:[
    {id:'E1',dt:'2026-06-14T19:00',home:'GER',away:'CUW'},
    {id:'E2',dt:'2026-06-15T01:00',home:'CIV',away:'ECU'},
    {id:'E3',dt:'2026-06-20T22:00',home:'GER',away:'CIV'},
    {id:'E4',dt:'2026-06-21T02:00',home:'ECU',away:'CUW'},
    {id:'E5',dt:'2026-06-25T22:00',home:'ECU',away:'GER'},
    {id:'E6',dt:'2026-06-25T22:00',home:'CUW',away:'CIV'},
  ],
  F:[
    {id:'F1',dt:'2026-06-14T22:00',home:'NED',away:'JPN'},
    {id:'F2',dt:'2026-06-15T04:00',home:'SWE',away:'TUN'},
    {id:'F3',dt:'2026-06-20T19:00',home:'NED',away:'SWE',note:'Midsommar 🌼'},
    {id:'F4',dt:'2026-06-21T06:00',home:'TUN',away:'JPN'},
    {id:'F5',dt:'2026-06-26T01:00',home:'JPN',away:'SWE'},
    {id:'F6',dt:'2026-06-26T01:00',home:'TUN',away:'NED'},
  ],
  G:[
    {id:'G1',dt:'2026-06-15T21:00',home:'BEL',away:'EGY'},
    {id:'G2',dt:'2026-06-16T03:00',home:'IRN',away:'NZL'},
    {id:'G3',dt:'2026-06-21T21:00',home:'BEL',away:'IRN'},
    {id:'G4',dt:'2026-06-22T03:00',home:'NZL',away:'EGY'},
    {id:'G5',dt:'2026-06-27T05:00',home:'EGY',away:'IRN'},
    {id:'G6',dt:'2026-06-27T05:00',home:'NZL',away:'BEL'},
  ],
  H:[
    {id:'H1',dt:'2026-06-15T18:00',home:'ESP',away:'CPV'},
    {id:'H2',dt:'2026-06-16T00:00',home:'SAU',away:'URU'},
    {id:'H3',dt:'2026-06-21T18:00',home:'ESP',away:'SAU'},
    {id:'H4',dt:'2026-06-22T00:00',home:'URU',away:'CPV'},
    {id:'H5',dt:'2026-06-27T02:00',home:'URU',away:'ESP'},
    {id:'H6',dt:'2026-06-27T02:00',home:'CPV',away:'SAU'},
  ],
  I:[
    {id:'I1',dt:'2026-06-16T21:00',home:'FRA',away:'SEN'},
    {id:'I2',dt:'2026-06-17T00:00',home:'IRQ',away:'NOR'},
    {id:'I3',dt:'2026-06-22T23:00',home:'FRA',away:'IRQ'},
    {id:'I4',dt:'2026-06-23T02:00',home:'NOR',away:'SEN'},
    {id:'I5',dt:'2026-06-26T21:00',home:'NOR',away:'FRA'},
    {id:'I6',dt:'2026-06-26T21:00',home:'SEN',away:'IRQ'},
  ],
  J:[
    {id:'J1',dt:'2026-06-17T03:00',home:'ARG',away:'ALG'},
    {id:'J2',dt:'2026-06-17T06:00',home:'AUT',away:'JOR'},
    {id:'J3',dt:'2026-06-22T19:00',home:'ARG',away:'AUT'},
    {id:'J4',dt:'2026-06-23T05:00',home:'JOR',away:'ALG'},
    {id:'J5',dt:'2026-06-28T04:00',home:'ALG',away:'AUT'},
    {id:'J6',dt:'2026-06-28T04:00',home:'JOR',away:'ARG'},
  ],
  K:[
    {id:'K1',dt:'2026-06-17T19:00',home:'POR',away:'COD'},
    {id:'K2',dt:'2026-06-18T04:00',home:'UZB',away:'COL'},
    {id:'K3',dt:'2026-06-23T19:00',home:'POR',away:'UZB'},
    {id:'K4',dt:'2026-06-24T04:00',home:'COL',away:'COD'},
    {id:'K5',dt:'2026-06-28T01:30',home:'COL',away:'POR'},
    {id:'K6',dt:'2026-06-28T01:30',home:'COD',away:'UZB'},
  ],
  L:[
    {id:'L1',dt:'2026-06-17T22:00',home:'ENG',away:'CRO'},
    {id:'L2',dt:'2026-06-18T01:00',home:'GHA',away:'PAN'},
    {id:'L3',dt:'2026-06-23T22:00',home:'ENG',away:'GHA'},
    {id:'L4',dt:'2026-06-24T01:00',home:'PAN',away:'CRO'},
    {id:'L5',dt:'2026-06-28T21:00',home:'CRO',away:'GHA'},
    {id:'L6',dt:'2026-06-28T21:00',home:'PAN',away:'ENG'},
  ],
}

export const ALL_MATCHES   = Object.values(MATCHES_BY_GROUP).flat()
export const TOTAL_MATCHES = ALL_MATCHES.length  // 72

// ─── Formatera ISO-datetime → "11 jun 21:00" ─────────────────────────────────

export function formatDt(dt) {
  const day   = parseInt(dt.slice(8, 10))
  const month = parseInt(dt.slice(5, 7))
  const time  = dt.slice(11)
  const names = { 6:'jun', 7:'jul' }
  return `${day} ${names[month] ?? ''} ${time}`
}

// ─── Beräkna grupptabell från 1X2-tipsresultat ───────────────────────────────

export function calcStandings(groupId, tips) {
  const group = GROUPS.find(g => g.id === groupId)
  const order = Object.fromEntries(group.teams.map((id, i) => [id, i]))
  const stats = Object.fromEntries(
    group.teams.map(id => [id, {id, pts:0, w:0, d:0, l:0, played:0}])
  )
  for (const m of MATCHES_BY_GROUP[groupId]) {
    const t = tips[m.id]
    if (!t) continue
    stats[m.home].played++
    stats[m.away].played++
    if      (t === '1') { stats[m.home].pts+=3; stats[m.home].w++; stats[m.away].l++ }
    else if (t === 'X') { stats[m.home].pts++;  stats[m.away].pts++; stats[m.home].d++; stats[m.away].d++ }
    else if (t === '2') { stats[m.away].pts+=3; stats[m.away].w++; stats[m.home].l++ }
  }
  return Object.values(stats).sort((a,b) =>
    b.pts !== a.pts ? b.pts - a.pts : order[a.id] - order[b.id]
  )
}

// ─── Kvalificerade lag: topp 2 per grupp + 8 bästa tredjeplatserna ───────────

export function getQualifiers(tips) {
  const byGroup = Object.fromEntries(GROUPS.map(g => [g.id, calcStandings(g.id, tips)]))
  const firsts  = GROUPS.map(g => ({...(byGroup[g.id][0] ?? {id:null,pts:0}), group:g.id}))
  const seconds = GROUPS.map(g => ({...(byGroup[g.id][1] ?? {id:null,pts:0}), group:g.id}))
  const thirds  = GROUPS
    .map(g => ({...(byGroup[g.id][2] ?? {id:null,pts:0}), group:g.id}))
    .sort((a,b) => b.pts - a.pts)
  return { firsts, seconds, wildcards: thirds.slice(0,8), thirds }
}


// ─── Mock världsranking ───────────────────────────────────────────────────────

export const APP_MATCHES_FLAT = Object.values(MATCHES_BY_GROUP).flat()

// ─── Mock världsranking ───────────────────────────────────────────────────────

export const MOCK_LEADERBOARD = [
  {id:1, name:'Carlos M.',  country:'🇧🇷', pts:198},
  {id:2, name:'Sophie L.',  country:'🇫🇷', pts:184},
  {id:3, name:'Lars E.',    country:'🇸🇪', pts:171},
  {id:4, name:'Hiroshi T.', country:'🇯🇵', pts:159},
  {id:5, name:'Ana García', country:'🇪🇸', pts:152},
  {id:6, name:'Mike O.',    country:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', pts:144},
  {id:7, name:'Pedro A.',   country:'🇦🇷', pts:137},
  {id:8, name:'Emma S.',    country:'🇸🇪', pts:130},
  {id:9, name:'Hans M.',    country:'🇩🇪', pts:124},
  {id:10,name:'Fatima B.',  country:'🇲🇦', pts:118},
]
