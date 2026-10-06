/**
 * A10 — Starter Egg.
 *
 * Spec section 16: a large egg or companion shell, one action, Activate Egg.
 *
 * The egg is a placeholder for the 3D shell that lands in P5. Section 55 scenario
 * 8 requires a static fallback when the model fails to load, and this screen is
 * where that rule starts: the egg renders regardless, so the flow never depends on
 * an asset being present.
 *
 * Nothing here claims the user owns a Seeker. The button says what it will do, not
 * what it will produce.
 */

import { useRouter } from 'expo-router'
import { View } from 'react-native'

import { Card, PrimaryButton, Screen, Text } from '../../../components/ui'

export default function StarterEggScreen() {
  const router = useRouter()

  return (
    <Screen>
      <View className="flex-1 items-center justify-center" style={{ gap: 12 }}>
        {/*
          The egg shell. Sized generously because it is the screen's only subject,
          and given a border rather than an image so it reads as a deliberate
          placeholder rather than a failed load.
        */}
        <View
          className="items-center justify-center border border-hairline bg-ink-850"
          style={{ width: 220, height: 260, borderRadius: 130 }}
        >
          <Text variant="caption">Companion shell</Text>
        </View>
      </View>

      <Card>
        <Text variant="title">Your companion is waiting</Text>
        <Text variant="body">
          Activating creates your companion and its collectible on Solana. Network fees are covered by Gochi.
        </Text>

        <PrimaryButton label="Activate Egg" onPress={() => router.push('/companion/name')} />
      </Card>
    </Screen>
  )
}
