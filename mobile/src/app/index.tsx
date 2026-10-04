import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import {
  Card,
  ChipRow,
  ConditionBadge,
  EmptyState,
  ErrorState,
  ExplorerLink,
  LoadingState,
  LevelBadge,
  OfflineBanner,
  PrimaryButton,
  ProgressBar,
  Screen,
  SecondaryButton,
  SeekerIdentityChip,
  StatRow,
  StatTile,
  TertiaryButton,
  Text,
  WalletChip,
} from '../components/ui'
import { allConditions } from '../domain/companion/conditions'
import { colors, space } from '../theme/tokens'

/**
 * TEMPORARY — P0 placeholder screen.
 *
 * This is not a Gochi product screen. It is a visual harness for the design
 * system, which is the only way to check the palette, the type scale and the
 * components actually look right before an Android build exists.
 *
 * It is replaced by Companion Home in P5 (the 3D view) and P6 (the FAB
 * navigation). Do not build on it.
 *
 * Every spec section 52 primitive is exercised here on purpose: a component that
 * is never rendered is a component nobody has looked at.
 */
export default function DesignSystemPreview() {
  return (
    <SafeAreaView className="flex-1 bg-ink-900" edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ gap: space.lg, padding: space.gutter }}>
        <Screen gap="lg">
          <View className="gap-1">
            <Text variant="display">Gochi</Text>
            <Text variant="body">Design system harness — P0 placeholder, not a product screen.</Text>
          </View>

          <Card title="Identity">
            <ChipRow>
              <WalletChip address="DztJxBybR7fKa9UyR8fBZMohaZYcLydyxrJr5CuJBa34" />
              <LevelBadge level={12} />
            </ChipRow>
            <ChipRow>
              <SeekerIdentityChip isVerified name="gochi.skr" />
              <SeekerIdentityChip name={null} />
            </ChipRow>
          </Card>

          <Card title="Stats">
            <StatRow>
              <StatTile label="Energy" progress={0.72} tint={colors.primary} value="72/100" />
              <StatTile isHighlighted label="Shield" progress={0.88} tint={colors.signal} value="88/100" />
              <StatTile label="Aura" progress={0.42} tint={colors.reward} value="42" />
            </StatRow>
          </Card>

          <Card title="Conditions">
            <View style={{ gap: space.sm }}>
              <ChipRow>
                <ConditionBadge condition="ENERGIZED" />
                <ConditionBadge condition="DAMAGED" />
              </ChipRow>
              <ChipRow>
                {allConditions.map((c) => (
                  <ConditionBadge key={c.id} condition={c.id} size="sm" />
                ))}
              </ChipRow>
            </View>
          </Card>

          <Card title="Meters">
            <View style={{ gap: space.md }}>
              <ProgressBar accessibilityLabel="Energy 72 of 100" glows tint={colors.primary} value={72} />
              <ProgressBar accessibilityLabel="Aura 42 of 100" tint={colors.reward} value={42} />
              <ProgressBar tint={colors.recover} value={100} />
              <ProgressBar tint={colors.ink700} value={0} />
            </View>
          </Card>

          <Card title="Buttons">
            <View style={{ gap: space.sm }}>
              <PrimaryButton label="Continue with Seeker" onPress={() => {}} />
              <SecondaryButton label="Continue with Google" onPress={() => {}} />
              <TertiaryButton fullWidth={false} label="Skip for now" onPress={() => {}} />
              <PrimaryButton isBusy label="Connecting" onPress={() => {}} />
              <PrimaryButton isDisabled label="Disabled" onPress={() => {}} />
            </View>
          </Card>

          <Card title="States">
            <View style={{ gap: space.sm }}>
              <OfflineBanner />
              <ErrorState message="We could not verify your Seeker identity right now." onRetry={() => {}} />
              <EmptyState
                action={<SecondaryButton fullWidth={false} label="Connect wallet" onPress={() => {}} />}
                message="Connect a wallet and your companion will start reacting to your activity."
                title="No companion yet"
              />
              <LoadingState label="Syncing activity" />
            </View>
          </Card>

          <Card title="Links">
            <ExplorerLink label="View on Solana Explorer" url="https://explorer.solana.com" />
          </Card>
        </Screen>
      </ScrollView>
    </SafeAreaView>
  )
}
