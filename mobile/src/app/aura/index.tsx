/**
 * F01–F03 — Aura (combat rating). Spec §7.2.
 *
 * Deliberately contains no trade advice. Spec §53 rule 5 forbids recommending
 * actions, and an aura number is exactly the kind of thing users would read as
 * "trade more to raise this" — so the copy frames it as history, not a target.
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
  combatRating: number
  aura: number
}

export default function AuraScreen() {
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
      <TopBar title="Aura" />
      {state === 'loading' ? <LoadingState /> : null}
      {state === 'error' ? (
        <ErrorState message="Aura could not load." onRetry={load} />
      ) : null}

      {state === 'ready' && c ? (
        <ScrollView className="gap-4">
          <Card title="Current">
            <StatRow>
              <Text variant="body" className="text-dim">Combat rating</Text>
              <Text variant="body">{String(c.combatRating)}</Text>
            </StatRow>
            <StatRow>
              <Text variant="body" className="text-dim">Aura</Text>
              <Text variant="body">{String(c.aura)}</Text>
            </StatRow>
          </Card>

          <Card title="What this is">
            <Text variant="body" className="text-dim">
              A record of activity your companion has seen. It is not advice, and
              it is not a measure of how well you are doing financially.
            </Text>
          </Card>
        </ScrollView>
      ) : null}
    </Screen>
  )
}
