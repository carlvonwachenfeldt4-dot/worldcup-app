import { useState, useEffect, useCallback, useRef } from 'react'
import Flag from './Flag'
import { isTournamentStarted } from '../lib/scoreCalculator'
import { getTopPlayersAll } from '../lib/apiFootball'
import { savePlayerPrediction, loadPlayerPredictions, fetchPlayerStats } from '../lib/supabase'

// ─── Nation → iso2-mappning (används av Flag-komponenten med flag-icons SVG:er)
// Löser problemet med att Unicode-flaggemojis visas som textkoder på Windows.
const NATION_ISO2 = {
  'Argentina':       'ar',
  'Portugal':        'pt',
  'Frankrike':       'fr',
  'Norge':           'no',
  'Brasilien':       'br',
  'England':         'gb-eng',  // ← 🏴󠁧󠁢󠁥󠁮󠁧󠁿 ej 🇬🇧
  'Spanien':         'es',
  'Turkiet':         'tr',
  'Mexiko':          'mx',
  'Sydkorea':        'kr',
  'Japan':           'jp',
  'Kanada':          'ca',
  'Elfenbenskusten': 'ci',
  'Ghana':           'gh',
  'Sydafrika':       'za',
  'Qatar':           'qa',
  'Bosnien':         'ba',
  'Colombia':        'co',
  'USA':             'us',
  'Marocko':         'ma',
  'Tyskland':        'de',
  'Sverige':         'se',
  'Kroatien':        'hr',
  'Belgien':         'be',
  'Ecuador':         'ec',
  'Senegal':         'sn',
  'Australien':      'au',
  'Paraguay':        'py',
  'Schweiz':         'ch',
  'Nederländerna':   'nl',
  'Uruguay':         'uy',
  'Iran':            'ir',
  'Österrike':       'at',
}

// ─── Spelardatan (definieras utanför komponenten för att undvika re-renders) ──

