/* Daily targets. Both are ranges to sit near, not lines to cross: around
 * 3000 kcal and around 200g of protein. Single-user app, so they live here as
 * constants rather than behind a settings screen. */

export const TARGETS = {
  calories: 3000,
  protein: 200,
}

import { proximity } from './bands'

export { proximity as aroundTone }

/**
 * A day you are still eating cannot have missed its target yet, so today reads
 * as progress and only finished days get judged.
 */
export const dayTone = (value, target, isToday) =>
  isToday ? 'idle' : proximity(value, target)

export const pctOf = (value, target) =>
  !target ? 0 : Math.max(0, Math.min(100, Math.round((Number(value ?? 0) / target) * 100)))
