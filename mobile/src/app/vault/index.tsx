/** B05/C03 — Mini-Vault. Custody boundary must always be visible (spec 9.3). */

import { useCallback, useEffect, useState } from 'react'

import { Card, OfflineBanner, Screen, TopBar, Text } from '../../components/ui'
import { api } from '../../core/api'

interface Vault {
  custodyNotice: string
  ownership: { walletAddress: string | null }
  activity: { totalEvents: number }
}

export default function VaultScreen() {
  const [vault, setVault] = useState<Vault | null>(null)
  const [offline, setOffline] = useState(false)

  const load = useCallback(async () => {
    try {
      const v = await api.vault()
      setVault(v as Vault)
      setOffline(false)
    } catch {
      setOffline(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Screen>
      <TopBar title="Vault" />
      {offline ? <OfflineBanner /> : null}
      <Card>
        <Text variant="title">Your assets stay yours</Text>
        <Text variant="body">
          {vault?.custodyNotice ?? 'Your wallet holds your assets. Gochi does not take custody.'}
        </Text>
      </Card>
      <Card title="Ownership">
        <Text variant="mono">{vault?.ownership?.walletAddress ?? '—'}</Text>
      </Card>
      <Card title="Protected activity">
        <Text variant="numeric">{vault?.activity?.totalEvents ?? 0}</Text>
        <Text variant="caption">total tracked events</Text>
      </Card>
    </Screen>
  )
}
