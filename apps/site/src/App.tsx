import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { GochiScene } from './scene/GochiScene'
import { DownloadPanel } from './components/DownloadPanel'
import { InteractiveDemo } from './components/InteractiveDemo'
import {
  Faq,
  FinalCta,
  FunSection,
  Problem,
  SolanaSection,
  Solution,
} from './components/Sections'
import { attachScroll, createScrollState } from './lib/scroll'
import { detectTier, prefersReducedMotion, qualityFor } from './lib/quality'

/** The eight beats. Camera keyframes in GochiScene are cut to the same spans. */
const BEATS = [
  'Something is here',
  'It opens its eyes',
  'It notices you',
  'The chain moves',
  'It grows',
  'While you were away',
  "It's yours",
  'Take it with you',
] as const

export function App() {
  const scroll = useMemo(() => createScrollState(), [])
  const demoBoost = useRef(0)

  const quality = useMemo(() => qualityFor(detectTier()), [])
  const reducedMotion = useMemo(() => prefersReducedMotion(), [])

  const [progressPct, setProgressPct] = useState(0)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => attachScroll(scroll), [scroll])

  // The only deliberate React work on scroll. Two renders' worth of state, both
  // quantised so a full page produces tens of renders rather than thousands.
  useEffect(() => {
    let raf = 0
    let lastPct = -1
    let lastScrolled = false
    const tick = () => {
      const pct = Math.round(scroll.progress * 100)
      const past = scroll.progress > 0.01
      if (pct !== lastPct) {
        lastPct = pct
        setProgressPct(pct)
      }
      if (past !== lastScrolled) {
        lastScrolled = past
        setScrolled(past)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [scroll])

  const boost = useCallback(() => {
    demoBoost.current = 1
  }, [])

  return (
    <>
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
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 20,
            paddingTop: 'max(1.25rem, env(safe-area-inset-top))',
            paddingBottom: '0.75rem',
            paddingInline: 'max(var(--gutter), env(safe-area-inset-left))',
            display: 'flex',
            alignItems: 'center',
            gap: '1.5rem',
            // Solid only once the hero is behind you. A bar that is always
            // present is a floating element competing with the character, which
            // is the thing the header is supposed to stay out of the way of.
            background: scrolled ? 'color-mix(in srgb, var(--ink-950) 86%, transparent)' : 'transparent',
            backdropFilter: scrolled ? 'blur(10px)' : undefined,
            WebkitBackdropFilter: scrolled ? 'blur(10px)' : undefined,
            transition: 'background var(--t-enter) var(--ease)',
            borderBottom: scrolled ? '1px solid var(--hairline)' : '1px solid transparent',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: '1.0625rem',
              letterSpacing: '-0.01em',
            }}
          >
            Gochi
          </span>

          <nav
            style={{
              display: 'flex',
              gap: '1.35rem',
              marginLeft: 'auto',
              fontSize: '0.9375rem',
              color: 'var(--fog-200)',
            }}
          >
            <a href="#how">How it works</a>
            <a href="#demo">Demo</a>
            <a href="#faq">FAQ</a>
          </nav>

          <DownloadPanel compact />
        </header>

        <main>
          {/* Hero. Copy low-left so the creature owns the centre of the frame,
              and no button stacked under a headline in the middle of it. */}
          <section
            className="shell"
            style={{
              minHeight: '100svh',
              display: 'grid',
              alignContent: 'end',
              paddingBottom: '14vh',
            }}
          >
            <p className="scene-label">A companion on Solana Mobile</p>
            <h1
              style={{
                fontSize: 'clamp(2.4rem, 6vw, 4.6rem)',
                marginTop: '1rem',
                maxWidth: '19ch',
              }}
            >
              A companion that reacts to your moves on Solana.
            </h1>
            <p
              style={{
                color: 'var(--fog-400)',
                maxWidth: '40ch',
                marginTop: '1.35rem',
                fontSize: '1.0625rem',
              }}
            >
              It reads what your wallet actually does, and changes because of it.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '2rem', flexWrap: 'wrap' }}>
              <DownloadPanel />
              <a href="#demo" className="control" style={{ alignSelf: 'stretch' }}>
                Try the demo
              </a>
            </div>
          </section>

          {/* Beats. Each is a full viewport so the camera has room to move. */}
          {BEATS.map((beat, i) => (
            <section
              key={beat}
              id={i === 2 ? 'how' : undefined}
              className="shell"
              style={{
                minHeight: '100svh',
                display: 'grid',
                alignContent: 'center',
                borderTop: '1px solid var(--hairline)',
              }}
            >
              <p className="scene-label">
                {String(i + 1).padStart(2, '0')} · {['Something is here', 'It wakes', 'It notices', 'Activity', 'It grows', 'Time passes', 'Yours', 'Take it with you'][i]}
              </p>
              <h2
                style={{
                  fontSize: 'clamp(1.9rem, 4.5vw, 3.2rem)',
                  marginTop: '0.8rem',
                  maxWidth: '20ch',
                }}
              >
                {beat}
              </h2>
            </section>
          ))}

          <Problem />
          <Solution />
          <InteractiveDemo onBoost={boost} />
          <FunSection />
          <SolanaSection />
          <Faq />

          <FinalCta>
            <DownloadPanel />
            <p style={{ color: 'var(--fog-600)', fontSize: '0.8125rem' }}>
              Solana dApp Store: coming soon · App Store: coming soon
            </p>
          </FinalCta>
        </main>

        <footer
          className="shell"
          style={{
            paddingBlock: '2.5rem',
            borderTop: '1px solid var(--hairline)',
            display: 'flex',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
            color: 'var(--fog-600)',
            fontSize: '0.8125rem',
          }}
        >
          <span>Gochi — a companion on Solana Mobile</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>built with three.js</span>
        </footer>
      </div>

      {/* Debug strip, removed before the final pass. */}
      <div
        style={{
          position: 'fixed',
          bottom: '1rem',
          left: '1rem',
          zIndex: 20,
          fontFamily: 'var(--font-mono)',
          fontSize: '0.6875rem',
          color: 'var(--fog-600)',
          pointerEvents: 'none',
        }}
      >
        {quality.tier} · {progressPct}%
      </div>
    </>
  )
}