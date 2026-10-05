/**
 * A06 — Google authentication.
 *
 * Section 16 calls this a web/SDK handoff with four states: signing in, success,
 * cancelled, failed. Cancelled is separate from failed for the same reason as
 * A05 — section 37 forbids treating a dismissed handoff as an account failure.
 *
 * The exchange this screen ultimately drives is `signInWithPrivy`, which turns
 * the SDK's access token into a Gochi session. It carries no wallet, so success
 * routes to A07 rather than straight to the companion.
 */

import { useCallback, useState } from 'react'
import { View } from 'react-native'
import { useRouter } from 'expo-router'
import { useLoginWithOAuth, usePrivy } from '@privy-io/expo'

import { ErrorState, LoadingState, PrimaryButton, Screen, SecondaryButton, Text } from '../../components/ui'
import { signInWithPrivy } from '../../features/identity'

type State = 'idle' | 'signing_in' | 'success' | 'cancelled' | 'failed'

export default function PrivyAuthenticationScreen() {
  const router = useRouter()
  const { login } = useLoginWithOAuth()
  const { getAccessToken, user } = usePrivy()

  const [state, setState] = useState<State>('idle')

  const signIn = useCallback(async () => {
    setState('signing_in')
    try {
      await login({ provider: 'google' })
    } catch {
      // The SDK rejects when the modal is dismissed. Not an account failure.
      setState('cancelled')
      return
    }

    const result = await signInWithPrivy(getAccessToken)
    if (result.ok) {
      setState('success')
      // A Google account has no wallet yet. That is A07's entire purpose.
      router.replace('/seeker/link-wallet')
    } else {
      setState(result.reason === 'cancelled' ? 'cancelled' : 'failed')
    }
  }, [getAccessToken, login, router])

  return (
    <Screen>
      <View className="flex-1 justify-center">
        <Text variant="display">Google</Text>
        <Text variant="body">Sign in with Google, then connect your Seeker wallet to confirm who you are.</Text>
        {user ? <Text variant="caption">Signed in as {user.id?.slice(0, 8)}…</Text> : null}
      </View>

      {state === 'signing_in' ? <LoadingState label="Opening Google" /> : null}

      {state === 'cancelled' ? (
        <ErrorState title="Cancelled" message="Google sign-in was cancelled." onRetry={signIn} retryLabel="Try again" />
      ) : null}

      {state === 'failed' ? (
        <ErrorState
          title="Could not sign in"
          message="Something went wrong. Please try again."
          onRetry={signIn}
          retryLabel="Try again"
        />
      ) : null}

      <PrimaryButton
        label="Continue with Google"
        isBusy={state === 'signing_in'}
        isDisabled={state === 'signing_in'}
        onPress={signIn}
      />
      <SecondaryButton label="Back" onPress={() => router.replace('/auth')} />
    </Screen>
  )
}
