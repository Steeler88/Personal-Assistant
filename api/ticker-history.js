/**
 * Fills in everything the expanded ticker view needs, and keeps it filled.
 *
 * The free plan hands back exactly one year of EOD however far back you ask,
 * so this is not a cache in front of the API — it is the only way the app
 * accumulates more than a year. Each run appends the newest bars to what is
 * already stored and discards nothing.
 *
 * Idempotent per symbol: run it twice and the second run costs one call and
 * changes nothing.
 */

const REFERENCE_TTL_DAYS = 3650   // a company's name and ISIN do not move
const ACTIONS_TTL_DAYS = 90       // dividends and splits, quarterly

const supabase = () => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  return { url, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } }
}

async function upsert(table, rows, onConflict) {
  if (!rows.length) return 0
  const { url, headers } = supabase()
  const res = await fetch(`${url}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error(`Saving ${table} failed (${res.status}): ${(await res.text()).slice(0, 160)}`)
  return rows.length
}

async function readOne(path) {
  const { url, headers } = supabase()
  const res = await fetch(`${url}/rest/v1/${path}`, { headers })
  if (!res.ok) return null
  const rows = await res.json()
  return Array.isArray(rows) ? rows[0] ?? null : null
}

const olderThan = (iso, days) =>
  !iso || Date.now() - new Date(iso).getTime() > days * 86400000

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v))

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Use POST.' })
  }

  const key = process.env.EODHD_API_KEY
  if (!key) return res.status(500).json({ error: 'EODHD_API_KEY is not configured.' })

  const symbol = typeof req.body?.symbol === 'string' ? req.body.symbol.trim().toUpperCase() : ''
  if (!/^[A-Z][A-Z0-9.\-]{0,11}$/.test(symbol)) {
    return res.status(400).json({ error: 'That does not look like a ticker.' })
  }
  const force = req.body?.force === true

  const spent = { eod: 0, search: 0, dividends: 0, splits: 0 }

  try {
    const meta = await readOne(`tickers?symbol=eq.${symbol}&select=*`)
    const newest = await readOne(`eod_bars?symbol=eq.${symbol}&select=bar_date&order=bar_date.desc&limit=1`)
    const knownSplits = await readOne(`splits?symbol=eq.${symbol}&select=split_date&order=split_date.desc&limit=1`)

    // ---- reference data: once, ever ----
    let reference = null
    if (force || olderThan(meta?.reference_at, REFERENCE_TTL_DAYS)) {
      const r = await fetch(`https://eodhd.com/api/search/${symbol}?api_token=${key}&fmt=json`)
      spent.search += 1
      if (r.ok) {
        const hits = await r.json()
        const hit = Array.isArray(hits) ? hits.find((h) => h.Code === symbol) ?? hits[0] : null
        if (hit) {
          reference = {
            name: hit.Name ?? null, type: hit.Type ?? null,
            exchange: hit.Exchange ?? null, currency: hit.Currency ?? null,
            isin: hit.ISIN ?? null,
          }
        }
      }
    }

    // ---- corporate actions ----
    let sawNewSplit = false
    let actionsFetched = false
    if (force || olderThan(meta?.actions_at, ACTIONS_TTL_DAYS)) {
      actionsFetched = true
      const [divRes, splitRes] = await Promise.all([
        fetch(`https://eodhd.com/api/div/${symbol}?api_token=${key}&fmt=json`),
        fetch(`https://eodhd.com/api/splits/${symbol}?api_token=${key}&fmt=json`),
      ])
      spent.dividends += 1
      spent.splits += 1

      if (divRes.ok) {
        const rows = await divRes.json()
        await upsert('dividends', (Array.isArray(rows) ? rows : []).map((d) => ({
          symbol, ex_date: d.date, amount: num(d.value), currency: d.currency ?? null,
          declaration_date: d.declarationDate || null, record_date: d.recordDate || null,
          payment_date: d.paymentDate || null, period: d.period ?? null,
        })).filter((d) => d.ex_date), 'symbol,ex_date')
      }

      if (splitRes.ok) {
        const rows = await splitRes.json()
        const parsed = (Array.isArray(rows) ? rows : []).map((s) => {
          const [a, b] = String(s.split ?? '').split('/').map(Number)
          return {
            symbol, split_date: s.date, ratio: s.split ?? null,
            factor: b ? Number((a / b).toFixed(6)) : null,
          }
        }).filter((s) => s.split_date)
        // A split newer than any we had means every adjusted close before it
        // has moved, so appending would leave the series inconsistent.
        sawNewSplit = parsed.some((s) => !knownSplits || s.split_date > knownSplits.split_date)
        await upsert('splits', parsed, 'symbol,split_date')
      }
    }

    // ---- the bars ----
    const full = force || sawNewSplit || !newest
    const from = full ? '1980-01-01' : newest.bar_date
    const eodRes = await fetch(
      `https://eodhd.com/api/eod/${symbol}.US?from=${from}&period=d&api_token=${key}&fmt=json`
    )
    spent.eod += 1
    if (!eodRes.ok) {
      const body = await eodRes.text()
      const limited = eodRes.status === 429 || /limit|quota|exceed/i.test(body)
      return res.status(limited ? 429 : 502).json({
        error: limited ? 'EODHD limit reached.' : `History for ${symbol} failed (${eodRes.status}).`,
      })
    }

    const bars = await eodRes.json()
    const rows = (Array.isArray(bars) ? bars : []).map((b) => ({
      symbol, bar_date: b.date,
      open: num(b.open), high: num(b.high), low: num(b.low),
      close: num(b.close), adjusted: num(b.adjusted_close), volume: num(b.volume),
    })).filter((b) => b.bar_date && b.close !== null)

    const stored = await upsert('eod_bars', rows, 'symbol,bar_date')

    const now = new Date().toISOString()
    await upsert('tickers', [{
      symbol,
      ...(reference ?? {}),
      ...(reference ? { reference_at: now } : {}),
      ...(actionsFetched ? { actions_at: now } : {}),
      ...(full ? { history_at: now } : {}),
    }], 'symbol')

    return res.status(200).json({
      symbol,
      bars: stored,
      from,
      full,
      refetchedForSplit: sawNewSplit,
      reference,
      calls: spent.eod + spent.search + spent.dividends + spent.splits,
    })
  } catch (err) {
    return res.status(502).json({ error: String(err?.message ?? err) })
  }
}
