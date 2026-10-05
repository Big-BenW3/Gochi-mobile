/**
 * A07 — Link Seeker wallet.
 *
 * For users who signed in with Google and therefore reach the app with an account
 * but no wallet. Section 29.2 puts wallet connection after Google sign-in, and
 * section 29.3 says one wallet resolves to one companion.
 *
 * The wallet is attached by signing our own SIWS challenge, not by sending an
 * address. A Google-only session has no wallet of its own, so accepting one from
 * the request body would let anyone with a valid Google login attach somebody
 * else's Seeker wallet — and with it their companion.
 */

import { useCallback, useState } from 'react'
import { View } from 'react-native'
import { useRouter } from 'expo-router'
import { useMobileWallet } from '@wallet-ui/react-native-kit'

import {
  Card,
  ErrorState,
  PrimaryButton,
  Screen,
  SecondaryButton,
  shortenAddress,
  Text,
  WalletChip,
} from '../../components/ui'
import { useAuthFlow } from '../../features/identity/data-access/use-auth-flow'

export default function LinkWalletScreen() {
  const router = useRouter()
  const { account, signIn } = useMobileWallet()
  const flow = useAuthFlow()

  const [error, setError] = useState<string | null>(null)
  const [alreadyLinked, setAlreadyLinked] = useState(false)

  const connect = useCallback(async () => {
    if (!account) {
      setError('No Seeker wallet found on this device.')
      return
    }

    setError(null)
    const result = await flow.link({ signIn }, account.address)

    if (result.ok) {
      router.replace(result.genesisStatus === 'verified' ? '/seeker/verified' : '/seeker/not-detected')
      return
    }

    // Section 29.3: refuse rather than steal. The server's message here is
    // deliberate copy, not a generic failure string.
    if (result.message.includes('already linked')) {
      setAlreadyLinked(true)
      return
    }

    setError(result.message)
  }, [account, flow, router, signIn])

  return (
    <Screen>
      <View className="flex-1 justify-center">
        <Text variant="display">Connect your wallet</Text>
        <Text variant="body">Sign a request from your Seeker wallet to prove it is yours. We never see your keys.</Text>
      </View>

      {account ? (
        <Card>
          <Text variant="caption">Connected wallet</Text>
          <WalletChip address={account.address} />
        </Card>
      ) : (
        <Card>
          <Text variant="caption">No wallet detected yet</Text>
          <Text variant="body">Open your Seeker wallet app and connect.</Text>
        </Card>
      )}

      {alreadyLinked ? (
        <ErrorState
          title="Already linked"
          message="That wallet is already linked to another Gochi account."
          retryLabel="Use another wallet"
          onRetry={() => router.replace('/auth')}
        />
      ) : null}

      {error && !alreadyLinked ? (
        <ErrorState title="Could not link" message={error} onRetry={connect} retryLabel="Try again" />
      ) : null}

      <PrimaryButton
        label="Connect Seeker Wallet"
        isBusy={flow.busy}
        isDisabled={flow.busy || !account}
        onPress={connect}
      />

      {/*
        Preview mode is deliberately not offered here. Section 37 permits a
        preview state when the wallet is absent, but this screen is reached only
        when the user *has* signed in with Google and a wallet is expected — a
        preview would let them skip the one check that binds an account to a
        device. The absent-wallet case is handled on A09.
      */}
      <SecondaryButton label="Back" onPress={() => router.replace('/auth')} />
    </Screen>
  )
}

export { shortenAddress }