const goalScorers = [
  { id:1,  name:'Lionel Messi',        nation:'Argentina',       flag:'🇦🇷', club:'Inter Miami'       },
  { id:2,  name:'Cristiano Ronaldo',   nation:'Portugal',        flag:'🇵🇹', club:'Al-Nassr'           },
  { id:3,  name:'Kylian Mbappé',       nation:'Frankrike',       flag:'🇫🇷', club:'Real Madrid'        },
  { id:4,  name:'Erling Haaland',      nation:'Norge',           flag:'🇳🇴', club:'Manchester City'    },
  { id:5,  name:'Vinícius Jr.',         nation:'Brasilien',       flag:'🇧🇷', club:'Real Madrid'        },
  { id:6,  name:'Raphinha',            nation:'Brasilien',       flag:'🇧🇷', club:'Barcelona'          },
  { id:7,  name:'Harry Kane',          nation:'England',         flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', club:'Bayern München'     },
  { id:8,  name:'Julian Álvarez',      nation:'Argentina',       flag:'🇦🇷', club:'Atlético Madrid'   },
  { id:9,  name:'Ousmane Dembélé',     nation:'Frankrike',       flag:'🇫🇷', club:'PSG'                },
  { id:10, name:'Michael Olise',       nation:'Frankrike',       flag:'🇫🇷', club:'Bayern München'     },
  { id:11, name:'Lamine Yamal',        nation:'Spanien',         flag:'🇪🇸', club:'Barcelona'          },
  { id:12, name:'Luis Díaz',           nation:'Colombia',        flag:'🇨🇴', club:'Liverpool'          },
  { id:13, name:'Christian Pulisic',   nation:'USA',             flag:'🇺🇸', club:'AC Milan'           },
  { id:14, name:'Brahim Díaz',         nation:'Marocko',         flag:'🇲🇦', club:'Real Madrid'        },
  { id:15, name:'Jamal Musiala',       nation:'Tyskland',        flag:'🇩🇪', club:'Bayern München'     },
  { id:16, name:'Florian Wirtz',       nation:'Tyskland',        flag:'🇩🇪', club:'Liverpool'          },
  { id:17, name:'Rafael Leão',         nation:'Portugal',        flag:'🇵🇹', club:'AC Milan'           },
  { id:18, name:'Rodrygo',             nation:'Brasilien',       flag:'🇧🇷', club:'Real Madrid'        },
  { id:19, name:'Marcus Thuram',       nation:'Frankrike',       flag:'🇫🇷', club:'Inter Milan'        },
  { id:20, name:'Kenan Yıldız',        nation:'Turkiet',         flag:'🇹🇷', club:'Juventus'           },
  { id:21, name:'Raúl Jiménez',        nation:'Mexiko',          flag:'🇲🇽', club:'Fulham'             },
  { id:22, name:'Son Heung-min',       nation:'Sydkorea',        flag:'🇰🇷', club:'LAFC'               },
  { id:23, name:'Kaoru Mitoma',        nation:'Japan',           flag:'🇯🇵', club:'Brighton'           },
  { id:24, name:'Jonathan David',      nation:'Kanada',          flag:'🇨🇦', club:'Juventus'           },
  { id:25, name:'Simon Adingra',       nation:'Elfenbenskusten', flag:'🇨🇮', club:'Brighton'           },
  { id:26, name:'Iñaki Williams',      nation:'Ghana',           flag:'🇬🇭', club:'Athletic Bilbao'    },
  { id:27, name:'Percy Tau',           nation:'Sydafrika',       flag:'🇿🇦', club:'Al Ahly'            },
  { id:28, name:'Akram Afif',          nation:'Qatar',           flag:'🇶🇦', club:'Al Sadd'            },
  { id:29, name:'Edin Džeko',          nation:'Bosnien',         flag:'🇧🇦', club:'Schalke 04'         },
  { id:30, name:'Álvaro Morata',       nation:'Spanien',         flag:'🇪🇸', club:'AC Milan'           },
  { id:31, name:'Alexander Isak',      nation:'Sverige',         flag:'🇸🇪', club:'Newcastle'          },
  { id:32, name:'Viktor Gyökeres',     nation:'Sverige',         flag:'🇸🇪', club:'Arsenal'            },
]

const assistProviders = [
  { id:1,  name:'Jude Bellingham',     nation:'England',         flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', club:'Real Madrid'       },
  { id:2,  name:'Declan Rice',         nation:'England',         flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', club:'Arsenal'           },
  { id:3,  name:'Bruno Fernandes',     nation:'Portugal',        flag:'🇵🇹', club:'Manchester United'  },
  { id:4,  name:'Vitinha',             nation:'Portugal',        flag:'🇵🇹', club:'PSG'                },
  { id:5,  name:'João Neves',          nation:'Portugal',        flag:'🇵🇹', club:'PSG'                },
  { id:6,  name:'Pedri',               nation:'Spanien',         flag:'🇪🇸', club:'Barcelona'          },
  { id:7,  name:'Rodri',               nation:'Spanien',         flag:'🇪🇸', club:'Manchester City'    },
  { id:8,  name:'Lamine Yamal',        nation:'Spanien',         flag:'🇪🇸', club:'Barcelona'          },
  { id:9,  name:'Federico Valverde',   nation:'Uruguay',         flag:'🇺🇾', club:'Real Madrid'        },
  { id:10, name:'Xavi Simons',         nation:'Nederländerna',   flag:'🇳🇱', club:'PSG'                },
  { id:11, name:'Kevin De Bruyne',     nation:'Belgien',         flag:'🇧🇪', club:'Manchester City'    },
  { id:12, name:'Enzo Fernández',      nation:'Argentina',       flag:'🇦🇷', club:'Chelsea'            },
  { id:13, name:'Joshua Kimmich',      nation:'Tyskland',        flag:'🇩🇪', club:'Bayern München'     },
  { id:14, name:'Aurélien Tchouaméni', nation:'Frankrike',       flag:'🇫🇷', club:'Real Madrid'        },
  { id:15, name:'Gusto Doué',          nation:'Frankrike',       flag:'🇫🇷', club:'PSG'                },
  { id:16, name:'Raphinha',            nation:'Brasilien',       flag:'🇧🇷', club:'Barcelona'          },
  { id:17, name:'Rodrygo',             nation:'Brasilien',       flag:'🇧🇷', club:'Real Madrid'        },
  { id:18, name:'Vinícius Jr.',         nation:'Brasilien',       flag:'🇧🇷', club:'Real Madrid'        },
  { id:19, name:'Michael Olise',       nation:'Frankrike',       flag:'🇫🇷', club:'Bayern München'     },
  { id:20, name:'Luis Díaz',           nation:'Colombia',        flag:'🇨🇴', club:'Liverpool'          },
  { id:21, name:'Lionel Messi',        nation:'Argentina',       flag:'🇦🇷', club:'Inter Miami'        },
  { id:22, name:'Jamal Musiala',       nation:'Tyskland',        flag:'🇩🇪', club:'Bayern München'     },
  { id:23, name:'Bernardo Silva',      nation:'Portugal',        flag:'🇵🇹', club:'Manchester City'    },
  { id:24, name:'Luka Modrić',         nation:'Kroatien',        flag:'🇭🇷', club:'AC Milan'           },
  { id:25, name:'Gavi',                nation:'Spanien',         flag:'🇪🇸', club:'Barcelona'          },
  { id:26, name:'Cole Palmer',         nation:'England',         flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', club:'Chelsea'           },
  { id:27, name:'Achraf Hakimi',       nation:'Marocko',         flag:'🇲🇦', club:'PSG'                },
  { id:28, name:'Martin Ødegaard',     nation:'Norge',           flag:'🇳🇴', club:'Arsenal'            },
  { id:29, name:'Alphonso Davies',     nation:'Kanada',          flag:'🇨🇦', club:'Bayern München'     },
  { id:30, name:'James Rodríguez',     nation:'Colombia',        flag:'🇨🇴', club:'Rayo Vallecano'     },
  { id:31, name:'Daniel Svensson',     nation:'Sverige',         flag:'🇸🇪', club:'Basel'              },
  { id:32, name:'Dejan Kulusevski',    nation:'Sverige',         flag:'🇸🇪', club:'Tottenham'          },
]

const yellowCardRisk = [
  { id:1,  name:'Casemiro',              nation:'Brasilien',     flag:'🇧🇷', club:'Manchester United' },
  { id:2,  name:'Joshua Kimmich',        nation:'Tyskland',      flag:'🇩🇪', club:'Bayern München'    },
  { id:3,  name:'Aurélien Tchouaméni',   nation:'Frankrike',     flag:'🇫🇷', club:'Real Madrid'       },
  { id:4,  name:'Adrien Rabiot',         nation:'Frankrike',     flag:'🇫🇷', club:'Marseille'         },
  { id:5,  name:'Idrissa Gueye',         nation:'Senegal',       flag:'🇸🇳', club:'Everton'           },
  { id:6,  name:'Granit Xhaka',          nation:'Schweiz',       flag:'🇨🇭', club:'Bayer Leverkusen'  },
  { id:7,  name:'Vinícius Jr.',           nation:'Brasilien',     flag:'🇧🇷', club:'Real Madrid'       },
  { id:8,  name:'Luka Modrić',           nation:'Kroatien',      flag:'🇭🇷', club:'AC Milan'          },
  { id:9,  name:'Enzo Fernández',        nation:'Argentina',     flag:'🇦🇷', club:'Chelsea'           },
  { id:10, name:'Federico Valverde',     nation:'Uruguay',       flag:'🇺🇾', club:'Real Madrid'       },
  { id:11, name:'Rodri',                 nation:'Spanien',       flag:'🇪🇸', club:'Manchester City'   },
  { id:12, name:'Leon Goretzka',         nation:'Tyskland',      flag:'🇩🇪', club:'Bayern München'    },
  { id:13, name:'Hakan Çalhanoğlu',      nation:'Turkiet',       flag:'🇹🇷', club:'Inter Milan'       },
  { id:14, name:'Sofyan Amrabat',        nation:'Marocko',       flag:'🇲🇦', club:'Fiorentina'        },
  { id:15, name:'Weston McKennie',       nation:'USA',           flag:'🇺🇸', club:'Juventus'          },
  { id:16, name:'Moisés Caicedo',        nation:'Ecuador',       flag:'🇪🇨', club:'Chelsea'           },
  { id:17, name:'Nampalys Mendy',        nation:'Senegal',       flag:'🇸🇳', club:'Leicester'         },
  { id:18, name:'Jackson Irvine',        nation:'Australien',    flag:'🇦🇺', club:'FC St. Pauli'      },
  { id:19, name:'Miguel Almirón',        nation:'Paraguay',      flag:'🇵🇾', club:'Newcastle'         },
  { id:20, name:'Frenkie de Jong',       nation:'Nederländerna', flag:'🇳🇱', club:'Barcelona'         },
  { id:21, name:'Rodrigo De Paul',       nation:'Argentina',     flag:'🇦🇷', club:'Atlético Madrid'   },
  { id:22, name:'Mateus Uribe',          nation:'Colombia',      flag:'🇨🇴', club:'Porto'             },
  { id:23, name:'Wataru Endō',           nation:'Japan',         flag:'🇯🇵', club:'Liverpool'         },
  { id:24, name:'Jesper Gudmundsson',    nation:'Sverige',       flag:'🇸🇪', club:'Burnley'           },
  { id:25, name:'Isak Hien',             nation:'Sverige',       flag:'🇸🇪', club:'Atalanta'          },
  { id:26, name:'Héctor Herrera',        nation:'Mexiko',        flag:'🇲🇽', club:'Houston Dynamo'    },
  { id:27, name:'Konrad Laimer',         nation:'Österrike',     flag:'🇦🇹', club:'Bayern München'    },
]

const redCardRisk = [
  { id:1,  name:'Vinícius Jr.',           nation:'Brasilien', flag:'🇧🇷', club:'Real Madrid'       },
  { id:2,  name:'Granit Xhaka',          nation:'Schweiz',   flag:'🇨🇭', club:'Bayer Leverkusen'  },
  { id:3,  name:'Adrien Rabiot',         nation:'Frankrike', flag:'🇫🇷', club:'Marseille'         },
  { id:4,  name:'Enzo Fernández',        nation:'Argentina', flag:'🇦🇷', club:'Chelsea'           },
  { id:5,  name:'Casemiro',              nation:'Brasilien', flag:'🇧🇷', club:'Manchester United' },
  { id:6,  name:'Idrissa Gueye',         nation:'Senegal',   flag:'🇸🇳', club:'Everton'           },
  { id:7,  name:'Federico Valverde',     nation:'Uruguay',   flag:'🇺🇾', club:'Real Madrid'       },
  { id:8,  name:'Hakan Çalhanoğlu',      nation:'Turkiet',   flag:'🇹🇷', club:'Inter Milan'       },
  { id:9,  name:'Sofyan Amrabat',        nation:'Marocko',   flag:'🇲🇦', club:'Fiorentina'        },
  { id:10, name:'Gustavo Gómez',         nation:'Paraguay',  flag:'🇵🇾', club:'Palmeiras'         },
  { id:11, name:'Moisés Caicedo',        nation:'Ecuador',   flag:'🇪🇨', club:'Chelsea'           },
  { id:12, name:'Nicolás Otamendi',      nation:'Argentina', flag:'🇦🇷', club:'Benfica'           },
  { id:13, name:'Morteza Pouraliganji', nation:'Iran',       flag:'🇮🇷', club:'Al-Gharafa'        },
  { id:14, name:'Kalidou Koulibaly',     nation:'Senegal',   flag:'🇸🇳', club:'Al-Hilal'          },
  { id:15, name:'Sergiño Dest',          nation:'USA',       flag:'🇺🇸', club:'PSV'               },
  { id:16, name:'Jesper Gudmundsson',    nation:'Sverige',   flag:'🇸🇪', club:'Burnley'           },
  { id:17, name:'Patrik Hien',           nation:'Sverige',   flag:'🇸🇪', club:'Girona'            },
]

// ─── Kategori-konfiguration ───────────────────────────────────────────────────

const CATEGORIES = [
  { key:'scorer', label:'Flest Mål',        emoji:'🥇', points:10, color:'#F59E0B', players:goalScorers       },
  { key:'assist', label:'Flest Assist',     emoji:'🎯', points:12, color:'#3B82F6', players:assistProviders   },
  { key:'yellow', label:'Flest Gula Kort',  emoji:'🟨', points:8,  color:'#EAB308', players:yellowCardRisk    },
  { key:'red',    label:'Flest Röda Kort',  emoji:'🟥', points:10, color:'#EF4444', players:redCardRisk       },
]

const TOTAL_POINTS = CATEGORIES.reduce((s, c) => s + c.points, 0) // 40

const STORAGE_KEY = 'wc26-player-picks'

// ─── Spelarkort ───────────────────────────────────────────────────────────────

function PlayerCard({ player, selected, color, onSelect }) {
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all active:scale-95"
      style={{
        background: selected ? `${color}18` : 'transparent',
        border:     `1.5px solid ${selected ? color : '#2D3748'}`,
      }}
    >
      {/* Använd Flag-komponenten (SVG via flag-icons) för korrekt visning på Windows */}
      <Flag iso2={NATION_ISO2[player.nation] ?? 'un'} size="md" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: selected ? '#F1F5F9' : '#CBD5E1' }}>
          {player.name}
        </p>
        <p className="text-xs truncate mt-0.5" style={{ color:'#64748B' }}>
          {player.nation} · {player.club}
        </p>
      </div>
      {selected && (
        <span className="text-base shrink-0 font-bold" style={{ color }}>✓</span>
      )}
    </button>
  )
}

// ─── Sökfält ──────────────────────────────────────────────────────────────────

function SearchField({ value, onChange, color }) {
  return (
    <div className="relative mb-3">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color:'#475569' }}>
        🔍
      </span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Sök spelare, nation eller klubb..."
        className="w-full pl-9 pr-9 py-2.5 rounded-xl text-sm outline-none transition-all"
        style={{
          background: '#0F172A',
          border:     `1.5px solid ${value ? color : '#334155'}`,
          color:      '#F1F5F9',
        }}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold transition-colors"
          style={{ color:'#64748B' }}
          onMouseEnter={e => e.currentTarget.style.color='#F1F5F9'}
          onMouseLeave={e => e.currentTarget.style.color='#64748B'}
        >
          ×
        </button>
      )}
    </div>
  )
}

