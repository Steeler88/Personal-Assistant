import { WHOOP_AUTH_URL, WHOOP_SCOPES, mintState } from '../_whoop.js'

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

  const url = new URL(WHOOP_AUTH_URL)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', WHOOP_SCOPES.join(' '))
  // Signed, so the callback can verify origin without a cookie surviving the round trip
  url.searchParams.set('state', mintState())

  res.redirect(302, url.toString())
}
