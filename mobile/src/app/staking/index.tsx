/**
 * E01–E04 — Staking. Spec §7.
 *
 * Staking detection is observational: we see Stake-program activity in a
 * wallet's history, which is not the same as holding a stake account now. E02 is
 * therefore allowed to say "unavailable" rather than implying a current position,
 * because claiming one we cannot verify is exactly the failure §58 warns about.
 */

import { useCallback, useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'

import {
  Card,
  ErrorState,
  LoadingState,
  Screen,
  StatRow,
  Text,
  TopBar,
} from '../../components/ui'
import { api } from '../../core/api'

interface Companion {
  energy: number
  condition: string
}

export default function StakingScreen() {
  const [c, setC] = useState<Companion | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  const load = useCallback(async () => {
    setState('loading')
    try {
      setC((await api.companion()) as unknown as Companion)
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
      <TopBar title="Staking" />
      {state === 'loading' ? <LoadingState /> : null}
      {state === 'error' ? (
        <ErrorState message="Staking details could not load." onRetry={load} />
      ) : null}

      {state === 'ready' && c ? (
        <ScrollView className="gap-4">
          <Card title="Vitality">
            <StatRow>
              <Text variant="body" className="text-dim">Energy</Text>
              <Text variant="body">{String(c.energy)}</Text>
            </StatRow>
            <StatRow>
              <Text variant="body" className="text-dim">Condition</Text>
              <Text variant="body">c.condition</Text>
            </StatRow>
          </Card>

          <Card title="Your staking position">
            <Text variant="body" className="text-dim">
              Unavailable.
            </Text>
            <Text variant="caption" className="text-dim">
              Gochi can see that staking activity happened, but cannot confirm your
              current delegation. Your wallet remains the only source of truth.
            </Text>
          </Card>
        </ScrollView>
      ) : null}
    </Screen>
  )
}
