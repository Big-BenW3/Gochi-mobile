/**
 * B05/C03 — Mini-Vault (spec §9, PLAN P10).
 *
 * Two rules hold on this screen and are enforced by its content, not its styling:
 *
 *  1. **§9.3 custody boundary.** The notice from the server is rendered verbatim.
 *     The vault is a room that belongs to the companion, not a wallet the app
 *     operates, and copy that drifts toward "your funds" would misdescribe it.
 *  2. **No fabricated value.** Balances are raw onchain amounts with no price
 *     attached, because inventing one is the same class of lie as a security
 *     score. A failed read renders as "unavailable" with a retry, never as zero.
 */

import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'

import { Card, ErrorState, LoadingState, Screen, Text, TopBar, shortenAddress } from '../../components/ui'
import { api } from '../../core/api'

interface Balance {
  mint: string
  amount: string
  decimals: number
  symbol: string | null
}

interface Vault {
  custodyNotice: string
  companion: { id: string; name: string; assetAddress: string | null; metadataUri: string | null }
  ownership: {
    walletAddress: string | null
    seekerId: string | null
    genesisVerified: boolean
  }
  balances: { available: boolean; tokens: Balance[] }
  activity: { totalEvents: number }
}

export default function VaultScreen() {
  const [vault, setVault] = useState<Vault | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  const load = useCallback(async () => {
    setState('loading')
    try {
      setVault((await api.vault()) as Vault)
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
      <TopBar title="Vault" />
      {state === 'loading' ? <LoadingState /> : null}
      {state === 'error' ? (
        <ErrorState message="The vault could not load." onRetry={load} />
      ) : null}

      {state === 'ready' && vault ? (
        <ScrollView className="gap-4">
          <Card title={vault.companion.name}>
            <Text variant="caption" className="text-dim">
              Companion asset
            </Text>
            <Text variant="mono">
              {vault.companion.assetAddress
                ? shortenAddress(vault.companion.assetAddress)
                : 'Not minted yet'}
            </Text>
          </Card>

          <Card title="Ownership">
            <Text variant="mono">
              {vault.ownership.walletAddress
                ? shortenAddress(vault.ownership.walletAddress)
                : 'No wallet'}
            </Text>
            <Text variant="caption" className="text-dim">
              {vault.ownership.seekerId
                ? `${vault.ownership.seekerId}.skr`
                : 'No .skr name'}
            </Text>
          </Card>

          <Card title="Holdings">
            {!vault.balances.available ? (
              <>
                <Text variant="body">Unavailable.</Text>
                <Text variant="caption" className="text-dim">
                  The chain could not be read, so balances are unknown — not empty.
                </Text>
                <Pressable accessibilityRole="button" onPress={load}>
                  <Text variant="body" className="text-signal">
                    Retry →
                  </Text>
                </Pressable>
              </>
            ) : vault.balances.tokens.length === 0 ? (
              <Text variant="body" className="text-dim">
                No token balances in this wallet.
              </Text>
            ) : (
              vault.balances.tokens.map((t) => (
                <View key={t.mint} className="flex-row justify-between py-1">
                  <Text variant="mono">{shortenAddress(t.mint)}</Text>
                  {/* Raw amount. No currency formatting, because formatting
                      implies a price this app has no business inventing. */}
                  <Text variant="mono">{t.amount}</Text>
                </View>
              ))
            )}
          </Card>

          <Text variant="caption" className="text-dim">
            {vault.custodyNotice}
          </Text>
        </ScrollView>
      ) : null}
    </Screen>
  )
}
