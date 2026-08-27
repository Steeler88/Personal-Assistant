import crypto from 'node:crypto'

/**
 * Whoop token handling.
 *
 * Tokens are encrypted before they reach the database. The Supabase anon key
 * ships in the browser bundle, so anything it can read is effectively public;
 * a Whoop refresh token is not journal text, it is account access.
 */

export const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth'
export const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'
export const WHOOP_API = 'https://api.prod.whoop.com/developer'

// `offline` is what makes Whoop issue a refresh token. Without it the
// connection dies in about an hour and has to be re-authorised by hand.
export const WHOOP_SCOPES = ['read:sleep', 'read:recovery', 'read:profile', 'offline']

const ALG = 'aes-256-gcm'

function keyBytes() {
  const hex = process.env.WHOOP_TOKEN_SECRET
  if (!hex) throw new Error('WHOOP_TOKEN_SECRET is not configured')
  const buf = Buffer.from(hex, 'hex')
  if (buf.length !== 32) throw new Error('WHOOP_TOKEN_SECRET must be 32 bytes of hex')
  return buf
}

/** -> "iv.tag.ciphertext", all base64url. */
export function encrypt(plain) {
  if (plain === null || plain === undefined) return null
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALG, keyBytes(), iv)
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.')
}

export function decrypt(blob) {
  if (!blob) return null
  const [ivB, tagB, dataB] = String(blob).split('.')
  if (!ivB || !tagB || !dataB) throw new Error('Stored token is malformed')
  const decipher = crypto.createDecipheriv(ALG, keyBytes(), Buffer.from(ivB, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagB, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(dataB, 'base64url')), decipher.final()]).toString('utf8')
}

/* ---------- Supabase helpers (service-free: same anon key as elsewhere) ---- */

function supabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase env vars are not configured')
  return { url, key, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } }
}

export async function loadTokenRow() {
  const { url, headers } = supabase()
  const res = await fetch(`${url}/rest/v1/whoop_tokens?id=eq.1&select=*`, { headers })
  if (!res.ok) return null
  const rows = await res.json()
  return Array.isArray(rows) ? rows[0] ?? null : null
}

export async function saveTokens({ access_token, refresh_token, expires_in, scope }) {
  const { url, headers } = supabase()
  const row = {
    id: 1,
    access_token: encrypt(access_token),
    // Whoop may omit a new refresh token on refresh; keep the existing one then.
    ...(refresh_token ? { refresh_token: encrypt(refresh_token) } : {}),
    expires_at: new Date(Date.now() + (Number(expires_in) || 3600) * 1000).toISOString(),
    ...(scope ? { scope } : {}),
  }
  const res = await fetch(`${url}/rest/v1/whoop_tokens?on_conflict=id`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row),
  })
  if (!res.ok) throw new Error(`Could not save Whoop tokens (${res.status}): ${(await res.text()).slice(0, 160)}`)
  return res.json()
}

async function exchange(params) {
  const res = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Whoop token exchange failed (${res.status}): ${text.slice(0, 200)}`)
  return JSON.parse(text)
}

export function exchangeCode(code) {
  return exchange({
    grant_type: 'authorization_code',
    code,
    client_id: process.env.WHOOP_CLIENT_ID,
    client_secret: process.env.WHOOP_CLIENT_SECRET,
    redirect_uri: process.env.WHOOP_REDIRECT_URI,
  })
}

export function refresh(refreshToken) {
  return exchange({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: process.env.WHOOP_CLIENT_ID,
    client_secret: process.env.WHOOP_CLIENT_SECRET,
    scope: 'offline',
  })
}

/**
 * A usable access token, refreshed if it's close to expiry.
 * Returns null when Whoop was never connected.
 */
export async function getAccessToken() {
  const row = await loadTokenRow()
  if (!row) return null

  // A minute of slack: a token that expires mid-request is a token that failed.
  const expiresSoon = new Date(row.expires_at).getTime() - Date.now() < 60_000
  if (!expiresSoon) return decrypt(row.access_token)

  const stored = decrypt(row.refresh_token)
  if (!stored) throw new Error('Access token expired and no refresh token is stored — reconnect Whoop.')

  const fresh = await refresh(stored)
  await saveTokens(fresh)
  return fresh.access_token
}

/** Authorised GET against the Whoop developer API. */
export async function whoopGet(path, token) {
  const res = await fetch(`${WHOOP_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Whoop ${path} failed (${res.status}): ${text.slice(0, 200)}`)
  return JSON.parse(text)
}
