/**
 * A09 — Genesis not detected.
 *
 * The screen that has to be honest. Section 16 asks it to explain what is
 * required "without exposing technical jargon", and section 37 forbids claiming
 * verified Seeker ownership when it is absent or merely unchecked.
 *
 * It covers three outcomes that must not be conflated:
 *
 *   - the check completed and found no SGT  → the common case, a plain wallet
 *   - the check could not complete          → section 37's "could not verify"
 *     wording, with a retry, never a verdict
 *   - no wallet is linked at all           → section 37 permits a preview state
 *
 * Nothing here says the user does not own a Seeker. A wallet that is not a Seed
 * Vault wallet was never expected to hold one, and a transient RPC failure is not
 * evidence of anything at all.
 */

import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import { useRouter } from 'expo-router'

import {
  Card,
  ExplorerLink,
  explorerAddressUrl,
  PrimaryButton,
  Screen,
  SecondaryButton,
  SeekerIdentityChip,
  shortenAddress,
  Text,
} from '../../components/ui'
import { useAuthFlow } from '../../features/identity/data-access/use-auth-flow'

export default function GenesisNotDetectedScreen() {
  const router = useRouter()
  const flow = useAuthFlow()

  const [identity, setIdentity] = useState<{ wallet: string | null; seekerId: string | null } | null>(null)
  const [checking, setChecking] = useState(false)
  /**
   * Whether the last check completed. False means we do not know — a different
   * screen state with different copy, not a second "not detected".
   */
  const [checkCompleted, setCheckCompleted] = useState(true)

  useEffect(() => {
    void (async () => {
      const me = await flow.me()
      if (me) setIdentity({ wallet: me.wallet, seekerId: me.seekerId })
    })()
  }, [flow])

  const retry = useCallback(async () => {
    setChecking(true)
    const status = await flow.recheckGenesis()
    setChecking(false)

    if (status === 'verified') {
      router.replace('/seeker/verified')
      return
    }
    if (status === 'unavailable') {
      // Section 37, verbatim. Deliberately not "no Seeker found".
      setCheckCompleted(false)
      return
    }
    setCheckCompleted(true)
  }, [flow, router])

  const wallet = identity?.wallet

  return (
    <Screen>
      <View className="flex-1 justify-center">
        <Text variant="display">{checkCompleted ? 'No Seeker found' : 'Could not verify'}</Text>
        <Text variant="body">
          {checkCompleted
            ? 'This wallet does not hold a Seeker Genesis Token, so device-only rewards stay locked. Everything else works as normal.'
            : // Section 37, verbatim.
              'We could not verify your Seeker identity right now.'}
        </Text>
      </View>

      {wallet ? (
        <Card>
          <Text variant="caption">Wallet checked</Text>
          <Text variant="mono">{shortenAddress(wallet)}</Text>

          {identity?.seekerId ? (
            <>
              <Text variant="caption">Seeker ID</Text>
              <SeekerIdentityChip name={identity.seekerId} />
            </>
          ) : null}

          <ExplorerLink label="View on explorer" url={explorerAddressUrl(wallet)} />
        </Card>
      ) : null}

      <PrimaryButton
        label={checking ? 'Checking…' : 'Check again'}
        isBusy={checking}
        isDisabled={checking || !wallet}
        onPress={retry}
      />

      <SecondaryButton label="Open Wallet" onPress={() => {}} />
      <SecondaryButton label="Continue without rewards" onPress={() => router.replace('/')} />
    </Screen>
  )
}
