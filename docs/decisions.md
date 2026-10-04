# Architecture decision records — Gochi

Every decision that departs from `SOLGOTCHI_PRODUCT.md`, or that a future reader
would otherwise have to reverse-engineer from the code.

**Rule:** when an implementation decision is ambiguous, the spec's handoff rule
(§61) applies — preserve the user's ability to use the companion, prefer the
simplest verifiable implementation, never invent blockchain or device data.

Status values: `Accepted`, `Provisional` (revisit at a named phase), `Superseded`.

---

## ADR-001 — React Native / Expo, not Flutter

**Status:** Accepted · **Date:** 2026-10-04 · **Spec:** §34

**Context.** The spec names Flutter as the primary frontend with React Native as an
alternative. The existing scaffold is Expo SDK 55 with `@solana/kit`,
`@wallet-ui/react-native-kit` (MWA), Privy and Uniwind already wired and working.

**Decision.** Build on React Native / Expo, using the spec's sanctioned alternative.

**Consequences.** We inherit a working MWA integration — `useMobileWallet()` exposes
`connect`, `signIn` (SIWS), `signMessage`, `signTransaction` and
`signAndSendTransaction`, so spec §29 needs no new wallet dependency. Every Solana
Mobile skill available is Expo-oriented.

The cost is 3D. Flutter has `flutter_3d_controller`, a real native GLB renderer.
React Native has no equivalent, so P5 uses a WebView renderer behind an interface —
which is what spec §11.8 anticipates anyway. **This decision is revisited if 3D
becomes the product rather than a feature of it.**

---

## ADR-002 — Spotify as the design base

**Status:** Accepted · **Date:** 2026-10-04 · **Spec:** §2.1, §51

**Context.** The concept board supplies a palette and screen mockups. Its palette uses
Tailwind defaults (`#7C3AED` = violet-600, `#6B7280` = gray-500), four equally-weighted
saturated neons with no focal point, three neutral steps, and no damage red or reward
gold — so spec §5.2's `DAMAGED` state and the level-up moment have no colour.

**Decision.** Adopt the Spotify design analysis from VoltAgent/awesome-design-md as the
base, with Gochi-specific adaptations recorded in `design/DESIGN.md` §14.

**Consequences.** "Content-first darkness" is the right doctrine for an app whose hero
is a glowing 3D creature: the chrome recedes and the companion is the only colour
source. Its single-functional-accent rule fixes the neon overload. The board's
screens are still used as layout and content reference — only the colour system,
typography and shape rules were replaced.

Deliberately **not** adopted: the proprietary fonts (CircularSp/SpotifyMixUI), and
full-pill primary buttons.

---

## ADR-003 — No SF Pro, and no SpotifyMixUI

**Status:** Accepted · **Date:** 2026-10-04

**Context.** The design request asked for an SF font.

**Decision.** Use Space Grotesk (display), Manrope (body) and JetBrains Mono (stats and
addresses), all OFL via `@expo-google-fonts`.

**Consequences.** SF Pro's licence restricts its use to Apple platforms; bundling it in
an Android app submitted to the Solana dApp Store is a licence violation, not a style
choice. SpotifyMixUI is proprietary to Spotify. All three chosen faces ship their `.ttf`
inside the npm package, so there is no runtime fetch and no licensing to record under
spec §50.

---

## ADR-004 — FAB-first navigation; the board's tab bar is wrong

**Status:** Accepted · **Date:** 2026-10-04 · **Spec:** §14.1, §61.7

**Context.** The concept board's home mock shows a persistent bottom tab strip
(home / activity / vault / chat) alongside the FAB.

**Decision.** No bottom tab bar. The FAB is the only global navigation.

**Consequences.** Spec §14.1 states "No permanent bottom tab bar" and §61 rule 7 requires
keeping the FAB navigation model intact. The board's tabs become FAB sub-actions.

Two further board inconsistencies were found and also resolved in the spec's favour:

- The board's asset panel recommends *Unity / Flutter 3D*, predating ADR-001.
- The board's home screen shows a **Health** stat; spec §5.1 has no Health variable.
  The real set is Energy, Shield Health, Shield Durability, Combat Rating and Aura.

---

## ADR-005 — Server-authoritative progression

**Status:** Accepted · **Date:** 2026-10-04 · **Spec:** §21.2, §38.6

**Context.** The companion's XP, level, energy, shield, aura and evolution are
meaningful game state that must not be forgeable.

**Decision.** The backend owns all progression. The client is authoritative only for
presentation. The client never computes permanent XP and the server never trusts
client-supplied XP, level, Genesis verification or wallet activity.

**Consequences.** Every screen reads companion state through the API. Idempotency keys
(`network + signature + event_type`) and optimistic concurrency are mandatory, not
optional — a duplicate webhook must never double-award, and a level-up must be
idempotent (spec §6.4, §24.4).

