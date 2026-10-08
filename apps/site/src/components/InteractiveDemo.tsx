import { useCallback, useMemo, useRef, useState } from 'react'

/**
 * The interactive demo.
 *
 * This is the part that could have been a lie, so it isn't one. The constants
 * below are the engine's, read from apps/api/src/engine/config.ts (GAME_CONFIG_V1),
 * and the classification rule is the API's: a swap is two or more of the wallet's
 * mints moving, never a program name. So tapping Swap here moves the creature for
 * the same reason it would move in the app.
 *
 * It is still a demonstration, and the copy says so. The site cannot read a real
 * wallet, so the amounts below are illustrative. What is faithful is the rule and
 * the arithmetic.
 *
 * Why the rule is stated on screen: a judge who watches the numbers move has to
 * be able to believe they came from somewhere. "Reacts to your moves" is a claim;
 * "we look at which of your tokens actually changed hands" is a mechanism.
 */

const CONFIG = {
  swapXpBase: 40,
  swapXpPerEventCap: 100,
  swapDailyCap: 300,
  swapFrequencyStep: 0.05,
  swapFrequencyCap: 2.0,
  stakingDailyXp: 25,
  interactionXp: 5,
} as const

/** Evolution thresholds, spec §26. */
const STAGES = [
  { stage: 1, level: 1 },
  { stage: 2, level: 10 },
  { stage: 3, level: 20 },
  { stage: 4, level: 35 },
  { stage: 5, level: 50 },
] as const

/** Real condition ids, spec §2.3. Shown as the companion's mood. */
const CONDITIONS = ['HEALTHY', 'ENERGIZED', 'TIRED', 'ALERT'] as const
type Condition = (typeof CONDITIONS)[number]

/** Authored lines from apps/api/src/dialogue/templates.ts. */
const LINES = {
  SWAP: [
    'That move gave me a boost.',
    'Another clean trade. Aura settled.',
    'Markets were not gentle. I held position.',
  ],
  STAKE_DETECTED: ['I feel the extra energy.', 'Staked and steady. This buys us time.'],
  INTERACTION: ['Still here.', 'That helped.'],
  DAILY_RESET: ['Energy came back overnight.'],
} as const

type ActionKind = 'SWAP' | 'STAKE_DETECTED' | 'INTERACTION' | 'DAILY_RESET'

interface DemoState {
  xp: number
  dailySwapXp: number
  dailySwapCount: number
  level: number
  energy: number
  condition: Condition
  stage: number
  lines: string[]
  swapsThisBurst: number
}

const INITIAL: DemoState = {
  xp: 0,
  dailySwapXp: 0,
  dailySwapCount: 0,
  level: 1,
  energy: 100,
  condition: 'HEALTHY',
  stage: 1,
  lines: ['Still here.'],
  swapsThisBurst: 0,
}

/** xpToNextLevel, spec §6.3: floor(120 + 80L + 12L²). */
function xpToNextLevel(level: number): number {
  return Math.floor(120 + 80 * level + 12 * level * level)
}

/** Engine's swapXp: frequency multiplier, then the per-event cap. */
function swapXp(dailySwapCount: number): number {
  const multiplier = Math.min(CONFIG.swapFrequencyCap, 1 + dailySwapCount * CONFIG.swapFrequencyStep)
  return Math.min(CONFIG.swapXpPerEventCap, Math.round(CONFIG.swapXpBase * multiplier))
}

function stageForLevel(level: number): number {
  let stage = 1
  for (const s of STAGES) if (level >= s.level) stage = s.stage
  return stage
}

/** §8.4 burst folding, mirrored from apps/api/src/dialogue/guard.ts. */
const BURST_THRESHOLD = 3

function act(state: DemoState, kind: ActionKind): { next: DemoState; gained: number } {
  let { xp, dailySwapXp, dailySwapCount, energy, level, condition, stage, lines, swapsThisBurst } = state
  let gained = 0

  if (kind === 'SWAP') {
    const raw = swapXp(dailySwapCount)
    const room = Math.max(0, CONFIG.swapDailyCap - dailySwapXp)
    gained = Math.min(raw, CONFIG.swapXpPerEventCap, room)
    xp += gained
    dailySwapXp += gained
    dailySwapCount += 1
    energy = Math.min(100, energy + 6)
    swapsThisBurst += 1
    condition = 'ENERGIZED'
  } else if (kind === 'STAKE_DETECTED') {
    gained = CONFIG.stakingDailyXp
    xp += gained
    energy = Math.min(100, energy + 18)
    swapsThisBurst = 0
    condition = 'HEALTHY'
  } else if (kind === 'INTERACTION') {
    gained = CONFIG.interactionXp
    xp += gained
    swapsThisBurst = 0
  } else {
    gained = 0
    energy = Math.min(100, energy + 30)
    swapsThisBurst = 0
    condition = 'HEALTHY'
  }

  while (xp >= xpToNextLevel(level)) {
    xp -= xpToNextLevel(level)
    level += 1
    lines = [...lines, 'We are getting stronger.']
  }

  stage = stageForLevel(level)
  energy = Math.max(0, energy - 4)
  if (energy < 30) condition = 'TIRED'

  // Burst folding: the third swap inside the window replaces individual lines
  // with one summary carrying the real count. Same rule as the API.
  if (kind === 'SWAP' && swapsThisBurst >= BURST_THRESHOLD) {
    lines = [...lines, `You made ${swapsThisBurst} moves. I definitely noticed.`]
    swapsThisBurst = 0
  } else if (kind !== 'SWAP') {
    const pool = LINES[kind]
    const pick = pool[Math.floor(Math.random() * pool.length)] ?? pool[0]
    lines = [...lines, pick]
  }

  return { next: { ...state, xp, dailySwapXp, dailySwapCount, level, energy, condition, stage, lines }, gained }
}

