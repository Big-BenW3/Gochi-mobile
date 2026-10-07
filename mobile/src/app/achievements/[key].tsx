/**
 * I07 — Achievement detail.
 *
 * A locked achievement shows what it is and nothing about how close it is. The
 * spec asks for a milestone surface; turning every locked entry into a progress
 * bar would make the screen a to-do list.
 */

import { useCallback, useEffect, useState } from 'react'
import { ScrollView } from 'react-native'
import { useLocalSearchParams } from 'expo-router'

import {
  Card,
  ErrorState,
  LoadingState,
  Screen,
  Text,
  TopBar,
} from '../../components/ui'
import { api } from '../../core/api'

interface Detail {
  key: string
  title: string
  unlocked: boolean
  unlockedAt: string | null
  metadata: Record<string, string | number>
}

export default function AchievementDetailScreen() {
  const { key } = useLocalSearchParams<{ key: string }>()
  const [a, setA] = useState<Detail | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  const load = useCallback(async () => {
    setState('loading')
    try {
      setA((await api.achievement(String(key))) as Detail)
      setState('ready')
    } catch {
      setState('error')
    }
  }, [key])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Screen>
      <TopBar title="Achievement" />
      {state === 'loading' ? <LoadingState /> : null}
      {state === 'error' ? (
        <ErrorState message="This achievement could not load." onRetry={load} />
      ) : null}

      {state === 'ready' && a ? (
        <ScrollView className="gap-4">
          <Card title={a.title}>
            <Text variant="body">
              {a.unlocked ? 'Unlocked' : 'Locked'}
            </Text>
            {a.unlocked && a.unlockedAt ? (
              <Text variant="caption" className="text-dim">
                {new Date(a.unlockedAt).toLocaleString()}
              </Text>
            ) : null}
          </Card>
        </ScrollView>
      ) : null}
    </Screen>
  )
}
