/**
 * I03 — Level-up celebration.
 *
 * The peak-end moment (PLAN.md P9), so it gets its own screen rather than a
 * toast: the user arrives *because* something happened, and the reward for
 * opening the app should feel like one.
 */

import { useEffect } from 'react'
import { View } from 'react-native'
import { useRouter } from 'expo-router'

import { Screen, Text, TopBar } from '../../components/ui'
import { colors, space } from '../../theme/tokens'

export default function LevelUpScreen() {
  const router = useRouter()

  useEffect(() => {
    // Auto-advance so the celebration never becomes a wall the user must dismiss
    // to see anything else. Long enough to read, short enough not to annoy.
    const t = setTimeout(() => router.back(), 3200)
    return () => clearTimeout(t)
  }, [router])

  return (
    <Screen>
      <TopBar title="Level up" />
      <View className="flex-1 items-center justify-center gap-4">
        {/* Gold is reserved for progression (PLAN.md P9): it never appears
            elsewhere in the app, so it still reads as a reward. */}
        <View
          style={{
            width: 96,
            height: 96,
            borderRadius: 48,
            backgroundColor: colors.reward,
          }}
        />
        <Text variant="title" style={{ color: colors.reward }}>
          Stronger
        </Text>
        <Text variant="body" className="text-dim">
          We are getting stronger.
        </Text>
        <View style={{ height: space.lg }} />
        <Text variant="caption" className="text-dim">
          Returning…
        </Text>
      </View>
    </Screen>
  )
}
