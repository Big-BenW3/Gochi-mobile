import { StatusBar } from 'expo-status-bar'

import { WalletFeatureEntry } from '../../features/wallet/wallet-feature-entry'

/**
 * The scaffold's original wallet demo, kept on a dev route.
 *
 * Not part of the product. It exists so Mobile Wallet Adapter can still be
 * exercised after the monorepo restructure: if connect/sign breaks, this screen
 * is the way to tell an app regression apart from a wallet or device problem.
 *
 * Replaced by the real identity flow in P1.
 */
export default function DevWallet() {
  return (
    <>
      <WalletFeatureEntry />
      <StatusBar style="auto" />
    </>
  )
}
