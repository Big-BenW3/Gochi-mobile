/** B03 — Companion Stats. Level, XP, energy, shield, aura, combat. */

import { useCallback, useEffect, useState } from 'react'

import { Card, ProgressBar, Screen, TopBar, Text } from '../../components/ui'
import { colors } from '../../theme/tokens'
import { api } from '../../core/api'

interface P {
  level: number
  xp: number
  xpToNextLevel: number
  energy: number
  shieldHealth: number
  aura: number
  combatRating: number
  evolutionStage: number
  condition: string
}

export default function StatsScreen() {
  const [p, setP] = useState<P | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await api.progression()
      setP(r as P)
    } catch {
      /* keep previous */
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Screen>
      <TopBar title="Stats" />
      <Card title="Level">
        <Text variant="numericStrong">{p?.level ?? '—'}</Text>
        <Text variant="caption">{p?.xpToNextLevel != null ? `${p.xp} / ${p.xpToNextLevel} XP` : '—'}</Text>
        <ProgressBar value={p?.xp ?? 0} max={Math.max(1, p?.xpToNextLevel ?? 1)} tint={colors.primary} />
      </Card>
      <Card title="Energy">
        <ProgressBar value={p?.energy ?? 0} max={100} tint={colors.signal} glows />
      </Card>
      <Card title="Shield">
        <ProgressBar value={p?.shieldHealth ?? 0} max={100} tint={colors.recover} />
      </Card>
      <Card title="Aura / combat">
        <ProgressBar value={p?.aura ?? 0} max={100} tint={colors.primary} glows />
        <Text variant="caption">Combat rating {p?.combatRating ?? '—'}</Text>
      </Card>
    </Screen>
  )
}
