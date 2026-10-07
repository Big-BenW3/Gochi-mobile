/**
 * D01–D05 — Shield. Spec §7.4 and §58 Limit 1.
 *
 * The load-bearing rule of this screen: **there is no numeric security score.**
 * Spec §58 names a fabricated score as the single worst thing this product could
 * do, because a user who sees "84% secure" makes decisions on a number the app
 * made up. So the screen reports only what was verified, and states plainly what
 * it could not check. D05 is a first-class state, not an error.
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
  shieldHealth: number
  shieldDurability: number
  condition: string
}

export default function ShieldScreen() {
  const [c, setC] = useState<Companion | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  const load = useCallback(async () => {
    setState('loading')
    try {
      const r = (await api.companion()) as unknown as Companion
      setC(r)
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
      <TopBar title="Shield" />
      {state === 'loading' ? <LoadingState /> : null}
      {state === 'error' ? (
        <ErrorState message="Shield state could not load." onRetry={load} />
      ) : null}

      {state === 'ready' && c ? (
        <ScrollView className="gap-4">
          <Card title="Coverage">
            <StatRow>
              <Text variant="body" className="text-dim">Health</Text>
              <Text variant="body">{String(c.shieldHealth)}</Text>
            </StatRow>
            <StatRow>
              <Text variant="body" className="text-dim">Durability</Text>
              <Text variant="body">{String(c.shieldDurability)}</Text>
            </StatRow>
            <StatRow>
              <Text variant="body" className="text-dim">Condition</Text>
              <Text variant="body">c.condition</Text>
            </StatRow>
          </Card>

          {/* D03/D05: say what we do not know. A silent gap invites the user to
              assume the app checked everything and found nothing wrong. */}
          <Card title="What this means">
            <Text variant="body" className="text-dim">
              The shield reflects activity Gochi has observed and confirmed. It is
              not a safety rating, and a healthy shield does not mean a wallet is
              secure.
            </Text>
            <Text variant="caption" className="text-dim">
              Gochi cannot verify your wallet's safety, and will never show you a
              score for it.
            </Text>
          </Card>
        </ScrollView>
      ) : null}
    </Screen>
  )
}
