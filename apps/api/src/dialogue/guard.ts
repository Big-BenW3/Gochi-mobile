/**
 * §8.4 no-spam rules and §28.2 notification preferences.
 *
 * The engine emits the *intent* (a templateKey); this layer decides whether a
 * second message adds anything. Two rules, deterministic and testable:
 *
 *  - cooldown: the same templateKey at most once per 60s
 *  - burst: when the same event type fires repeatedly within a 5-minute window,
 *    fold the per-event lines into one summary with the real count
 */

import { DIALOGUE_TEMPLATES } from './templates.js'

export interface RecentDialogueRow {
  templateKey: string
  createdAt: Date
}

const COOLDOWN_MS = 60_000
export const BURST_WINDOW_MS = 5 * 60_000
const BURST_THRESHOLD = 3 // per-event lines before one summary wins

/** §8.4 decision for one incoming templateKey. */
export function decideDialogue(
  templateKey: string,
  recent: RecentDialogueRow[],
  swapEventsInWindow: number,
  now: Date,
): { action: 'post' } | { action: 'burst'; count: number } | { action: 'suppress' } {
  const priority = DIALOGUE_TEMPLATES[templateKey]?.priority ?? 'normal'

  // Critical lines (§28.1) always get through — a level-up can't cooldown out.
  if (priority === 'critical') return { action: 'post' }

  const window = recent.filter((r) => now.getTime() - r.createdAt.getTime() < BURST_WINDOW_MS)

  // Burst fold: swap_encouragement arriving when the window already holds
  // per-event swap lines (or an open burst row) collapses into one summary.
  if (templateKey === 'swap_encouragement') {
    const swapLines = window.filter((r) => r.templateKey === 'swap_encouragement').length
    const burstOpen = window.some((r) => r.templateKey === 'swap_burst')
    if (burstOpen || swapLines >= BURST_THRESHOLD - 1) {
      return { action: 'burst', count: swapEventsInWindow }
    }
  }

  const sameKeyRecent = window.find(
    (r) => r.templateKey === templateKey && now.getTime() - r.createdAt.getTime() < COOLDOWN_MS,
  )
  if (sameKeyRecent) return { action: 'suppress' }

  return { action: 'post' }
}
