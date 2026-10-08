/**
 * Scroll progress, as a value rather than a DOM effect.
 *
 * The 3D scene must not re-render React on every scroll event: a scroll-linked
 * page re-rendering at event rate is the most reliable way to produce jank.
 *
 * So progress is written into a mutable ref, read inside useFrame, and only
 * surfaced to React at scene boundaries where a label actually changes. rAF is
 * the sole reader, so one frame can never read a half-written value.
 */

export interface ScrollState {
  /** Normalised document scroll, 0 at the top, 1 at the bottom. */
  progress: number
  /** Pointer position in NDC, already damped by the consumer. */
  pointer: { x: number; y: number }
  /** True once the user has scrolled past the hero. */
  engaged: boolean
}

export function createScrollState(): ScrollState {
  return { progress: 0, pointer: { x: 0, y: 0 }, engaged: false }
}

/**
 * Attach scroll and pointer listeners.
 *
 * Passive listeners, because scroll handlers run on the compositor thread and
 * calling preventDefault inside them is both impossible and a jank source.
 *
 * Returns a teardown that must be called, or a resize leaves a listener holding a
 * stale element.
 */
export function attachScroll(state: ScrollState): () => void {
  let ticking = false

  const measure = () => {
    const doc = document.documentElement
    const max = doc.scrollHeight - window.innerHeight
    state.progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
    state.engaged = state.progress > 0.02
    ticking = false
  }

  const onScroll = () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(measure)
  }

  const onPointer = (event: PointerEvent) => {
    state.pointer.x = (event.clientX / window.innerWidth) * 2 - 1
    state.pointer.y = (event.clientY / window.innerHeight) * 2 - 1
  }

  // Touch devices have no hover, so a pointer that never moves would leave the
  // creature looking at the last known place forever. Re-centring on scroll end
  // is the honest fallback: it looks at the user again rather than off-screen.
  const onLeave = () => {
    state.pointer.x = 0
    state.pointer.y = 0
  }

  measure()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll, { passive: true })
  window.addEventListener('pointermove', onPointer, { passive: true })
  window.addEventListener('pointerleave', onLeave, { passive: true })
  document.addEventListener('visibilitychange', onLeave)

  return () => {
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
    window.removeEventListener('pointermove', onPointer)
    window.removeEventListener('pointerleave', onLeave)
    document.removeEventListener('visibilitychange', onLeave)
  }
}

/**
 * Remap a value from one range to another, clamped.
 *
 * Used everywhere a scene boundary needs to become a local 0..1 so a section
 * animates across its own span rather than across the whole page.
 */
export function range(value: number, from: number, to: number): number {
  if (to === from) return 0
  const t = (value - from) / (to - from)
  return Math.min(1, Math.max(0, t))
}

/** Ease used for every transition. Slow in, slow out, never linear. */
export function easeInOut(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

/** Smoothstep, for values that should feel continuous rather than eased. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}