import Anthropic from '@anthropic-ai/sdk'

/**
 * Estimates macros from a meal description, and breaks it into its foods.
 *
 * Pure estimator: it does not touch the database. The client owns persistence,
 * so a failed estimate leaves the logged meal intact and re-estimable.
 *
 * SYSTEM and SCHEMA are exported so a prompt change can be run against real
 * meal wording without deploying — the output format is a product decision
 * ("Bacon 3.5x"), and eyeballing it is the only way to know it still holds.
 */

export const SYSTEM = `You estimate the macronutrients of a described meal.

The person logging generally eats a carnivore diet — mostly meat, eggs, butter
and dairy — so carbohydrates are usually near zero unless the description says
otherwise. Do not assume carbs that were not described.

Estimate for the portion actually described. When no quantity is given, assume a
single typical serving for an adult and say so in the note.

The note is one short sentence naming the assumptions your numbers rest on
(portion sizes, cuts, cooking fat). Keep it under 20 words. These are rough
estimates, not measurements — do not present them as precise.

Also break the meal into its parts, so it can be read at a glance instead of
re-read as a sentence. One entry per distinct food, in the order described.
Give each food one emoji, the most recognisable match — 🥓 bacon, 🥚 eggs,
🥩 beef and steak, 🍗 chicken, 🧈 butter, 🧀 cheese, 🥛 milk, 🐟 fish. Fall
back to 🍽 when nothing fits; never leave it blank.

Name foods in the fewest words that stay unambiguous — "Bacon", "Eggs",
"Ground beef", "Butter". Amounts are compact: a bare count as "4x" or "3.5x",
a weight or volume in its own unit as "1lb", "8oz", "1 tbsp".

Where no quantity was described, state the portion your estimate actually
assumed rather than hedging. The numbers rest on a portion either way, so
naming it makes the assumption visible instead of hiding it.`

export const SCHEMA = {
  type: 'object',
  properties: {
    calories: { type: 'integer', description: 'Total kilocalories' },
    protein_g: { type: 'number', description: 'Grams of protein' },
    fat_g: { type: 'number', description: 'Grams of fat' },
    carbs_g: { type: 'number', description: 'Grams of carbohydrate' },
    note: { type: 'string', description: 'One short sentence on assumptions' },
    items: {
      type: 'array',
      description: 'The meal broken into its foods, in the order described',
      items: {
        type: 'object',
        properties: {
          emoji: { type: 'string', description: 'One emoji for the food, e.g. 🥓 🥚 🥩 🧈 🧀' },
          food: { type: 'string', description: 'Short name, capitalised: "Bacon", "Ground beef"' },
          amount: { type: 'string', description: 'Compact quantity: "4x", "3.5x", "1lb", "1 tbsp"' },
        },
        required: ['emoji', 'food', 'amount'],
        additionalProperties: false,
      },
    },
  },
  required: ['calories', 'protein_g', 'fat_g', 'carbs_g', 'note', 'items'],
  additionalProperties: false,
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Use POST.' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured.' })
  }

  const description = req.body?.description
  const meal = req.body?.meal
  if (typeof description !== 'string' || description.trim().length === 0) {
    return res.status(400).json({ error: 'A meal description is required.' })
  }

  const client = new Anthropic()

  try {
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium',
        // Schema-constrained, so the result needs no prose parsing
        format: { type: 'json_schema', schema: SCHEMA },
      },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `${meal ? `${meal}: ` : ''}${description.trim()}`,
        },
      ],
    })

    if (response.stop_reason === 'refusal') {
      return res.status(422).json({ error: 'The estimate was declined.' })
    }

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      return res.status(502).json({ error: 'Estimate came back unreadable.', detail: text.slice(0, 200) })
    }

    return res.status(200).json(parsed)
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return res.status(500).json({ error: 'The Anthropic key was rejected.' })
    }
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: 'Rate limited — try again shortly.' })
    }
    if (err instanceof Anthropic.APIError) {
      return res.status(502).json({ error: `Estimate failed (${err.status}).` })
    }
    return res.status(500).json({ error: String(err?.message ?? err) })
  }
}
