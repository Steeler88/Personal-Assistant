import { exchangeCode, saveTokens } from '../_whoop.js'

/** Lands here after consent. Trades the code for tokens and stores them. */

function page(title, body, ok = true) {
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="background:#000;color:#fff;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0">
<div style="max-width:32rem;padding:2rem;text-align:center">
  <h1 style="font-size:1.25rem;color:${ok ? '#6EE7B7' : '#EF4444'}">${title}</h1>
  <p style="color:rgba(255,255,255,.7);line-height:1.6">${body}</p>
  <a href="/" style="color:#6EE7B7">Back to the dashboard</a>
</div>`
}

function readCookie(header, name) {
  return (header ?? '')
    .split(';')
    .map((c) => c.trim().split('='))
    .find(([k]) => k === name)?.[1]
}

export default async function handler(req, res) {
  const { code, state, error: oauthError } = req.query ?? {}

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  // The state cookie has done its job either way.
  res.setHeader('Set-Cookie', 'whoop_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0')

  if (oauthError) {
    return res.status(400).send(page('Whoop declined', `Whoop returned "${oauthError}".`, false))
  }
  if (!code) {
    return res.status(400).send(page('Missing code', 'Whoop did not return an authorization code.', false))
  }

  // Reject a callback that did not originate from our own authorize step.
  const expected = readCookie(req.headers.cookie, 'whoop_state')
  if (!expected || state !== expected) {
    return res.status(400).send(
      page('State mismatch', 'This callback did not match the request that started it, so it was rejected.', false)
    )
  }

  try {
    const tokens = await exchangeCode(code)
    if (!tokens.refresh_token) {
      // Without offline scope the connection silently dies in an hour.
      return res.status(400).send(
        page(
          'Connected, but without a refresh token',
          'Whoop did not return a refresh token, which means the <code>offline</code> scope was not granted. Add it to the app’s scopes and connect again, otherwise the link expires within the hour.',
          false
        )
      )
    }
    await saveTokens(tokens)
    return res.status(200).send(page('Whoop connected', 'You can close this and return to the dashboard.'))
  } catch (err) {
    return res.status(502).send(page('Connection failed', String(err?.message ?? err), false))
  }
}
