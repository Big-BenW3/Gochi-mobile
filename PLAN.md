# SOLGOTCHI V1 — BUILD PLAN

**Status:** plan locked, awaiting green light for **P0**
**Contract:** `SOLGOTCHI_PRODUCT (1).md` (4036 lines) — spec wins on every conflict
**Art direction:** `SOLGOTCHI Neon Companion App Board.png`
**Design base:** `design/DESIGN.md` (Spotify-derived) — *to be written in P0*

---

## 0. DECISIONS (locked)

| # | Decision | Rationale | Spec ref |
|---|---|---|---|
| 1 | **React Native / Expo** (not Flutter) | Scaffold already has MWA + Privy + `@solana/kit` wired; `signIn`/`signTransaction` verified present in `useMobileWallet()`; every Solana Mobile skill is Expo-oriented. Flutter's only real edge is `flutter_3d_controller`. | §34 |
| 2 | **Design base = Spotify** `design.md` | "Content-first darkness" — UI recedes so the character is the only thing that glows. Fixes the board's 4-competing-neon problem. | — |
| 3 | **Borrow from Raycast** | Surface ladder + 1px hairlines + accent-**soft** (15% alpha) variants. Makes dark UI feel expensive instead of flat. | — |
| 4 | **Borrow gold from PlayStation** | `#FFC24B` reserved *exclusively* for XP / level-up / achievements. The board palette had no reward color at all. | — |
| 5 | **Monorepo**, Expo app relocated to `mobile/` | Frees root for `apps/` + `packages/`. `android/` moves with the app. | — |
| 6 | **Server-authoritative** progression | Client never calculates permanent XP. | §21.2 |
| 7 | **Mint = server-side preferred**, but **spike decides** | Server-side Umi + payer, `asset.owner = userWallet`, RN client never touches Metaplex. Fall back to client-side MWA signing if spike proves otherwise. *Decide at P0 spike, revisit at P4.* | §32 |
| 8 | **Nav = FAB-first, no tab bar** | Board's home mock has a bottom tab strip — that is an **error**. Spec §14.1 + §61.7 override. | §14 |

### Palette (replaces the board's)

Derived from Spotify doctrine + the character's own art. The board palette used Tailwind defaults (`#7C3AED` = violet-600, `#6B7280` = gray-500), four equal-weight neons, and was missing both an alert red and a reward gold.

**Neutrals** — violet-tinted blacks, 6 steps (board had 3 — not enough for card/sheet/overlay elevation):

```
#05060D  #0A0C16  #111426  #1A1E33  #262B44  #343B58
text:    #EDEFF9 (primary)  #A8B0CC (secondary)  #666E8F (tertiary)
```

**Roles** — 1 primary, 1 interactive, 4 semantic:

| Role | Hex | Use |
|---|---|---|
| Primary / aura | `#7A6BFF` | brand, glows (via alpha ramps, **not** extra hues) |
| Primary-lit | `#A99BFF` | energized, highlights |
| Signal | `#31D6FF` | links, interactive, ALERT |
| Damage | `#FF5B6E` | DAMAGED — *missing from board* |
| Recover | `#3DDC97` | RECOVERING |
| Evolve | `#FF6EDB` | EVOLVING only — pink gets one rare job |
| **Reward** | `#FFC24B` | XP, level-up, achievements — *missing from board* |

**Condition → color** (spec §5.2, 8 states):

| Condition | Color |
|---|---|
| HEALTHY | `#7A6BFF` |
| ENERGIZED | `#A99BFF` |
| TIRED | `#666E8F` |
| ALERT | `#31D6FF` |
| DAMAGED | `#FF5B6E` |
| RECOVERING | `#3DDC97` |
| EVOLVING | `#FF6EDB` |
| SLEEPING | `#343B58` |

### Typography

Spotify's CircularSp is proprietary — **do not bundle SF Pro either** (Apple's license restricts it to Apple platforms; an Android app bundling it is a violation).

Three open-license faces via `@expo-google-fonts` (OFL, no asset paperwork):

