/**
 * A08 — Genesis verification, verified.
 *
 * Shown only when the *server* confirmed the linked wallet holds a Seeker Genesis
 * Token. The client never decides this: section 38 rule 6 names Genesis
 * verification among the things a client must not be trusted about, so the claim
 * on this screen is a rendering of the server's answer and nothing more.
 *
 * A `.skr` name is shown beside the truncated address, never instead of it. A
 * reverse-resolved name is not evidence of identity — `.skr` transfers need
 * nothing from the recipient, so anyone can push a name onto any wallet. The
 * address is the part a user can actually check.
 */

import { useCallback, useState } from 'react'
import { View } from 'react-native'
import { useRouter } from 'expo-router'

import {
  Card,
  ExplorerLink,
  explorerAddressUrl,
  PrimaryButton,
  Screen,
  SeekerIdentityChip,
  shortenAddress,
  Text,
} from '../../components/ui'
import { useAuthFlow } from '../../features/identity/data-access/use-auth-flow'

export default function GenesisVerifiedScreen() {
  const router = useRouter()
  const flow = useAuthFlow()
  const [identity, setIdentity] = useState<{ wallet: string | null; seekerId: string | null } | null>(null)

  // Read identity on mount rather than threading it through navigation params,
  // which would put a trust decision in a link.
  useCallback(async () => {
    const me = await flow.me()
    if (me) setIdentity({ wallet: me.wallet, seekerId: me.seekerId })
  }, [flow])

  const wallet = identity?.wallet
  const seekerId = identity?.seekerId

  return (
    <Screen>
      <View className="flex-1 justify-center">
        <Text variant="display">Seeker verified</Text>
        <Text variant="body">This wallet holds a Seeker Genesis Token. Your companion can use every reward.</Text>
      </View>

      {wallet ? (
        <Card>
          <Text variant="caption">Wallet</Text>
          <Text variant="mono">{shortenAddress(wallet)}</Text>

          {seekerId ? (
            <>
              <Text variant="caption">Seeker ID</Text>
              <SeekerIdentityChip name={seekerId} isVerified />
            </>
          ) : null}

          <ExplorerLink label="View on explorer" url={explorerAddressUrl(wallet)} />
        </Card>
      ) : null}

      <PrimaryButton label="Continue" onPress={() => router.replace('/')} />
    </Screen>
  )
}
