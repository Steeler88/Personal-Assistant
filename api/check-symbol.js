/**
 * Checks a ticker exists before it goes on the watchlist.
 *
 * Runs server-side because EODHD_API_KEY is a real secret. Uses a live quote
 * rather than the search endpoint: search will happily match a company whose
 * ticker the briefing then cannot price, whereas a quote coming back proves
 * the exact thing the briefing will need.
 *
 * Costs one EODHD call per check, against a 20/day allowance. Adding a symbol
 * is rare; a typo silently sitting in the list and never appearing would cost
 * more attention than the call does.
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Use POST.' })
  }

  const key = process.env.EODHD_API_KEY
  if (!key) return res.status(500).json({ error: 'EODHD_API_KEY is not configured.' })

  const raw = typeof req.body?.symbol === 'string' ? req.body.symbol.trim().toUpperCase() : ''
  if (!/^[A-Z][A-Z0-9.\-]{0,11}$/.test(raw)) {
    return res.status(400).json({ error: 'That does not look like a ticker.' })
  }

  try {
    const r = await fetch(`https://eodhd.com/api/real-time/${raw}.US?api_token=${key}&fmt=json`)
    const body = await r.text()

    if (!r.ok) {
      const rateLimited = r.status === 429 || /limit|quota|exceed/i.test(body)
      return res.status(rateLimited ? 429 : 502).json({
        error: rateLimited
          ? 'EODHD limit reached — the daily allowance and the buffer are both used up.'
          : `Could not check ${raw} (${r.status}).`,
      })
    }

    let quote
    try { quote = JSON.parse(body) } catch { quote = null }

    // EODHD answers an unknown ticker with 200 and "NA" rather than an error.
    const price = quote && typeof quote.close === 'number' ? quote.close : null
    if (price === null) {
      return res.status(404).json({ error: `No such ticker as ${raw}.` })
    }

    return res.status(200).json({ symbol: raw, price })
  } catch (err) {
    return res.status(502).json({ error: String(err?.message ?? err) })
  }
}
