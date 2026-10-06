/**
 * A14 — First Sync.
 *
 * Spec section 16: four steps — wallet connected, identity resolved, companion
 * initialized, activity synchronized — and one action.
 *
 * Each step is reported from something real. Two are known at entry (the session
 * proves the wallet, the identity route proves the Seeker check), and the third and
 * fourth come from the engine's own response. A step that cannot be verified shows
 * as unmet rather than as done, because a first-sync screen that always reaches
 * "Continue" teaches the user to trust a progress indicator that means nothing.
 */

import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import { useRouter } from 'expo-router'

import { Card, PrimaryButton, Screen, Text, WalletChip } from '../../../components/ui'
import { api, getSessionToken } from '../../../core/api'

type StepState = 'done' | 'failed' | 'pending'

interface Step {
  key: string
  label: string
  state: StepState
  detail?: string
}

export default function FirstSyncScreen() {
  const router = useRouter()
  const [steps, setSteps] = useState<Step[]>([
    { key: 'wallet', label: 'Wallet connected', state: 'pending' },
    { key: 'identity', label: 'Identity resolved', state: 'pending' },
    { key: 'companion', label: 'Companion initialized', state: 'pending' },
    { key: 'activity', label: 'Activity synchronized', state: 'pending' },
  ])
  const [address, setAddress] = useState<string | null>(null)

  const patch = useCallback((key: string, update: Partial<Step>) => {
    setSteps((current) => current.map((step) => (step.key === key ? { ...step, ...update } : step)))
  }, [])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      // 1. Wallet: the session token existing is the proof. A session without a
      // wallet is the Google path mid-link, which is a legitimate state to show as
      // unmet rather than to hide.
      const wallet = getSessionToken() ? 'connected' : null
      if (cancelled) return

      if (wallet) {
        patch('wallet', { state: 'done' })
      } else {
        patch('wallet', { state: 'failed', detail: 'Not signed in' })
      }

      // 2. Identity.
      try {
        const me = await api.me()
        if (cancelled) return
        setAddress(me.wallet)
        patch('wallet', { state: 'done' })
        patch('identity', {
          state: 'done',
          // A wallet with no SGT is resolved, not broken: the identity is known and
          // the answer is "no device". Section 37's preview path.
          detail: me.genesisVerified ? 'Seeker verified' : 'No Seeker Genesis Token',
        })
      } catch {
        if (cancelled) return
        patch('identity', { state: 'failed', detail: 'Could not resolve' })
      }

      // 3 & 4. Companion, then activity — one sync call covers both.
      try {
        const result = await api.syncCompanion()
        if (cancelled) return
        patch('companion', { state: 'done' })
        patch('activity', {
          state: 'done',
          // Distinguishes "nothing to sync" from "sync failed". Scenario 2 requires
          // the first to read as genuinely empty.
          detail:
            result.eventsProcessed === 0
              ? 'Nothing new yet'
              : `${result.eventsProcessed} event${result.eventsProcessed === 1 ? '' : 's'}`,
        })
      } catch {
        if (cancelled) return
        patch('companion', { state: 'failed', detail: 'Could not sync' })
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [patch])

  const ready = steps.every((step) => step.state === 'done')
  const working = steps.some((step) => step.state === 'pending')

  return (
    <Screen>
      <View className="flex-1 justify-center">
        <Text variant="display">Setting up</Text>
        <Text variant="body">One moment while we check everything.</Text>
      </View>

      {address ? <WalletChip address={address} /> : null}

      <Card>
        {steps.map((step) => (
          <View key={step.key} className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text variant="bodyStrong">{step.label}</Text>
              {step.detail ? <Text variant="caption">{step.detail}</Text> : null}
            </View>
            <Text
              variant="caption"
              style={{
                color: step.state === 'done' ? '#3DDC97' : step.state === 'failed' ? '#FF5B6E' : '#666E8F',
              }}
            >
              {step.state === 'done' ? 'Done' : step.state === 'failed' ? 'Unmet' : '…'}
            </Text>
          </View>
        ))}
      </Card>

      <PrimaryButton
        label={ready ? 'Continue' : working ? 'Working…' : 'Continue anyway'}
        isBusy={working}
        onPress={() => router.replace('/')}
      />
    </Screen>
  )
}
