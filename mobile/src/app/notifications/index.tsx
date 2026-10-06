/** J01 — Notification Center. */

import { useCallback, useEffect, useState } from 'react'

import { Card, EmptyState, OfflineBanner, Screen, TopBar, Text } from '../../components/ui'
import { api } from '../../core/api'

interface N {
  id: string
  type: string
  title: string
  body: string
  readAt: string | null
}

export default function NotificationsScreen() {
  const [list, setList] = useState<N[]>([])
  const [offline, setOffline] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await api.notifications()
      setList((r as { notifications?: N[] }).notifications ?? [])
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
      <TopBar title="Alerts" />
      {offline ? <OfflineBanner /> : null}
      {list.length === 0 ? (
        <EmptyState title="No alerts" message="Nothing to show yet." />
      ) : (
        list.map((n) => (
          <Card key={n.id} title={n.title}>
            <Text variant="body">{n.body}</Text>
            <Text variant="caption">{n.readAt ? 'Read' : 'New'}</Text>
          </Card>
        ))
      )}
    </Screen>
  )
}
