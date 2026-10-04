import { View } from 'react-native'
import type { ReactNode } from 'react'

import { colors, radius, space } from '../../theme/tokens'
import { Text } from './text'

type Props = {
  /** Current value. */
  value: number
  /** Upper bound of the scale. Usually 100. */
  max?: number
  /** Bar tint. Pass the companion's condition colour to tie a meter to its state. */
  tint?: string
  /**
   * Renders a soft bloom under the fill.
   *
   * Reserved for the two meters that represent live activity — energy and aura.
   * Glow on a static meter competes with the companion, which should be the
   * brightest thing on screen.
   */
  glows?: boolean
  /** Accessible description, e.g. "Energy 72 of 100". */
  accessibilityLabel?: string
  height?: number
}

/**
 * A labelled progress bar.
 *
 * The track is a lighter neutral than the page background so an empty bar is
 * still legible — on a near-black canvas a track the same colour as the
 * background disappears and the meter reads as "no value" rather than "zero".
 *
 * Width is set directly rather than animated. Ticking the fill on change is
 * worth doing (Reanimated is already a dependency) but it belongs with the
 * motion pass, not in the primitive, so that a screen which updates several
 * meters at once cannot end up with half of them animating.
 */
export function ProgressBar({
  accessibilityLabel,
  glows = false,
  height = 8,
  max = 100,
  tint = colors.primary,
  value,
}: Props) {
  // Clamp rather than trust the caller: a negative or over-max value would
  // otherwise render a bar wider than its track.
  const safeValue = Math.min(Math.max(value, 0), max)
  const percent = (safeValue / max) * 100

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityValue={{ max, min: 0, now: safeValue }}
      className="w-full overflow-hidden"
      style={{ backgroundColor: colors.ink700, borderRadius: radius.pill, height }}
    >
      <View
        style={{
          backgroundColor: tint,
          borderRadius: radius.pill,
          height: '100%',
          width: `${percent}%`,
          // Tinted, low-opacity bloom. Neutral shadows read as dirt on violet.
          ...(glows
            ? { shadowColor: tint, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } }
            : null),
        }}
      />
    </View>
  )
}

type StatTileProps = {
  label: string
  /** The number. Rendered in mono so digits align in a row of tiles. */
  value: string
  /** Tint for the value and the bar beneath it. */
  tint?: string
  /** Optional 0-1 progress for the bar; omit for a tile with no meter. */
  progress?: number
  /** Emphasised tiles get a lit border, for the one stat that matters most. */
  isHighlighted?: boolean
}

/**
 * One stat in a stat row — Energy, Shield, Aura.
 *
 * Design notes:
 * - The label is `fog-400` and small, the value is `fog-50` and mono. Value
 *   first in the visual hierarchy, because the number is what the user came to
 *   read; the label is context.
 * - Values are passed in pre-formatted. Formatting a stat here would mean
 *   deciding rounding rules in the view layer, and the spec requires the server
 *   to own anything that affects progression.
 */
export function StatTile({ isHighlighted = false, label, progress, tint = colors.primary, value }: StatTileProps) {
  return (
    <View
      className={[
        'flex-1 gap-2 border p-3',
        isHighlighted ? 'border-primary/40 bg-ink-800' : 'border-hairline bg-ink-850',
      ].join(' ')}
      style={{ borderRadius: radius.chip }}
    >
      <Text variant="caption">{label}</Text>

      <Text style={{ color: tint }} variant="numericStrong">
        {value}
      </Text>

      {typeof progress === 'number' ? <ProgressBar glows tint={tint} value={progress} /> : null}
    </View>
  )
}

/**
 * The level badge, shown in the top bar and on the companion card.
 *
 * Rendered as `LVL 08` in mono so the number is scannable at a glance and pads
 * consistently as the level grows — level 8 and level 80 occupy the same width,
 * which stops the top bar reflowing on every level-up.
 */
export function LevelBadge({ level, tint = colors.reward }: { level: number; tint?: string }) {
  const padded = String(Math.max(0, Math.floor(level))).padStart(2, '0')

  return (
    <View
      className="flex-row items-center gap-1 border border-hairline bg-ink-850 px-2 py-1"
      style={{ borderRadius: radius.chip }}
    >
      <Text variant="caption">LVL</Text>
      <Text style={{ color: tint }} variant="captionStrong">
        {padded}
      </Text>
    </View>
  )
}

/**
 * Row of stat tiles with consistent gutters.
 *
 * A component rather than a repeated `gap` so that the spacing stays right when
 * a tile's value changes width.
 */
export function StatRow({ children }: { children: ReactNode }) {
  return (
    <View className="flex-row" style={{ gap: space.sm }}>
      {children}
    </View>
  )
}
