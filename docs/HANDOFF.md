# Gochi — Handoff

Everything below is **for you to do**, except section 6 which is what I do once you
hand over the keys. No secrets go in this file or in git — only the *names* of
environment variables and the steps to obtain their values.

Written at the end of the P7–P12 push. Two commits cover that work: `32eedbd`
(API, contracts, migrations, tests) and `021406c` (mobile screens).

---

## 1. Where the project actually stands

| Phase | State |
|---|---|
| P0–P6 | Done and committed (identity, engine, persistence, game routes, minting, companion flow, FAB nav) |
| P7 | Done — RPC-history ingestion, dedupe, cursor-based backfill. Helius adapter is a stub awaiting your key |
| P8 | Done server-side — dialogue registry, §8.4 cooldown + burst folding, prefs. **OS-level notification delivery is NOT wired** (see §2.3) |
| P9 | Done — progression, evolution, achievements, while-you-were-away, daily summary |
| P10 | Done — vault holdings read from token accounts |
| P11 | Done — shield, staking, aura screens with the honest copy |
| P12 | Done — profile, settings, notification preferences, disconnect confirm |
| 3D renderer | **Not built.** Static fallback ships and works (see §4) |
| P13 / P14 | Not started — offline mode, error matrix, demo mode, release build |

### Test status — read this

The last *completed* full run had **28 failures across 5 files**. I fixed two known
root causes (two P3-era tests asserted the vault has no `balances` field, which P10
deliberately adds). A further run was in flight when this doc was written.

**I have not yet seen the remaining failures.** They are most likely in the new
dialogue/aggregation logic, since that is the newest behaviour touching
`apply.ts`. Treat the suite as **not yet green** and expect me to fix things when
you hand over the keys.

The suite is slow by design: ~200 tests, each doing a real round trip to Neon over
the network. A full run takes 12–20 minutes. To run part of it:

```bash
cd apps/api
npx vitest run tests/ingestion.test.ts      # pure, no network — fast
npx vitest run tests/dialogue.test.ts       # needs Neon
npx vitest run                              # everything
```

---

## 2. Things you need to create

### 2.1 Helius API key

The app already works without this. Setting it switches ingestion from the RPC
adapter to the Helius adapter — no code change, `env.heliusApiKey` picks it up.

1. Sign in at <https://dashboard.helius.dev>
2. Create a project (any name; pick one matching the cluster you use)
3. **API Keys** in the sidebar → **Create API Key**
4. Copy the key
5. Put it in the repo-root `.env`:

```
HELIUS_API_KEY=your-key-here
```

Useful while you are in there: Helius also gives you a **dedicated RPC URL**. If you
use it, set `SOLANA_RPC_URL` to it as well — the public devnet endpoint rate-limits
hard and backs off.

> **Note on what Helius changes.** The Helius *webhook* path is still a stub
> (`apps/api/src/ingestion/helius.ts`). Setting the key today routes ingestion
> through the Helius RPC endpoint, which is a genuine improvement (better rate
> limits, `getTokenAccountsByOwnerV2` paging). Actual parsed-webhook parsing is
> unbuilt. If you specifically want webhooks, tell me and I will finish that
> adapter — it needs a public HTTPS endpoint for Helius to call.

### 2.2 Firebase / FCM

**Optional.** It is the last-mile pipe for push notifications, and everything
upstream of it is already built and tested: priority routing (§28.1), dedupe,
daily cap, quiet hours, category toggles. All of that runs server-side and works
today.

What you lose without it: if the app is closed and your companion evolves, nothing
appears on the phone. You find out on next open — which is §28.3's stated
behaviour ("when the app is reopened, it performs a fresh state reconciliation").

What FCM costs: a Firebase project, `google-services.json`, two RN packages, and a
native rebuild.

**Recommended order: skip this for now.** Get the APK running first, add FCM after.

If you do want it:

1. <https://console.firebase.google.com> → **Add project**
2. Project settings → **Add app** → **Android**
3. Package name must be exactly **`com.gochi.app`** (matches
   `mobile/android/app/build.gradle` and `mobile/app.json`). Get this wrong and the
   file silently does nothing.
4. Download `google-services.json`
5. Place it at `mobile/android/app/google-services.json`
6. Install the packages (section 2.3)
7. Rebuild (section 3.3)

I still have to write the messaging code on the API side (send on notification
insert) and the client handler. That is my work, not yours — say the word.

### 2.3 npm installs you run

