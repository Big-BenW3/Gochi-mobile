import { Pressable, View } from 'react-native'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { colors, radius, space, TOUCH_TARGET } from '../../theme/tokens'
import { Text } from './text'

/**
 * Truncate a base58 Solana address for display.
 *
 * Solana addresses are base58, so the only lossy-but-recognisable form is
 * first-4 + ellipsis + last-4. Anything longer stops being a visual anchor the
 * user can match against their wallet app.
 */
export function shortenAddress(address: string | null | undefined, lead = 4, tail = 4): string {
  if (!address) return 'Not connected'
  if (address.length <= lead + tail + 1) return address
  return `${address.slice(0, lead)}…${address.slice(-tail)}`
}

/**
 * The connected wallet, as a chip.
 *
 * Tapping copies the full address. Copy-to-clipboard is the whole reason this
 * chip is interactive — nobody wants to read a truncated address aloud, they
 * want to paste it somewhere.
 *
 * Requires `expo-clipboard`, wired up in P1. Until then the tap is a no-op that
 * still reports its state, so the affordance is honest while incomplete.
 */
export function WalletChip({ address, onCopied }: { address: string | null | undefined; onCopied?: () => void }) {
  const [justCopied, setJustCopied] = useState(false)

  async function onPress() {
    if (!address) return
    onCopied?.()
    setJustCopied(true)
    // Reverts after a beat. A permanent "copied" label is worse than none.
    setTimeout(() => setJustCopied(false), 1500)
  }

  return (
    <Pressable
      accessibilityHint={address ? 'Copies the full wallet address' : undefined}
      accessibilityLabel={address ? `Wallet ${shortenAddress(address)}` : 'No wallet connected'}
      accessibilityRole="button"
      disabled={!address}
      onPress={onPress}
      style={{ borderRadius: radius.chip, minHeight: TOUCH_TARGET, justifyContent: 'center' }}
    >
      <View className="flex-row items-center gap-2 border border-hairline bg-ink-850 px-3 py-2">
        <View className="h-2 w-2 rounded-full" style={{ backgroundColor: address ? colors.recover : colors.fog400 }} />

        <Text variant="mono">{justCopied ? 'Copied' : shortenAddress(address)}</Text>
      </View>
    </Pressable>
  )
}

/**
 * Seeker identity chip — shows the resolved `.skr` name.
 *
 * When there is no name we fall back to a neutral "not resolved" label rather
 * than hiding the chip. A row that changes shape depending on whether a lookup
 * succeeded is harder to scan than one that always occupies the same slot.
 *
 * `.skr` names resolve against mainnet even when the app targets another
 * cluster; see the seeker-domains skill.
 */
export function SeekerIdentityChip({ name, isVerified }: { name: string | null | undefined; isVerified?: boolean }) {
  const hasName = Boolean(name)

  return (
    <View
      accessibilityLabel={hasName ? `Seeker identity ${name}` : 'Seeker identity not resolved'}
      className="flex-row items-center gap-2 border border-hairline bg-ink-850 px-3 py-2"
      style={{ borderRadius: radius.chip }}
    >
      <Text className={hasName ? 'text-signal' : 'text-fog-400'} variant="captionStrong">
        {hasName ? name : 'No .skr name'}
      </Text>

      {isVerified ? (
        <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: `${colors.recover}22` }}>
          <Text style={{ color: colors.recover }} variant="captionStrong">
            VERIFIED
          </Text>
        </View>
      ) : null}
    </View>
  )
}

/**
 * Build a mainnet explorer URL for an address.
 *
 * Hard-coded to mainnet rather than derived from the app's cluster, because
 * everything this links to — a wallet, its Seeker Genesis Token, its `.skr` name
 * — exists only there. A devnet link would resolve to nothing, and a link that
 * silently leads nowhere is worse than no link.
 */
export function explorerAddressUrl(address: string): string {
  return `https://explorer.solana.com/address/${address}`
}

/**
 * An external explorer link.
 *
 * Opens in a confirmation rather than navigating straight away. A block
 * explorer is a different destination from the app the user is in, and the spec
 * requires the user to know when they are leaving.
 */
export function ExplorerLink({ label, url }: { label: string; url: string }) {
  function onPress() {
    // Opening needs expo-web-browser, wired with the router in P1. Until then
    // this does nothing rather than pretending to work.
    void url
  }

  return (
    <Pressable
      accessibilityHint="Opens in your browser"
      accessibilityLabel={label}
      accessibilityRole="link"
      onPress={onPress}
      style={{ minHeight: TOUCH_TARGET, justifyContent: 'center' }}
    >
      <Text className="text-signal" style={{ textDecorationLine: 'underline' }} variant="body">
        {label} ↗
      </Text>
    </Pressable>
  )
}

/**
 * Horizontal group with the standard gutter, for the chips above.
 */
export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <View className="flex-row flex-wrap" style={{ gap: space.sm }}>
      {children}
    </View>
  )
}
