/**
 * Gochi API — bootstrap entry point.
 *
 * The service starts in P3. This file exists so the workspace is bootstrapped and
 * typechecking has something to resolve, and deliberately contains no server yet.
 *
 * What will be here, per spec sections 21-24 and 40:
 *   - SIWS session auth (verify the MWA signature, issue a JWT)
 *   - the /v1 companion, activity, progression, achievements and notification routes
 *   - the ingestion adapters (Helius webhooks, with an RPC history fallback)
 *   - the game engine, which is the only thing allowed to mutate progression
 *
 * Two invariants that shape every endpoint here, from spec sections 21.2 and 38:
 *   1. Progression is authoritative on the server. A client-supplied level, XP or
 *      Genesis flag is never trusted.
 *   2. Every state mutation is idempotent and keyed, so a replayed webhook or a
 *      double-tapped button cannot double-award.
 *
 * See PLAN.md phase P3 for the endpoint list and P2 for the engine contract.
 */

export {}