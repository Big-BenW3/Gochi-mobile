/**
 * Barrel for the shared UI layer.
 *
 * Screens import from here rather than from individual files.
 *
 * Only components with no dependency on app data live in this layer. Anything
 * that needs a companion, an activity event or a notification is a feature
 * component and belongs in `src/features/<name>/ui` instead — that boundary is
 * what keeps the primitives reusable and keeps domain logic out of the view
 * layer.
 *
 * Components whose data contract does not exist yet are deliberately absent
 * rather than stubbed with fake data. See PLAN.md for the phase each one lands
 * in: FAB (P6), ActivityCard (P7), NotificationRow (P8), CompanionCard and the
 * 3D views (P5), AchievementBadge and StateTimelineItem (P9).
 */
export { Button, PrimaryButton, SecondaryButton, TertiaryButton } from './button'
export { ConditionBadge } from './condition-badge'
export { ChipRow, ExplorerLink, SeekerIdentityChip, shortenAddress, WalletChip } from './identity'
export { LevelBadge, ProgressBar, StatRow, StatTile } from './stat'
export { Card, EmptyState, ErrorState, LoadingState, OfflineBanner, Screen, TopBar } from './state'
export { Text, typeScale } from './text'
