/**
 * K01–K03 — Profile, wallet and Seeker identity.
 *
 * Ownership display only. Spec §9.3 and §29: the wallet is the account, and the
 * companion asset is held by the user's own wallet. Nothing here moves funds.
 */

import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useRouter } from 'expo-router'

import {
  Card,
  ErrorState,
  Screen,
  Text,
  TopBar,
  shortenAddress,
} from '../../components/ui'
import { api, getSessionToken, setSessionToken } from '../../core/api'

interface Me {
  wallet?: string | null
  seekerId?: string | null
  genesisVerified?: boolean
}

export default function ProfileScreen() {
  const router = useRouter()
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState(false)
  // K10: disconnect is destructive enough to confirm. Arming then re-tapping
  // avoids a modal dependency that is not in the project yet.
  const [confirming, setConfirming] = useState(false)

  const load = useCallback(async () => {
    try {
      setMe((await api.me()) as Me)
      setError(false)
    } catch {
      setError(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const disconnect = () => {
    setSessionToken(null)
    router.replace('/auth')
  }

  return (
    <Screen>
      <TopBar title="Profile" />
      {error ? (
        <ErrorState message="Profile could not load." onRetry={load} />
      ) : null}

      <ScrollView className="gap-4">
        <Card title="Wallet">
          <Text variant="mono">
            {me?.wallet ? shortenAddress(me.wallet) : 'Not connected'}
          </Text>
        </Card>

        <Card title="Seeker">
          <Text variant="body">
            {me?.seekerId ? `${me.seekerId}.skr` : 'No .skr name found'}
          </Text>
          <Text variant="caption" className="text-dim">
            {me?.genesisVerified
              ? 'Seeker Genesis Token verified'
              : 'Genesis not verified'}
          </Text>
        </Card>

        <View className="gap-2">
          {confirming ? (
            <Pressable
              accessibilityRole="button"
              onPress={disconnect}
              className="border border-damage p-3"
            >
              <Text variant="bodyStrong" style={{ color: '#ff6b6b' }}>
                Tap again to disconnect
              </Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => setConfirming(true)}
              className="border border-hairline p-3"
            >
              <Text variant="body">Disconnect wallet</Text>
            </Pressable>
          )}
          <Text variant="caption" className="text-dim">
            Disconnecting signs you out of this device. Your companion and its
            onchain asset stay where they are.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  )
}
