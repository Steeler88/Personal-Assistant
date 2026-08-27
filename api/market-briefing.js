/**
 * Generates a market briefing. Runs on Vercel's servers, never in the browser,
 * because EODHD_API_KEY is a real secret — unlike the Supabase anon key, it is
 * not safe to ship in the client bundle.
 *
 * POST only: EODHD is billed per symbol against a 20/day free-tier quota, so a
 * briefing is generated deliberately, never as a side effect of a page load.
 * The dashboard reads the saved row from Supabase directly.
 */

// Sectors named in the project notes: AI/semis, broad market, energy, tech.
const SYMBOLS = ['NVDA.US', 'AMD.US', 'SPY.US', 'XOM.US', 'QQQ.US']
const NEWS_SYMBOL = 'NVDA.US'
const NEWS_LIMIT = 5

// Vercel runs UTC, so a briefing generated on a Tuesday evening in Central
// time would be filed under Wednesday. The browser sends its own local date.
const serverDate = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const isDateKey = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

// EODHD returns titles HTML-escaped: "Nvidia &amp; AMD" rather than "Nvidia & AMD".
const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rsquo: '\u2019', lsquo: '\u2018', rdquo: '\u201d', ldquo: '\u201c',
  mdash: '\u2014', ndash: '\u2013', hellip: '\u2026',
}

function decodeEntities(text) {
  if (typeof text !== 'string') return text
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED[name.toLowerCase()] ?? m)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Use POST — briefings are generated on demand.' })
  }

  const key = process.env.EODHD_API_KEY
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

  if (!key) return res.status(500).json({ error: 'EODHD_API_KEY is not configured.' })
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase env vars are not configured.' })
  }

  try {
    const [first, ...rest] = SYMBOLS

    const [quoteRes, newsRes] = await Promise.all([
      fetch(
        `https://eodhd.com/api/real-time/${first}?s=${rest.join(',')}&api_token=${key}&fmt=json`
      ),
      fetch(
        `https://eodhd.com/api/news?api_token=${key}&s=${NEWS_SYMBOL}&limit=${NEWS_LIMIT}&fmt=json`
      ),
    ])

    if (!quoteRes.ok) {
      const body = await quoteRes.text()
      // The free tier allows 20 calls a day and a briefing costs about six, so
      // running out is an ordinary outcome, not a crash. Say so plainly.
      const looksRateLimited =
        quoteRes.status === 429 || /limit|quota|exceed/i.test(body)
      return res.status(502).json({
        error: looksRateLimited
          ? 'Daily EODHD limit reached (20 calls/day on the free plan). It resets at midnight UTC.'
          : `EODHD quotes failed (${quoteRes.status})`,
        detail: body.slice(0, 200),
      })
    }

    const raw = await quoteRes.json()
    const rows = Array.isArray(raw) ? raw : [raw]

    // EODHD returns "NA" for a symbol the plan can't serve; keep the good ones
    // rather than failing the whole briefing.
    const quotes = rows
      .filter((r) => r && r.code && typeof r.close === 'number')
      .map((r) => ({
        symbol: String(r.code).replace('.US', ''),
        close: r.close,
        previous_close: r.previousClose ?? null,
        change: r.change ?? null,
        change_p: r.change_p ?? null,
        volume: r.volume ?? null,
        timestamp: r.timestamp ?? null,
      }))

    if (quotes.length === 0) {
      return res.status(502).json({ error: 'EODHD returned no usable quotes.', detail: rows })
    }

    // News is a nice-to-have; a failure here shouldn't lose the quotes.
    let headlines = []
    if (newsRes.ok) {
      const news = await newsRes.json()
      if (Array.isArray(news)) {
        headlines = news.slice(0, NEWS_LIMIT).map((n) => ({
          title: decodeEntities(n.title ?? ''),
          date: n.date ?? null,
          link: n.link ?? null,
        }))
      }
    }

    // Trust the client's local date when it sends a valid one; otherwise fall
    // back to the server's, which is UTC on Vercel.
    const clientDate = req.body && typeof req.body === 'object' ? req.body.date : undefined
    const row = {
      briefing_date: isDateKey(clientDate) ? clientDate : serverDate(),
      generated_at: new Date().toISOString(),
      quotes,
      headlines,
    }

    const save = await fetch(
      `${supabaseUrl}/rest/v1/market_briefings?on_conflict=briefing_date`,
      {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(row),
      }
    )

    if (!save.ok) {
      const body = await save.text()
      return res.status(502).json({
        error: `Could not save the briefing (${save.status})`,
        detail: body.slice(0, 300),
      })
    }

    const saved = await save.json()
    return res.status(200).json(Array.isArray(saved) ? saved[0] : saved)
  } catch (err) {
    return res.status(500).json({ error: 'Briefing failed.', detail: String(err?.message ?? err) })
  }
}
