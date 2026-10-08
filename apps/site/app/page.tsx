/*
 * Scaffold placeholder.
 *
 * Real content comes in the next pass. This exists so the app builds and boots
 * before any of it — proving the toolchain works is worth more than a hero
 * section that might not compile.
 */

export default function Page() {
  return (
    <section
      style={{
        minHeight: '100svh',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--gutter)',
      }}
    >
      <div style={{ maxWidth: 'var(--measure)', textAlign: 'center' }}>
        <h1 style={{ fontSize: 'clamp(2.25rem, 6vw, 4rem)' }}>
          Gochi
          <span style={{ color: 'var(--primary-lit)' }}>.</span>
        </h1>
        <p
          style={{
            color: 'var(--fog-400)',
            marginTop: '1rem',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8125rem',
          }}
        >
          scaffold is live — hero, 3D stage and sections land next
        </p>
      </div>
    </section>
  )
}