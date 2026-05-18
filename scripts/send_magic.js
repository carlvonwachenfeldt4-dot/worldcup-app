import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

// Manually load .env if present (avoids adding dotenv dependency)
const envPath = path.resolve(process.cwd(), '.env')
if (fs.existsSync(envPath)) {
  const txt = fs.readFileSync(envPath, 'utf8')
  for (const line of txt.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx)
    const val = trimmed.slice(idx + 1)
    if (!(key in process.env)) process.env[key] = val
  }
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const email = process.argv[2]
if (!email) {
  console.error('Usage: node scripts/send_magic.js user@example.com')
  process.exit(1)
}

async function sendMagic() {
  try {
    const resp = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: 'http://localhost:5174/profil' } })
    console.log('Supabase response:', JSON.stringify(resp, null, 2))
    if (resp.error) process.exit(2)
  } catch (e) {
    console.error('Error sending magic link:', e.message || e)
    process.exit(3)
  }
}

sendMagic()
