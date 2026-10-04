/**
 * Gochi shared contracts — bootstrap.
 *
 * This package exists so the mobile app and the API cannot drift apart.
 *
 * The rule (PLAN.md, "contract first"): every shape that crosses the network is
 * declared here once, as a zod schema. The API validates its inputs and shapes
 * its responses with these; the mobile app generates its request types from the
 * same schemas. Neither side is allowed to hand-write a duplicate of a type that
 * already lives here.
 *
 * `main` points at the TypeScript source rather than a build output. Metro
 * transpiles workspace packages from source, and the API runs through a TS-aware
 * runtime, so neither side needs a compiled `dist/` for this to work. If that ever
 * changes, this package gains a build step and `main` moves to `dist/index.js`.
 *
 * Nothing is defined here yet. The first schemas land in P2, when the game engine
 * is written — adding speculative types now would mean maintaining definitions
 * that the engine may contradict.
 */

export {}