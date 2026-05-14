import { useState } from 'react'
import { signIn, signUp, supabase } from '../lib/supabase'

// ─── Återanvändbart textfält ──────────────────────────────────────────────────

function Field({ label, type = 'text', value, onChange, placeholder, required, minLength, error }) {
  const [focused, setFocused] = useState(false)
  return (
    <div>
      <label className="text-xs font-semibold block mb-1" style={{ color: '#94A3B8' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
        style={{
          background:   '#0F172A',
          border:       `1.5px solid ${error ? '#EF4444' : focused ? '#F59E0B' : '#334155'}`,
          color:        '#F1F5F9',
        }}
        onFocus={() => setFocused(true)}
        onBlur={() =>  setFocused(false)}
      />
      {error && <p className="text-xs mt-1" style={{ color: '#F87171' }}>{error}</p>}
    </div>
  )
}

// ─── Lösenordsfält med visa/dölj ─────────────────────────────────────────────

function PasswordField({ label, value, onChange, placeholder, error }) {
  const [show,    setShow]    = useState(false)
  const [focused, setFocused] = useState(false)
  return (
    <div>
      <label className="text-xs font-semibold block mb-1" style={{ color: '#94A3B8' }}>
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? '••••••••'}
          className="w-full px-4 py-2.5 pr-10 rounded-xl text-sm outline-none transition-all"
          style={{
            background: '#0F172A',
            border:     `1.5px solid ${error ? '#EF4444' : focused ? '#F59E0B' : '#334155'}`,
            color:      '#F1F5F9',
          }}
          onFocus={() => setFocused(true)}
          onBlur={() =>  setFocused(false)}
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-sm"
          style={{ color: '#64748B' }}
          tabIndex={-1}
        >
          {show ? '🙈' : '👁️'}
        </button>
      </div>
      {error && <p className="text-xs mt-1" style={{ color: '#F87171' }}>{error}</p>}
    </div>
  )
}

// ─── Huvudkomponent ───────────────────────────────────────────────────────────

export default function AuthModal({ onSuccess, onClose }) {
  const [mode, setMode] = useState('login') // 'login' | 'register' | 'reset'

  // Gemensamma fält
  const [username,  setUsername]  = useState('')
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')

  const [loading,   setLoading]   = useState(false)
  const [success,   setSuccess]   = useState('')   // bekräftelsemeddelande
  const [error,     setError]     = useState('')
  const [fieldErrs, setFieldErrs] = useState({})   // per-fält-fel

  function switchMode(m) {
    setMode(m); setError(''); setSuccess(''); setFieldErrs({})
    setPassword(''); setConfirm('')
  }

  // ─── Validering ────────────────────────────────────────────────────────────

  function validate() {
    const errs = {}
    if (mode === 'register') {
      if (!username.trim())            errs.username = 'Ange ett namn'
      if (password.length < 8)         errs.password = 'Minst 8 tecken'
      if (password !== confirm)        errs.confirm  = 'Lösenorden matchar inte'
    }
    if (!email.includes('@'))          errs.email    = 'Ogiltig e-postadress'
    setFieldErrs(errs)
    return Object.keys(errs).length === 0
  }

  // ─── Skicka formulär ────────────────────────────────────────────────────────

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return
    setError(''); setLoading(true)
    try {
      if (mode === 'register') {
        await signUp(email, password, username.trim())
        setSuccess('Kolla din e-post för att bekräfta kontot – kolla även skräpkorgen!')
        return
      }
      if (mode === 'login') {
        await signIn(email, password)
        onSuccess()
        return
      }
    } catch (err) {
      // Översätt vanliga Supabase-felmeddelanden till svenska
      const msg = err.message ?? ''
      if (msg.includes('Invalid login credentials'))
        setError('Fel e-post eller lösenord. Försök igen.')
      else if (msg.includes('Email not confirmed'))
        setError('Bekräfta din e-post innan du loggar in.')
      else if (msg.includes('User already registered'))
        setError('Det finns redan ett konto med den e-postadressen.')
      else
        setError(msg || 'Något gick fel. Försök igen.')
    } finally {
      setLoading(false)
    }
  }

  // ─── Återställ lösenord ─────────────────────────────────────────────────────

  async function handleReset(e) {
    e.preventDefault()
    if (!email.includes('@')) {
      setFieldErrs({ email: 'Ange din e-postadress' }); return
    }
    setLoading(true); setError('')
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      })
      if (err) throw err
      setSuccess('Återställningslänk skickad! Kolla din e-post.')
    } catch (err) {
      setError(err.message || 'Kunde inte skicka återställningslänk.')
    } finally {
      setLoading(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: '#1E293B', border: '1px solid #334155',
                 boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}
      >
        {/* ─ Header ─ */}
        <div className="px-6 pt-6 pb-4 text-center" style={{ borderBottom: '1px solid #334155' }}>
          <div
            className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-2xl font-black mb-3"
            style={{ background: 'linear-gradient(135deg,#F59E0B,#D97706)' }}
          >
            ⚽
          </div>
          <h2 className="text-xl font-black" style={{ color: '#F1F5F9' }}>VM-tippning 2026</h2>
          <p className="text-xs mt-1" style={{ color: '#64748B' }}>
            {mode === 'login'    && 'Logga in för att spara dina tips'}
            {mode === 'register' && 'Skapa gratis konto och börja tippa'}
            {mode === 'reset'    && 'Återställ ditt lösenord'}
          </p>
        </div>

        {/* ─ Tab-växlare (login/register) ─ */}
        {mode !== 'reset' && (
          <div className="flex p-2 gap-1" style={{ borderBottom: '1px solid #334155' }}>
            {[['login','Logga in'],['register','Registrera']].map(([m, lbl]) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all"
                style={mode === m
                  ? { background: '#F59E0B', color: '#0F172A' }
                  : { background: 'transparent', color: '#64748B' }}
              >
                {lbl}
              </button>
            ))}
          </div>
        )}

        {/* ─ Bekräftelsemeddelande ─ */}
        {success ? (
          <div className="p-6 text-center space-y-4">
            <div className="text-4xl">📧</div>
            <p className="text-sm font-semibold" style={{ color: '#34D399' }}>{success}</p>
            <button
              onClick={() => { setSuccess(''); switchMode('login') }}
              className="text-xs underline"
              style={{ color: '#64748B' }}
            >
              Tillbaka till inloggning
            </button>
          </div>

        ) : mode === 'reset' ? (
          /* ─ Återställ lösenord ─ */
          <form onSubmit={handleReset} className="p-5 space-y-4">
            <Field
              label="E-post" type="email"
              value={email} onChange={setEmail}
              placeholder="du@exempel.se" required
              error={fieldErrs.email}
            />
            {error && (
              <p className="text-xs px-3 py-2 rounded-lg"
                 style={{ background: 'rgba(239,68,68,0.1)', color: '#F87171' }}>
                ⚠️ {error}
              </p>
            )}
            <button
              type="submit" disabled={loading}
              className="w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-95"
              style={{
                background: loading ? '#334155' : 'linear-gradient(135deg,#3B82F6,#1D4ED8)',
                color:      loading ? '#64748B' : '#fff',
              }}
            >
              {loading ? '⏳ Skickar...' : 'Skicka återställningslänk'}
            </button>
            <button
              type="button" onClick={() => switchMode('login')}
              className="w-full text-xs underline text-center"
              style={{ color: '#64748B' }}
            >
              ← Tillbaka till inloggning
            </button>
          </form>

        ) : (
          /* ─ Login / Registrering ─ */
          <form onSubmit={handleSubmit} className="p-5 space-y-3">

            {mode === 'register' && (
              <Field
                label="Namn" value={username} onChange={setUsername}
                placeholder="t.ex. fotbollsfan99" required
                error={fieldErrs.username}
              />
            )}

            <Field
              label="E-post" type="email"
              value={email} onChange={setEmail}
              placeholder="du@exempel.se" required
              error={fieldErrs.email}
            />

            <PasswordField
              label="Lösenord"
              value={password} onChange={setPassword}
              error={fieldErrs.password}
            />

            {mode === 'register' && (
              <PasswordField
                label="Bekräfta lösenord"
                value={confirm} onChange={setConfirm}
                placeholder="Upprepa lösenordet"
                error={fieldErrs.confirm}
              />
            )}

            {error && (
              <p className="text-xs px-3 py-2 rounded-lg"
                 style={{ background: 'rgba(239,68,68,0.1)', color: '#F87171' }}>
                ⚠️ {error}
              </p>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-95 mt-1"
              style={{
                background: loading ? '#334155' : 'linear-gradient(135deg,#F59E0B,#D97706)',
                color:      loading ? '#64748B' : '#0F172A',
              }}
            >
              {loading ? '⏳ Laddar...' : mode === 'login' ? 'Logga in' : 'Skapa konto'}
            </button>

            {/* Glömt lösenord */}
            {mode === 'login' && (
              <button
                type="button"
                onClick={() => switchMode('reset')}
                className="w-full text-xs text-center transition-colors"
                style={{ color: '#64748B' }}
                onMouseEnter={e => e.currentTarget.style.color = '#94A3B8'}
                onMouseLeave={e => e.currentTarget.style.color = '#64748B'}
              >
                Glömt lösenordet?
              </button>
            )}

            {mode === 'register' && (
              <p className="text-xs text-center" style={{ color: '#475569' }}>
                Gratis konto · Dina tips synkroniseras automatiskt
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
