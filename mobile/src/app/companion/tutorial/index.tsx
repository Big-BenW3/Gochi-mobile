/**
 * A13 — First Companion Tutorial.
 *
 * Spec section 16: three short coach marks, on companion state, activity events,
 * and FAB navigation.
 *
 * Each mark points at something real rather than a screenshot, so a user who skips
 * it has still learned where the controls are. The third one matters most: the app
 * is FAB-first with no bottom tab bar (ADR-004), which is unusual enough to be worth
 * saying explicitly rather than leaving to be discovered.
 */

import { useCallback, useState } from 'react'
import { View } from 'react-native'
import { useRouter } from 'expo-router'

import { Card, PrimaryButton, Screen, SecondaryButton, Text } from '../../../components/ui'

const MARKS = [
  {
    title: 'Its state changes',
    body: 'Energy, shield and aura respond to what you actually do. They settle over time, and never fall to zero — a tired companion is resting, not dying.',
  },
  {
    title: 'Activity is the input',
    body: 'Swaps, staking and wallet activity feed it. Nothing here needs a trade to keep your companion alive.',
  },
  {
    title: 'Everything is one tap away',
    body: 'There is no tab bar. The round button at the bottom opens activities, stats, the vault and settings.',
  },
] as const

export default function CompanionTutorialScreen() {
  const router = useRouter()
  const [index, setIndex] = useState(0)

  const mark = MARKS[index]
  const isLast = index === MARKS.length - 1

  const advance = useCallback(() => {
    if (isLast) {
      router.replace('/companion/sync')
      return
    }
    setIndex((current) => current + 1)
  }, [isLast, router])

  return (
    <Screen>
      <View className="flex-1 justify-center">
        <Text variant="caption">{`${index + 1} of ${MARKS.length}`}</Text>
        <Text variant="display">{mark.title}</Text>
        <Text variant="body">{mark.body}</Text>
      </View>

      <Card>
        <PrimaryButton label={isLast ? 'Finish' : 'Next'} onPress={advance} />
        {isLast ? null : <SecondaryButton label="Skip" onPress={() => router.replace('/companion/sync')} />}
      </Card>
    </Screen>
  )
}
