/**
 * A05 — Seeker connection.
 *
 * Owns every state between tapping "Continue with Seeker" and knowing whether it
 * worked: connecting, wallet unavailable, MWA declined, and timeout. Section 16
 * lists exactly those four, and this is the only screen that can reach them.
 *
 * The distinction that matters is declined versus failed. Section 37 requires a
 * dismissed wallet prompt to read as "Wallet connection cancelled." and *not* as
 * an account failure — the user changed their mind, nothing is broken. That
 * string is verbatim and comes from the server's error table, so there is one
 * copy of it rather than one per screen.
 */

import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMobileWallet } from '@wallet-ui/react-native-kit'

import { ErrorState, LoadingState, Screen, TertiaryButton, Text } from '../../components/ui'
import { useAuthFlow } from '../../features/identity/data-access/use-auth-flow'

/** Section 16's four states. */
type State = 'connecting' | 'wallet_unavailable' | 'declined' | 'timeout' | 'failed'

/** A dismissed prompt and a genuine failure are different outcomes, with different copy. */
const COPY: Record<State, { title: string; message: string }> = {
  connecting: { title: 'Connecting', message: 'Approve the connection in your wallet.' },
  wallet_unavailable: {
    title: 'No wallet found',
    message: 'We could not find a Seeker wallet on this device.',
  },
  // Section 37, verbatim.
  declined: { title: 'Cancelled', message: 'Wallet connection cancelled.' },
  timeout: { title: 'Timed out', message: 'The wallet did not respond. Please try again.' },
  failed: { title: 'Could not sign in', message: 'Something went wrong. Please try again.' },
}

/** How long to wait on a wallet prompt before offering a retry. */
const TIMEOUT_MS = 90_000

export default function SeekerConnectingScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ error?: string }>()
  const { account, signIn } = useMobileWallet()
  const flow = useAuthFlow()

  const [state, setState] = useState<State>('connecting')

  // A reason carried back from A04 means the attempt already happened; do not
  // start a second one on mount.
  useEffect(() => {
    if (params.error) {
      setState(params.error === 'rejected' ? 'declined' : 'failed')
      return
    }
    if (!account) setState('wallet_unavailable')
  }, [params.error, account])

  const attempt = useCallback(async () => {
    if (!account) {
      setState('wallet_unavailable')
      return
    }

    setState('connecting')
    const result = await flow.signIn({ signIn }, account.address)

    if (result.ok) {
      router.replace(result.genesisStatus === 'verified' ? '/seeker/verified' : '/seeker/not-detected')
      return
    }

    setState(result.reason === 'rejected' ? 'declined' : 'failed')
  }, [account, flow, router, signIn])

  // Timeout: a wallet prompt left open forever would leave the spinner running
  // with no path forward, which reads as a hung app.
  useEffect(() => {
    if (state !== 'connecting') return
    const timer = setTimeout(() => setState('timeout'), TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [state])

  // Kick off the first attempt automatically.
  useEffect(() => {
    if (!params.error && account && state === 'connecting') void attempt()
    // Intentionally runs once on mount; `attempt` changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const copy = COPY[state]

  return (
    <Screen>
      <View className="flex-1 justify-center">
        <Text variant="display">{copy.title}</Text>
        <Text variant="body">{copy.message}</Text>
      </View>

      {state === 'connecting' ? <LoadingState label="Waiting for wallet" /> : null}

      {state === 'connecting' ? null : (
        <ErrorState title={copy.title} message={copy.message} onRetry={attempt} retryLabel="Try again" />
      )}

      <TertiaryButton label="Use a different method" onPress={() => router.replace('/auth')} />
    </Screen>
  )
}