// ─── Enskild kategorisektion (accordion) ─────────────────────────────────────

// isLocked = turneringen har startat → hela sektionen är read-only
function CategorySection({ cat, selection, isConfirmed, isOpen, onToggle,
                            query, onQuery, onSelect, onConfirm, onEdit, isLocked }) {
  const q = query.toLowerCase()
  const filtered = cat.players.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.nation.toLowerCase().includes(q) ||
    p.club.toLowerCase().includes(q)
  )

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background:'#1E293B', border:`1px solid ${isOpen ? cat.color + '40' : '#334155'}` }}
    >
      {/* ─ Rubrik / toggle ─ */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-4 text-left transition-all"
        style={{ background: isOpen ? `${cat.color}0A` : 'transparent' }}
      >
        <span className="text-xl shrink-0">{cat.emoji}</span>
        <div className="flex-1 min-w-0">
          <span className="font-bold text-sm" style={{ color:'#F1F5F9' }}>{cat.label}</span>
          <span
            className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ background:`${cat.color}20`, color:cat.color }}
          >
            {cat.points}p
          </span>
        </div>

        {/* Val-badge när kollapsad och vald */}
        {!isOpen && selection && (
          <span className="flex items-center gap-1.5 text-xs font-semibold shrink-0 mr-2"
                style={{ color: isConfirmed ? cat.color : '#94A3B8' }}>
            <Flag iso2={NATION_ISO2[selection.nation] ?? 'un'} size="sm" />
            <span className="truncate max-w-[80px] hidden sm:block">{selection.name}</span>
            {isConfirmed && <span style={{ color:cat.color }}>✓</span>}
          </span>
        )}

        <span className="text-xs shrink-0" style={{ color:'#64748B' }}>
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {/* ─ Innehåll ─ */}
      {isOpen && (
        <div className="px-4 pb-4" style={{ borderTop:`1px solid #334155` }}>
          <div className="pt-3">

            {/* ─ Turneringen har startat: read-only ─ */}
            {isLocked ? (
              <div
                className="rounded-xl p-4 flex items-center gap-3"
                style={{ background:'rgba(255,255,255,0.03)', border:'1px solid #334155' }}
              >
                {selection ? (
                  <>
                    <Flag iso2={NATION_ISO2[selection.nation] ?? 'un'} size="lg" />
                    <div>
                      <p className="font-semibold text-sm" style={{ color:'#94A3B8' }}>
                        {selection.name}
                      </p>
                      <p className="text-xs" style={{ color:'#475569' }}>
                        {selection.nation} · {selection.club}
                      </p>
                    </div>
                    <span className="ml-auto text-lg">✓</span>
                  </>
                ) : (
                  <p className="text-sm italic" style={{ color:'#475569' }}>
                    Ingen tipsning gjord
                  </p>
                )}
              </div>

            ) : isConfirmed && selection ? (
              /* ─ Bekräftad vy (redigerbar) ─ */
              <div
                className="rounded-xl p-4 flex items-center justify-between gap-3"
                style={{ background:`${cat.color}12`, border:`1.5px solid ${cat.color}40` }}
              >
                <div className="flex items-center gap-3">
                  <Flag iso2={NATION_ISO2[selection.nation] ?? 'un'} size="lg" />
                  <div>
                    <p className="font-bold text-sm" style={{ color:'#F1F5F9' }}>{selection.name}</p>
                    <p className="text-xs" style={{ color:'#94A3B8' }}>
                      {selection.nation} · {selection.club}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xl font-black" style={{ color:cat.color }}>✓</span>
                  <button
                    onClick={onEdit}
                    className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                    style={{ background:'#334155', color:'#94A3B8' }}
                    onMouseEnter={e => e.currentTarget.style.color='#F1F5F9'}
                    onMouseLeave={e => e.currentTarget.style.color='#94A3B8'}
                  >
                    Ändra
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Sökfält */}
                <SearchField value={query} onChange={onQuery} color={cat.color} />

                {/* Antal träffar */}
                <p className="text-xs mb-2 px-1" style={{ color:'#475569' }}>
                  {filtered.length} av {cat.players.length} spelare
                  {query && ` · "${query}"`}
                </p>

                {/* Scrollbar spelarlista */}
                <div
                  className="space-y-1 pr-1 player-list-scroll"
                >
                  {filtered.length > 0 ? (
                    filtered.map(p => (
                      <PlayerCard
                        key={p.id}
                        player={p}
                        selected={selection?.id === p.id}
                        color={cat.color}
                        onSelect={() => onSelect(p)}
                      />
                    ))
                  ) : (
                    <div className="py-8 text-center">
                      <p className="text-3xl mb-2">🔍</p>
                      <p className="text-sm" style={{ color:'#475569' }}>
                        Ingen spelare matchar "{query}"
                      </p>
                    </div>
                  )}
                </div>

                {/* Bekräfta-knapp */}
                <button
                  onClick={onConfirm}
                  disabled={!selection}
                  className="mt-4 w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-95"
                  style={{
                    background: selection ? cat.color : '#1E293B',
                    color:      selection ? '#0F172A' : '#475569',
                    cursor:     selection ? 'pointer' : 'not-allowed',
                    border:     `1px solid ${selection ? 'transparent' : '#334155'}`,
                  }}
                >
                  {selection
                    ? `✓ Bekräfta: ${selection.name}`
                    : 'Välj en spelare för att bekräfta'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sammanfattningskort ──────────────────────────────────────────────────────

function SummaryCard({ selections, confirmed }) {
  const allDone = CATEGORIES.every(c => confirmed[c.key])
  const anyDone = CATEGORIES.some(c => confirmed[c.key])
  if (!anyDone) return null

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: allDone ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.03)',
        border:     `1px solid ${allDone ? 'rgba(245,158,11,0.35)' : '#334155'}`,
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">{allDone ? '🏆' : '📋'}</span>
        <p className="font-bold text-sm" style={{ color:'#F1F5F9' }}>
          {allDone ? 'Alla tipsningar bekräftade!' : 'Dina tipsningar'}
        </p>
      </div>
      <div className="space-y-2">
        {CATEGORIES.map(c => {
          const sel = selections[c.key]
          const ok  = confirmed[c.key]
          return (
            <div key={c.key} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">{c.emoji}</span>
                <span className="text-xs" style={{ color:'#64748B' }}>{c.label}:</span>
                {sel && ok ? (
                  <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color:'#F1F5F9' }}>
                    <Flag iso2={NATION_ISO2[sel.nation] ?? 'un'} size="sm" />
                    <span>{sel.name}</span>
                  </span>
                ) : (
                  <span className="text-xs italic" style={{ color:'#334155' }}>Inte valt</span>
                )}
              </div>
              {ok && (
                <span className="text-xs font-black px-2 py-0.5 rounded-full"
                      style={{ background:`${c.color}20`, color:c.color }}>
                  {c.points}p
                </span>
              )}
            </div>
          )
        })}
      </div>
      {allDone && (
        <div
          className="mt-3 pt-3 flex items-center justify-between"
          style={{ borderTop:'1px solid rgba(245,158,11,0.2)' }}
        >
          <span className="text-sm font-bold" style={{ color:'#F59E0B' }}>
            💰 Max möjliga poäng
          </span>
          <span className="text-xl font-black" style={{ color:'#F59E0B' }}>
            {TOTAL_POINTS}p
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Hook: hämta livetabeller med variabelt pollintervall ────────────────────
// Interval: 5 min 18:00–06:00 (matchfönster), annars 30 min

function useLiveStats(enabled) {
  const [stats,       setStats]       = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [loading,     setLoading]     = useState(false)
  const mounted = useRef(false)

  const fetchAll = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    try {
      const data = await getTopPlayersAll()
      if (!mounted.current) return
      setStats(data)
      setLastUpdated(new Date())
    } catch (e) {
      console.warn('Livetabeller: kunde inte hämta data', e.message)
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    mounted.current = true
    fetchAll()

    // Schemalägg nästa poll baserat på om det är matchfönster
    let tid = null
    const schedule = () => {
      const h = new Date().getHours()
      const delay = (h >= 18 || h < 6) ? 5 * 60_000 : 30 * 60_000
      tid = setTimeout(() => { fetchAll(); schedule() }, delay)
    }
    schedule()
    return () => { clearTimeout(tid); mounted.current = false }
  }, [enabled, fetchAll])

  return { stats, lastUpdated, loading, refetch: fetchAll }
}

// ─── Hook: hämta livetabeller från Supabase (för icke-admin-användare) ───────

function useSupabaseStats(enabled) {
  const [stats,       setStats]       = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [loading,     setLoading]     = useState(false)
  const mounted = useRef(false)

  const fetchAll = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    try {
      const data = await fetchPlayerStats()
      if (!mounted.current) return
      setStats(data)
      setLastUpdated(new Date())
    } catch (e) {
      console.warn('Supabase-stats: kunde inte hämta data', e.message)
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    mounted.current = true
    fetchAll()
    return () => { mounted.current = false }
  }, [enabled, fetchAll])

  return { stats, lastUpdated, loading, refetch: fetchAll }
}

// ─── Livetabell – en statistikkategori ───────────────────────────────────────

function LiveTable({ title, emoji, color, statLabel, rows, userPickName, lastUpdated, loading }) {
  // Kontrollera om användarens tips finns i tabellen
  const pickInTop = userPickName
    ? rows.findIndex(r =>
        r.name.toLowerCase().includes(userPickName.toLowerCase()) ||
        userPickName.toLowerCase().includes(r.name.toLowerCase())
      )
    : -1

  const fmtTime = d => d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="rounded-2xl overflow-hidden"
         style={{ background: '#1E293B', border: `1px solid ${color}30` }}>

      {/* Rubrik */}
      <div className="px-4 py-3 flex items-center justify-between"
           style={{ background: '#0F172A', borderBottom: '1px solid #334155' }}>
        <div className="flex items-center gap-2">
          <span className="text-lg">{emoji}</span>
          <span className="font-bold text-sm" style={{ color: '#F1F5F9' }}>{title}</span>
          {loading && <span className="text-xs" style={{ color: '#475569' }}>↻</span>}
        </div>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: `${color}20`, color }}>
          {statLabel}
        </span>
      </div>

      {/* Tabell */}
      {rows.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm" style={{ color: '#475569' }}>
            {loading ? 'Hämtar data...' : 'Ingen data tillgänglig ännu'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: '#0F172A', color: '#64748B' }}>
                <th className="px-3 py-2 text-left font-semibold w-8">#</th>
                <th className="px-3 py-2 text-left font-semibold">Spelare</th>
                <th className="px-3 py-2 text-left font-semibold hidden sm:table-cell">Nation</th>
                <th className="px-3 py-2 text-center font-semibold">{statLabel}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const isMyPick = pickInTop === i
                return (
                  <tr key={i}
                      style={{
                        background:  isMyPick ? `${color}12` : 'transparent',
                        borderTop:   '1px solid #1E293B',
                      }}>
                    {/* Rank */}
                    <td className="px-3 py-2.5 font-bold"
                        style={{ color: i < 3 ? color : '#475569' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                    </td>
                    {/* Namn */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold" style={{ color: isMyPick ? color : '#F1F5F9' }}>
                          {row.name}
                        </span>
                        {isMyPick && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full font-bold shrink-0"
                                style={{ background: `${color}25`, color }}>
                            ⭐ Ditt tips
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Nation */}
                    <td className="px-3 py-2.5 hidden sm:table-cell"
                        style={{ color: '#64748B' }}>
                      {row.nation}
                    </td>
                    {/* Värde */}
                    <td className="px-3 py-2.5 text-center font-black"
                        style={{ color: isMyPick ? color : '#F1F5F9' }}>
                      {row.value}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Uppdateringstid */}
      <div className="px-4 py-2 flex items-center justify-between"
           style={{ borderTop: '1px solid #1E293B' }}>
        <span className="text-xs" style={{ color: '#334155' }}>
          {lastUpdated ? `Senast uppdaterad: ${fmtTime(lastUpdated)}` : 'Väntar på data...'}
        </span>
      </div>
    </div>
  )
}

// ─── Poängsystem-banner ───────────────────────────────────────────────────────

// Poängbanner – visar endast de fyra spelarkategorierna (2×2 symmetriskt)
function PointsBanner() {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ background:'#1E293B', border:'1px solid #334155' }}
    >
      <div className="grid grid-cols-2 gap-3">
        {CATEGORIES.map(c => (
          <div
            key={c.key}
            className="rounded-xl p-3 flex items-center gap-3"
            style={{ background:'#0F172A' }}
          >
            <span className="text-2xl shrink-0">{c.emoji}</span>
            <div className="min-w-0">
              <p className="text-xs truncate" style={{ color:'#64748B' }}>{c.label}</p>
              <p className="text-lg font-black leading-tight" style={{ color:c.color }}>{c.points}p</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 flex items-center justify-between"
           style={{ borderTop:'1px solid #334155' }}>
        <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color:'#64748B' }}>
          <span>💰</span> Max spelarpoäng
        </span>
        <span className="text-sm font-black" style={{ color:'#F59E0B' }}>{TOTAL_POINTS}p</span>
      </div>
    </div>
  )
}

