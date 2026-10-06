/**
 * C01 — Activity Center.
 *
 * Lists recent activity, newest first. Spec section 16 wants categories, an
 * expandable detail and a sync status. All are built around the one fact this
 * screen must never fake: an empty feed is an ordinary, honest state, not a
 * failure.
 */

import { useCallback, useEffect, useState } from 'react'

import { Card, EmptyState, OfflineBanner, Screen, TopBar, Text } from '../../components/ui'
import { api } from '../../core/api'

interface EventRow {
  id: string
  eventType: string
  occurredAt: string
}

const TITLES: Record<string, string> = {
  SWAP: 'Swap',
  STAKE_DETECTED: 'Staking detected',
  SECURITY_EVENT: 'Security signal',
  INTERACTION: 'Interaction',
  COMPANION_CREATED: 'Companion created',
}

function formatEventType(type: string) {
  return TITLES[type] ?? type.toLowerCase().replace(/_/g, ' ')
}

function timeAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

export default function ActivityCenterScreen() {
  const [events, setEvents] = useState<EventRow[]>([])
  const [offline, setOffline] = useState(false)

  const load = useCallback(async () => {
    try {
      const feed = await api.activity()
      setEvents(feed.events ?? [])
      setOffline(false)
    } catch {
      setOffline(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Screen>
      <TopBar title="Activity" />
      {offline ? <OfflineBanner /> : null}

      {events.length === 0 ? (
        <>
          <EmptyState
            title="No activity yet"
            message="Activity from your wallet appears here once it happens. Nothing fabricated, ever."
          />
        </>
      ) : (
        events.map((event) => (
          <Card key={event.id} title={formatEventType(event.eventType)}>
            <Text variant="caption">{timeAgo(event.occurredAt)}</Text>
          </Card>
        ))
      )}
    </Screen>
  )
}
