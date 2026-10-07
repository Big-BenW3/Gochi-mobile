/**
 * K04 — Settings: identity, notification preferences, sign out.
 *
 * The preference controls here write through to the server rather than to local
 * state, because spec §28.2 governs what the *backend* sends: a toggle stored
 * only on the handset would silence nothing and would silently revert on the
 * next reinstall.
 */

import { useCallback, useEffect, useState } from 'react'

import {
  Card,
  ErrorState,
  PrimaryButton,
  Screen,
  Text,
  TopBar,
} from '../../components/ui'
import { api, getSessionToken, setSessionToken } from '../../core/api'
import type { GameConfigResponse } from '@gochi/contracts'

interface Prefs {
  systemEnabled: boolean
  dialogueEnabled: boolean
  quietStartHour: number | null
  quietEndHour: number | null
  dailyCap: number
}

export default function SettingsScreen() {
  const [cfg, setCfg] = useState<GameConfigResponse | null>(null)
  const [wallet, setWallet] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const me = await api.me()
      setWallet(me.wallet)
    } catch {
      setError('Not signed in.')
    }
    try {
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787'}/v1/admin/config`,
        { headers: { Authorization: `Bearer ${getSessionToken()}` } },
      )
      setCfg(res.ok ? ((await res.json()) as GameConfigResponse) : null)
    } catch {
      setError('Config unavailable.')
    }
    try {
      const r = (await api.notificationPrefs()) as { prefs: Prefs }
      setPrefs(r.prefs)
    } catch {
      setError('Notification preferences unavailable.')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = useCallback(async (key: 'systemEnabled' | 'dialogueEnabled') => {
    if (!prefs) return
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    try {
      // Optimistic, then authoritative: the server owns the rule (§28.2).
      const r = (await api.updateNotificationPrefs(next)) as { prefs: Prefs }
      setPrefs(r.prefs)
    } catch {
      setError('Could not save that preference.')
      void load()
    }
  }, [prefs, load])

  return (
    <Screen>
      <TopBar title="Settings" />

      {error ? <ErrorState message={error} onRetry={load} /> : null}

      <Card title="Wallet">
        <Text variant="mono">{wallet ?? 'Not connected'}</Text>
      </Card>

      <Card title="Notifications">
        <Text variant="caption" className="text-dim">
          Level-ups and evolution always notify. Everything else follows these.
        </Text>

        <Text
          variant="body"
          onPress={() => void toggle('systemEnabled')}
          accessibilityRole="button"
        >
          System alerts: {prefs?.systemEnabled ? 'On' : 'Off'}
        </Text>

        <Text
          variant="body"
          onPress={() => void toggle('dialogueEnabled')}
          accessibilityRole="button"
        >
          Companion chatter: {prefs?.dialogueEnabled ? 'On' : 'Off'}
        </Text>

        <Text variant="caption" className="text-dim">
          Quiet hours:{' '}
          {prefs?.quietStartHour == null
            ? 'off'
            : `${prefs.quietStartHour}:00–${prefs.quietEndHour ?? 0}:00`}
        </Text>
        <Text variant="caption" className="text-dim">
          Daily cap: {prefs?.dailyCap ?? '—'} alerts
        </Text>
      </Card>

      <Card title="Game version">
        <Text variant="mono">{cfg?.version ?? '—'}</Text>
        <Text variant="caption">Level curve: {cfg?.levelCurveVersion ?? '—'}</Text>
      </Card>

      <PrimaryButton label="Sign out" onPress={() => setSessionToken(null)} />
    </Screen>
  )
}