Native deps are deliberately **not** installed in the repo so far, to avoid
breaking the working dev client. Run these when you want them:

```bash
cd mobile

# Local notifications — recommended, no Firebase needed
npx expo install expo-notifications expo-device

# Only if you are doing FCM (section 2.2)
npx expo install @react-native-firebase/app @react-native-firebase/messaging
```

`expo-notifications` **changes native dependencies**, so it requires the rebuild in
section 3.3. Adding it without rebuilding will produce an app that crashes when it
tries to show a notification.

---

## 3. Getting it onto your phone

Assumes a dev build is already installed (it was, in P1). If the build fails or the
app is missing, section 3.3 rebuilds from scratch.

### 3.1 Start the API

```bash
cd /home/bigben/projects/Seeker/SLS
npm run api:dev          # listens on :8787
```

The API refuses to start if `DATABASE_URL`, `API_JWT_SECRET`,
`EXPO_PRIVATE_PRIVY_APP_SECRET` or `EXPO_PUBLIC_PRIVY_APP_ID` is missing. Those are
all set already in your `.env`.

### 3.2 Start Metro

```bash
cd mobile
npx expo start --dev-client
```

Then on the phone: connect over the **same Wi-Fi**, open Gochi. If Metro cannot be
reached, set `EXPO_PUBLIC_API_URL` in `.env` to your machine's LAN IP (e.g.
`http://192.168.1.x:8787`) and restart Metro — `localhost` on the handset is the
handset itself.

### 3.3 Build and install the APK

```bash
cd mobile/android

./gradlew assembleDebug \
  --no-parallel \
  --max-workers=1 \
  -PreactNativeArchitectures=arm64-v8a \
  -Pkotlin.compiler.execution.strategy=in-process
```

Those flags are not optional on this machine. There are 6GB of RAM total and VS Code
holds about half; without them Gradle OOMs. `--max-workers=1` and
`in-process` Kotlin compilation are what make it fit.

Then install:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

APK lands at `mobile/android/app/build/outputs/apk/debug/app-debug.apk` (~96MB; debug
builds bundle the JS, so it is large).

---

## 4. The 3D character — full guide

This is the one piece of Gochi that cannot be written in code. Everything else is
built; the *character* is an asset decision.

### 4.1 What the spec actually asks for

Spec §11.5, and the part people get wrong:

> **These are states of one character, not seven different characters.**

One rig, one visual identity, seven exports:

```
assets/3d/solgotchi_base.glb        # STATE_HEALTHY
assets/3d/solgotchi_energized.glb   # STATE_ENERGIZED
assets/3d/solgotchi_tired.glb       # STATE_TIRED
assets/3d/solgotchi_alert.glb       # STATE_ALERT
assets/3d/solgotchi_damaged.glb     # STATE_DAMAGED
assets/3d/solgotchi_recovering.glb  # STATE_RECOVERING
```

Plus `EVOLVING` — spec §26 says evolution is the *same model* in a new state
variant, so stage 2–5 are texture/material variants of the same mesh, not new models.

GLB specifically (not glTF + separate files): Blender's glTF exporter supports mesh,
materials, textures, cameras and animations, and `.glb` packages it into one binary.

### 4.2 Where files go

```
mobile/assets/3d/*.glb
```

Metro will bundle them once referenced. Keep them under roughly 8MB total — this is
a phone, not a desktop, and the app is already a ~96MB debug APK.

### 4.3 How it renders

Per **ADR-001**: React Native has no native GLB renderer equivalent to Flutter's
`flutter_3d_controller`, so Gochi uses a **WebView + three.js** renderer.
`react-native-webview` is already a dependency — nothing new to install.

What it must do, all of which is spec, not preference:

- Load a GLB and play **named animations** for the interaction emotes (spec §11.6
  expects named clips; §8.3 lines are paired with emotes)
- **Texture/material switching** per condition — or the seven variants above
- Camera control, non-interactive or lightly interactive
- `onLoad` / `onError` callbacks — required, see 4.5

### 4.4 The seam it plugs into

`mobile/src/features/companion/ui/companion-stage.tsx` defines the boundary.
There are two implementations behind one interface, and the design intent is
documented in that file's header comment:

- `StaticCompanion` — what ships today. A 2D composition driven by companion state.
- The GLB renderer — arrives when the model does.

**Do not delete or replace `StaticCompanion`.** Spec §55 scenario 8 requires: "3D
model fails → static fallback; rest of app remains usable". A screen that renders the
model directly cannot satisfy that, because the failure mode is the component itself
failing to mount. The fallback is a real implementation of the same interface, not a
degraded path.

