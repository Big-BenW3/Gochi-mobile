/**
 * B01 — Companion Home.
 *
 * The primary screen, and the one every navigation path returns to. Spec section 16
 * lists its contents: the companion, its name, level, XP progress, condition, the
 * three stats, the latest event, a while-you-were-away teaser, and the FAB.
 *
 * Two decisions worth naming:
 *
 * **Stats come from the server, including the XP the curve needs.** The client never
 * recomputes XP-to-next — section 21.2 makes the server authoritative and section 41
 * wants balance changes to need no app release. A locally calculated progress bar
 * would silently disagree with the server the moment the curve changed.
 *
 * **Tapping a stat opens its explanation rather than a chart.** Energy, shield and
 * aura each mean something different and none is obvious from a number. Section 4.3
 * is explicit that the shield must never read as a security score, and the copy
 * below is where that promise is kept.
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'expo-router'

import { Pressable, View } from 'react-native'

import {
  Card,
  ConditionBadge,
  LevelBadge,
  OfflineBanner,
  ProgressBar,
  Screen,
  StatRow,
  StatTile,
  Text,
  TopBar,
} from '../components/ui'
import { colors } from '../theme/tokens'
import { api } from '../core/api'
import { FabButton } from '../components/navigation/fab-button'
import {
  StaticCompanion,
  useStageVisibility,
} from '../features/companion/ui/companion-stage'

interface CompanionView {
  id: string
  name: string
  level: number
  xp: number
  xpToNextLevel: number
  energy: number
  shieldHealth: number
  aura: number
  combatRating: number
  condition: string
  evolutionStage: number
}

/** What each stat actually means, in one sentence. */
const STAT_COPY: Record<string, { title: string; body: string }> = {
  energy: {
    title: 'Energy',
    body: 'Drops slowly while your wallet is quiet and recovers through staking. It settles at 20 and never reaches zero — a tired companion is resting, not dying.',
  },
  shield: {
    title: 'Shield',
    body: 'Protection is shown, not scored. Gochi cannot inspect wallet security, so this reflects confirmed activity rather than a security rating.',
  },
  aura: {
    title: 'Aura and combat rating',
    body: 'Activity intensity. Both rise with verified swaps and fall back over time. This is a visual signal, not a ranking against anyone.',
  },
}

function formatEvent(type: string): string {
  switch (type) {
    case 'SWAP':
      return 'A swap lifted its aura.'
    case 'STAKE_DETECTED':
      return 'Staking restored its energy.'
    case 'SECURITY_EVENT':
      return 'A security signal came through.'
    case 'INTERACTION':
      return 'It asked for a moment.'
    default:
      return 'It stirred.'
  }
}

export default function CompanionHomeScreen() {
  const router = useRouter()
  const active = useStageVisibility()

  const [companion, setCompanion] = useState<CompanionView | null>(null)
  const [latestEvent, setLatestEvent] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [explaining, setExplaining] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const response = await api.companion()
      const payload = (response as unknown as { companion: CompanionView }).companion
      setCompanion(payload)
      setOffline(false)
      try {
        const feed = await api.activity()
        const first = feed.events?.[0]
        if (first) setLatestEvent(formatEvent(first.eventType))
      } catch {
        /* latest event is a teaser, not a reason to show an error */
      }
    } catch {
      // Section 36: a cached companion stays on screen when the network fails.
      // Section 53 rule 9 forbids replacing data with a spinner.
      setOffline(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Screen>
      <TopBar title={companion?.name ?? 'Gochi'} />

      {offline ? <OfflineBanner /> : null}

      <View style={{ flex: 1, minHeight: 220 }}>
        {companion ? (
          <StaticCompanion
            active={active}
            visual={{
              condition: companion.condition as never,
              level: companion.level,
              evolutionStage: companion.evolutionStage,
              energy: companion.energy,
              aura: companion.aura,
              combatRating: companion.combatRating,
              shieldHealth: companion.shieldHealth,
            }}
          />
        ) : null}
      </View>

      {explaining ? (
        <Card>
          <Text variant="title">{STAT_COPY[explaining]?.title}</Text>
          <Text variant="body">{STAT_COPY[explaining]?.body}</Text>
        </Card>
      ) : null}

      {companion ? (
        <Card>
          <View className="flex-row items-center justify-between">
            <Text variant="title">{companion.name}</Text>
            <LevelBadge level={companion.level} />
          </View>

          <ConditionBadge condition={companion.condition as never} />

          {/*
            XP progress uses the server's xpToNextLevel rather than a locally
            computed one. Section 41 wants a balance change to need no app release,
            and a client-side curve would disagree with the server the moment it
            changed.
          */}
          {/* XP progress uses the server's xpToNextLevel (see file header). */}
          <ProgressBar
            value={companion.xp}
            max={Math.max(1, companion.xpToNextLevel)}
            tint={colors.primary}
            accessibilityLabel={`${companion.xp} of ${companion.xpToNextLevel} XP`}
          />
          <Text variant="caption">
            {companion.xp} / {companion.xpToNextLevel} XP to level {companion.level + 1}
          </Text>

          <StatRow>
            <Pressable onPress={() => setExplaining('energy')} accessibilityLabel="About energy">
              <StatTile
                label="Energy"
                value={String(companion.energy)}
                progress={companion.energy / 100}
                tint={colors.signal}
                isHighlighted
              />
            </Pressable>
            <Pressable onPress={() => setExplaining('shield')} accessibilityLabel="About shield">
              <StatTile
                label="Shield"
                value={String(companion.shieldHealth)}
                progress={companion.shieldHealth / 100}
                tint={colors.recover}
              />
            </Pressable>
            <Pressable onPress={() => setExplaining('aura')} accessibilityLabel="About aura">
              <StatTile
                label="Aura"
                value={String(companion.aura)}
                progress={companion.aura / 100}
                tint={colors.primary}
              />
            </Pressable>
          </StatRow>

          <StatTile
            label="Combat rating"
            value={String(companion.combatRating)}
            progress={companion.combatRating / 1000}
            tint={colors.primary}
          />
        </Card>
      ) : null}

      {latestEvent ? (
        <Card title="Latest">
          <Text variant="body">{latestEvent}</Text>
        </Card>
      ) : null}

      {/*
        FAB-first with no tab bar (ADR-004). The concept board's tab strip was
        rejected: four equally-weighted destinations make the companion compete with
        its own navigation.
      */}
      <FabButton
        onPress={() => router.push('/activity')}
        accessibilityLabel="Open companion menu"
      />
    </Screen>
  )
}
