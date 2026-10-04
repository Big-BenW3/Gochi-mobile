/**
 * Gochi design tokens — programmatic half.
 *
 * `src/global.css` owns colour for Tailwind utilities (`bg-ink-900`). This file
 * owns everything CSS cannot express well in a React Native codebase:
 *
 *   - shadows, which need platform-specific shadow/elevation pairs
 *   - motion durations, so animation feels consistent everywhere
 *   - the condition -> colour map, which is *data* the UI reads, not a class
 *
 * Rule: if a value can be a Tailwind class, it belongs in global.css. If it is
 * read by JS, it belongs here.
 */

/* ==========================================================================
   COLOUR — mirrored from global.css
   ========================================================================== */

/**
 * Needed in JS for things a className cannot reach: shadow tints, gradient
 * stop arrays, and the WebView background behind the 3D companion.
 */
export const colors = {
  ink950: '#05060D',
  ink900: '#0A0C16',
  ink850: '#111426',
  ink800: '#1A1E33',
  ink700: '#262B44',
  ink600: '#343B58',

  fog50: '#EDEFF9',
  fog200: '#A8B0CC',
  fog400: '#666E8F',
  fog600: '#343B58',

  primary: '#7A6BFF',
  primaryLit: '#A99BFF',
  signal: '#31D6FF',

  damage: '#FF5B6E',
  recover: '#3DDC97',
  evolve: '#FF6EDB',
  reward: '#FFC24B',

  hairline: 'rgba(237, 239, 249, 0.08)',
  hairlineStrong: 'rgba(237, 239, 249, 0.16)',
} as const

/* ==========================================================================
   SPACING — 8-point grid
   ========================================================================== */

/**
 * The skill rule is that spacing must be divisible by 4 or 8. `space` is the
 * sanctioned scale; `space.gutter` is the screen edge inset used on every
 * page so content lines up between screens.
 *
 * Related elements sit closer together than unrelated ones — when two items
 * belong to the same group, use one step smaller than the gap to the next
 * group.
 */
export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
  gutter: 20,
} as const

/**
 * Minimum touch target. The platform accessibility guidance is 44dp; anything
 * interactive must hit this even when it *looks* smaller.
 */
export const TOUCH_TARGET = 44

/* ==========================================================================
   RADIUS — see the --radius-* tokens in global.css for the Tailwind side
   ========================================================================== */

export const radius = {
  card: 20,
  control: 16,
  chip: 12,
  pill: 999,
} as const

/* ==========================================================================
   ELEVATION
   ========================================================================== */

/**
 * Shadows are *tinted*, never pure gray or black. A neutral shadow on a
 * violet-black canvas reads as dirt; a violet shadow reads as depth.
 *
 * Each level is expressed as a ViewStyle with both the iOS `shadow*` props and
 * the Android `elevation` prop, because React Native ignores `shadow*` on
 * Android and `elevation` on iOS.
 *
 * Levels are deliberately few and soft. Hard, distinct shadows are a fast way
 * to make a dark interface look cheap.
 */
export const elevation = {
  /** Resting cards and list rows. Barely there. */
  card: {
    shadowColor: '#7A6BFF',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  /** Sheets and anything that lifts off the page. */
  sheet: {
    shadowColor: '#7A6BFF',
    shadowOpacity: 0.28,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  /** The FAB, and modals. One level above everything. */
  float: {
    shadowColor: '#7A6BFF',
    shadowOpacity: 0.42,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
  },
} as const

/**
 * The aura glow. Applied to the companion and to the energy/aura meters so the
 * live parts of the screen are the brightest things on it.
 */
export const glow = (hex: string, opacity = 0.35) => ({
  shadowColor: hex,
  shadowOpacity: opacity,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 0 },
  elevation: 8,
})

/* ==========================================================================
   MOTION
   ========================================================================== */

/**
 * One duration set for the whole app. Animation that is fast somewhere and
 * slow elsewhere feels unfinished.
 *
 * `enter` is for a view arriving, `exit` slightly shorter so leaving never feels
 * like waiting, `press` near-instant because it is a direct response to touch,
 * and `celebrate` is reserved for level-ups and evolution — the peak moments.
 */
export const duration = {
  press: 90,
  quick: 160,
  enter: 240,
  exit: 180,
  celebrate: 700,
} as const

/* ==========================================================================
   LAYOUT
   ========================================================================== */

/**
 * Portrait-first and single-column (spec section 20). Baseline width is the
 * smallest phone worth designing for; larger screens centre the column rather
 * than stretching it, because a 3D companion stretched to 600dp wide looks
 * broken rather than immersive.
 */
export const layout = {
  baselineWidth: 375,
  maxContentWidth: 480,
} as const
