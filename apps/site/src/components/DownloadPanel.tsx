import { useEffect, useRef, useState } from 'react'

/**
 * The download interaction.
 *
 * The brief was specific that this must not be a generic modal and must not
 * redirect somewhere random, and that the unavailable stores must say so plainly
 * rather than pretending. Three decisions follow from that:
 *
 *  1. The panel is anchored to the button and grows out of it, so it reads as
 *     that button revealing more rather than a dialog appearing.
 *  2. "Coming soon" is rendered as a genuinely disabled row, not a greyed button
 *     that looks clickable. Faking availability is worse than admitting absence.
 *  3. The APK row is the only real affordance, and it says what it downloads and
 *     how big it is, because 105MB is a thing a person should be told before
 *     they commit to the download.
 *
 * Escape and outside-click both close it, and focus moves into the panel on open
 * so it is reachable without a mouse.
 */

const APK_SIZE = '105 MB'

export function DownloadPanel({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('keydown', onKey)
    // Deferred so the click that opened the panel does not immediately close it.
    const id = window.setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown)
    }, 0)

    panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointerDown)
      window.clearTimeout(id)
    }
  }, [open])

  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      <button
        ref={trigger}
        type="button"
        className="control"
        data-variant="primary"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        style={compact ? { padding: '0.55rem 0.95rem', fontSize: '0.875rem' } : undefined}
      >
        Download the app
        <span aria-hidden="true" style={{ fontSize: '0.8em', opacity: 0.7 }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {/*
        No CSS transition on mount: the panel is mounted conditionally, so a
        transition class would animate from a stale computed style and flash.
        The reveal is the origin transform below plus the 240ms enter duration,
        which is the app's own timing token.
      */}
      {open ? (
        <div
          ref={panel}
          role="dialog"
          aria-label="Download Gochi"
          className="surface-float"
          style={{
            position: 'absolute',
            top: 'calc(100% + 0.6rem)',
            right: 0,
            width: 'min(19rem, calc(100vw - 2 * var(--gutter)))',
            padding: '0.5rem',
            zIndex: 30,
            // Grows out of the button it belongs to.
            transformOrigin: 'top right',
            animation: 'panel-in var(--t-enter) var(--ease)',
          }}
        >
          <a
            data-autofocus
            href="/gochi.apk"
            download="gochi.apk"
            className="control"
            data-variant="primary"
            style={{ width: '100%', justifyContent: 'space-between' }}
          >
            <span>Download APK</span>
            <span style={{ opacity: 0.72, fontWeight: 400 }}>{APK_SIZE}</span>
          </a>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              padding: '0.8rem 0.75rem',
              marginTop: '0.35rem',
              borderRadius: 'var(--r-control)',
              // Present, not hidden. A missing row reads as an oversight; a
              // disabled row reads as a decision.
              border: '1px solid var(--hairline)',
              opacity: 0.66,
            }}
          >
            <span style={{ fontSize: '0.9375rem' }}>Solana dApp Store</span>
            <span className="scene-label">Coming soon</span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              padding: '0.8rem 0.75rem',
              marginTop: '0.35rem',
              borderRadius: 'var(--r-control)',
              border: '1px solid var(--hairline)',
              opacity: 0.66,
            }}
          >
            <span style={{ fontSize: '0.9375rem' }}>App Store</span>
            <span className="scene-label">Coming soon</span>
          </div>

          <p
            style={{
              margin: '0.75rem 0.25rem 0.4rem',
              fontSize: '0.75rem',
              color: 'var(--fog-400)',
              lineHeight: 1.5,
            }}
          >
            Android, built on the Solana Mobile Wallet Adapter. iOS is not built yet.
          </p>
        </div>
      ) : null}
    </div>
  )
}