// ─── Huvudkomponent: SpelerPredictions ───────────────────────────────────────

export default function SpelerPredictions({ user, isAdmin }) {
  const [selections, setSelections] = useState({ scorer:null, assist:null, yellow:null, red:null })
  const [confirmed,  setConfirmed]  = useState({ scorer:false, assist:false, yellow:false, red:false })
  const [queries,    setQueries]    = useState({ scorer:'', assist:'', yellow:'', red:'' })
  const [open,       setOpen]       = useState({ scorer:true, assist:true, yellow:true, red:true })
  const [saveError,  setSaveError]  = useState(null)

  // Dev-läge: ?dev=true i URL → visa livetabeller oavsett datum (för granskning)
  const isDevMode = new URLSearchParams(window.location.search).get('dev') === 'true'

  // ─ Turneringslåsning: kontrollera vid mount och var 60:e sekund ─
  const [isLocked, setIsLocked] = useState(() => isTournamentStarted())
  useEffect(() => {
    if (isLocked) return  // redan låst, inget mer att göra
    const id = setInterval(() => {
      if (isTournamentStarted()) {
        setIsLocked(true)
        clearInterval(id)
      }
    }, 10_000)
    return () => clearInterval(id)
  }, [isLocked])

  // ─ Ladda från localStorage vid mount ─
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
      if (saved) {
        if (saved.selections) setSelections(saved.selections)
        if (saved.confirmed)  setConfirmed(saved.confirmed)
      }
    } catch { /* ignorera */ }
  }, [])

  // ─ Ladda från Supabase vid inloggning – skriver över localStorage ─
  useEffect(() => {
    if (!user?.id) return
    const catPlayers = { scorer: goalScorers, assist: assistProviders, yellow: yellowCardRisk, red: redCardRisk }
    loadPlayerPredictions(user.id)
      .then(({ selections: dbSels, confirmed: dbConf }) => {
        const resolved = {}
        for (const [cat, dbSel] of Object.entries(dbSels)) {
          resolved[cat] = dbSel ? (catPlayers[cat]?.find(p => p.name === dbSel.name) ?? null) : null
        }
        setSelections(prev => ({ ...prev, ...resolved }))
        setConfirmed(prev => ({ ...prev, ...dbConf }))
      })
      .catch(console.warn)
  }, [user?.id])

  // ─ Spara till localStorage vid förändring ─
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ selections, confirmed }))
  }, [selections, confirmed])

  function handleSelect(catKey, player) {
    setSelections(prev => ({
      ...prev,
      [catKey]: prev[catKey]?.id === player.id ? null : player,
    }))
  }

  function handleConfirm(catKey) {
    if (!selections[catKey]) return
    setConfirmed(prev => ({ ...prev, [catKey]: true }))
    if (user) savePlayerPrediction(user.id, catKey, selections[catKey], true)
      .catch(() => setSaveError('Tipsningen kunde inte sparas – kontrollera uppkopplingen och försök igen.'))
  }

  function handleEdit(catKey) {
    setConfirmed(prev => ({ ...prev, [catKey]: false }))
    setOpen(prev => ({ ...prev, [catKey]: true }))
  }

  function toggleOpen(catKey) {
    setOpen(prev => ({ ...prev, [catKey]: !prev[catKey] }))
  }

  function setQuery(catKey, val) {
    setQueries(prev => ({ ...prev, [catKey]: val }))
  }

  // ─ Livetabeller ─
  const showLiveTables = isDevMode || isLocked
  const showSelection  = !isLocked || isDevMode
  // Admin: poll direkt mot API-Football. Vanliga användare: läs från Supabase (uppdateras av admin-synken).
  const apiLive = useLiveStats(showLiveTables && isAdmin)
  const dbLive  = useSupabaseStats(showLiveTables && !isAdmin)
  const { stats, lastUpdated, loading, refetch } = isAdmin ? apiLive : dbLive

  // Konfiguration för de fyra livetabellerna
  const LIVE_TABLES = [
    { key:'scorers', title:'Skytteliga',  emoji:'🥇', color:'#F59E0B', statLabel:'Mål',  pick: selections.scorer },
    { key:'assists', title:'Assistliga',  emoji:'🎯', color:'#3B82F6', statLabel:'Ast',  pick: selections.assist },
    { key:'yellow',  title:'Gula kort',   emoji:'🟨', color:'#EAB308', statLabel:'Kort', pick: selections.yellow },
    { key:'red',     title:'Röda kort',   emoji:'🟥', color:'#EF4444', statLabel:'Kort', pick: selections.red    },
  ]

  return (
    <div className="space-y-5">

      {saveError && (
        <div className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
             style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <p className="text-sm" style={{ color: '#F87171' }}>⚠️ {saveError}</p>
          <button onClick={() => setSaveError(null)} className="shrink-0 text-lg leading-none" style={{ color: '#64748B' }}>×</button>
        </div>
      )}

      {/* Sidtitel */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black" style={{ color:'#F1F5F9' }}>
            Spelare att få flest
          </h1>
          <p className="text-sm mt-1" style={{ color:'#64748B' }}>
            {isLocked ? 'Livetabeller – uppdateras under turneringen' :
             'Tippa vem som leder respektive statistikkategori i VM 2026'}
          </p>
        </div>
        {showLiveTables && (
          <button onClick={refetch} disabled={loading}
                  className="text-xs px-3 py-1.5 rounded-xl font-semibold shrink-0 transition-all"
                  style={{ background:'#334155', color: loading ? '#475569' : '#F1F5F9' }}>
            {loading ? '↻ Laddar...' : '↻ Uppdatera'}
          </button>
        )}
      </div>

      {/* Poängsystem-banner */}
      <PointsBanner />

      {/* ─ Livetabeller (visas efter turnerings start eller i dev-läge) ─ */}
      {showLiveTables && (
        <div className="space-y-4">
          {isDevMode && !isLocked && (
            <div className="rounded-xl px-3 py-2 flex items-center gap-2"
                 style={{ background:'rgba(59,130,246,0.1)', border:'1px solid rgba(59,130,246,0.25)' }}>
              <span className="text-sm">🛠️</span>
              <p className="text-xs font-semibold" style={{ color:'#3B82F6' }}>
                Dev-läge aktiv – livetabeller visas oavsett datum
              </p>
            </div>
          )}
          {LIVE_TABLES.map(t => (
            <LiveTable
              key={t.key}
              title={t.title}
              emoji={t.emoji}
              color={t.color}
              statLabel={t.statLabel}
              rows={stats?.[t.key] ?? []}
              userPickName={t.pick?.name ?? null}
              lastUpdated={lastUpdated}
              loading={loading}
            />
          ))}
        </div>
      )}

      {/* ─ Turneringslås-banner ─ */}
      {isLocked && (
        <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
             style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)' }}>
          <span className="text-xl shrink-0">🔒</span>
          <div>
            <p className="font-bold text-sm" style={{ color:'#F87171' }}>
              Tippningen är stängd – turneringen har börjat
            </p>
            <p className="text-xs mt-0.5" style={{ color:'#64748B' }}>
              Dina val är låsta och räknas mot de faktiska resultaten
            </p>
          </div>
        </div>
      )}

      {/* ─ Spelarval (döljs när turneringen startat, visas i dev-läge) ─ */}
      {showSelection && (
        <>
          <SummaryCard selections={selections} confirmed={confirmed} />

          {CATEGORIES.map(cat => (
            <CategorySection
              key={cat.key}
              cat={cat}
              selection={selections[cat.key]}
              isConfirmed={confirmed[cat.key]}
              isOpen={open[cat.key]}
              onToggle={() => toggleOpen(cat.key)}
              query={queries[cat.key]}
              onQuery={val => setQuery(cat.key, val)}
              onSelect={player => handleSelect(cat.key, player)}
              onConfirm={() => handleConfirm(cat.key)}
              onEdit={() => handleEdit(cat.key)}
              isLocked={isLocked}
            />
          ))}
        </>
      )}
    </div>
  )
}
