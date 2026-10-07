/**
 * H01 — Home chat. The companion thread, and the only screen that speaks.
 *
 * Reads the same rows the notification feed renders, so a line cannot appear in
 * one place and not the other. The suggested replies (§8 H03) are pure UI: the
 * engine grants nothing for tapping one (spec §19 — interaction is not XP).
 */

import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'

import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  Text,
  TopBar,
} from '../../components/ui'
import { api } from '../../core/api'
import { radius, space } from '../../theme/tokens'

interface Line {
  id: string
  templateKey: string
  body: string
  createdAt: string
}

const SUGGESTED = ['Status', 'What should I watch?', 'Anything changed?']

export default function ChatScreen() {
  const [lines, setLines] = useState<Line[]>([])
  const [context, setContext] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  const load = useCallback(async () => {
    setState('loading')
    try {
      const r = (await api.dialogue()) as {
        messages?: Line[]
        lastTrigger?: { templateKey: string } | null
      }
      setLines(r.messages ?? [])
      setContext(r.lastTrigger?.templateKey ?? null)
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
      <TopBar title="Companion" />

      {state === 'loading' ? <LoadingState /> : null}
      {state === 'error' ? (
        <ErrorState
          message="The companion could not load its messages."
          onRetry={load}
        />
      ) : null}

      {state === 'ready' && lines.length === 0 ? (
        <EmptyState
          title="Nothing yet"
          message="Your companion speaks when something happens onchain."
        />
      ) : null}

      {state === 'ready' && lines.length > 0 ? (
        <ScrollView className="gap-3">
          {context ? (
            <Text variant="caption" className="text-dim">
              Latest line reacted to: {context}
            </Text>
          ) : null}

          {lines.map((l) => (
            <Card key={l.id}>
              <Text variant="body">{l.body || l.templateKey}</Text>
              <Text variant="caption" className="text-dim">
                {new Date(l.createdAt).toLocaleTimeString()}
              </Text>
            </Card>
          ))}
        </ScrollView>
      ) : null}

      {state === 'ready' ? (
        <View className="mt-4 flex-row flex-wrap gap-2">
          {SUGGESTED.map((s) => (
            <Pressable
              key={s}
              accessibilityRole="button"
              onPress={load}
              className="border border-hairline px-3 py-2"
              style={{ borderRadius: radius.pill }}
            >
              <Text variant="caption" className="text-dim">
                {s}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={{ height: space.xl }} />
    </Screen>
  )
}
