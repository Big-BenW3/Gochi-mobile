/**
 * Quality tiers, and the one honest reason they exist.
 *
 * A 3D landing page has to survive a mid-range laptop and a phone, and the
 * honest way to do that is to reduce work rather than reduce the experience.
 * The bunny, the story and the download CTA are never dropped. What changes is
 * shadow resolution, bloom, particle count and pixel ratio.
 *
 * Measured once on load rather than guessed per frame, so a slow device does not
 * spend its first seconds re-measuring.
 */

export type Tier = 'low' | 'medium' | 'high'

export interface Quality {
  tier: Tier
  /** Device pixel ratio ceiling. The single biggest lever on fill cost. */
  dprCap: number
  /** Shadow map edge length. One shadow-casting light only, so this is cheap. */
  shadowMapSize: number
  /** Post-processing. Bloom is the expensive one; off entirely on low. */
  bloom: boolean
  bloomIntensity: number
  /** Decorative particles in the environment. */
  particles: number
  /** Soft-shadow filtering. PCF soft is the floor, VSM only on high. */
  softShadows: boolean
}

const TIERS: Record<Tier, Omit<Quality, 'tier'>> = {
  low: {
    dprCap: 1,
    shadowMapSize: 512,
    bloom: false,
    bloomIntensity: 0,
    particles: 90,
    softShadows: false,
  },
  medium: {
    dprCap: 1.5,
    shadowMapSize: 1024,
    bloom: true,
    bloomIntensity: 0.42,
    particles: 220,
    softShadows: true,
  },
  high: {
    dprCap: 1.9,
    shadowMapSize: 2048,
    bloom: true,
    bloomIntensity: 0.58,
    particles: 420,
    softShadows: true,
  },
}

export function detectTier(): Tier {
  if (typeof window === 'undefined') return 'medium'

  const mobile = window.matchMedia('(pointer: coarse)').matches
  const cores = navigator.hardwareConcurrency ?? 4
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4

  // Coarse pointer means a touchscreen, which in practice means a thermal
  // budget that will not forgive 2048 shadows and a 1.9 dpr.
  if (mobile || cores <= 4 || memory <= 4) return cores <= 4 && memory <= 2 ? 'low' : 'medium'

  return cores >= 8 && memory >= 8 ? 'high' : 'medium'
}

export function qualityFor(tier: Tier): Quality {
  return { tier, ...TIERS[tier] }
}

/** True when the OS asks for reduced motion. Honoured as a first-class state. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
