/**
 * Auth orchestration for the onboarding screens.
 *
 * Wraps the sign-in exchanges so a screen deals in a `result.ok` boolean rather
 * than in fetch states, signatures and error codes. Without this, each of the six
 * onboarding screens would make its own decision about what a dismissed wallet
 * prompt means, and one of them would eventually get it wrong.
 *
 * The wallet API is passed in rather than reached for through a hook, because a
 * hook cannot be called from a callback. The screens own `useMobileWallet()` and
 * hand the result here, which keeps the exchanges plain async functions.
 */

import type { useMobileWallet } from '@wallet-ui/react-native-kit'
import { useCallback, useState } from 'react'
import type { User } from '@gochi/contracts'

import { api, setSessionToken } from '../../../core/api'
import { logger } from '../../../core/logging'
import { linkWallet, signInWithWallet, type SignInResult } from './sign-in'

/** The slice of the wallet hook these exchanges need. */
export type WalletApi = Pick<ReturnType<typeof useMobileWallet>, 'signIn'>

export interface AuthFlow {
  /** True while any exchange is in flight, so screens can block double-taps. */
  busy: boolean
  /** SIWS sign-in, the Seeker path from A04. */
  signIn: (wallet: WalletApi, address: string) => Promise<SignInResult>
  /** Attach a wallet to a Google-only account, the A07 path. */
  link: (wallet: WalletApi, address: string) => Promise<SignInResult>
  /** Re-check Genesis on demand, backing A08's retry. */
  recheckGenesis: () => Promise<User['genesisStatus'] | null>
  /** Read the session's identity. Returns null when unauthenticated. */
  me: () => Promise<User | null>
}

export function useAuthFlow(): AuthFlow {
  const [busy, setBusy] = useState(false)

  /**
   * Run an exchange under the busy flag.
   *
   * `finally` rather than a success path, so a rejected promise still clears the
   * flag. A stuck spinner reads as a hung app.
   */
  const guard = useCallback(async <T>(run: () => Promise<T>): Promise<T> => {
    setBusy(true)
    try {
      return await run()
    } finally {
      setBusy(false)
    }
  }, [])

  const signIn = useCallback(
    (wallet: WalletApi, address: string) => guard(() => signInWithWallet(wallet, address)),
    [guard],
  )

  const link = useCallback((wallet: WalletApi, address: string) => guard(() => linkWallet(wallet, address)), [guard])

  const recheckGenesis = useCallback(
    (): Promise<User['genesisStatus']> =>
      guard(async () => {
        try {
          const result = await api.genesis()
          return result.status
        } catch {
          // 503 means the check could not complete, which A08 shows as a retry
          // rather than as a negative answer.
          logger.warn('genesis.recheck_failed')
          return 'unavailable' as const
        }
      }),
    [guard],
  )

  const me = useCallback(async (): Promise<User | null> => {
    try {
      return await api.me()
    } catch {
      // A missing or rejected session is an ordinary state, not an error worth
      // surfacing — the caller routes to A04 when this returns null.
      return null
    }
  }, [])

  return { busy, signIn, link, recheckGenesis, me }
}

export { setSessionToken }
