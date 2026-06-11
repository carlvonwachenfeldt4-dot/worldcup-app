import { useState, useEffect } from 'react'
import { loadPlayerPredictions, supabase } from '../lib/supabase'
import Flag from './Flag'
import { TEAMS } from './data'

// Mappning: nation → iso2-kod för flagga
const NATION_ISO2 = {
  'Argentina': 'ar', 'Portugal': 'pt', 'Frankrike': 'fr', 'Norge': 'no',
  'Brasilien': 'br', 'England': 'gb-eng', 'Spanien': 'es', 'Turkiet': 'tr',
  'Mexiko': 'mx', 'Sydkorea': 'kr', 'Japan': 'jp', 'Kanada': 'ca',
  'Elfenbenskusten': 'ci', 'Ghana': 'gh', 'Sydafrika': 'za', 'Qatar': 'qa',
  'Bosnien': 'ba', 'Colombia': 'co', 'USA': 'us', 'Marocko': 'ma',
  'Tyskland': 'de', 'Sverige': 'se', 'Kroatien': 'hr', 'Belgien': 'be',
  'Ecuador': 'ec', 'Senegal': 'sn', 'Australien': 'au', 'Paraguay': 'py',
  'Schweiz': 'ch', 'Nederländerna': 'nl', 'Uruguay': 'uy', 'Iran': 'ir',
  'Österrike': 'at', 'Algeriet': 'dz', 'Chile': 'cl', 'Tjeckien': 'cz',
  'Saudiarabien': 'sa', 'Tunisien': 'tn', 'Nya Zeeland': 'nz', 'Egypten': 'eg',
  'Irak': 'iq', 'Jordanien': 'jo', 'Uzbekistan': 'uz', 'Kap Verde': 'cv',
  'Curaçao': 'cw', 'DR Kongo': 'cd',
}

export default function LockedPredictions({ userId }) {
  const [predictions, setPredictions] = useState({
    vmWinner: null,
    scorer: null,
    assist: null,
    yellow: null,
    red: null,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    let mounted = true

    async function load() {
      setLoading(true)
      try {
        // Hämta spelarprediktor
        const playerPreds = await loadPlayerPredictions(userId)
        
        // Hämta VM-vinnare från Supabase (if exists) eller localStorage
        let vmWinner = null
        try {
          const { data } = await supabase
            .from('vm_picks')
            .select('vm_winner')
            .eq('user_id', userId)
            .single()
          vmWinner = data?.vm_winner || null
        } catch {
          // Fallback: hämta från localStorage
          vmWinner = localStorage.getItem('vmWinner')
        }

        if (!mounted) return

        setPredictions({
          vmWinner: vmWinner,
          scorer: playerPreds.selections?.scorer || null,
          assist: playerPreds.selections?.assist || null,
          yellow: playerPreds.selections?.yellow || null,
          red: playerPreds.selections?.red || null,
        })
      } catch (e) {
        console.warn('LockedPredictions load error:', e.message)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()
    return () => { mounted = false }
  }, [userId])

  const categories = [
    { key: 'vmWinner', label: 'VM-Vinnare', icon: '🏆', type: 'team' },
    { key: 'scorer', label: 'Målskytteking', icon: '⚽', type: 'player' },
    { key: 'assist', label: 'Assistkung', icon: '🎯', type: 'player' },
    { key: 'yellow', label: 'Gula kort', icon: '🟨', type: 'player' },
    { key: 'red', label: 'Röda kort', icon: '🟥', type: 'player' },
  ]

  const PredictionRow = ({ cat }) => {
    const value = predictions[cat.key]
    const isEmpty = !value

    return (
      <div className="flex items-center justify-between py-3 px-3 rounded-lg border" style={{
        background: isEmpty ? '#0F172A' : '#1E293B',
        borderColor: isEmpty ? '#1E293B' : '#334155',
      }}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-lg">{cat.icon}</span>
          <span className="text-xs font-semibold" style={{ color: '#94A3B8' }}>
            {cat.label}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {isEmpty ? (
            <span className="text-xs" style={{ color: '#475569' }}>Ej tippat</span>
          ) : cat.type === 'team' ? (
            <div className="flex items-center gap-1.5">
              {TEAMS[Object.keys(TEAMS).find(k => TEAMS[k].name === value)] ? (
                <Flag 
                  iso2={TEAMS[Object.keys(TEAMS).find(k => TEAMS[k].name === value)].iso2} 
                />
              ) : null}
              <span className="text-xs font-bold" style={{ color: '#F1F5F9' }}>
                {value}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              {value.nation && NATION_ISO2[value.nation] && (
                <Flag iso2={NATION_ISO2[value.nation]} />
              )}
              <span className="text-xs font-bold" style={{ color: '#F1F5F9' }}>
                {value.name}
              </span>
            </div>
          )}
          
          <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{
            background: '#F59E0B',
            color: '#0F172A',
            fontSize: '10px',
            fontWeight: '700',
          }}>
            🔒
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="w-80 p-4 rounded-2xl" style={{ background: '#0F172A', border: '1px solid #1E293B' }}>
        <div className="animate-pulse space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 rounded-lg" style={{ background: '#1E293B' }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="w-80 rounded-2xl p-4 space-y-3" style={{
      background: '#0F172A',
      border: '1px solid #334155',
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
    }}>
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b" style={{ borderColor: '#1E293B' }}>
        <span className="text-lg">🔒</span>
        <h3 className="font-black text-sm" style={{ color: '#F59E0B' }}>
          Låsta Tippningar
        </h3>
      </div>

      {/* Prediction rows */}
      <div className="space-y-2">
        {categories.map(cat => (
          <PredictionRow key={cat.key} cat={cat} />
        ))}
      </div>

      {/* Footer info */}
      <div className="text-xs pt-2 border-t" style={{ borderColor: '#1E293B', color: '#64748B' }}>
        <p>Dessa tippningar låses när turneringen startar.</p>
      </div>
    </div>
  )
}
