/** Settings: signed-in wallet, config version, sign out. */

import { useCallback, useEffect, useState } from 'react'

import { Card, PrimaryButton, Screen, TopBar, Text } from '../../components/ui'
import { api, getSessionToken, setSessionToken } from '../../core/api'
import type { GameConfigResponse } from '@gochi/contracts'

export default function SettingsScreen() {
  const [cfg, setCfg] = useState<GameConfigResponse | null>(null)
  const [wallet, setWallet] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const me = await api.me()
      setWallet(me.wallet)
    } catch {
      /* not signed in */
    }
    try {
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787'}/v1/admin/config`,
        { headers: { Authorization: `Bearer ${getSessionToken()}` } },
      )
      setCfg(res.ok ? ((await res.json()) as GameConfigResponse) : null)
    } catch {
      /* offline */
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Screen>
      <TopBar title="Settings" />
      <Card title="Wallet">
        <Text variant="mono">{wallet ?? 'Not connected'}</Text>
      </Card>
      <Card title="Game version">
        <Text variant="mono">{cfg?.version ?? '—'}</Text>
        <Text variant="caption">Level curve: {cfg?.levelCurveVersion ?? '—'}</Text>
      </Card>
      <PrimaryButton
        label="Sign out"
        onPress={() => setSessionToken(null)}
      />
    </Screen>
  )
}
