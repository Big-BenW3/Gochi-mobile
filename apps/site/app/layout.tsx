import type { Metadata, Viewport } from 'next'
import { Manrope } from 'next/font/google'

import './globals.css'

/*
 * Manrope, matching the app's own type stack (mobile/src/theme/fonts.ts).
 * Self-hosted by next/font, so there is no render-blocking request to a third
 * party and no layout shift when it lands.
 */
const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-body-face',
  display: 'swap',
})

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://gochi.app'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Gochi — a companion that reacts to your moves on Solana',
  description:
    'Gochi is a persistent cyber companion on Solana Mobile. It reads your real onchain activity and responds — a swap gives it a boost, staking feeds it, and it grows with you.',
  openGraph: {
    title: 'Gochi — a companion that reacts to your moves on Solana',
    description:
      'A persistent cyber companion whose state and personality are driven by your real onchain activity.',
    type: 'website',
    url: siteUrl,
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Gochi — a companion that reacts to your moves on Solana',
    description:
      'A persistent cyber companion whose state and personality are driven by your real onchain activity.',
    images: ['/og.png'],
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: '#05060D',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={manrope.variable}>
      <body>
        <div className="stage" aria-hidden="true" />
        <main className="page">{children}</main>
      </body>
    </html>
  )
}