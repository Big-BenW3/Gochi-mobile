# Architecture

How a transaction becomes a level-up, and why each step lives where it does.

## The path of one swap

```
Solana mainnet
   │  wallet signs a swap
   ▼
RpcHistoryAdapter.getSignaturesForAddress
   │  last 50 signatures for the user's wallet, newest first
   ▼
getParsedTransaction (maxSupportedTransactionVersion: 1)
   │  program ids, and pre/post token balances
   ▼
movedMintCount(tx, wallet)
   │  how many distinct mints changed THIS wallet's balance
   ▼
normalizeAndValidate (§24.2–24.3)
   │  event type from the delta, then §24.3 validation
   │  → two or more mints moved  ⇒ SWAP
   ▼
activity_events row, processedAt = null          ← recorded, not applied
   ▼
POST /v1/companion/sync
   ▼
ingestEvent()  ← inside one transaction
   │  1. claim the idempotency key (23505 ⇒ duplicate, rollback)
   │  2. run the pure engine
   │  3. companion state, XP, achievements
   │  4. dialogue, subject to cooldown and burst folding
   │  5. notification, subject to §28.2 preferences
   ▼
sync_cursors.lastSlot advances
```

## Why classification reads balances, not program ids

The obvious implementation is "if the transaction called Raydium, it's a swap."
That was the first attempt and it was wrong for two reasons.

**Jupiter has no program to find.** Jupiter v6 is an off-chain aggregator: it
routes a trade through whichever underlying AMM is cheapest, so the transaction
you see on chain calls Raydium or Orca, not Jupiter. Classifying on a Jupiter
program id would never match anything.

**A wrong id fails silently.** An unrecognised program falls through to a generic
event, and a generic event awards no XP. The user makes ten real trades, earns
nothing, and nothing anywhere reports an error — which looks exactly like a
broken product.

So the signal is the balance delta: if two or more of the user's mints moved, they
gave up one asset and received another, whatever program did it. Verified against
live mainnet swaps through the real adapter. Program ids are kept only as *labels*
(`raydium_amm_v4`) for the activity feed, sourced and cited rather than guessed.

## Two layers, one transaction

`engine.ts` decides and `apply.ts` writes, and they are separate for a reason:
purity has a price. A pure function cannot see the database, so it cannot
deduplicate. That is `apply.ts`'s whole job.

The idempotency guard is the unique index on
`activity_events.idempotency_key`, used as a write rather than a check-then-act:

```
insert → 23505 → two concurrent deliveries cannot both award
SELECT-then-INSERT → both see "unprocessed" → both award
```

A duplicate rolls the whole transaction back, which is correct: none of the writes
should have happened. Spec §25.3 lists six things that must commit as one
operation — processed marker, state, XP, achievements, dialogue, notification — and
a partial commit would leave a companion that gained XP with no achievement.

## Server-authoritative progression

The client never computes XP, level thresholds or evolution stages. It renders
numbers the server sends.

Two reasons. Spec §21.2 makes the server authoritative, so a client that could set
its own level would make every other rule decorative. Spec §41 wants balance
changes to need no app release, and a locally-calculated progress bar silently
disagrees with the server the moment the curve changes.

This is also why `GAME_CONFIG_V1` is versioned and stored on every companion and
every processed event: a progression number can always be explained after the
fact from the config that produced it.

## Dialogue: warranted, then filtered

The engine says which line is *warranted*. `decideDialogue` decides whether saying
it now adds anything.

```
10 swaps in 5 minutes
   engine says:  swap_encouragement × 10
   guard says:   cooldown on 2, burst-fold the rest
   result:       "You made 10 moves. I definitely noticed."
```

Critical lines (§28.1 — level-up, evolution) never cooldown out, because a user
who muted the companion still needs to know it evolved.

The subtle bug here was a clock mismatch. Dialogue rows defaulted `createdAt` to
wall-clock time while the comparison used the *event's* time, so every stored line
looked like it had been written in the future, every comparison landed "inside
cooldown", and the burst path was unreachable. Backfilled history hit it hardest,
since its block time is older than its insert by definition. Both rows now carry
the event's own timestamp.

## Read/write cluster split

Two RPC endpoints, for a reason that is easy to get wrong:

| Variable | Cluster | Used for |
|---|---|---|
| `SOLANA_RPC_URL` | devnet | **writes only** — creating the companion asset |
| `SOLANA_MAINNET_RPC_URL` | mainnet | **every read** — history, balances, Genesis Token, `.skr` |

The read side must be mainnet, not a preference. The Seeker Genesis Token exists
only on mainnet and `.skr` names are mainnet ANS records, so reading either from
devnet reports every wallet as having no device and every name as unresolved.
Those are confident wrong answers rather than errors, which is the worst kind: a
wallet without a Seeker and a wallet whose verification call failed look identical
from the client.

Splitting them also means the demo can read a judge's real trading history while
spending only devnet SOL to mint.

## Environment ownership

Two independent `.env` files, no shared file:

```
apps/api/.env    the server — DATABASE_URL, JWT secret, Privy App ID,
                 Helius key, payer keypair (base64), both RPC URLs
mobile/.env      the app — Privy App ID and Client ID, API URL
```

Expo resolves `.env` relative to `mobile/`, which is why the app's file must be
there. A root-level `.env` is silently ignored and the app bundles `undefined`.

The payer travels as `PAYER_SECRET_KEY_BASE64` rather than a path because the same
build runs on a laptop, where a keyfile on disk is natural, and on a host, where
the filesystem has no such file and baking one into an image would put a funded
wallet into git history permanently. A Solana keyfile is a JSON array of 64 bytes,
so it is base64 of that JSON *text* — 300 characters, not 88.

## Privy needs one value, not two

Verification is asymmetric: the access token is checked against Privy's published
JWKS, signed by the platform rather than the app. The only Privy value the server
needs is the public App ID, used as the JWT `audience` so a token minted for a
different app is rejected.

There is deliberately no app secret. It was once required and never read, which put
an unused credential on a public host. A secret would become necessary the moment
this server called a Privy *REST* endpoint.

## Failure modes designed for

| Failure | Behaviour |
|---|---|
| Duplicate webhook / replay | unique index rejects, transaction rolls back, nothing awarded |
| Out-of-order arrival | ordered by slot, then block time, then key |
| Failed transaction | rejected before the engine, with a reason recorded |
| RPC or indexer down | ingestion is best-effort; sync still drains what already landed |
| Token balances unreadable | `available: false`, UI offers a retry — never a zero balance |
| Security signal unknown | recorded, shield untouched (§55 scenario 7) |
| 3D model fails to load | static fallback; the rest of the app stays usable |
| Config changes | versioned on every companion and event, so numbers stay explainable |