/**
 * Headline selection. The feed repeats itself: the same story is filed by
 * several outlets, and one big earnings day floods it with a single company.
 * This picks a spread rather than the first N.
 */

const STOP = new Set([
  'the', 'and', 'for', 'with', 'its', 'from', 'after', 'over', 'into', 'are',
  'but', 'was', 'will', 'can', 'could', 'what', 'why', 'how', 'has', 'have',
  'this', 'that', 'than', 'their', 'says', 'said', 'new', 'amid', 'about',
])

/** Significant lowercase tokens, punctuation stripped. */
function tokens(title) {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  )
}

function jaccard(a, b) {
  let shared = 0
  for (const t of a) if (b.has(t)) shared++
  const union = a.size + b.size - shared
  return union ? shared / union : 0
}

// One earnings day otherwise fills every slot with the same company.
const COMPANIES = {
  nvidia: 'NVDA', nvda: 'NVDA',
  amazon: 'AMZN', amzn: 'AMZN',
  tesla: 'TSLA', tsla: 'TSLA', musk: 'TSLA',
  palantir: 'PLTR', pltr: 'PLTR',
  apple: 'AAPL', microsoft: 'MSFT', google: 'GOOGL', alphabet: 'GOOGL',
  meta: 'META', broadcom: 'AVGO', intel: 'INTC', micron: 'MU',
}

/** Whichever company is named first in the headline, not first in our list. */
function companyOf(title) {
  const lower = title.toLowerCase()
  let best = null
  let bestAt = Infinity
  for (const [word, ticker] of Object.entries(COMPANIES)) {
    const at = lower.indexOf(word)
    if (at !== -1 && at < bestAt) {
      bestAt = at
      best = ticker
    }
  }
  return best
}

/**
 * @param items       raw headlines, most recent first
 * @param limit       how many to keep
 * @param similarity  0-1; above this two headlines count as the same story
 * @param perCompany  max headlines about any one company
 */
export function pickDiverse(items, { limit = 5, similarity = 0.4, perCompany = 1 } = {}) {
  const kept = []
  const keptTokens = []
  const companyCount = {}

  for (const item of items) {
    const title = (item?.title ?? '').trim()
    if (!title) continue

    const tk = tokens(title)
    if (tk.size === 0) continue

    // Same story, different outlet
    if (keptTokens.some((k) => jaccard(tk, k) >= similarity)) continue

    // Different story, same company, already covered
    const company = companyOf(title)
    if (company) {
      if ((companyCount[company] ?? 0) >= perCompany) continue
      companyCount[company] = (companyCount[company] ?? 0) + 1
    }

    kept.push(item)
    keptTokens.push(tk)
    if (kept.length >= limit) break
  }

  return kept
}
