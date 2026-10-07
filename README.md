# Gochi

A persistent cyber companion on Solana Mobile. Your companion's state, personality
and progression are driven by your real onchain activity — it reads what actually
happened in your wallet, not what you told it happened.

<!-- Quick orientation: this README is the submission. `docs/TEST.md` is the
     phone-side checklist, `docs/ARCHITECTURE.md` is how it fits together, and
     `docs/HANDOFF.md` is everything that still needs a key or a decision. -->

## What it does

- **Reads your wallet, mainnet.** Swaps and staking are detected from real
  transaction history, then converted into game events by a deterministic engine.
- **Accumulates progression.** XP, level, energy, aura and combat rating move by
  server-computed rules. The client never computes progression — a client that
  could set its own level would make every other rule decorative.
- **Speaks in character.** Short authored lines, chosen by condition, with
  cooldown and burst folding so ten swaps in five minutes produce one sentence
  instead of ten.
- **Mints an onchain companion.** A Metaplex Core asset in your wallet, with the
  holder unable to transfer it. Gochi pays the fees; your wallet remains the owner.

## Running it

```bash
# 1. API — reads apps/api/.env
npm run api:dev            # http://localhost:8787

# 2. App — reads mobile/.env
cd mobile && npx expo start --dev-client
```

Both `.env` files are documented by the `.env.example` beside them. They are
independent: the API's environment and the app's environment share nothing.

### Building the APK

```bash
cd mobile/android
./gradlew assembleDebug --no-parallel --max-workers=1 \
  -PreactNativeArchitectures=arm64-v8a \
  -Pkotlin.compiler.execution.strategy=in-process
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Those flags are not optional on a 6GB machine — see `docs/P1.md`.

## Two things that will bite you

Both cost real debugging time, so they are written down.

**The `.env` for the app lives in `mobile/`, not at the repo root.** Expo resolves
`.env` relative to its own project root. A file at the root is silently ignored:
the app bundles `undefined` for every `EXPO_PUBLIC_` value and falls back to a
hardcoded default. That presents as a server problem, not a configuration one.

**A debug build does not bundle JavaScript.** With `expo-dev-client` installed,
debug variants are treated as debuggable and skip bundling, so the app launches a
dev client and waits for Metro. On someone else's phone there is no Metro, so it
shows nothing. `mobile/android/app/build.gradle` sets `debuggableVariants = []` to
bundle it. Verify with:

```bash
unzip -l mobile/android/app/build/outputs/apk/debug/app-debug.apk | grep index.android.bundle
```

## Honesty as a design constraint

Several screens could easily have told a judge something flattering and false.
They don't, and the constraints are load-bearing rather than stylistic:

- **No security score, anywhere.** Spec §58 names a fabricated one as the worst
  thing this product could do, because a user seeing "84% secure" makes decisions
  on a number the app invented. The shield reports only verified activity and
  states what it could not check.
- **No portfolio value.** The vault shows raw token amounts with no price. A
  priced portfolio implies an app that manages money, and §9.3 forbids implying
  custody.
- **Staking says "unavailable."** We can see that staking happened; we cannot
  confirm a current delegation. Claiming one we cannot verify is the same failure
  in a different costume.
- **A failed read is not an empty result.** Unavailable balances render as
  unavailable with a retry, never as zero — zero is a claim about the wallet.

## Layout

```
apps/api/          Hono API — engine, ingestion, dialogue, minting
packages/contracts/  zod schemas shared by both sides
mobile/            Expo app — screens, features, design tokens
docs/              architecture, testing, handoff, decisions
```

See `docs/ARCHITECTURE.md` for how a transaction becomes a level-up.

## Tests

```bash
cd apps/api && npx vitest run
```

203 tests, ~200 of which are integration tests against a real Neon database, so a
full run takes 12–20 minutes. `tests/ingestion.test.ts` is pure and finishes in
seconds if you only want the event-classification rules.