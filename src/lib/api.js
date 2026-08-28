/* Talking to our own serverless functions.
 *
 * `vite dev` does not serve /api — those are Vercel functions that only exist
 * once deployed — so locally every one of these comes back 404 with an empty
 * body. Calling res.json() on that throws "Unexpected end of JSON input",
 * which says nothing about what actually happened. The same is true in
 * production of any route that failed to deploy, or a proxy error page.
 *
 * So: read the body as text, parse it only if there is something to parse, and
 * turn every failure into a sentence that names the cause.
 */

const local = () =>
  typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)

async function request(url, init) {
  let res
  try {
    res = await fetch(url, init)
  } catch (err) {
    return { ok: false, error: `Could not reach ${url}: ${String(err?.message ?? err)}` }
  }

  const text = await res.text()
  let body = null
  if (text) {
    try { body = JSON.parse(text) } catch { /* handled below */ }
  }

  if (body === null) {
    if (local()) {
      return {
        ok: false,
        offline: true,
        error: `${url} isn’t available here — the dev server doesn’t run the API. It works on the deployed site.`,
      }
    }
    return { ok: false, error: `${url} returned no readable reply (${res.status}).` }
  }

  if (!res.ok) return { ok: false, status: res.status, body, error: body.error || `Request failed (${res.status}).` }
  return { ok: true, status: res.status, body }
}

export const getJson = (url) => request(url, undefined)

export const postJson = (url, payload) =>
  request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  })
