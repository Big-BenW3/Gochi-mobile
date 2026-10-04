/**
 * Companion conditions — the game's core state vocabulary.
 *
 * Source: SOLGOTCHI_PRODUCT.md section 5.2.
 *
 * These are *game* states. They describe the companion, never the person using
 * the app. The spec is explicit about this and the distinction is load-bearing:
 * a condition badge that implied anything about the user's security or health
 * would be a lie. See section 7.4 for the separate three-state shield model
 * (Confirmed / Inferred / Unknown), which is deliberately NOT folded in here.
 */
import { colors } from '../../theme/tokens'

export const conditionIds = [
  'HEALTHY',
  'ENERGIZED',
  'TIRED',
  'ALERT',
  'DAMAGED',
  'RECOVERING',
  'EVOLVING',
  'SLEEPING',
] as const

export type ConditionId = (typeof conditionIds)[number]

/**
 * Which of the authored animations plays in this condition.
 *
 * Names come from the Blender animation list in section 11.5. `null` means the
 * condition has no bespoke clip and the companion falls back to Idle — the spec
 * requires that a missing animation degrades to idle rather than breaking.
 */
const animations: Record<ConditionId, string | null> = {
  HEALTHY: 'Idle',
  ENERGIZED: 'EnergyPulse',
  TIRED: 'Idle',
  ALERT: 'Alert',
  DAMAGED: 'Hit',
  RECOVERING: 'Recover',
  EVOLVING: 'Evolution',
  SLEEPING: 'Sleep',
}

/**
 * Per-condition colour. Mapped from the palette so that each hue has exactly one
 * job — the original palette had four competing neons and no focal point, and
 * no colour at all for DAMAGED or for XP.
 *
 * Note TIRED reuses a neutral on purpose: "drained" should read as *less*, not
 * as a new colour competing for attention.
 */
const conditionColors: Record<ConditionId, string> = {
  HEALTHY: colors.primary,
  ENERGIZED: colors.primaryLit,
  TIRED: colors.fog400,
  ALERT: colors.signal,
  DAMAGED: colors.damage,
  RECOVERING: colors.recover,
  EVOLVING: colors.evolve,
  SLEEPING: colors.ink600,
}

/**
 * Short label for the badge.
 *
 * Kept to a single word so the badge stays compact, and worded to describe the
 * companion rather than the user's wallet.
 */
const conditionLabels: Record<ConditionId, string> = {
  HEALTHY: 'Healthy',
  ENERGIZED: 'Energized',
  TIRED: 'Tired',
  ALERT: 'Alert',
  DAMAGED: 'Damaged',
  RECOVERING: 'Recovering',
  EVOLVING: 'Evolving',
  SLEEPING: 'Sleeping',
}

/**
 * Plain-language explanation shown on the condition detail sheet (screen B04).
 *
 * Every string names the *reason* in terms of an action the user took or a
 * passage of time, never an abstract metric. "Because you completed a swap"
 * teaches the loop; "Energy 72%" does not.
 */
const conditionReasons: Record<ConditionId, string> = {
  HEALTHY: 'Nothing unusual is happening. Your companion is in its normal state.',
  ENERGIZED: 'You made a recent move onchain, so your companion is running hot.',
  TIRED: 'Your wallet has been quiet for a while and energy has run down.',
  ALERT: 'Something important happened that your companion wants you to look at.',
  DAMAGED: 'Your companion’s shield has worn down below its normal protection.',
  RECOVERING: 'Your companion is rebuilding strength after a recovery event.',
  EVOLVING: 'Your companion has reached a new form and is changing.',
  SLEEPING: 'It has been a long time since you visited, so your companion is resting.',
}

export type CompanionCondition = {
  id: ConditionId
  label: string
  reason: string
  color: string
  animation: string | null
}

/**
 * Look a condition up in one call.
 *
 * Unknown input falls back to HEALTHY rather than throwing: a companion whose
 * state the client has not heard about yet should still render, and the server
 * remains the only authority on the real value.
 */
export function getCondition(id: string | null | undefined): CompanionCondition {
  const known = conditionIds.includes(id as ConditionId) ? (id as ConditionId) : 'HEALTHY'

  return {
    id: known,
    label: conditionLabels[known],
    reason: conditionReasons[known],
    color: conditionColors[known],
    animation: animations[known],
  }
}

/** Every condition, in the order shown on the condition timeline. */
export const allConditions: CompanionCondition[] = conditionIds.map((id) => getCondition(id))
