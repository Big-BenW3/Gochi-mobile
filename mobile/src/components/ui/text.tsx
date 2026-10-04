import { Text as RNText } from 'react-native'
import type { TextProps as RNTextProps } from 'react-native'

import { fontFamily } from '../../theme/fonts'
import { colors } from '../../theme/tokens'

/**
 * The app's text primitive, and the single enforcement point for typography.
 *
 * WHY THIS EXISTS
 * ---------------
 * React Native resolves a typeface by exact family string. It does *not* pick the
 * closest registered weight from a family the way CSS does, which means a
 * `font-semibold` class on a `Manrope-Regular` body would silently render in a
 * system font instead of failing loudly.
 *
 * Expressing weight through this component's `variant` instead of a utility class
 * means the weight and the family can never disagree, and the size budget in
 * design/DESIGN.md section 3.2 (four sizes) is visible in one table rather than
 * scattered across every screen.
 *
 * Four sizes only:
 *   display  26   screen titles, companion name
 *   title    17   section and card headings
 *   body     14-15  all body and UI copy
 *   caption  11-12  labels, badges, timestamps
 *
 * Variants also set a default colour, so text is never accidentally unstyled.
 */

type Variant =
  /** Screen titles, the companion's name. */
  | 'display'
  /** Section and card headings. */
  | 'title'
  /** Body copy. */
  | 'body'
  /** Body copy that must win against neighbouring body copy. */
  | 'bodyStrong'
  /** Labels, badges, timestamps, secondary metadata. */
  | 'caption'
  /** Caption weight, for a label that must stay legible on a dark surface. */
  | 'captionStrong'
  /** A stat value. Mono so digits align across a row of tiles. */
  | 'numeric'
  /** A stat value that must dominate its tile. */
  | 'numericStrong'
  /** A wallet address or signature. Mono because these must be unambiguous. */
  | 'mono'

type VariantStyle = {
  fontFamily: string
  fontSize: number
  lineHeight: number
  letterSpacing?: number
  color: string
}

/**
 * The type scale, as data.
 *
 * `lineHeight` is set explicitly on every variant. Leaving it to the platform
 * default looks fine at one size and cramped at another, and it breaks outright
 * when the OS font scale is raised — which spec section 20 requires us to respect.
 */
const variants: Record<Variant, VariantStyle> = {
  display: {
    fontFamily: fontFamily.display,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
    color: colors.fog50,
  },
  title: {
    fontFamily: fontFamily.bodyStrong,
    fontSize: 17,
    lineHeight: 24,
    color: colors.fog50,
  },
  body: {
    fontFamily: fontFamily.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.fog200,
  },
  bodyStrong: {
    fontFamily: fontFamily.bodyStrong,
    fontSize: 15,
    lineHeight: 22,
    color: colors.fog50,
  },
  caption: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    lineHeight: 16,
    color: colors.fog400,
  },
  captionStrong: {
    fontFamily: fontFamily.bodyStrong,
    fontSize: 12,
    lineHeight: 16,
    color: colors.fog200,
  },
  numeric: {
    fontFamily: fontFamily.numeric,
    fontSize: 18,
    lineHeight: 24,
    color: colors.fog50,
  },
  numericStrong: {
    fontFamily: fontFamily.numericBold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.fog50,
  },
  mono: {
    fontFamily: fontFamily.numeric,
    fontSize: 12,
    lineHeight: 16,
    color: colors.fog200,
  },
}

/** The type scale, for callers that need the numbers (e.g. a chart axis). */
export const typeScale = variants

export function Text({ variant = 'body', style, ...rest }: { variant?: Variant } & RNTextProps) {
  const v = variants[variant]

  return (
    <RNText
      // Colour is the variant default so a text node is never colourless; an
      // explicit style still wins, because `style` is applied after.
      style={[{ color: v.color }, v, style]}
      {...rest}
    />
  )
}