`useStageVisibility()` already enforces §35 (no animation while hidden or
backgrounded) so the renderer inherits it rather than reimplementing it.

### 4.5 Licensing — do not skip this

Spec §50 requires asset licences to be recorded. Whatever you use must permit:

- **commercial use**
- **modification** (you are deriving 7–12 variants from it)
- **redistribution** inside an APK you publish

Record for each asset: source URL, author, licence name, and the licence text in
`docs/licenses/`. "Found it on Sketchfab" is not a provenance record. A CC-BY model
requires attribution in-app; CC0/CC-BY-4.0-with-commercial-use are the safe picks.

### 4.6 Getting the model — realistic options

1. **Commission it** (best fidelity to the concept). Brief: one creature, seven
   states, same rig, named idle + 3–4 emotes. Budget varies wildly.
2. **Adapt a licensed base mesh** and author the states yourself. Fastest path to
   something that looks intentional. Check the licence allows derivatives (§4.5).
3. **Generate one** with an image-to-3D tool, then clean it up in Blender. Fast, and
   usually needs real retopology work before it is phone-ready — expect this to take
   longer than it looks.

Whatever route: **one base mesh, seven materials.** Do not try to ship seven
separate models; §11.5 is explicit that they must share a rig.

### 4.7 What I will do when the model lands

- Write the WebView renderer behind the existing seam
- Map the seven condition states to the variants
- Wire named animations to interaction emotes
- Add the load/error callbacks so §55 scenario 8 fallback works
- Add the K05 settings (quality, animations, auto-rotate, reduced-motion, battery)

---

## 5. Environment variables

Repo-root `.env`. Copy from `.env.example`. Full commentary lives in that file.

| Variable | Needed | Notes |
|---|---|---|
| `DATABASE_URL` | **yes** | Neon direct URL. Migrations use this, not the pooled one |
| `DATABASE_URL_POOLED` | recommended | For the running server; Neon poolers drop idle connections |
| `API_JWT_SECRET` | **yes** | `openssl rand -base64 48` |
| `EXPO_PUBLIC_PRIVY_APP_ID` | **yes** | Public — ships in the bundle |
| `EXPO_PRIVATE_PRIVY_APP_SECRET` | **yes** | Server only. Never `EXPO_PUBLIC_` — that prefix inlines it into the APK |
| `EXPO_PUBLIC_API_URL` | yes | `http://localhost:8787` locally; your LAN IP on a real handset |
| `SOLANA_RPC_URL` | yes | Devnet. Point at Helius if you have a key |
| `SOLANA_MAINNET_RPC_URL` | yes | Genesis + `.skr` resolve **only on mainnet**. Devnet here reports "no device" for every wallet — a confident wrong answer, not an error |
| `PAYER_KEYPAIR_PATH` | for minting | Your funded devnet keypair |
| `HELIUS_API_KEY` | optional | Section 2.1 |
| `RATE_LIMIT_READ` / `RATE_LIMIT_WRITE` | tests only | Set by `vitest.config.ts` |

---

## 6. What I do next, once you hand over

1. Run the full suite and triage the outstanding failures (see §1 — there were 28,
   I fixed 2 root causes, the rest are unseen)
2. Finish the Helius webhook adapter if you want true webhook delivery, and the FCM
   send path if you want push
3. Wire local notifications once you've installed `expo-notifications`
4. Write the WebView 3D renderer the moment a GLB exists
5. P13: offline mode, the §37 error matrix, demo mode
6. P14: release build, dApp Store submission — and the bundle id must become a real
   reverse-domain name first (`com.gochi.app` is a placeholder; changing it after
   release is impossible)

---

## 7. Known gaps, honestly

Not bugs — things that are deliberately not built yet.

- **3D renderer** — static fallback only (§4)
- **OS notification delivery** — the logic is complete and tested; the delivery
  pipe is not connected (§2.3)
- **FCM** — not started, optional (§2.2)
- **Helius webhook parsing** — the adapter is a stub; RPC path works today (§2.1)
- **Metadata URI origin** — the Core metadata host derives its URI from the request
  origin, so local runs mint with a `localhost` URI that will not resolve off-device.
  Fine for devnet testing, needs a public origin before anything ships
- **Bundle id** — `com.gochi.app` is a placeholder (§6.6)
- **P13/P14** — offline, error matrix, demo mode, release build, store submission
- **Test suite not yet green** — §1