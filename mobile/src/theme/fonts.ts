/**
 * Gochi typeface loading.
 *
 * Three faces, three jobs (see design/DESIGN.md section 3):
 *
 *   Space Grotesk   display — headings, wordmark, the companion's name
 *   Manrope         body    — all UI and body copy
 *   JetBrains Mono  numeric — stats, levels, wallet addresses, signatures
 *
 * All three are SIL Open Font License and the `.ttf` files ship inside these
 * packages, so there is no runtime network fetch and no asset licensing to
 * record under spec section 50.
 *
 * WHY FAMILIES ARE NAMED PER WEIGHT
 * ---------------------------------
 * `expo-font` registers a font under the *key* it is given, and React Native
 * resolves a typeface by that exact family string — unlike CSS, it does not pick
 * the closest registered weight from a family. Registering one family with two
 * weights would leave `font-semibold` silently falling back to the system font.
 *
 * So each weight gets its own family name ("Manrope-SemiBold", not "Manrope") and
 * the Tailwind tokens in global.css map to those exact strings. Weight is carried
 * by the family, never by `font-weight`.
 *
 * Only the weights the design actually uses are registered — six faces, not
 * thirty. The design budget is a maximum of two weights per context.
 */
import { useFonts } from 'expo-font'
import { JetBrainsMono_500Medium, JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono'
import { Manrope_400Regular, Manrope_600SemiBold } from '@expo-google-fonts/manrope'
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk'

/**
 * The family names, in one place.
 *
 * Components and the stylesheet both need these exact strings. Keeping them here
 * means a family rename cannot half-apply.
 */
export const fontFamily = {
  display: 'SpaceGrotesk-Bold',
  displayMedium: 'SpaceGrotesk-Medium',
  body: 'Manrope-Regular',
  bodyStrong: 'Manrope-SemiBold',
  numeric: 'JetBrainsMono-Medium',
  numericBold: 'JetBrainsMono-Bold',
} as const

/**
 * Load the six faces.
 *
 * Callers must gate their first render on this resolving. Rendering before the
 * fonts load produces one frame of system-font text, which then snaps to the real
 * typeface — a visible flash. See `src/app/_layout.tsx`, which holds the splash
 * until fonts are ready.
 */
export function useGochiFonts() {
  const [loaded, error] = useFonts({
    [fontFamily.display]: SpaceGrotesk_700Bold,
    [fontFamily.displayMedium]: SpaceGrotesk_500Medium,
    [fontFamily.body]: Manrope_400Regular,
    [fontFamily.bodyStrong]: Manrope_600SemiBold,
    [fontFamily.numeric]: JetBrainsMono_500Medium,
    [fontFamily.numericBold]: JetBrainsMono_700Bold,
  })

  // A font that fails to load is a degraded-typography problem, not a crash: the
  // app is still fully usable on system fonts. Surfacing `loaded` alone would
  // hang the splash screen forever.
  return { fontsLoaded: loaded, fontError: error }
}
