/**
 * I06 — Achievements. Spec §6, nine categories.
 *
 * Locked entries show their name and stay silent about progress: an achievement
 * grid that reveals "3 more swaps needed" is a to-do list, not a reward, and the
 * spec asks for a milestone surface rather than a quest log.
 */

import { useCallback, useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'

import {
  Card,
  ErrorState,
  LoadingState,
  Screen,
  Text,
  TopBar,
} from '../../components/ui'
import { api } from '../../core/api'

interface Entry {
  key: string
  title: string
}

export default function AchievementsScreen() {
  const [unlocked, setUnlocked] = useState<Entry[]>([])
  const [locked, setLocked] = useState<Entry[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  const load = useCallback(async () => {
    setState('loading')
    try {
      const r = (await api.achievements()) as {
        unlocked?: Entry[]
        locked?: Entry[]
      }
      setUnlocked(r.unlocked ?? [])
      setLocked(r.locked ?? [])
      setState('ready')
    } catch {
      setState('error')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Screen>
      <TopBar title="Achievements" />
      {state === 'loading' ? <LoadingState /> : null}
      {state === 'error' ? (
        <ErrorState message="Achievements could not load." onRetry={load} />
      ) : null}

      {state === 'ready' ? (
        <ScrollView className="gap-4">
          <Text variant="caption" className="text-dim">
            {unlocked.length} unlocked · {locked.length} remaining
          </Text>

          <View className="gap-2">
            {unlocked.map((a) => (
              <Card key={a.key}>
                <Text variant="bodyStrong">{a.title}</Text>
              </Card>
            ))}
          </View>

          <View className="gap-2">
            {locked.map((a) => (
              <View key={a.key} className="border border-hairline p-3">
                <Text variant="body" className="text-dim">
                  {a.title}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : null}
    </Screen>
  )
}
