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
import { generateInsight } from './_insight.js'

// The watchlist lives in Supabase so it can be edited without a deploy. This
// is the fallback for a database that has not had SCHEMA-market.sql re-run yet,
// and for a watchlist someone has emptied — a briefing of nothing is worse than
// a briefing of the original seven.
const DEFAULT_SYMBOLS = ['VOO', 'QQQ', 'PLTR', 'NVDA', 'AMZN', 'TSLA', 'SOXL']

/** Bare tickers, as stored; EODHD's ".US" suffix is added at call time. */
async function watchlist(supabaseUrl, supabaseKey) {
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/watchlist?select=symbol&order=added_at.asc`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    })
    if (!r.ok) return DEFAULT_SYMBOLS
    const rows = await r.json()
    const symbols = Array.isArray(rows) ? rows.map((x) => x.symbol).filter(Boolean) : []
    return symbols.length ? symbols : DEFAULT_SYMBOLS
  } catch {
    return DEFAULT_SYMBOLS
  }
}

// Unfiltered market news, not one symbol's feed: asking for NVDA's news
// returned five Nvidia stories. Over-fetch, then thin it out.
const NEWS_FETCH = 40
const NEWS_LIMIT = 5

// Headlines don't turn over minute to minute; refetch at most this often.
const NEWS_MAX_AGE_MS = 3 * 60 * 60 * 1000

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

  const clientDate = req.body && typeof req.body === 'object' ? req.body.date : undefined
  const row_date = isDateKey(clientDate) ? clientDate : serverDate()

  try {
    const since = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString().slice(0, 10)
    const force = !!(req.body && typeof req.body === 'object' && req.body.force)
    const today = row_date

    const eodUrl = (sym) =>
      `https://eodhd.com/api/eod/${sym}?api_token=${key}&fmt=json&period=d&from=${since}`

    // What we already have, so a refresh can reuse the parts that cannot move.
    const prevRes = await fetch(
      `${supabaseUrl}/rest/v1/market_briefings?select=*&order=briefing_date.desc&limit=1`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    )
    const prevRows = prevRes.ok ? await prevRes.json() : []
    const prev = Array.isArray(prevRows) ? prevRows[0] : null

    const SYMBOLS = (await watchlist(supabaseUrl, supabaseKey)).map((sym) => `${sym}.US`)

    // Live quotes are the point of the button, so always fetch them. They also
    // carry previousClose, which gives today's move without any EOD call.
    const [liveFirst, ...liveRest] = SYMBOLS
    const liveRes = await fetch(
      `https://eodhd.com/api/real-time/${liveFirst}?s=${liveRest.join(',')}&api_token=${key}&fmt=json`
    )

    if (!liveRes.ok) {
      const body = await liveRes.text()
      const looksRateLimited = liveRes.status === 429 || /limit|quota|exceed/i.test(body)
      return res.status(502).json({
        error: looksRateLimited
          ? 'EODHD limit reached — the daily allowance and the extra buffer are both used up.'
          : `EODHD live quotes failed (${liveRes.status})`,
        detail: body.slice(0, 200),
      })
    }

    const liveRaw = await liveRes.json()
    const liveRows = Array.isArray(liveRaw) ? liveRaw : [liveRaw]
    const live = {}
    for (const r of liveRows) {
      if (!r || !r.code || typeof r.close !== 'number') continue
      live[String(r.code).replace('.US', '')] = {
        price: r.close,
        previous_close: typeof r.previousClose === 'number' ? r.previousClose : null,
        change: typeof r.change === 'number' ? r.change : null,
        change_p: typeof r.change_p === 'number' ? r.change_p : null,
        timestamp: r.timestamp ?? null,
      }
    }

    // History only shifts after a close, so pull it once a day rather than on
    // every refresh. That keeps an intraday refresh to one call per symbol.
    //
    // Cached per symbol rather than all-or-nothing. Treating the day's cache as
    // complete meant a ticker added after the first briefing was never in it,
    // so it stayed unpriced until the next day — while still costing a live
    // call every refresh, because the live fetch asked for it and the merge
    // then dropped it for having no context.
    const bare = SYMBOLS.map((sym) => sym.replace('.US', ''))
    const cacheUsable = !force && prev?.eod_fetched_on === today && Array.isArray(prev?.quotes)

    // Symbols taken off the watchlist drop out here rather than lingering in
    // every future briefing.
    const cached = cacheUsable ? prev.quotes.filter((q) => bare.includes(q.symbol)) : []
    const covered = new Set(cached.map((q) => q.symbol))
    const needHistory = SYMBOLS.filter((sym) => !covered.has(sym.replace('.US', '')))

    let failures = []
    let fetched = []
    const eodFetchedOn = today

    if (needHistory.length) {
      const histResults = await Promise.all(
        needHistory.map((sym) =>
          fetch(eodUrl(sym))
            .then(async (r) => ({ sym, ok: r.ok, status: r.status, body: r.ok ? await r.json() : await r.text() }))
            .catch((e) => ({ sym, ok: false, status: 0, body: String(e?.message ?? e) }))
        )
      )
      failures = histResults.filter((r) => !r.ok)
      fetched = histResults
        .filter((r) => r.ok && Array.isArray(r.body))
        .map((r) => summarise(r.sym, r.body))
        .filter(Boolean)
    }

    // Back into watchlist order, so the list does not reshuffle when one
    // symbol happens to come from the cache and another from a fresh fetch.
    const order = new Map(bare.map((sym, i) => [sym, i]))
    const context = [...cached, ...fetched].sort(
      (a, b) => (order.get(a.symbol) ?? 999) - (order.get(b.symbol) ?? 999)
    )

    // Merge the live figure onto each symbol's context. Prefer live for today's
    // move; fall back to the EOD comparison outside market hours.
    const quotes = (context ?? []).map((q) => {
      const l = live[q.symbol]
      if (!l) return { ...q, live: null }
      return {
        ...q,
        live: l,
        change_p: l.change_p ?? q.change_p,
        change: l.change ?? q.change,
      }
    })

    if (quotes.length === 0) {
      const detail = failures.map((f) => `${f.sym}: ${String(f.body).slice(0, 80)}`).join(' | ')
      return res.status(502).json({ error: 'EODHD returned no usable data.', detail })
    }

    // News is a nice-to-have; a failure here shouldn't lose the quotes.
    let headlines = Array.isArray(prev?.headlines) ? prev.headlines : []
    const newsAgeMs = prev?.generated_at ? Date.now() - new Date(prev.generated_at).getTime() : Infinity
    const newsIsStale = force || headlines.length === 0 || newsAgeMs > NEWS_MAX_AGE_MS
    const newsRes = newsIsStale
      ? await fetch(`https://eodhd.com/api/news?api_token=${key}&limit=${NEWS_FETCH}&fmt=json`)
      : null
    if (newsRes?.ok) {
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

    // Written over the final numbers, so the prose matches what's displayed.
    const { insight, error: insightError } = await generateInsight({ quotes, headlines })

    const row = {
      briefing_date: row_date,
      insight,
      generated_at: new Date().toISOString(),
      quotes,
      headlines,
      eod_fetched_on: eodFetchedOn,
      // Persisted, so a partly-failed briefing stays visibly partial on reload
      skipped: failures.map((f) => f.sym.replace('.US', '')),
    }

    // Not persisted: why the insight is missing matters now, not tomorrow
    const meta = { insight_error: insightError }

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
    const savedRow = Array.isArray(saved) ? saved[0] : saved
    return res.status(200).json({ ...savedRow, ...meta })
  } catch (err) {
    return res.status(500).json({ error: 'Briefing failed.', detail: String(err?.message ?? err) })
  }
}
