/**
 * I01/I02 — Progression and level detail.
 *
 * The emotional peak of the product lives here (I03), so the level-up moment is
 * celebrated rather than listed. All numbers come from the server: spec §38.6
 * forbids computing progression on the client, so nothing on this screen is
 * derived locally.
 */

import { useCallback, useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'

import {
  Card,
  ErrorState,
  LoadingState,
  ProgressBar,
  Screen,
  StatRow,
  Text,
  TopBar,
} from '../../components/ui'
import { api } from '../../core/api'

interface Progression {
  level: number
  xp: number
  xpToNextLevel: number
  totalXp: number
  evolutionStage: number
  nextEvolutionAtLevel: number | null
  condition: string
  energy: number
}

export default function ProgressionScreen() {
  const [p, setP] = useState<Progression | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  const load = useCallback(async () => {
    setState('loading')
    try {
      setP((await api.progression()) as Progression)
      setState('ready')
    } catch {
      setState('error')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const earned = p ? Math.min(100, Math.round((p.xp / Math.max(1, p.xpToNextLevel)) * 100)) : 0

  return (
    <Screen>
      <TopBar title="Progress" />
      {state === 'loading' ? <LoadingState /> : null}
      {state === 'error' ? (
        <ErrorState message="Progress could not load." onRetry={load} />
      ) : null}

      {state === 'ready' && p ? (
        <ScrollView className="gap-4">
          <Card title={`Level ${p.level}`}>
            <View className="gap-2">
              <ProgressBar value={earned} />
              <Text variant="caption" className="text-dim">
                {p.xp} / {p.xpToNextLevel} XP to level {p.level + 1}
              </Text>
            </View>
          </Card>

          <Card title="Milestone">
            <StatRow>
              <Text variant="body" className="text-dim">Evolution stage</Text>
              <Text variant="body">{`Stage ${p.evolutionStage}`}</Text>
            </StatRow>
            <StatRow>
              <Text variant="body" className="text-dim">Next evolution</Text>
              <Text variant="body">{p.nextEvolutionAtLevel ? `Level ${p.nextEvolutionAtLevel}` : 'All unlocked'}</Text>
            </StatRow>
            <StatRow>
              <Text variant="body" className="text-dim">Total XP</Text>
              <Text variant="body">{String(p.totalXp)}</Text>
            </StatRow>
            <StatRow>
              <Text variant="body" className="text-dim">Condition</Text>
              <Text variant="body">p.condition</Text>
            </StatRow>
            <StatRow>
              <Text variant="body" className="text-dim">Energy</Text>
              <Text variant="body">{String(p.energy)}</Text>
            </StatRow>
          </Card>
        </ScrollView>
      ) : null}
    </Screen>
  )
}
