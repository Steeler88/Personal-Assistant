/**
 * Generates a market briefing. Runs on Vercel's servers, never in the browser,
 * because EODHD_API_KEY is a real secret — unlike the Supabase anon key, it is
 * not safe to ship in the client bundle.
 *
 * POST only: EODHD is billed per symbol against a 20/day free-tier quota, so a
 * briefing is generated deliberately, never as a side effect of a page load.
 * The dashboard reads the saved row from Supabase directly.
 */

import { summarise } from './_metrics.js'
import { pickDiverse } from './_news.js'

const SYMBOLS = ['VOO.US', 'QQQ.US', 'PLTR.US', 'NVDA.US', 'AMZN.US', 'TSLA.US', 'SOXL.US']

// Unfiltered market news, not one symbol's feed: asking for NVDA's news
// returned five Nvidia stories. Over-fetch, then thin it out.
const NEWS_FETCH = 40
const NEWS_LIMIT = 5

// Enough bars for a 200-day moving average plus slack for holidays.
const HISTORY_DAYS = 400

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
    const since = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString().slice(0, 10)

    // EOD history rather than real-time: on the free plan the real-time endpoint
    // returns the same closing figures, but a history call also yields the
    // multi-period performance, sparkline and indicators for the same quota.
    const [histResults, newsRes] = await Promise.all([
      Promise.all(
        SYMBOLS.map((sym) =>
          fetch(`https://eodhd.com/api/eod/${sym}?api_token=${key}&fmt=json&period=d&from=${since}`)
            .then(async (r) => ({ sym, ok: r.ok, status: r.status, body: r.ok ? await r.json() : await r.text() }))
            .catch((e) => ({ sym, ok: false, status: 0, body: String(e?.message ?? e) }))
        )
      ),
      fetch(`https://eodhd.com/api/news?api_token=${key}&limit=${NEWS_FETCH}&fmt=json`),
    ])

    const failures = histResults.filter((r) => !r.ok)
    const quotes = histResults
      .filter((r) => r.ok && Array.isArray(r.body))
      .map((r) => summarise(r.sym, r.body))
      .filter(Boolean)

    if (quotes.length === 0) {
      const detail = failures.map((f) => `${f.sym}: ${String(f.body).slice(0, 80)}`).join(' | ')
      // 20 calls a day with a ~6-call briefing makes exhaustion routine, and the
      // 500-call buffer absorbs overflow until it too runs out. Say which it is.
      const looksRateLimited = failures.some(
        (f) => f.status === 429 || /limit|quota|exceed/i.test(String(f.body))
      )
      return res.status(502).json({
        error: looksRateLimited
          ? 'EODHD limit reached — the daily 20 and the extra buffer are both used up.'
          : 'EODHD returned no usable history.',
        detail,
      })
    }

    // News is a nice-to-have; a failure here shouldn't lose the quotes.
    let headlines = []
    if (newsRes.ok) {
      const news = await newsRes.json()
      if (Array.isArray(news)) {
        // Decode first: entity-escaped titles would compare as different strings
        const decoded = news.map((n) => ({
          title: decodeEntities(n.title ?? ''),
          date: n.date ?? null,
          link: n.link ?? null,
        }))
        headlines = pickDiverse(decoded, { limit: NEWS_LIMIT })
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
      // Surfaced so a partly-failed briefing is visibly partial, not silently short
      skipped: failures.map((f) => f.sym.replace('.US', '')),
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
