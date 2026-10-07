/**
 * I04/I05 — Evolution overview and reveal. Spec §26.
 *
 * §26 is explicit that evolution is the *same* 3D model in a new state variant,
 * not a new character. The copy says so, so a user who expected a new creature
 * is not misled about what changed.
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

interface Milestone {
  stage: number
  atLevel: number
  unlocked: boolean
  progressPercent: number
}

interface Evolution {
  currentStage: number
  nextStageAtLevel: number | null
  milestones: Milestone[]
}

export default function EvolutionScreen() {
  const [e, setE] = useState<Evolution | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  const load = useCallback(async () => {
    setState('loading')
    try {
      setE((await api.evolution()) as Evolution)
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
      <TopBar title="Evolution" />
      {state === 'loading' ? <LoadingState /> : null}
      {state === 'error' ? (
        <ErrorState message="Evolution milestones could not load." onRetry={load} />
      ) : null}

      {state === 'ready' && e ? (
        <ScrollView className="gap-3">
          <Card title={`Current: Stage ${e.currentStage}`}>
            <StatRow>
              <Text variant="body" className="text-dim">Next stage</Text>
              <Text variant="body">{e.nextStageAtLevel ? `Level ${e.nextStageAtLevel}` : 'Fully evolved'}</Text>
            </StatRow>
            <Text variant="caption" className="text-dim">
              Each stage changes aura, armour and eye glow. The character itself
              does not change.
            </Text>
          </Card>

          {e.milestones.map((m) => (
            <Card key={m.stage} title={`Stage ${m.stage} — level ${m.atLevel}`}>
              {m.unlocked ? (
                <Text variant="bodyStrong">Unlocked</Text>
              ) : (
                <View className="gap-2">
                  <ProgressBar value={m.progressPercent} />
                  <Text variant="caption" className="text-dim">
                    {m.progressPercent}% toward this stage
                  </Text>
                </View>
              )}
            </Card>
          ))}
        </ScrollView>
      ) : null}
    </Screen>
  )
}
