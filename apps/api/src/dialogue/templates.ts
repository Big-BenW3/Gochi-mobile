/**
 * Authored dialogue lines — §8.3. Short, character-consistent, and authored
 * (§8.1: V1 is template-driven, not LLM-driven). The registry is the single
 * place that turns the engine's `templateKey` into a line a user can read, so
 * changing tone is a content edit, not a code change.
 */

export interface DialogueTemplate {
  /** Drives §28.1 priority routing when used as a notification. */
  priority: 'critical' | 'high' | 'normal'
  lines: string[]
}

export const DIALOGUE_TEMPLATES: Record<string, DialogueTemplate> = {
  swap_encouragement: {
    priority: 'normal',
    lines: [
      'That move gave me a boost.',
      'Another clean trade. Aura settled.',
      'Markets were not gentle. I held position.',
    ],
  },
  staking_energy: {
    priority: 'normal',
    lines: ['I feel the extra energy.', 'Staked and steady. This buys us time.'],
  },
  shield_recovered: {
    priority: 'high',
    lines: ['Shield restored. Back online.', 'Coverage is holding again.'],
  },
  level_up: {
    priority: 'critical',
    lines: ['We are getting stronger.'],
  },
  evolved: {
    priority: 'critical',
    lines: ['Something in me shifted. New form — still yours.'],
  },
  long_inactivity: {
    priority: 'normal',
    lines: ['You have been quiet. I am still here.'],
  },
  /** §8.4 — one summary instead of N per-swap lines. */
  swap_burst: {
    priority: 'normal',
    lines: [],
  },
}

export function templateFor(key: string): DialogueTemplate {
  return (
    DIALOGUE_TEMPLATES[key] ?? {
      priority: 'normal',
      lines: ['Something happened out there. I am still watching.'],
    }
  )
}

export function renderLine(key: string, seed = 0): string {
  const t = DIALOGUE_TEMPLATES[key]
  if (!t) return 'Something happened out there. I am still watching.'
  if (t.lines.length === 0) return ''
  return t.lines[seed % t.lines.length]
}
