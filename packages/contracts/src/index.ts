/**
 * Gochi shared contracts.
 *
 * This package exists so the mobile app and the API cannot drift apart.
 *
 * The rule (PLAN.md, "contract first"): every shape that crosses the network is
 * declared here once, as a zod schema. The API validates its inputs and shapes
 * its responses with these; the mobile app parses responses with the same
 * schemas. Neither side is allowed to hand-write a duplicate of a type that
 * already lives here — that is the whole point, since a hand-written duplicate
 * fails silently when the two versions disagree.
 *
 * `main` points at the TypeScript source rather than a build output. Metro
 * transpiles workspace packages from source, and the API runs through a TS-aware
 * runtime, so neither side needs a compiled `dist/` for this to work. If that ever
 * changes, this package gains a build step and `main` moves to `dist/index.js`.
 *
 * Identity schemas arrived in P1. The game-state schemas (spec section 40's
 * `/v1/companion`, `/v1/progression`, `/v1/activity`) arrive in P2, when the
 * engine that defines their shapes is written — guessing them now would mean
 * maintaining definitions the engine may contradict.
 */

export * from "./identity.js";
