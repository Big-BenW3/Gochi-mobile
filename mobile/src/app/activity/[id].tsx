/**
 * C02 — Activity detail.
 *
 * Shows one recorded event and whether the engine has processed it yet. An
 * unprocessed event is a normal state (§25), not an error: ingestion records
 * first and the engine applies after, so between those two moments this screen
 * has something true to say.
 */

import { useCallback, useEffect, useState } from 'react'
import { useLocalSearchParams } from 'expo-router'
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

interface Detail {
  eventType: string
  source: string | null
  signature: string | null
  slot: number | null
  occurredAt: string
  processedAt: string | null
  detail: Record<string, unknown>
}

export default function ActivityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [e, setE] = useState<Detail | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  const load = useCallback(async () => {
    setState('loading')
    try {
      setE((await api.activityEvent(String(id))) as Detail)
      setState('ready')
    } catch {
      setState('error')
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Screen>
      <TopBar title="Event" />
      {state === 'loading' ? <LoadingState /> : null}
      {state === 'error' ? (
        <ErrorState message="This event could not load." onRetry={load} />
      ) : null}

      {state === 'ready' && e ? (
        <ScrollView className="gap-4">
          <Card title={e.eventType}>
            <StatRow>
              <Text variant="body" className="text-dim">Status</Text>
              <Text variant="body">
                {e.processedAt ? 'Processed' : 'Recorded — awaiting sync'}
              </Text>
            </StatRow>
            <StatRow>
              <Text variant="body" className="text-dim">Source</Text>
              <Text variant="body">{e.source ?? '—'}</Text>
            </StatRow>
            <StatRow>
              <Text variant="body" className="text-dim">Occurred</Text>
              <Text variant="body">
                {new Date(e.occurredAt).toLocaleString()}
              </Text>
            </StatRow>
          </Card>

          {e.signature ? (
            <Card title="Signature">
              <Text variant="mono">{e.signature}</Text>
            </Card>
          ) : null}

          <View className="gap-2">
            {Object.entries(e.detail ?? {}).map(([k, v]) => (
              <View key={k} className="flex-row justify-between">
                <Text variant="caption" className="text-dim">{k}</Text>
                <Text variant="caption">{String(v)}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : null}
    </Screen>
  )
}
