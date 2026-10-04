import { View } from 'react-native'

import { getCondition } from '../../domain/companion/conditions'
import { radius, space } from '../../theme/tokens'
import { Text } from './text'

/**
 * The companion's current state, as a compact pill.
 *
 * Colour comes from the condition map rather than being passed in, so a badge
 * can never show a state colour that disagrees with the state.
 *
 * The dot carries the colour; the label stays neutral. Eight saturated pills in
 * a row would be unreadable, and the user needs the *word* more often than they
 * need the hue.
 */
export function ConditionBadge({
  condition,
  size = 'md',
}: {
  condition: string | null | undefined
  size?: 'sm' | 'md'
}) {
  const state = getCondition(condition)
  const compact = size === 'sm'
  const dot = compact ? 6 : 8

  return (
    <View
      // The state name is the accessible content; the colour is decoration.
      accessibilityLabel={`Companion condition: ${state.label}`}
      className="flex-row items-center border border-hairline bg-ink-850"
      style={{
        borderRadius: radius.pill,
        gap: space.sm,
        paddingHorizontal: compact ? space.sm : 10,
        paddingVertical: compact ? 4 : 6,
      }}
    >
      <View style={{ backgroundColor: state.color, borderRadius: dot, height: dot, width: dot }} />

      <Text variant="captionStrong">{state.label}</Text>
    </View>
  )
}
