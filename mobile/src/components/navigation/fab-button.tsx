/**
 * The FAB — the app's only navigation control.
 *
 * ADR-004: the concept board's bottom tab bar was rejected. Four equally-weighted
 * destinations make the companion compete with its own navigation, and the product
 * is one screen with a few sheets over it. A single floating control keeps the
 * companion the subject.
 *
 * It opens a sheet rather than navigating immediately, because the destinations are
 * peers and a menu is honest about that. An expanding set of arcs is the standard
 * pattern and needs no library.
 *
 * Section 53 requires the primary action to be unambiguous, so the destinations are
 * labelled rather than icon-only.
 */

import { useCallback, useState } from 'react'
import { Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'

import { Text } from '../ui'
import { colors, radius, space } from '../../theme/tokens'

/** Where the FAB leads. Order is the order they appear, most-used first. */
const DESTINATIONS = [
  { path: '/chat', label: 'Companion' },
  { path: '/activity', label: 'Activity' },
  { path: '/progression', label: 'Progress' },
  { path: '/stats', label: 'Stats' },
  { path: '/vault', label: 'Vault' },
  { path: '/achievements', label: 'Awards' },
  { path: '/notifications', label: 'Alerts' },
  { path: '/shield', label: 'Shield' },
  { path: '/staking', label: 'Staking' },
  { path: '/aura', label: 'Aura' },
  { path: '/profile', label: 'Profile' },
  { path: '/settings', label: 'Settings' },
] as const

export interface FabButtonProps {
  onPress?: () => void
  accessibilityLabel?: string
}

/**
 * The FAB.
 *
 * `onPress` overrides the default sheet, for the cases that want one destination
 * rather than the menu — the first-sync screen uses it to jump straight to
 * activity.
 */
export function FabButton({ onPress, accessibilityLabel }: FabButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const toggle = useCallback(() => {
    if (onPress) {
      onPress()
      return
    }
    setOpen((current) => !current)
  }, [onPress])

  const choose = useCallback(
    (path: string) => {
      setOpen(false)
      router.push(path as never)
    },
    [router],
  )

  return (
    <View style={{ alignItems: 'flex-end' }} pointerEvents="box-none">
      {open
        ? DESTINATIONS.map((destination) => (
            <Pressable
              key={destination.path}
              onPress={() => choose(destination.path)}
              accessibilityRole="button"
              accessibilityLabel={destination.label}
              style={{
                marginBottom: space.sm,
                paddingVertical: space.sm,
                paddingHorizontal: space.gutter,
                backgroundColor: colors.ink800,
                borderWidth: 1,
                borderColor: colors.hairline,
                borderRadius: radius.pill,
                minHeight: 44,
                justifyContent: 'center',
              }}
            >
              <Text variant="bodyStrong">{destination.label}</Text>
            </Pressable>
          ))
        : null}

      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? 'Open companion menu'}
        accessibilityState={{ expanded: open }}
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text variant="numericStrong" style={{ color: colors.ink950 }}>
          {open ? '×' : '+'}
        </Text>
      </Pressable>
    </View>
  )
}
