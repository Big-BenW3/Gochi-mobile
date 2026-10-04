import { ActivityIndicator, Pressable } from 'react-native'
import type { ReactNode } from 'react'

import { colors, radius, space, TOUCH_TARGET } from '../../theme/tokens'
import { Text } from './text'

/**
 * The three button weights, in descending emphasis.
 *
 * - primary:   one per screen, the thing you want tapped. Filled.
 * - secondary: supporting actions. Outlined.
 * - tertiary:  low-emphasis, link-like. Text only.
 */
type Variant = 'primary' | 'secondary' | 'tertiary'

type Props = {
  label: string
  onPress: () => void
  variant?: Variant
  /**
   * Shows a spinner and blocks presses. Used by anything that waits on a
   * signature or a sync, so the user is never left tapping a dead button.
   */
  isBusy?: boolean
  isDisabled?: boolean
  /** Trailing content, typically an icon. */
  trailing?: ReactNode
  fullWidth?: boolean
  /** Needed when the visible label alone does not describe the action. */
  accessibilityLabel?: string
}

/**
 * Per-variant chrome, kept in one table so the three weights cannot drift.
 *
 * Every variant declares a border, even a transparent one, so switching variant
 * never shifts layout by a border width.
 */
const chrome: Record<Variant, { container: string; label: string; pressed: string; spinner: string }> = {
  primary: {
    container: 'bg-primary border border-transparent',
    label: 'text-ink-950',
    pressed: colors.primaryLit,
    spinner: colors.ink950,
  },
  secondary: {
    container: 'bg-ink-800 border border-hairline',
    label: 'text-fog-50',
    pressed: colors.ink700,
    spinner: colors.fog50,
  },
  tertiary: {
    container: 'bg-transparent border border-transparent',
    label: 'text-signal',
    pressed: colors.ink700,
    spinner: colors.fog50,
  },
}

/**
 * The app's button.
 *
 * Design notes:
 * - Radius is `control`, not `pill`. Fully rounded shapes are reserved for chips
 *   and the FAB, so that a pill keeps meaning "floating control".
 * - Primary label sits on `ink-950`, not white. Light text on a mid-violet fill
 *   fails contrast; dark text on it is comfortable.
 * - Height is pinned to the 44dp touch minimum for every variant, so switching
 *   weight never changes how big the target is.
 * - Pressed feedback is a fill change, not a scale. Scaling a button shifts its
 *   neighbours and makes a column of them feel unstable.
 */
export function Button({
  accessibilityLabel,
  fullWidth = true,
  isBusy = false,
  isDisabled = false,
  label,
  onPress,
  trailing,
  variant = 'primary',
}: Props) {
  const style = chrome[variant]
  // Busy implies disabled: a spinner that can still be tapped misreports state.
  const blocked = isDisabled || isBusy

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ busy: isBusy, disabled: blocked }}
      className={[
        'flex-row items-center justify-center gap-2',
        fullWidth ? 'w-full' : 'self-start',
        style.container,
      ].join(' ')}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: radius.control,
        minHeight: TOUCH_TARGET,
        opacity: blocked ? 0.45 : 1,
        paddingHorizontal: space.lg,
        ...(pressed ? { backgroundColor: style.pressed } : null),
      })}
    >
      {isBusy ? <ActivityIndicator color={style.spinner} size="small" /> : null}

      <Text className={style.label} variant="bodyStrong">
        {label}
      </Text>

      {trailing}
    </Pressable>
  )
}

/** Named exports matching the component inventory in spec section 52. */
export function PrimaryButton(props: Omit<Props, 'variant'>) {
  return <Button variant="primary" {...props} />
}

export function SecondaryButton(props: Omit<Props, 'variant'>) {
  return <Button variant="secondary" {...props} />
}

export function TertiaryButton(props: Omit<Props, 'variant'>) {
  return <Button variant="tertiary" {...props} />
}
