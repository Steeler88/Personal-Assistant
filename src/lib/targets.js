/* Daily targets. Both are ranges to sit near, not lines to cross: around
 * 3000 kcal and around 200g of protein. Single-user app, so they live here as
 * constants rather than behind a settings screen. */

export const TARGETS = {
  calories: 3000,
  protein: 200,
}

/**
 * How far off a target sits. Deliberately symmetric, because "around 3000" is
 * missed by 2000 and by 4000 alike — a ceiling would say the first is fine.
 */
export function aroundTone(value, target) {
  if (value === null || value === undefined || !target) return 'idle'
  const off = Math.abs(Number(value) - target) / target
  if (off <= 0.1) return 'ok'
  if (off <= 0.25) return 'warn'
  return 'bad'
}

/**
 * A day you are still eating cannot have missed its target yet, so today reads
 * as progress and only finished days get judged.
 */
export const dayTone = (value, target, isToday) =>
  isToday ? 'idle' : aroundTone(value, target)

export const pctOf = (value, target) =>
  !target ? 0 : Math.max(0, Math.min(100, Math.round((Number(value ?? 0) / target) * 100)))
