/**
 * A11 — Companion Birth Reveal.
 *
 * Spec section 16: a full-screen reveal with one action, Continue.
 *
 * This screen owns the mint, which is why it is the one that can fail. The
 * distinction it must preserve is between three outcomes the spec cares about:
 *
 *   - a companion exists with an asset  → reveal
 *   - a companion row exists, no asset → retryable, and *not* a reveal
 *   - the mint is unavailable          → retryable, with the server's wording
 *
 * Collapsing the middle two into "something went wrong" would leave a user with a
 * companion they can never see again and no way to fix it.
 */

import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'

import { Card, ErrorState, LoadingState, PrimaryButton, Screen, Text } from '../../../components/ui'
import { createCompanion } from '../../../features/companion/data-access/creation'

export default function CompanionRevealScreen() {
  const router = useRouter()
  const { name } = useLocalSearchParams<{ name?: string }>()

  const [state, setState] = useState<'minting' | 'revealed' | 'retryable'>('minting')
  const [message, setMessage] = useState<string | null>(null)

  const mint = useCallback(async () => {
    if (!name) {
      // Reached without a name, which means the egg screen routed here directly.
      // There is nothing to mint, so send the user back rather than inventing one.
      router.replace('/companion/name')
      return
    }

    setState('minting')
    setMessage(null)

    const result = await createCompanion(name)

    if (result.ok) {
      // A null asset address with ok:true means the row exists but the transaction
      // did not complete. Treated as retryable, not as a birth.
      if (result.assetAddress) {
        setState('revealed')
        return
      }
      setState('retryable')
      setMessage('Your companion exists but its collectible was not created yet. This is safe to retry.')
      return
    }

    setState('retryable')
    setMessage(result.message)
  }, [name, router])

  useEffect(() => {
    void mint()
  }, [mint])

  return (
    <Screen>
      <View className="flex-1 items-center justify-center" style={{ gap: 12 }}>
        {/*
          The reveal itself. P5 replaces this with the 3D model; section 55
          scenario 8 requires the static fallback to remain usable when the model
          fails, so it is a real screen rather than a loading state.
        */}
        <View
          className="items-center justify-center border border-hairline bg-ink-850"
          style={{ width: 240, height: 280, borderRadius: 140 }}
        >
          <Text variant="caption">{state === 'revealed' ? name : 'Companion'}</Text>
        </View>
      </View>

      {state === 'minting' ? <LoadingState label="Creating your companion" /> : null}

      {state === 'revealed' ? (
        <Card>
          <Text variant="title">{name}</Text>
          <Text variant="body">
            Born on Solana. Network fees were covered by Gochi, and no transaction was sent from your wallet.
          </Text>
          <PrimaryButton label="Continue" onPress={() => router.replace('/companion/tutorial')} />
        </Card>
      ) : null}

      {state === 'retryable' ? (
        <Card>
          <ErrorState
            title="Not created yet"
            message={message ?? 'Something went wrong.'}
            onRetry={mint}
            retryLabel="Try again"
          />
          <PrimaryButton label="Choose a different name" onPress={() => router.replace('/companion/name')} />
        </Card>
      ) : null}
    </Screen>
  )
}
