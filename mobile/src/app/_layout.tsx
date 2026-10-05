/**
 * Root layout.
 *
 * Two jobs: hold the providers, and refuse to render before fonts are ready.
 *
 * The font gate matters more than it looks. Each weight registers as its own
 * family because React Native matches a typeface by exact family string and will
 * not fall back to the nearest weight the way CSS does. Rendering before they
 * load produces one frame of the system font, which is a visible flash on the
 * first screen and the companion's name — the one place the display face
 * matters most.
 */

import '../global.css'

import { Slot } from 'expo-router'
import { View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { LoadingState } from '../components/ui'
import { AppProviders } from '../features/core/data-access/app-providers'
import { useGochiFonts } from '../theme/fonts'

export default function RootLayout() {
  const fontsLoaded = useGochiFonts()

  // Render nothing rather than a fallback face: the alternative is a wrong
  // typeface for a frame, which on the companion's name reads as a rendering bug.
  if (!fontsLoaded) {
    return (
      <View className="flex-1 bg-ink-900 items-center justify-center">
        <LoadingState label="" />
      </View>
    )
  }

  return (
    <AppProviders>
      <SafeAreaProvider>
        <View className="flex-1 bg-ink-900">
          <Slot />
        </View>
      </SafeAreaProvider>
    </AppProviders>
  )
}
