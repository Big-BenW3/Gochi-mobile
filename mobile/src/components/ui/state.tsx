import { ActivityIndicator, Pressable, View } from 'react-native'
import type { ReactNode } from 'react'

import { colors, radius, space } from '../../theme/tokens'
import { Text } from './text'

/**
 * The full set of non-content states.
 *
 * These exist as components rather than being re-invented per screen because
 * the spec is strict about them: every failed operation needs a human-readable
 * recovery path, every screen needs loading and empty handling, and cached data
 * must be shown rather than replaced by a spinner (spec section 53, rule 9).
 */

/**
 * Something failed, and the user can do something about it.
 *
 * `onRetry` is what separates an ErrorState from dead text. Every error state
 * in this app must offer a way forward — that is a product rule, not a
 * preference — so the retry affordance is required rather than optional.
 */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
}: {
  title?: string
  message: string
  onRetry?: () => void
  retryLabel?: string
}) {
  return (
    <View
      accessibilityLiveRegion="polite"
      className="gap-3 border border-hairline bg-ink-850 p-4"
      style={{ borderRadius: radius.card }}
    >
      <Text variant="bodyStrong">{title}</Text>

      {/* Tone down the language: this is a state of the app, not a failure the user caused. */}
      <Text variant="body">{message}</Text>

      {onRetry ? (
        <Text className="text-signal" variant="body">
          {retryLabel} →
        </Text>
      ) : null}
    </View>
  )
}

/**
 * Nothing here yet.
 *
 * Always offers a next step. An empty state that only says "no data" is a dead
 * end; the spec requires guidance and a call to action.
 */
export function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return (
    <View className="items-center gap-3 p-6" style={{ borderRadius: radius.card }}>
      <Text variant="bodyStrong">{title}</Text>

      <Text className="text-center" variant="body">
        {message}
      </Text>

      {action}
    </View>
  )
}

/**
 * First-load spinner.
 *
 * Only for genuinely uncached data. Once there is cached content to show, the
 * sync happens quietly behind it — see `OfflineBanner` and the spec's rule
 * against covering cached state with a spinner.
 */
export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <View accessibilityLabel={label} className="items-center gap-3 p-6">
      <ActivityIndicator color={colors.primary} />
      <Text className="text-center" variant="caption">
        {label}
      </Text>
    </View>
  )
}

/**
 * Shown when the device is offline.
 *
 * Deliberately an inline banner rather than a blocking modal: a cached
 * companion is still perfectly usable, and blocking the app over a dropped
 * connection would be worse than the problem.
 */
export function OfflineBanner({ isSyncing = false }: { isSyncing?: boolean }) {
  return (
    <View
      accessibilityLiveRegion="polite"
      className="flex-row items-center gap-2 border border-hairline bg-ink-800 px-4 py-3"
    >
      <View className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.reward }} />

      <Text className="flex-1" variant="captionStrong">
        {isSyncing ? 'Offline — reconnecting' : 'Offline — showing your last known state'}
      </Text>
    </View>
  )
}

/**
 * Standard card surface.
 *
 * One component so that padding, radius and border stay identical everywhere.
 * Spec section 52 treats a consistent card as the base layer of the whole
 * interface, and that only holds if it is not re-declared per screen.
 */
export function Card({ children, title, trailing }: { children: ReactNode; title?: string; trailing?: ReactNode }) {
  return (
    <View className="gap-3 border border-hairline bg-ink-850 p-4" style={{ borderRadius: radius.card }}>
      {title ? (
        <View className="flex-row items-center justify-between">
          <Text variant="bodyStrong">{title}</Text>
          {trailing}
        </View>
      ) : null}

      {children}
    </View>
  )
}

/**
 * Screen title bar.
 *
 * Left slot is the back affordance, right slot is a contextual action. The spec
 * forbids a permanent bottom tab bar, so the top bar is the only persistent
 * chrome besides the FAB.
 */
export function TopBar({ title, onBack, trailing }: { title: string; onBack?: () => void; trailing?: ReactNode }) {
  return (
    <View
      className="flex-row items-center justify-between border-b border-hairline px-4 py-3"
      style={{ minHeight: 56 }}
    >
      <View className="flex-1 flex-row items-center gap-3">
        {onBack ? (
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            // Hit slop keeps the target usable without inflating the visual chevron.
            hitSlop={12}
            onPress={onBack}
          >
            <Text className="text-fog-200" style={{ fontSize: 24, lineHeight: 28 }}>
              ‹
            </Text>
          </Pressable>
        ) : null}

        <Text className="flex-1" numberOfLines={1} variant="title">
          {title}
        </Text>
      </View>

      {trailing}
    </View>
  )
}

/** Vertical stack with the standard page gutters. */
export function Screen({ children, gap = 'md' }: { children: ReactNode; gap?: 'sm' | 'md' | 'lg' }) {
  const gapValue = gap === 'sm' ? space.sm : gap === 'lg' ? space.lg : space.md

  return (
    <View className="flex-1 bg-ink-900" style={{ gap: gapValue, padding: space.gutter }}>
      {children}
    </View>
  )
}
