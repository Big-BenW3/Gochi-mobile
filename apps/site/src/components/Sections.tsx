import { useState } from 'react'

/**
 * Content sections.
 *
 * The copy here went through two rewrites and the second one is the one that
 * matters: the first version read like a spec, listing conditions and evolution
 * stages in tables. Tables of states are documentation. A landing page should let
 * someone feel the mechanic, so the stage and condition information is now either
 * shown through the demo above or kept to one quiet visual.
 *
 * What did not change: the honesty lines. Gochi does not hold assets, does not
 * score your wallet, and does not compute progression on your phone. Every one of
 * those is a thing the app actually does, and stating them is more convincing than
 * any claim of security would have been.
 */

export function Problem() {
  return (
    <section className="shell" style={{ paddingBlock: 'var(--section)' }}>
      <p className="scene-label">The problem</p>
      <h2 style={{ fontSize: 'clamp(2.1rem, 5vw, 3.6rem)', marginTop: '0.9rem', maxWidth: '16ch' }}>
        The chain moves.
        <br />
        But what moves with you?
      </h2>
      <p style={{ color: 'var(--fog-200)', marginTop: '1.75rem', maxWidth: 'var(--measure)', fontSize: '1.0625rem' }}>
        People swap. They stake. They send. Every one of those leaves a record.
      </p>
      <p style={{ color: 'var(--fog-400)', marginTop: '1rem', maxWidth: 'var(--measure)' }}>
        A record is not a relationship. A history tells you what you did. It never
        changes because of you.
      </p>
    </section>
  )
}

export function Solution() {
  const refusals = [
    'It never touches your keys.',
    'It never shows you a security score, because it cannot honestly produce one.',
    'It never computes progression on your phone. The server owns every number.',
  ]

  return (
    <section
      className="shell"
      style={{ paddingBlock: 'var(--section)', borderTop: '1px solid var(--hairline)' }}
    >
      <p className="scene-label">The solution</p>
      <h2 style={{ fontSize: 'clamp(2.1rem, 5vw, 3.6rem)', marginTop: '0.9rem', maxWidth: '18ch' }}>
        Meet your onchain companion.
      </h2>
      <p style={{ color: 'var(--fog-200)', marginTop: '1.75rem', maxWidth: 'var(--measure)', fontSize: '1.0625rem' }}>
        Gochi turns onchain activity into growth. It reads what your wallet already
        does, and turns it into XP, energy and evolution. Over time that becomes an
        asset in your own wallet, minted on Solana, held by you and locked in place.
      </p>

      <div style={{ display: 'grid', gap: '0.9rem', marginTop: '2.5rem', maxWidth: 'var(--measure)' }}>
        {refusals.map((line) => (
          <p key={line} style={{ display: 'flex', gap: '0.75rem', color: 'var(--fog-400)' }}>
            <span aria-hidden="true" style={{ color: 'var(--recover)' }}>
              &#10003;
            </span>
            {line}
          </p>
        ))}
      </div>
    </section>
  )
}

