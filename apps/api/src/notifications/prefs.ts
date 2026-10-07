/**
 * §28.2 notification preferences, as pure functions.
 *
 * Kept free of drizzle so the rules — category toggles, quiet hours, daily cap —
 * are provable without a database. `apply.ts` reads the row and calls these; the
 * same functions decide what a route preview would show.
 */

export interface Prefs {
  /** System notifications: level-up, shield, sync issues. */
  systemEnabled: boolean
  /** Companion chatter (§8 dialogue lines). */
  dialogueEnabled: boolean
  /** Local hour 0-23 where quiet hours begin, inclusive. NULL = disabled. */
  quietStartHour: number | null
  /** Local hour 0-23 where quiet hours end, exclusive. */
  quietEndHour: number | null
  /** Max non-critical notifications per UTC day. */
  dailyCap: number
}

export const DEFAULT_PREFS: Prefs = {
  systemEnabled: true,
  dialogueEnabled: true,
  quietStartHour: null,
  quietEndHour: null,
  dailyCap: 20,
}

export type Priority = 'critical' | 'high' | 'normal'
export type Category = 'system' | 'dialogue'

/**
 * Quiet hours, handling the window that wraps past midnight (22 → 7).
 * A window where start === end is treated as disabled rather than "always
 * quiet", since that is never what a user setting it means.
 */
export function inQuietHours(prefs: Prefs, hourUtc: number): boolean {
  const { quietStartHour: start, quietEndHour: end } = prefs
  if (start == null || end == null || start === end) return false
  if (start < end) return hourUtc >= start && hourUtc < end
  return hourUtc >= start || hourUtc < end
}

/**
 * Whether a notification of this priority/category may be delivered.
 *
 * §28.1 critical items (level-up, evolution, auth problems) bypass every
 * preference: a user who muted the companion still needs to know it evolved.
 */
export function allowsNotification(
  prefs: Prefs,
  priority: Priority,
  category: Category,
  hourUtc: number,
): boolean {
  if (priority === 'critical') return true
  if (category === 'dialogue' && !prefs.dialogueEnabled) return false
  if (category === 'system' && !prefs.systemEnabled) return false
  if (inQuietHours(prefs, hourUtc) && priority === 'normal') return false
  return true
}

/** §28.2 daily cap. Critical items do not consume the budget. */
export function capReached(prefs: Prefs, nonCriticalToday: number): boolean {
  return nonCriticalToday >= prefs.dailyCap
}
