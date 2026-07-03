import { useEffect, useState } from 'react'
import { uploadAvatar, updateProfile, resetPassword } from '../lib/supabase'

export default function Profile({ user, onBack, onSignOut, profile: profileProp, rankInfo, tips, bracketTips, userPredictions }) {
  const [profile, setProfile] = useState(profileProp)
  const [uploading, setUploading] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')

  useEffect(() => { setProfile(profileProp) }, [profileProp])

  async function handleUpload(e) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!['image/jpeg','image/png','image/webp'].includes(f.type)) { alert('Endast jpg, png eller webp tillåts'); return }
    if (f.size > 2 * 1024 * 1024) { alert('Max 2MB'); return }
    setUploading(true)
    try {
      const url = await uploadAvatar(user.id, f)
      setProfile(prev => ({ ...prev, avatar_url: url }))
    } catch (e) { alert(e.message || 'Uppladdning misslyckades') }
    finally { setUploading(false) }
  }

  async function saveName() {
    if (!nameInput.trim()) return
    try {
      const updated = await updateProfile(user.id, { username: nameInput.trim() })
      setProfile(updated)
      setEditingName(false)
    } catch (e) { alert(e.message || 'Kunde inte spara namn') }
  }

  if (!user) return (
    <div className="p-6 text-center">
      <p className="text-sm" style={{ color:'#64748B' }}>Du måste vara inloggad för att se profilen.</p>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="text-sm px-2 py-1 rounded" style={{ color:'#94A3B8' }}>← Tillbaka</button>
        <h1 className="font-black text-xl" style={{ color:'#F1F5F9' }}>Min profil</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-2xl p-4" style={{ background:'#1E293B', border:'1px solid #334155' }}>
          <div className="flex flex-col items-center gap-3">
            <label htmlFor="avatar" className="cursor-pointer">
              <div style={{ width:120, height:120, borderRadius:9999, overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', background:'#0F172A' }}>
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="avatar" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                ) : (
                  <div style={{ width:120, height:120, display:'flex', alignItems:'center', justifyContent:'center', background:'#334155', color:'#F1F5F9', fontWeight:800, fontSize:28 }}>
                    {(profile?.username || user.email || '').split(' ').map(p => p[0]).slice(0,2).join('').toUpperCase()}
                  </div>
                )}
              </div>
            </label>
            <input id="avatar" type="file" accept="image/*" onChange={handleUpload} style={{ display:'none' }} />
            {uploading ? <p className="text-xs" style={{ color:'#64748B' }}>Laddar upp...</p> : <p className="text-xs" style={{ color:'#64748B' }}>Klicka bilden för att byta</p>}

            <div className="text-center mt-3">
              {!editingName ? (
                <>
                  <p className="font-bold text-lg" style={{ color:'#F1F5F9' }}>{profile?.username ?? user.user_metadata?.username ?? user.email.split('@')[0]}</p>
                  <p className="text-xs" style={{ color:'#64748B' }}>{user.email}</p>
                  <button onClick={() => { setEditingName(true); setNameInput(profile?.username ?? '') }} className="mt-2 text-xs px-3 py-1 rounded" style={{ background:'#334155', color:'#94A3B8' }}>Byt visningsnamn</button>
                </>
              ) : (
                <div className="space-y-2">
                  <input value={nameInput} onChange={e => setNameInput(e.target.value)} className="w-full px-3 py-2 rounded" style={{ background:'#0F172A', border:'1px solid #334155', color:'#F1F5F9' }} />
                  <div className="flex gap-2">
                    <button onClick={saveName} className="px-3 py-1 rounded" style={{ background:'#F59E0B', color:'#0F172A' }}>Spara</button>
                    <button onClick={() => setEditingName(false)} className="px-3 py-1 rounded" style={{ background:'#334155', color:'#94A3B8' }}>Avbryt</button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 text-xs text-center" style={{ color:'#64748B' }}>
              {rankInfo ? (
                <div>
                  <div>Ranking: <strong style={{ color:'#F59E0B' }}>#{rankInfo.position}</strong>{rankInfo.total ? ` av ${rankInfo.total}` : ''}</div>
                  <div>Totala poäng: <strong style={{ color:'#34D399' }}>{rankInfo.points ?? '0'}</strong></div>
                </div>
              ) : (
                <div>Ranking inte tillgänglig</div>
              )}
            </div>
          </div>
        </div>

        <div className="md:col-span-2 space-y-4">
          <div className="rounded-2xl p-4" style={{ background:'#1E293B', border:'1px solid #334155' }}>
            <h3 className="font-bold" style={{ color:'#F1F5F9' }}>Tävlingsstatistik</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3" style={{ color:'#94A3B8' }}>
              <div>
                <p className="text-xs">Poänghistorik per fas</p>
                <p className="text-sm" style={{ color:'#F1F5F9' }}>Inte beräknat i klienten</p>
              </div>
              <div>
                <p className="text-xs">Antal rätta tips totalt</p>
                <p className="text-sm" style={{ color:'#F1F5F9' }}>Ej beräknat</p>
              </div>
              <div>
                <p className="text-xs">Träffsäkerhet</p>
                <p className="text-sm" style={{ color:'#F1F5F9' }}>Ej beräknat</p>
              </div>
              <div>
                <p className="text-xs">Bästa gissning</p>
                <p className="text-sm" style={{ color:'#F1F5F9' }}>Ej tillgänglig</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl p-4" style={{ background:'#1E293B', border:'1px solid #334155' }}>
            <h3 className="font-bold" style={{ color:'#F1F5F9' }}>Mina tips</h3>
            <div className="mt-3 space-y-2 text-sm" style={{ color:'#F1F5F9' }}>
              <div>
                <h4 className="font-semibold" style={{ color:'#F1F5F9' }}>Grupptips</h4>
                {Object.keys(tips ?? {}).length === 0 ? (
                  <p className="text-xs" style={{ color:'#64748B' }}>Inga sparade grupptips</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {Object.entries(tips ?? {}).map(([match, tip]) => (
                      <li key={match} style={{ color:'#F1F5F9' }}>{match}: {tip}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-2">
                <h4 className="font-semibold" style={{ color:'#F1F5F9' }}>Slutspel</h4>
                {Object.keys(bracketTips ?? {}).length === 0 ? (
                  <p className="text-xs" style={{ color:'#64748B' }}>Inga slutspelstips</p>
                ) : (
                  <p className="text-xs mt-2" style={{ color:'#94A3B8' }}>
                    {Object.values(bracketTips ?? {}).filter(v =>
                      (v && typeof v === 'object') ? !!v.tip : !!v
                    ).length} slutspelstips sparade
                  </p>
                )}
              </div>

              <div className="mt-2">
                <h4 className="font-semibold" style={{ color:'#F1F5F9' }}>Spelare</h4>
                {Object.keys(userPredictions?.selections ?? {}).length === 0 ? (
                  <p className="text-xs" style={{ color:'#64748B' }}>Inga spelar-tips</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {Object.entries(userPredictions?.selections ?? {}).map(([cat, sel]) => (
                      <li key={cat} style={{ color:'#F1F5F9' }}>{cat}: {sel.name} ({sel.nation})</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl p-4" style={{ background:'#1E293B', border:'1px solid #334155' }}>
            <h3 className="font-bold" style={{ color:'#F1F5F9' }}>Kontoinställningar</h3>
            <div className="mt-3 space-y-3">
              <div>
                <p className="text-xs" style={{ color:'#64748B' }}>Byt visningsnamn</p>
                <button onClick={() => { setEditingName(true); setNameInput(profile?.username ?? '') }} className="mt-2 px-3 py-2 rounded" style={{ background:'#334155', color:'#94A3B8' }}>Redigera namn</button>
              </div>
              <div>
                <p className="text-xs" style={{ color:'#64748B' }}>Byt lösenord</p>
                <button onClick={async () => { await resetPassword(user.email) }} className="mt-2 px-3 py-2 rounded" style={{ background:'#334155', color:'#94A3B8' }}>Skicka återställningsmail</button>
              </div>
              <div>
                <button onClick={onSignOut} className="mt-2 px-3 py-2 rounded" style={{ background:'#EF4444', color:'#fff' }}>Logga ut</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
