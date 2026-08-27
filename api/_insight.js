import Anthropic from '@anthropic-ai/sdk'

/**
 * Writes the short "insight for the next day" paragraph over the briefing data.
 *
 * Deliberately descriptive, not advisory: it reports what moved and the context
 * around it. It is explicitly instructed not to recommend buying or selling,
 * because this is a personal dashboard, not a licensed advice service.
 */

const SYSTEM = `You write a brief market note for one person's personal dashboard.

You are given closing and current prices for a fixed set of tickers, their
performance over several periods, RSI and moving-average position, plus a few
market headlines.

Write ONE paragraph, 60-90 words, covering:
- the most notable move or moves in this specific set, with the figure
- any relevant connection to the headlines provided
- what is worth watching next session

Rules:
- Describe what happened and why it may have happened. Do not recommend buying,
  selling, holding, or sizing a position, and do not give price targets.
- Use only the data provided. Do not invent figures, events, or causes. If the
  headlines do not explain a move, say the move happened without claiming a cause.
- Plain prose. No bullet points, no headings, no preamble like "Here is".
- Refer to tickers by symbol.`

function compactData(quotes, headlines) {
  const lines = quotes.map((q) => {
    const p = q.perf ?? {}
    const price = q.live?.price ?? q.close
    const bits = [
      `${q.symbol}: ${price}`,
      `today ${q.change_p ?? '?'}%`,
      `1W ${p.w1 ?? '?'}%`,
      `1M ${p.m1 ?? '?'}%`,
      `YTD ${p.ytd ?? '?'}%`,
    ]
    if (q.rsi14 != null) bits.push(`RSI ${q.rsi14}`)
    if (q.sma50 != null && price != null) {
      bits.push(`${price >= q.sma50 ? 'above' : 'below'} 50d`)
    }
    return bits.join(', ')
  })

  const news = (headlines ?? []).map((h) => `- ${h.title}`).join('\n')

  return `QUOTES\n${lines.join('\n')}\n\nHEADLINES\n${news || '(none available)'}`
}

export async function generateInsight({ quotes, headlines }) {
  if (!process.env.ANTHROPIC_API_KEY) return { insight: null, error: 'no-key' }
  if (!Array.isArray(quotes) || quotes.length === 0) return { insight: null, error: 'no-data' }

  const client = new Anthropic()

  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5',
      max_tokens: 16000,
      // Adaptive thinking: budget_tokens is rejected on Opus 5. Medium effort
      // suits a short summary over data that is already computed.
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      // Route around a policy decline rather than returning nothing
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: compactData(quotes, headlines) }],
    })

    if (response.stop_reason === 'refusal') {
      return { insight: null, error: 'refused' }
    }

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    return { insight: text || null, error: text ? null : 'empty' }
  } catch (err) {
    // Typed classes, most specific first, so a transient 429 is distinguishable
    // from a bad key. A failure here must not lose the quotes.
    if (err instanceof Anthropic.AuthenticationError) return { insight: null, error: 'bad-key' }
    if (err instanceof Anthropic.RateLimitError) return { insight: null, error: 'rate-limited' }
    if (err instanceof Anthropic.APIError) return { insight: null, error: `api-${err.status}` }
    return { insight: null, error: String(err?.message ?? err) }
  }
}