- **Space Grotesk** 500/700 — display, wordmark
- **Manrope** 400/600 — body / UI
- **JetBrains Mono** 500 — stat blocks (`Energy 72/100`) **and wallet addresses** (need mono anyway)

Hard limits from `mobile-app-ui-design` skill: **max 4 font sizes, max 2 weights per context, one family (two max with clear hierarchy purpose).**

---

## 1. TARGET LAYOUT

```
/                        npm workspaces root
├── package.json         workspaces: ["mobile", "apps/*", "packages/*"]
├── .npmrc               hoisted install (Expo wants hoisted, not isolated)
├── PLAN.md              ← this file
├── design/DESIGN.md     Spotify base + our deltas (palette, fonts, condition map)
├── docs/
│   ├── SOLGOTCHI_PRODUCT.md     spec (contract)
│   └── decisions.md             ADRs — every deviation from spec, section cited
├── mobile/              ← Expo app MOVED here (owns android/)
│   ├── android/  src/  app.json  metro.config.js  index.js  polyfill.js
│   ├── package.json  tsconfig.json  eslint.config.js  .prettierrc
├── apps/api/            Hono + Drizzle + Neon
└── packages/contracts/  shared zod schemas + types (contract-first)
```

**Keep:** `.agents/` (real skill content), `skills/` + `skills-lock.json` (installer manifest), `.vscode`, `.expo`.

**Delete (21 dirs — all verified pure symlinks → `.agents/`, zero data loss):**
`.aider-desk .augment .autohand .claude .cortex .devin .goose .grok .hermes .inferencesh .jazz .junie .kiro .minimax .pi .qoder .qwen .tabnine .vibe .windsurf .zcode`

---

## 2. RESEARCH FINDINGS THAT CHANGE THE PLAN

Pulled from live docs during planning — not guesses.

