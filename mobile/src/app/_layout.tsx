import '../global.css'

import { Slot } from 'expo-router'
import { View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { LoadingState } from '../components/ui'
import { AppProviders } from '../features/core/data-access/app-providers'
import { useGochiFonts } from '../theme/fonts'

/**
 * Root layout: providers, fonts, and the splash gate.
 *
 * FONTS MUST LOAD BEFORE ANYTHING RENDERS
 * ---------------------------------------
 * The six Gochi faces are registered at runtime by `expo-font`. If a screen
 * renders before that finishes, its text paints once in a system font and then
 * snaps to the real typeface — a visible flash on the first screen the user sees,
 * which is exactly the impression we cannot afford on a splash.
 *
 * So this layout holds a neutral loading view until fonts resolve.
 *
 * A font failure deliberately does NOT block the app. Typography degrades to the
 * system face, which is ugly but fully usable; hanging on the splash forever
 * because a font file failed to load would be a far worse failure. The error is
 * returned rather than swallowed so it can be logged (P0.12 wires the logger).
 */
export default function Layout() {
  const { fontsLoaded, fontError } = useGochiFonts()

  if (fontError) {
    console.warn('[fonts] falling back to system fonts:', fontError.message)
  }

  return (
    <AppProviders>
      <SafeAreaProvider>
        {fontsLoaded ? (
          <Slot />
        ) : (
          <View className="flex-1 items-center justify-center bg-ink-950">
            <LoadingState label="Gochi" />
          </View>
        )}
      </SafeAreaProvider>
    </AppProviders>
  )
}
