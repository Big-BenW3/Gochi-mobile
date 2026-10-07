/**
 * B05 — While You Were Away. Spec §27.
 *
 * The ranking comes from the server (spec §27.2), ordered most meaningful first.
 * This screen only presents it: deciding what counts as meaningful is a game
 * rule, and a client that re-ranked the list would disagree with the server the
 * moment the rules changed.
 */

import { useCallback, useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'

import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  Text,
  TopBar,
} from '../components/ui'
import { api } from '../core/api'

interface Highlight {
  kind: string
  title: string
  detail: string
  count: number
}

interface Away {
  hasSummary: boolean
  since: string | null
  lines: string[]
  highlights: Highlight[]
}

export default function WhileYouWereAwayScreen() {
  const [a, setA] = useState<Away | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  const load = useCallback(async () => {
    setState('loading')
    try {
      setA((await api.whileYouWereAway()) as Away)
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
      <TopBar title="While you were away" />
      {state === 'loading' ? <LoadingState /> : null}
      {state === 'error' ? (
        <ErrorState message="The summary could not load." onRetry={load} />
      ) : null}

      {state === 'ready' && a && !a.hasSummary ? (
        <EmptyState
          title="Nothing new"
          message="Your companion has been holding steady."
        />
      ) : null}

      {state === 'ready' && a?.hasSummary ? (
        <ScrollView className="gap-4">
          {a.since ? (
            <Text variant="caption" className="text-dim">
              Since {new Date(a.since).toLocaleString()}
            </Text>
          ) : null}

          <Card title="Summary">
            <View className="gap-1">
              {a.lines.map((l) => (
                <Text key={l} variant="body">
                  {l}
                </Text>
              ))}
            </View>
          </Card>

          <View className="gap-2">
            {a.highlights.map((h) => (
              <Card key={`${h.kind}-${h.title}`} title={h.title}>
                <Text variant="caption" className="text-dim">
                  {h.detail}
                </Text>
              </Card>
            ))}
          </View>
        </ScrollView>
      ) : null}
    </Screen>
  )
}
