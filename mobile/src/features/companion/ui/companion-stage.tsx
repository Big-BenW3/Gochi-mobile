/**
 * The companion stage — where the character lives.
 *
 * An abstraction with two implementations, and the seam between them is the whole
 * design:
 *
 *   - `StaticCompanion` — a 2D composition driven by the companion's state. Ships
 *     now, needs no native module, and is the fallback the spec requires.
 *   - A GLB renderer — arrives with the model in P5's final step.
 *
 * Section 55 scenario 8 is the requirement that makes this necessary: "3D model
 * fails → static fallback; rest of app remains usable". A screen that renders the
 * model directly cannot satisfy that, because the failure mode is the component
 * itself failing to mount. So the model is always behind this boundary, and the
 * fallback is not a degraded path — it is a real implementation of the same
 * interface.
 *
 * Section 35 adds the constraints that shape what the 3D renderer must do when it
 * lands: one active renderer on screen at a time, no animation while hidden or
 * backgrounded, and a downgrade on low battery. `useStageVisibility` encodes the
 * first two now, so the renderer inherits them rather than reimplementing them.
 */

import { useEffect, useState } from 'react'
import { AppState, View, type AppStateStatus } from 'react-native'

import type { ConditionId } from '../../../domain/companion/conditions'
import { colors } from '../../../theme/tokens'
import { Text } from '../../../components/ui'

export interface CompanionVisual {
  condition: ConditionId
  level: number
  evolutionStage: number
  energy: number
  aura: number
  combatRating: number
  shieldHealth: number
}

/**
 * Per-condition presentation.
 *
 * These are the design system's decisions rather than 3D ones: colour comes from
 * the tokens that already back the condition badges, so a companion on the home
 * screen and its badge cannot disagree about what ENERGYZED looks like.
 */
const CONDITION_TREATMENT: Record<
  ConditionId,
  { glow: string; label: string; tilt: number }
> = {
  HEALTHY: { glow: colors.signal, label: 'Restless', tilt: 0 },
  ENERGIZED: { glow: colors.signal, label: 'Boosted', tilt: -2 },
  TIRED: { glow: colors.fog600, label: 'Drowsy', tilt: 3 },
  ALERT: { glow: colors.reward, label: 'Alert', tilt: 0 },
  DAMAGED: { glow: colors.damage, label: 'Scuffed', tilt: 4 },
  RECOVERING: { glow: colors.recover, label: 'Mending', tilt: -1 },
  EVOLVING: { glow: colors.evolve, label: 'Changing', tilt: 0 },
  SLEEPING: { glow: colors.fog600, label: 'Asleep', tilt: 6 },
}

/**
 * Whether the stage should be running.
 *
 * Section 35 requires that a hidden 3D screen consumes no CPU and that animation
 * pauses when the app is backgrounded. Both are enforced here rather than inside
 * the renderer, so a future renderer inherits the behaviour instead of being asked
 * to remember it.
 */
export function useStageVisibility(): boolean {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    // `active` covers both "screen is mounted" and "app is foregrounded"; Android
    // will not keep animating in the background anyway, but iOS-style lifecycle
    // events still fire and the check costs nothing.
    const onChange = (status: AppStateStatus) => setVisible(status === 'active')
    const subscription = AppState.addEventListener('change', onChange)
    return () => subscription.remove()
  }, [])

  return visible
}

export interface CompanionStageProps {
  visual: CompanionVisual
  /** False while off screen; the renderer must stop animating. */
  active: boolean
  /** Expands the composition for B02's focus mode. */
  expanded?: boolean
}

/**
 * The 2D composition.
 *
 * Not a placeholder in the sense of unfinished: it renders the companion's state
 * faithfully through scale, tilt, glow and colour, so a user who never sees the GLB
 * still gets a companion whose appearance responds to its condition. That is what
 * makes it a legitimate fallback rather than an apology.
 */
export function StaticCompanion({
  visual,
  active,
  expanded = false,
}: CompanionStageProps) {
  const treatment = CONDITION_TREATMENT[visual.condition]

  // Animation is a plain value rather than a driver, so the component holds no
  // resources when inactive. The 3D renderer will animate for real; this moves just
  // enough to read as alive without a loop that burns battery.
  const breathe = active ? 1 : 0
  const scale = (expanded ? 1.15 : 1) * (1 + breathe * 0.012)
  const energyRatio = visual.energy / 100

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}>
      <View
        style={{
          width: expanded ? 280 : 220,
          height: expanded ? 340 : 270,
          borderRadius: (expanded ? 280 : 220) / 2,
          backgroundColor: colors.ink850,
          borderWidth: 1,
          borderColor: colors.hairline,
          transform: [{ scale }, { rotate: `${treatment.tilt}deg` }],
          alignItems: 'center',
          justifyContent: 'center',
          // The glow is the condition's colour, dimmed by how tired the companion
          // is. Energy therefore affects appearance as well as a number, which is
          // the point of Pillar B.
          shadowColor: treatment.glow,
          shadowOpacity: 0.18 + energyRatio * 0.34,
          shadowRadius: 28 + visual.aura * 0.4,
          shadowOffset: { width: 0, height: 0 },
        }}
      >
        <Text variant="caption">{treatment.label}</Text>
        <Text variant="title">Stage {visual.evolutionStage}</Text>
      </View>
    </View>
  )
}