| # | Finding | Consequence |
|---|---|---|
| 1 | **Expo SDK 55 auto-configures Metro for monorepos.** `autolinkingModuleResolution` is **on automatically** for monorepo apps. Doc says **delete** manual `watchFolders` / `resolver.nodeModulesPaths` / `extraNodeModules` / `disableHierarchicalLookup`. | Monorepo is low-risk. Our `metro.config.js` has none of those → almost no Metro surgery. npm (hoisted) is what Expo wants. |
| 2 | **Metaplex Core works on React Native** — official guide `docs.solanamobile.com/react-native/metaplex_integration`. Needs polyfills + metro `extraNodeModules`. Umi has an RN export fix (PR #129). | Risk downgraded from "unknown" to "solvable". **But** the guide is `@solana/web3.js`, our scaffold is `@solana/kit` → **spike in P0.** |
| 3 | **`react-native-model-viewer-webview` exists** — wraps `<model-viewer>`, **vendors model-viewer 4.2.0 (works offline)**, accepts `require('./x.glb')`, verified base64 data-URI path on Android, needs `glb` in Metro `assetExts`. | 3D path is concrete. Honest caveat from its own README: *"not for game-like rendering"* — fine for a rotating companion, not for physics/particles. |
| 4 | **Metaplex storage drivers (`bundlrStorage`, `nftStorage`) are RN-incompatible** (Node deps). | Metadata must be **hosted by our backend** → adds `GET /v1/metadata/:id.json` to P3. |
| 5 | **`seeker-genesis-token` requires BOTH** SIWS *and* server-side Token-2022 SGT inspection. Address-check alone is insecure. | P1 has two hard halves; cannot shortcut. |
| 6 | **This repo is NOT a git repo.** | We move the whole app and delete 21 folders. **`git init` is a hard prerequisite for P0.** |
| 7 | Missing deps: `expo-asset`, `expo-file-system`, `expo-notifications`, `react-native-model-viewer-webview` | Added to install lists in the relevant phases. |
| 8 | `references/industry-conventions.md` → **Crypto/Web3**: *"polish builds trust"* (Phantom). **Education**: character animations + emotional feedback loops took Duolingo 14.2M → 34M+ DAU. | Direct evidence for the animation/emotion budget in P5/P9. Cite when arguing scope. |
| 9 | `polyfill.js` already installs `react-native-quick-crypto` + `fast-text-encoding`; `react-native-quick-crypto@1.x` is JSI/Nitro (native). | Do **not** also add `crypto-browserify` — pick one crypto path. Prefer `quick-crypto` via metro `resolveRequest`. |

### Docs index (read before the phase that needs them)

```
https://docs.expo.dev/guides/monorepos/
https://docs.expo.dev/guides/customizing-metro/
https://docs.solanamobile.com/get-started/react-native/installation
https://docs.solanamobile.com/react-native/metaplex_integration
https://docs.solanamobile.com/get-started/development-setup
https://developers.metaplex.com/core
https://developers.metaplex.com/core/transfer
https://www.metaplex.com/docs/smart-contracts/core/sdk/javascript
https://modelviewer.dev/docs/
https://www.helius.dev/solana-webhooks-websockets/
https://www.helius.dev/blog/parsed-events-and-streams
https://docs.privy.io/authentication
https://orm.drizzle.team/docs
https://hono.dev/docs/
https://github.com/solana-mobile/solana-mobile-docs/blob/main/solana-mobile-stack/seeker-id.mdx
```

### Skills map (load before the phase — don't work from memory)

| Phase | Skills |
|---|---|
| P0 | `mobile-app-ui-design` (full), `solana-mobile` |
| P1 | `solana-mobile-wallet` **first** (it mandates picking the stack before code), `integration-privy`, `seeker-genesis-token`, `seeker-domains` |
| P2–P3 | — (pure logic) |
| P4 | `solana-mobile-wallet`, `seeker-genesis-token` |
| P5 | `mobile-app-ui-design` (Step 4 peak-end — birth reveal **is** the peak) |
| P6 | `mobile-app-ui-design` (Step 2 thumb zone) |
| P7–P13 | `mobile-app-ui-design` as needed |
| P14 | `solana-mobile-publishing` (one-time App NFT is **irreversible** — read early, execute late), `solana-mobile` |

---

## 3. WHAT I NEED FROM YOU

| # | Item | Phase | Status |
|---|---|---|---|
| 1 | Spotify base + palette + 3-font system | P0 | ✅ approved |
| 2 | Monorepo / `mobile/` relocation | P0 | ✅ approved |
| 3 | **`git init`** (or a remote URL) | P0 | ⬜ |
| 4 | Bundle id — currently `com.anonymous.kit_expo_privy`, **must change** | P0 | ⬜ |
| 5 | App display name + scheme (`SOLGOTCHI` / `solgotchi`) | P0 | ⬜ |
| 6 | Neon Postgres connection string | P1 | ⬜ |
| 7 | Privy App ID + Client ID | P1 | ⬜ (you can get) |
| 8 | Seeker device **or** emulator + Mock MWA wallet | P1 | ⬜ |
| 9 | Game economy numbers — approve/adjust (`swapXpBase`, caps, decay, evolution thresholds) | P2 | ⬜ |
| 10 | Mint approach — **spike decides**, per your call | P0 spike → P4 | ⬜ deferred |
| 11 | Payer keypair path + cluster (devnet first) | P4 | ✅ you have |
| 12 | GLB character (you're sourcing) | P5 | ✅ your timing |
| 13 | Helius API key | P7 | ⬜ (you can get) |
| 14 | Firebase project for FCM — **or** local-notifications-only for V1 | P8 | ⬜ |
---

## 4. THE PHASES

Format: **Goal / Accept** · **Work** · **Read** · **Skills** · **Need** · **Do (ordered)** · **Risk**

---

### P0 — Repo surgery + foundations

**Goal:** monorepo standing, app relocated, design system built, Android build still green.
**Accept:** `npm run ci` (tsc + lint + format + android build) passes from the new layout; token + component layer exists; `PLAN.md` + `design/DESIGN.md` + `docs/decisions.md` in repo.

**Work**
- `git init` + baseline commit (**before any move**)
- Move Expo app → `mobile/`: `android/ src/ app.json metro.config.js index.js polyfill.js tsconfig.json eslint.config.js .prettierrc .prettierignore .gitignore .expo/ package.json package-lock.json node_modules`
- Root `package.json` with `workspaces: ["mobile","apps/*","packages/*"]`; `.npmrc` hoisted; root scripts delegate into `mobile/`
- Root `.gitignore` (node_modules, .expo, .env, android/build)
- **Do NOT add `watchFolders`** — SDK 55 handles it; adding it is explicitly counter-advised
- Delete the 21 symlink dirs
- `design/DESIGN.md` — Spotify base annotated with our deltas (surface ladder, gold, condition map, font sub, palette)
- `docs/decisions.md` — ADRs for RN-over-Flutter, Spotify-over-board, server-mint, FAB-over-tabs
- **Tokens:** color (60/30/10), type scale (max 4 sizes / 2 weights), 8-pt spacing, radii, **tinted** shadows (never pure gray/black on colored bg)
- **Component library** (spec §52): `PrimaryButton` `SecondaryButton` `TertiaryButton` `TopBar` `StatTile` `ProgressBar` `ConditionBadge` `BottomSheet` `ConfirmationDialog` `ErrorState` `EmptyState` `LoadingState` `OfflineBanner` `WalletChip` `SeekerIdentityChip` `ExplorerLink`
- Fonts: `@expo-google-fonts/space-grotesk` `@expo-google-fonts/manrope` `@expo-google-fonts/jetbrains-mono`
- Route groups: `(onboarding) (auth) (companion) (activity) (vault) (chat) (profile) (settings)`
- Typed API client + logger + analytics interface
- **Timeboxed spike (2h): Metaplex Umi in this RN app** → go/no-go on the mint approach

**Read:** expo monorepos · expo customizing-metro · `modelviewer.dev/docs/`
**Skills:** `mobile-app-ui-design`, `solana-mobile`
**Need:** `git init` approval, bundle id, app name/scheme

**Do**
1. `git init` → 2. baseline commit → 3. move app to `mobile/` → 4. root workspace + `.npmrc` + install → 5. `npm why react-native` (duplicate check) → 6. `npx expo start --clear` → 7. `npm run android` **green** → 8. delete 21 symlink dirs → 9. tokens → 10. components → 11. route groups → 12. **Umi spike** → 13. `npm run ci` → 14. commit

**Risk:** the move can break gradle / absolute paths. Mitigation: git baseline first, one commit per step, verify build after step 7 before touching anything else.

---

### P1 — Identity (Seeker + Privy)

**Goal:** real wallet session + server-verified user + honest Genesis check.
**Accept:** physical Seeker connects; backend knows which wallet owns the session; Genesis is never trusted from the client.

**Work**
- SIWS via MWA `signIn()` → `POST /v1/auth/siws` → JWT
- Privy path: `useLoginWithSiws` → `POST /v1/auth/privy` w/ access token
- **Both halves of Genesis:** SIWS proof **+** server-side Token-2022 SGT mint inspection
- `.skr` resolution (runs against **mainnet** regardless of app cluster)
- Wallet↔companion linking rule — one wallet, one active companion
- Screens A04–A09: Authentication · Seeker connection loading · Privy Google auth · Link Seeker wallet · Genesis verification · Genesis not detected

**Read:** solana-mobile RN installation · `seeker-id.mdx` · privy authentication · metaplex core
**Skills:** `solana-mobile-wallet` (load first), `integration-privy`, `seeker-genesis-token`, `seeker-domains`
**Need:** Neon conn string, Privy IDs, Seeker/emulator + Mock MWA wallet

**Do**
1. `users` migration → 2. SIWS client → 3. SIWS server verify → 4. JWT middleware → 5. Privy path → 6. SGT verification service → 7. `.skr` resolver → 8. auth screens A04–A09 → 9. error matrix (§37: reject / expire / absent wallet) → 10. tests → 11. commit

**Risk:** Mock MWA quirks. The existing README already documents the fix —
`adb shell locksettings set-pin 1234` + restart `com.solana.mwallet`.

---

### P2 — Schema + game state engine

*Spec §54: build the engine BEFORE the screens.*
**Goal:** one source of truth, fully tested.
**Accept:** a deterministic test event mutates state correctly; a duplicate event no-ops; level-up is idempotent.

**Work**
- Tables (§23): `users companions activity_events state_changes achievements notifications dialogue_messages sync_cursors idempotency_keys game_config`
- Pure-TS engine: `process(event, state, config) → {patch, gameEvents, dialogue?, notification?, achievements[]}`
- Rules: swap XP + frequency multiplier + daily cap · staking once-per-daily-cycle · energy decay 4/24h **floor 20** · shield honest-fallback (§7.4) · curve `floor(120 + 80L + 12L²)` · evolution at L10/20/35/50 · 8 conditions (§5.2)
- `GAME_CONFIG_V1`, versioned, stamped on every processed event (§41)
- Optimistic concurrency (version column)
- Vitest suite covering §43 unit list + §55 scenarios 1–10

**Read:** spec §5–§7, §25–§26, §41, §43, §55 · `orm.drizzle.team/docs`
**Skills:** none (pure logic)
**Need:** approval on economy numbers

**Do**
1. migrations → 2. domain types in `packages/contracts` → 3. config module → 4. engine `SWAP` → 5. `STAKE_DETECTED` → 6. `SECURITY_EVENT` → 7. `DAILY_RESET` → 8. level + evolution → 9. achievements → 10. dialogue hooks → 11. full test matrix → 12. commit

**Risk:** none structural. **This is the highest-confidence phase — do it properly, everything downstream depends on it.**

---

### P3 — API surface

**Goal:** the full §40 contract, server-authoritative.
**Accept:** the app reads/mutates the companion only through the API; a replayed request never double-awards.

**Work**
- `GET /v1/me` · `GET /v1/companion` · `POST /v1/companion/sync` · `GET /v1/activity` · `GET /v1/activity/:id` · `GET /v1/progression` · `GET /v1/achievements` · `GET /v1/notifications` · `POST /v1/notifications/read` · `POST /v1/companion/interaction` · `GET /v1/vault`
- **`GET /v1/metadata/:companionId.json`** — static Core metadata host (finding #4)
- Middlewares: JWT · rate limit · idempotency · version check
- Admin config read + versioning

**Read:** `hono.dev/docs/` · spec §40, §38
**Need:** —

**Do**
1. zod contracts in `packages/contracts` → 2. client generated from the same schemas → 3. routes → 4. middlewares → 5. seed script → 6. integration tests → 7. commit

**Risk:** low. Contract-first stops client/server drift.

---

### P4 — Companion creation + onchain mint

**Goal:** one companion per verified user; real Core Asset + PDA checkpoint.
**Accept:** verified user creates exactly one companion; asset owner = their wallet; survives restart.

**Work**
- Screens A10–A14: Starter Egg → birth reveal → name (+ randomize + validation) → 3-coachmark tutorial → first sync
- **Preferred:** backend mints via Umi + payer, `asset.owner = userWallet`, writes metadata URI
- Companion PDA per §31.2 — `CompanionState { owner, companion_asset, level, xp_checkpoint, evolution_stage, created_at, updated_at }`
- Honest copy: never label a tx "free" if the user pays fees; claim "soulbound" **only** if the transfer plugin is actually enforced (§32.2, §10.3)
- Screen G03 (Core asset detail: asset ID, metadata URI, collection, owner, explorer link)
- Devnet first

**Read:** `docs.solanamobile.com/react-native/metaplex_integration` · `developers.metaplex.com/core` · `developers.metaplex.com/core/transfer` · spec §31–32
**Skills:** `solana-mobile-wallet`, `seeker-genesis-token`
**Need:** payer keypair path, cluster

**Do**
1. **re-run / confirm the P0 spike result** → 2. Umi + payer in `apps/api` → 3. metadata builder → 4. mint endpoint (hard rate-limited) → 5. PDA create → 6. persist `asset_address` → 7. egg / reveal / name screens → 8. uniqueness test → 9. devnet mint → 10. commit

**Risk:** **highest technical risk in the project.** If server-side Umi fails, fallback = client-side MWA signing (kit → legacy-transaction bridge). Decide at the P0 spike, **not** here.

---

### P5 — 3D companion

**Goal:** one local GLB, animated, state-reactive, with a static fallback.
**Accept:** GLB loads on Seeker; ≥ Idle / Happy / Alert / Recover / Evolution play; state change alters the visible character; static fallback on failure.

**Work**
- Install `react-native-model-viewer-webview`, `expo-asset`, `expo-file-system`; add `glb` + `gltf` to Metro `assetExts`
- `CompanionRenderer` interface (§11.8): `ModelViewerRenderer` / `StaticFallbackRenderer`
- Local GLB → **base64 data URI** path (verified on Android), with `file:` attempt + fallback
- **Verify** whether `htmlOptions.additionalAttributes` (`animation-name`) is enough for clip control, or we need injected JS against the vendored runtime. If insufficient → thin custom wrapper.
- Source 1 Quaternius CC0 GLB → Blender: node names (`Character_Root Body Head Eyes Armor_* Shield_Ring Aura_Core Damage_Crack_L/R Weapon_Core`), materials (`MAT_Body MAT_Eyes MAT_Armor MAT_Shield MAT_Aura MAT_Damage MAT_Weapon`) → export `mobile/assets/3d/solgotchi_base.glb`
- Screens B01–B04 (Home · Focus · Stats · Condition detail) + §19 interactions: tap / long-press / drag / double-tap
- §35 perf: **max one live 3D instance**, pause on background, 2D previews everywhere else

**Read:** `modelviewer.dev/docs/` + `/#animations` · spec §11, §19, §35, §51
**Skills:** `mobile-app-ui-design` (Step 4 — the birth reveal **is** the peak moment)
**Need:** your GLB (your timing — renderer ships first against a placeholder)

**Do**
1. install + Metro ext → 2. renderer interface → 3. **static fallback first** (always works) → 4. model-viewer impl → 5. confirm animation control → 6. state→visual map (§11.7) → 7. screens B01–B04 → 8. gestures → 9. perf rules → 10. on-device acceptance → 11. commit

**Risk:** WebView memory cost is real (their README says so). Mitigate: never mount two viewers, unmount on blur, static fallback on `onModelError`.

---

### P6 — FAB navigation + Activity

**Goal:** spec §14 navigation + a working Activity feed.
**Accept:** FAB is the only global nav (**no tab bar** — the board error, corrected); Activity filters work.

**Work**
- `FABRoot` + `FABAction` expanding menu per §14.2, one-hand ergonomics
- Route structure + back-stack; no accidental second nav system (§14.4)
- Activity: **C01** Center (filters: all / swaps / staking / protection / system) · **C02** Event detail (signature, game impact, processing status) · **C03** Sync status · **C04** Transaction detail
- Replace the existing demo `index.tsx` entirely

**Read:** spec §14, §16-C, §18 · `mobile-app-ui-design` thumb-zone rules
**Do:** 1. FAB component → 2. route groups wired → 3. activity queries → 4. C01–C04 → 5. resolve FAB-vs-3D-drag gesture conflict → 6. a11y labels + 44pt targets → 7. commit

**Risk:** FAB and 3D drag-rotation collide on Home. Resolve explicitly, don't discover it.

---

### P7 — Onchain ingestion

**Goal:** a real transaction becomes a game event with no manual step.
**Accept:** §45-P5 acceptance met + duplicates never double-award.

**Work**
- `IngestionAdapter` interface → `HeliusWebhookAdapter` (parsed streams = **open beta**) + `RpcHistoryAdapter` fallback
- Pipeline: normalize (§24.2) → validate (§24.3) → dedupe on `network + signature + event_type` (§24.4) → engine → **atomic** commit (§25.3)
- Swap detection (Jupiter / Raydium / Orca), staking detection (stake program), ordering by slot + blockTime + ingestion time (§24.5)
- Backfill + `sync_cursors` + `POST /v1/companion/sync`
- Webhook signature validation (§38.5), retry/backoff, rate-limit handling

**Read:** `helius.dev/solana-webhooks-websockets/` · `helius.dev/blog/parsed-events-and-streams` · spec §24, §7
**Need:** Helius key

**Do**
1. adapter interface → 2. **RPC history adapter first** (works with no Helius key) → 3. normalizer + idempotency → 4. swap/stake parsers → 5. engine wiring → 6. Helius adapter behind the same interface → 7. backfill job → 8. duplicate / out-of-order / failed-tx tests → 9. commit

**Risk:** Helius parsed streams are beta — spec already mandates the RPC fallback. **Build RPC first so we are never blocked.**

---

### P8 — Dialogue + notifications

**Goal:** the companion talks contextually without spamming.
**Accept:** a meaningful event produces exactly one contextual message; cooldowns enforce the no-spam rule.

**Work**
- Rule/template engine. Inputs (§8.2): event type, condition, level, recent activity count, energy, shield, time of day, last interaction, last message ID
- Author short character-consistent lines (§8.3) + §8.4 aggregation — 10 swaps in 5 min → **one** summary: *"You made 10 moves. I definitely noticed."*
- Chat **H01** Home · **H02** Thread · **H03** Suggested replies · **H04** Conversation context (*"triggered by your latest confirmed swap"*)
- Notifications: install `expo-notifications`; priorities §28.1; daily cap; quiet hours; deep links; dedupe
- Notification center **J01–J03** + preferences

**Read:** spec §8, §28 · `docs.expo.dev/versions/latest/sdk/notifications/`
**Skills:** `mobile-app-ui-design` (emotional feedback loops)
**Need:** Firebase project for FCM, **or** agree local-notifications-only for V1

**Do:** 1. template registry → 2. selector → 3. cooldown/aggregation layer → 4. chat screens → 5. notification service + prefs → 6. J01–J03 → 7. spam tests → 8. commit

**Risk:** push setup is fiddly. Get local notifications working end-to-end first.

---

### P9 — Progression surfaces

**Goal:** make progression feel like the payoff it is.
**Accept:** level-up celebrates; evolution reveals; While-You-Were-Away reads correctly.

**Work**
- **I01** Progression · **I02** Level detail · **I03 Level-up celebration (the emotional peak)** · **I04** Evolution overview · **I05** Evolution reveal · **I06** Achievements (9 categories) · **I07** Achievement detail
- **B05** While You Were Away (§27 priority ranking + aggregation) · **B06** Daily summary
- Gold `#FFC24B` used **exclusively** here

**Read:** spec §6, §26, §27 · `mobile-app-ui-design` Step 4 (peak-end rule)
**Do:** 1. progression query → 2. level-up modal + animation → 3. evolution reveal → 4. achievements grid → 5. WYWA aggregator → 6. daily summary → 7. commit

**Risk:** low technically — but this phase is where retention lives. Do not treat it as an afterthought.

---

### P10 — Mini-Vault

**Goal:** a room that belongs to the companion, not a wallet dashboard.
**Accept:** vault shows asset + ownership; copy never implies custody (§9.3).

**Work:** **G01** Vault · **G02** Asset detail · **G03** Core asset detail · **G04** Vault activity · token balances via RPC/token accounts · truncated address + `.skr` display (uses P1 resolver) · custody-boundary copy

**Read:** spec §9, §40 `/v1/vault`
**Skills:** `seeker-domains`
**Do:** 1. `/v1/vault` → 2. balance fetcher → 3. screens → 4. copy review against §9.3 → 5. commit

---

### P11 — Pillar detail surfaces (D / E / F)

**Goal:** the three pillars explain themselves honestly.
**Accept:** **no fabricated security score anywhere** (§58 Limit 1).

**Work**
- **Shield:** D01 Overview · D02 History · D03 Security detail (*what we can and cannot verify*) · D04 Retry · D05 Unavailable
- **Staking:** E01 Vitality · E02 Staking detail (or explicit "unavailable") · E03 Energy history · E04 Rules
- **Combat:** F01 Aura overview · F02 Aura history · F03 Rules (no trade recommendations)

**Read:** spec §7.4, §58-Limit1, §53 (UX rules 1, 4, 5)
**Do:** 1. **write the honest copy first**, before any screen → 2. D01–D05 → 3. E01–E04 → 4. F01–F03 → 5. lint for banned phrases (`security score`, `safe`, `guaranteed`, `%`) → 6. commit

**Risk:** this is where products lie to users. Forbid numeric security scores in review.

---

### P12 — Profile, settings, system

**Accept:** all K screens exist; destructive actions confirm.

**Work:** **K01** Profile · **K02** Wallet & Seeker identity · **K03** Connection mgmt · **K04** Settings · **K05 3D performance** (quality / animations / auto-rotate / reduced-motion / battery) · **K06** About (program IDs, asset licenses, OSS credits) · **K07** Help · **K08** Privacy · **K09** Terms · **K10** Disconnect confirmation

**Read:** spec §16-K, §39
**Do:** 1. K01–K03 → 2. K04 + K05 (wired to renderer) → 3. K06–K09 content → 4. K10 confirm modal → 5. a11y pass (font scaling, contrast, Android back nav §20) → 6. commit

---

### P13 — Offline, edge cases, demo mode

**Accept:** §55 scenarios 2, 5, 6, 7, 8, 9, 10 all pass; demo runs deterministically.

**Work**
- §36 offline: cached companion, banner, disabled actions, reconciliation chain on reconnect
- §37 full error matrix: MWA reject/expire · Genesis not found · indexer down · wallet switch · duplicate webhook · out-of-order · failed tx · stale stake · security unavailable · XP race · 3D failure
- §44 **demo mode** — deterministic scripted sequence through the *same* engine: swap → aura → XP → stake → energy → security → shield → level-up → evolution → WYWA. Gated, separate config, never shown in a production build.

**Read:** spec §36, §37, §44, §55
**Do:** 1. offline store + banner → 2. reconciliation chain → 3. error states as components → 4. work §37 **item by item** → 5. demo sequence + replay test → 6. run full §55 → 7. commit

**Risk:** this phase gets cut under time pressure. It is what separates a demo from a product — keep it.

---

### P14 — Hardening + submission

**Accept:** §48 acceptance criteria all green; store-ready build.

**Work**
- §43 test suites complete (unit / integration / mobile / blockchain)
- Analytics §42 (onboarding completion, D1/D7, 3D load failures, sync failures — **never** transaction volume)
- Real Seeker device matrix: cold/warm start, poor network, revoked auth, background/foreground, low battery, portrait-first rotation (§20)
- Production APK/AAB + dApp Store publication
- README, architecture diagram, **asset licenses** (§50), demo script

**Read:** spec §43, §48, §50 · `docs.solanamobile.com`
**Skills:** `solana-mobile-publishing` (read early, execute late — App NFT setup is irreversible), `solana-mobile`
**Need:** publisher account decision, final icon + screenshots, GLB finalized

**Do:** 1. full test run → 2. a11y + copy audit → 3. on-device perf pass → 4. analytics wired → 5. release build → 6. store metadata → 7. licenses → 8. §48 checklist sign-off → 9. commit + tag

---

## 5. AGENT WORKING RULES

1. **One phase = one commit series.** `npm run ci` green before a phase is called done.
2. **Read the skill before the phase**, never from memory — they contain non-obvious specifics.
3. **Contract first** — zod schemas in `packages/contracts` before either side is written.
4. **Say "I don't know" before writing code.** Wherever risk is flagged, spike first.
5. **`docs/decisions.md`** gets an entry for every deviation from the spec, citing the spec section.
6. **No invented data.** No fabricated security scores, no client-side XP (§38.6).
7. **Check in at every phase gate** with Accept status + blockers.
8. **Durable state lives in repo files** (this plan, `decisions.md`, checklists), not conversation memory — sessions restart, files don't.

---

## 6. OPEN QUESTIONS

| # | Question | Default if no answer |
|---|---|---|
| 1 | `git init` — bare local, or a remote URL? | local, `.gitignore`'d properly |
| 2 | Bundle id + display name? | block P0 until answered (cannot ship `com.anonymous.kit_expo_privy`) |
| 3 | FCM (Firebase) or local notifications for V1? | local notifications, FCM deferred to P13+ |
| 4 | Economy numbers approved as spec'd? | use spec defaults, flag in `decisions.md` as unratified |

---

**End of plan. Awaiting go-ahead for P0.**
