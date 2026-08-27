/* Meal logging shared between the nutrition screen and the home quick-log.
 * Both save first and estimate second, so a failed estimate never loses the
 * entry you typed. */

import { supabase } from './supabase'

export const MEALS = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
]

const ORDER = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 }

export function sortMeals(list) {
  return [...list].sort((a, b) =>
    ORDER[a.meal] !== ORDER[b.meal]
      ? ORDER[a.meal] - ORDER[b.meal]
      : a.created_at < b.created_at ? -1 : 1
  )
}

/** Only estimated meals count — a total that silently ignored a pending row
 *  would read as an accurate number that happens to be wrong. */
export function mealTotals(rows) {
  const estimated = rows.filter((r) => r.estimated_at)
  const totals = estimated.reduce(
    (acc, r) => ({
      calories: acc.calories + Number(r.calories ?? 0),
      protein: acc.protein + Number(r.protein_g ?? 0),
      fat: acc.fat + Number(r.fat_g ?? 0),
      carbs: acc.carbs + Number(r.carbs_g ?? 0),
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 }
  )
  return { ...totals, pending: rows.length - estimated.length }
}

/**
 * The foods to list, one per line, or null when there are none — meals logged
 * before the estimator returned items, and estimates that came back without
 * them, fall back to the sentence you typed.
 */
export function mealItems(row) {
  return Array.isArray(row?.items) && row.items.length ? row.items : null
}

/** One line of a listed meal: "Bacon - 3.5x". The mark is rendered separately
 *  so it can be styled as one, and so older items without one still read. */
export const itemLine = (i) => `${i.food} - ${i.amount}`

/** Guess the meal from the clock, so a quick log is one field instead of two. */
export function mealForNow(d = new Date()) {
  const h = d.getHours()
  if (h < 11) return 'breakfast'
  if (h < 15) return 'lunch'
  if (h < 21) return 'dinner'
  return 'snack'
}

/** Ask Claude for the macros and write them back. Returns the patch that was
 *  applied, or an error string — never throws. */
export async function estimateMacros(row) {
  try {
    const res = await fetch('/api/estimate-macros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: row.description, meal: row.meal }),
    })
    const body = await res.json()
    if (!res.ok) return { error: body.error || `Estimate failed (${res.status})` }

    const patch = {
      calories: body.calories,
      protein_g: body.protein_g,
      fat_g: body.fat_g,
      carbs_g: body.carbs_g,
      estimate_note: body.note,
      items: Array.isArray(body.items) && body.items.length ? body.items : null,
      estimated_at: new Date().toISOString(),
    }

    const { error } = await supabase.from('meals').update(patch).eq('id', row.id)
    if (error) return { error: error.message }
    return { patch }
  } catch (err) {
    return { error: String(err?.message ?? err) }
  }
}