---

## ADR-006 — Minting: server-side preferred, spike decides

**Status:** Provisional — decide at the P0 spike, execute in P4 · **Date:** 2026-10-04 · **Spec:** §10, §31, §32

**Context.** Metaplex Core on React Native is documented by Solana Mobile, but the
official guide targets `@solana/web3.js` while this app uses `@solana/kit`. Bridging
kit → legacy transaction for Umi is the single highest technical risk in the project.

Separately, Metaplex's storage drivers (`bundlrStorage`, `nftStorage`) depend on Node
libraries and cannot run in React Native, so metadata JSON must be served by our own
backend either way.

**Decision.** Prefer minting server-side: the backend signs with Umi using an
application payer keypair and sets the Core asset's owner to the user's wallet. The
client never links Metaplex. Fall back to client-side MWA signing if the spike proves
that impossible.

**Consequences.** Server-side removes the RN/Umi risk entirely and lets the app avoid
shipping a heavy SDK. The cost is that the backend holds a hot key, so the mint
endpoint must be authenticated, rate-limited and idempotent per wallet (spec §29.3
requires one wallet to resolve to exactly one companion). Revalidate in P4 before
committing.

---

## ADR-007 — Node + TypeScript API with Postgres

**Status:** Accepted · **Date:** 2026-10-04 · **Spec:** §21, §22, §40

**Context.** The spec requires a real backend with authoritative game state.

**Decision.** A Node/TypeScript service (`apps/api`) against Postgres, with shared
schemas in `packages/contracts`. Redis is **not** introduced for V1.

**Consequences.** The spec's Redis uses (§22.2) are caches, rate limits, sync locks,
dedupe windows and notification cooldowns. Every one is achievable on Postgres for V1
traffic, and omitting it removes a service to run and fund. If measurement later shows
a need, `packages/contracts` and the adapter interfaces are already shaped for it.

---

## ADR-008 — One Neo project, two clusters

**Status:** Provisional · **Date:** 2026-10-04

**Decision.** Devnet-first. Production uses a separate Neon project/branch so dev data
can never be mistaken for real.

**Consequences.** Spec §38.12 requires development and production wallets to be
separate. Migrations run against devnet/development only; production promotion is a
deliberate act.

---

## ADR-009 — Dark and portrait locked

**Status:** Accepted · **Date:** 2026-10-04 · **Spec:** §20

**Context.** The scaffold had `userInterfaceStyle: automatic` and
`orientation: default`.

**Decision.** Dark-only and portrait-only.

**Consequences.** The design system is built on a near-black canvas with no light theme;
supporting `automatic` would mean shipping a second palette that the spec never asked
for. Portrait-only follows §20's requirement that no user flow needs rotation. Both
still need honouring the OS font-scale and reduced-motion settings — locked theme and
orientation are not an accessibility exemption.

---

## ADR-010 — Bundle id is a placeholder

**Status:** Provisional — must be settled before P14 · **Date:** 2026-10-04

**Context.** The scaffold shipped `com.anonymous.kit_expo_privy`, which cannot be
published.

**Decision.** Use `com.gochi.app` and the scheme `gochi` for development.

**Consequences.** This must become a real reverse-domain identifier controlled by the
user before any store submission — changing it later alters the Android application
id and the MWA deep link, so it is cheaper to settle now. **Blocking for release, not
for development.**

---

## ADR-011 — No AI attribution in commits

**Status:** Accepted · **Date:** 2026-10-04

**Context.** The repository is submitted to judges.

**Decision.** No `Co-Authored-By`, `Generated with`, or any tool attribution trailer on
any commit. Author and committer are the user's own identity. Commits follow Conventional
Commits.

**Consequences.** See `docs/git-conventions.md`, which also records the verification
command. No pull requests are opened without explicit instruction.

---

## ADR-012 — UI primitives carry no app data

**Status:** Accepted · **Date:** 2026-10-04 · **Spec:** §33, §52

**Context.** Spec §52 lists ~26 components, but several depend on data contracts that do
not exist yet (activity events, notifications, achievements, 3D models).

**Decision.** `src/components/ui/` contains only components with no dependency on
app data. Feature components live in `src/features/<name>/ui`. Components whose data
contract is not yet built are **absent, not stubbed with fake data**.

**Consequences.** No placeholder screens exist to be mistaken for working ones, and the
primitives stay reusable. Landing phase: FAB P6, ActivityCard P7, NotificationRow P8,
CompanionCard and the 3D views P5, AchievementBadge and StateTimelineItem P9.

Shared vocabulary that *is* needed up front — the eight conditions — lives in
`src/domain/companion/conditions.ts`, below the UI layer, so `ConditionBadge` can stay
a primitive while still being unable to disagree with the state it shows.