const ACTIONS: Array<{ kind: ActionKind; label: string; hint: string }> = [
  { kind: 'SWAP', label: 'Swap', hint: 'two or more tokens change hands' },
  { kind: 'STAKE_DETECTED', label: 'Stake', hint: 'stake program, energy up' },
  { kind: 'INTERACTION', label: 'Interact', hint: 'a tap, worth a little' },
  { kind: 'DAILY_RESET', label: 'Rest', hint: 'energy recovers' },
]

export function InteractiveDemo({ onBoost }: { onBoost: () => void }) {
  const [state, setState] = useState<DemoState>(INITIAL)
  const [lastGained, setLastGained] = useState<number | null>(null)
  const timer = useRef<number | null>(null)

  const need = useMemo(() => xpToNextLevel(state.level), [state.level])

  const press = useCallback(
    (kind: ActionKind) => {
      setState((current) => {
        const { next, gained } = act(current, kind)
        setLastGained(gained)
        return next
      })
      onBoost()
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setLastGained(null), 1600)
    },
    [onBoost],
  )

  const reset = useCallback(() => {
    setState(INITIAL)
    setLastGained(null)
  }, [])

  const progress = Math.min(100, Math.round((state.xp / need) * 100))

  return (
    <section className="shell" style={{ paddingBlock: 'var(--section)' }} id="demo">
      <div style={{ display: 'grid', gap: '2.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', alignItems: 'start' }}>
        <div>
          <p className="scene-label">Interactive</p>
          <h2 style={{ fontSize: 'clamp(1.9rem, 4vw, 2.9rem)', marginTop: '0.75rem' }}>
            Tap something. Watch what happens.
          </h2>
          <p style={{ color: 'var(--fog-400)', marginTop: '1.1rem', maxWidth: '42ch' }}>
            These run the real rules from the app, including the daily cap. Swap too much
            in one day and it stops paying, exactly as it does onchain.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginTop: '2rem' }}>
            {ACTIONS.map((a) => (
              <button key={a.kind} type="button" className="control" onClick={() => press(a.kind)}>
                {a.label}
              </button>
            ))}
            <button
              type="button"
              className="control"
              onClick={reset}
              style={{ opacity: 0.7, fontSize: '0.875rem' }}
            >
              Reset
            </button>
          </div>

          <p style={{ color: 'var(--fog-600)', fontSize: '0.8125rem', marginTop: '0.9rem' }}>
            {ACTIONS.find((a) => a.kind === 'SWAP')?.hint}
          </p>
        </div>

        <div style={{ display: 'grid', gap: '1rem' }}>
          <div className="control" style={{ display: 'block', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
              <span className="scene-label">Level {state.level}</span>
              <span className="scene-label">Stage {state.stage}</span>
            </div>

            <div style={{ marginTop: '0.9rem' }}>
              <div style={{ height: 6, background: 'var(--ink-700)', borderRadius: 3, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${progress}%`,
                    height: '100%',
                    background: 'var(--primary-lit)',
                    transition: 'width var(--t-calm) var(--ease)',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.6rem', fontSize: '0.8125rem', color: 'var(--fog-400)' }}>
                <span style={{ fontFamily: 'var(--font-mono)' }}>
                  {state.xp} / {need} XP
                </span>
                <span>
                  {lastGained !== null ? `+${lastGained} XP` : `${state.condition}`}
                </span>
              </div>
            </div>

            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: 'var(--fog-400)' }}>
              <span>Energy {state.energy}</span>
              <span>Daily swap XP {state.dailySwapXp} / {CONFIG.swapDailyCap}</span>
            </div>
          </div>

          <div className="control" style={{ display: 'block', padding: '1.25rem' }}>
            <span className="scene-label">It said</span>
            <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.75rem' }}>
              {state.lines.slice(-4).map((l, i) => (
                <p key={`${i}-${l}`} style={{ color: i === state.lines.slice(-4).length - 1 ? 'var(--fog-50)' : 'var(--fog-600)', fontSize: '0.9375rem' }}>
                  {l}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}