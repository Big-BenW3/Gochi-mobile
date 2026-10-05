/**
 * A04 — Authentication.
 *
 * The first thing a new user sees, and the only place both entry paths sit side
 * by side.
 *
 * The copy describes an action, never an outcome. "Continue with Seeker" does not
 * promise the user owns a Seeker, because they may not — A09 says so honestly
 * rather than this screen having implied otherwise.
 */

import { useCallback, useState } from 'react'
import { View } from 'react-native'
import { useRouter } from 'expo-router'
import { useLoginWithOAuth, usePrivy } from '@privy-io/expo'
import { useMobileWallet } from '@wallet-ui/react-native-kit'

import { Card, PrimaryButton, Screen, SecondaryButton, TertiaryButton, Text } from '../../components/ui'
import { signInWithPrivy } from '../../features/identity'
import { useAuthFlow } from '../../features/identity/data-access/use-auth-flow'

export default function AuthenticationScreen() {
  const router = useRouter()
  const { account, signIn: walletSignIn } = useMobileWallet()
  const { login: loginWithGoogle } = useLoginWithOAuth()
  // Read at the top level: a hook cannot be called from inside a callback, and
  // `getAccessToken` is a plain function once we hold it.
  const { getAccessToken } = usePrivy()
  const flow = useAuthFlow()

  const [googleBusy, setGoogleBusy] = useState(false)
  const [googleError, setGoogleError] = useState<string | null>(null)

  const continueWithSeeker = useCallback(async () => {
    if (!account) {
      // A05 owns "wallet unavailable", so route there rather than reporting it here.
      router.push('/seeker/connecting')
      return
    }

    const result = await flow.signIn({ signIn: walletSignIn }, account.address)

    if (!result.ok) {
      router.push({ pathname: '/seeker/connecting', params: { error: result.reason } })
      return
    }

    router.push(result.genesisStatus === 'verified' ? '/seeker/verified' : '/seeker/not-detected')
  }, [account, flow, router, walletSignIn])

  const continueWithGoogle = useCallback(async () => {
    setGoogleError(null)
    setGoogleBusy(true)
    try {
      await loginWithGoogle({ provider: 'google' })
      // The SDK is now authenticated with Google; exchange that for a Gochi
      // session, which has no wallet yet. That is exactly A07.
      const result = await signInWithPrivy(getAccessToken)
      router.push(result.ok ? '/seeker/link-wallet' : '/auth')
    } catch {
      setGoogleError('Google sign-in was cancelled.')
    } finally {
      setGoogleBusy(false)
    }
  }, [getAccessToken, loginWithGoogle, router])

  return (
    <Screen>
      <View className="flex-1 justify-center">
        <Text variant="display">Gochi</Text>
        <Text variant="body">Your companion lives on this wallet. Connect one to begin.</Text>
      </View>

      <Card>
        <PrimaryButton
          label={flow.busy ? 'Waiting for wallet…' : 'Continue with Seeker'}
          isBusy={flow.busy}
          isDisabled={googleBusy}
          onPress={continueWithSeeker}
        />

        <SecondaryButton
          label={googleBusy ? 'Opening Google…' : 'Continue with Google'}
          isBusy={googleBusy}
          isDisabled={flow.busy}
          onPress={continueWithGoogle}
        />

        {googleError ? (
          <Text variant="caption" className="text-damage-400">
            {googleError}
          </Text>
        ) : null}
      </Card>

      <View className="flex-row justify-between">
        <TertiaryButton label="Terms" fullWidth={false} onPress={() => {}} />
        <TertiaryButton label="Privacy" fullWidth={false} onPress={() => {}} />
      </View>
    </Screen>
  )
}
