import { useEffect, useMemo, useRef, useState } from 'react'

import { GochiScene } from './scene/GochiScene'
import { createScrollState, attachScroll } from './lib/scroll'
import { detectTier, prefersReducedMotion, qualityFor } from './lib/quality'

/**
 * App shell.
 *
 * Owns three pieces of state that must live above the 3D:
 *
 *  1. `scroll` — a mutable object, not React state. The scene reads it inside
 *     useFrame, so scrolling never triggers a React render. That is the whole
 *     reason this is a ref-like object rather than useState.
 *  2. `quality` — measured once. Re-measuring mid-scroll costs frames for no gain.
 *  3. `demoBoost` — raised by the interactive demo and decayed inside the frame
 *     loop, so the decay costs no renders either.
 *
 * The scroll readout in the header is the one deliberate React render on scroll,
 * and it only happens when a whole percent changes.
 */
export function App() {
  const scroll = useMemo(() => createScrollState(), [])
  const demoBoost = useRef(0)

  const quality = useMemo(() => qualityFor(detectTier()), [])
  const reducedMotion = useMemo(() => prefersReducedMotion(), [])

  // A coarse label for the header. Changes only when the integer changes, so a
  // full scroll produces at most a hundred renders rather than thousands.
  const [progressPct, setProgressPct] = useState(0)

  useEffect(() => attachScroll(scroll), [scroll])

  useEffect(() => {
    let raf = 0
    let last = -1
    const tick = () => {
      const next = Math.round(scroll.progress * 100)
      if (next !== last) {
        last = next
        setProgressPct(next)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [scroll])

  return (
    <>
      {/*
        The stage. Fixed, behind everything, and pointer-events none so it can
        never intercept a click meant for the copy layered over it.
      */}
      <div className="stage" aria-hidden="true">
        <GochiScene
          scroll={scroll}
          quality={quality}
          demoBoostRef={demoBoost}
          reducedMotion={reducedMotion}
        />
      </div>

      <div className="page">
        <header
          className="shell"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            paddingTop: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1.5rem',
          }}
        >
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>Gochi</span>
          <nav style={{ display: 'flex', gap: '1.25rem', marginLeft: 'auto', fontSize: '0.9375rem' }}>
            <a href="#how">How it works</a>
            <a href="#demo">Demo</a>
            <a href="#faq">FAQ</a>
          </nav>
          <a className="control" href="#download" data-variant="primary">
            Download the app
          </a>
        </header>

        <main>
          <section
            className="shell"
            style={{
              minHeight: '100svh',
              display: 'grid',
              alignContent: 'center',
              // Copy sits low-left so the creature owns the centre of the frame.
              paddingBottom: '12vh',
            }}
          >
            <p className="scene-label">A companion on Solana Mobile</p>
            <h1
              style={{
                fontSize: 'clamp(2.5rem, 6.5vw, 5rem)',
                marginTop: '1rem',
                maxWidth: '18ch',
              }}
            >
              A companion that reacts to your moves on Solana.
            </h1>
            <p
              style={{
                color: 'var(--fog-400)',
                maxWidth: '44ch',
                marginTop: '1.5rem',
                fontSize: '1.0625rem',
              }}
            >
              It reads what your wallet actually does, and changes because of it.
            </p>
          </section>

          {Array.from({ length: 8 }, (_, i) => (
            <section
              key={i}
              className="shell"
              style={{
                minHeight: '100svh',
                display: 'grid',
                alignContent: 'center',
                borderTop: '1px solid var(--hairline)',
              }}
            >
              <p className="scene-label">Scene {String(i + 1).padStart(2, '0')}</p>
              <h2 style={{ fontSize: 'clamp(1.75rem, 4vw, 3rem)', marginTop: '0.75rem', maxWidth: '20ch' }}>
                {[
                  'Something is here',
                  'It opens its eyes',
                  'It notices you',
                  'The chain moves',
                  'It grows',
                  'While you were away',
                  "It's yours",
                  'Take it with you',
                ][i]}
              </h2>
            </section>
          ))}
        </main>

        {/* Debug strip. Removed once the real sections land. */}
        <div
          style={{
            position: 'fixed',
            bottom: '1rem',
            left: '1rem',
            zIndex: 20,
            fontFamily: 'var(--font-mono)',
            fontSize: '0.6875rem',
            color: 'var(--fog-600)',
          }}
        >
          {quality.tier} · scroll {progressPct}%
        </div>
      </div>
    </>
  )
}