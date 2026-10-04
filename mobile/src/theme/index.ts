/**
 * Barrel for the design system.
 *
 * Import from this folder's index rather than reaching into individual files,
 * so token locations can change without touching call sites. Relative imports
 * are used throughout — no path alias is configured.
 */
export { colors, duration, elevation, glow, layout, radius, space, TOUCH_TARGET } from './tokens'