export function FunSection() {
  // The progression, as one quiet strip rather than a table. The numbers are real
  // (spec §26) but a table of thresholds stops being a story and starts being a
  // manual, so this is a horizon the eye can follow.
  const stages = [
    { stage: 1, at: 1 },
    { stage: 2, at: 10 },
    { stage: 3, at: 20 },
    { stage: 4, at: 35 },
    { stage: 5, at: 50 },
  ]

  return (
    <section
      className="shell"
      style={{ paddingBlock: 'var(--section)', borderTop: '1px solid var(--hairline)' }}
    >
      <p className="scene-label">The fun part</p>
      <h2 style={{ fontSize: 'clamp(2.1rem, 5vw, 3.6rem)', marginTop: '0.9rem', maxWidth: '14ch' }}>
        It does not just count. It changes.
      </h2>
      <p style={{ color: 'var(--fog-400)', marginTop: '1.75rem', maxWidth: 'var(--measure)' }}>
        Energy moves. Mood shifts. At level 10 it becomes something else. By level 50 you
        have met five versions of the same small creature.
      </p>

      <div style={{ marginTop: '3rem', maxWidth: '46rem' }}>
        <div style={{ position: 'relative', height: 2, background: 'var(--ink-700)' }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              width: '38%',
              background: 'linear-gradient(90deg, var(--primary), var(--primary-lit))',
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
          {stages.map((s) => (
            <div key={s.stage} style={{ display: 'grid', gap: '0.3rem' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--fog-200)' }}>
                Stage {s.stage}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6875rem', color: 'var(--fog-600)' }}>
                level {s.at}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function SolanaSection() {
  return (
    <section
      className="shell"
      style={{ paddingBlock: 'var(--section)', borderTop: '1px solid var(--hairline)' }}
    >
      <p className="scene-label">Why Solana</p>
      <h2 style={{ fontSize: 'clamp(2.1rem, 5vw, 3.6rem)', marginTop: '0.9rem', maxWidth: '18ch' }}>
        Built around what Solana already knows.
      </h2>
      <p style={{ color: 'var(--fog-200)', marginTop: '1.75rem', maxWidth: 'var(--measure)', fontSize: '1.0625rem' }}>
        No bridge. No new chain. No custody. Your wallet is the source of truth and it
        stays that way.
      </p>
      <p style={{ color: 'var(--fog-400)', marginTop: '1rem', maxWidth: 'var(--measure)' }}>
        Gochi reads the mainnet transaction history of a wallet you already own, signs
        nothing on your behalf, and holds nothing. The companion is a Metaplex Core
        asset in your wallet, frozen so it cannot be moved, and Gochi paid for creating
        it.
      </p>
    </section>
  )
}

interface QA {
  q: string
  a: string
}

const FAQ: QA[] = [
  {
    q: 'What is Gochi?',
    a: 'A persistent companion on Solana Mobile whose state comes from your real onchain activity. It is not a wallet, and it cannot move anything.',
  },
  {
    q: 'What does it react to?',
    a: 'Swaps and staking in your linked wallet history, read from Solana mainnet. A swap is detected by watching which of your tokens actually change hands on both sides of a trade, not by guessing from a program name.',
  },
  {
    q: 'Do I need crypto experience?',
    a: 'No. Connect a wallet, name your companion, and it reacts to what you already do. If you have never swapped on mainnet, it will not move, and it will say so instead of pretending.',
  },
  {
    q: 'Does it hold my assets?',
    a: 'No. Your wallet holds them. The only transaction Gochi ever sends is creating its own companion asset, and Gochi pays for that.',
  },
  {
    q: 'Game or wallet?',
    a: 'A companion. It cannot send, swap or transfer.',
  },
  {
    q: 'Where can I download it?',
    a: 'Android APK on this page. The Solana dApp Store and the App Store have not been submitted to yet.',
  },
  {
    q: 'Is it on iOS?',
    a: 'Not yet.',
  },
]

export function Faq() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section
      className="shell"
      style={{ paddingBlock: 'var(--section)', borderTop: '1px solid var(--hairline)' }}
      id="faq"
    >
      <p className="scene-label">Questions</p>
      <h2 style={{ fontSize: 'clamp(2.1rem, 5vw, 3.6rem)', marginTop: '0.9rem', maxWidth: '14ch' }}>
        Straight answers.
      </h2>

      <div style={{ marginTop: '2.5rem', maxWidth: 'var(--measure)', borderTop: '1px solid var(--hairline)' }}>
        {FAQ.map((item, i) => {
          const isOpen = open === i
          return (
            <div key={item.q} style={{ borderBottom: '1px solid var(--hairline)' }}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1.5rem',
                  width: '100%',
                  padding: '1.35rem 0',
                  textAlign: 'left',
                  fontSize: '1.0625rem',
                  fontWeight: 500,
                }}
              >
                {item.q}
                <span
                  aria-hidden="true"
                  style={{
                    color: 'var(--fog-600)',
                    fontSize: '0.8em',
                    transition: 'transform var(--t-quick) var(--ease)',
                    transform: isOpen ? 'rotate(45deg)' : 'none',
                  }}
                >
                  +
                </span>
              </button>
              {/*
                Height is animated rather than conditional so the open and close
                share one transition. `grid-template-rows` on a wrapper is the
                technique that measures to auto height without JS.
              */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateRows: isOpen ? '1fr' : '0fr',
                  transition: 'grid-template-rows var(--t-enter) var(--ease)',
                }}
              >
                <div style={{ overflow: 'hidden' }}>
                  <p style={{ color: 'var(--fog-400)', paddingBottom: '1.35rem', maxWidth: '58ch' }}>
                    {item.a}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function FinalCta({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="shell"
      style={{
        paddingBlock: 'calc(var(--section) * 1.2)',
        borderTop: '1px solid var(--hairline)',
        display: 'grid',
        justifyItems: 'center',
        textAlign: 'center',
        gap: '1.5rem',
      }}
    >
      <h2 style={{ fontSize: 'clamp(2.2rem, 6vw, 4rem)', maxWidth: '18ch' }}>
        Give your Solana activity a companion.
      </h2>
      {children}
      <p style={{ color: 'var(--fog-200)', maxWidth: '40ch', marginTop: '0.5rem' }}>
        Your Solana activity should not just be a transaction history.
        <br />
        It should feel like a journey.
      </p>
    </section>
  )
}