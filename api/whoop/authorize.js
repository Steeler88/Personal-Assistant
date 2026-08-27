import crypto from 'node:crypto'
import { WHOOP_AUTH_URL, WHOOP_SCOPES } from '../_whoop.js'

/**
 * Starts the OAuth flow. Redirects the browser to Whoop's consent screen.
 * The client secret is never involved here — only the public client id.
 */
export default function handler(req, res) {
  const clientId = process.env.WHOOP_CLIENT_ID
  const redirectUri = process.env.WHOOP_REDIRECT_URI

  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: 'Whoop client id or redirect URI is not configured.' })
  }

  // Whoop requires at least 8 characters of state; it guards against CSRF.
  // Stored in an httpOnly cookie so the callback can prove it started here.
  const state = crypto.randomBytes(16).toString('hex')

  res.setHeader(
    'Set-Cookie',
    `whoop_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`
  )

  const url = new URL(WHOOP_AUTH_URL)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', WHOOP_SCOPES.join(' '))
  url.searchParams.set('state', state)

  res.redirect(302, url.toString())
}
