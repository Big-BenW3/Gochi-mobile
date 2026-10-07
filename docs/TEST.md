# TEST.md — phone-side checklist

Everything here is run **by hand on the device**. Nothing below needs me.

---

## 0. Before you start (2 minutes)

| # | Check | Expected |
|---|---|---|
| 1 | `cd /home/bigben/projects/Seeker/SLS && npm run api:dev` | `server.listening` on `:8787` |
| 2 | `curl http://localhost:8787/health` | `{"ok":true}` |
| 3 | `cd mobile && npx expo start --dev-client` | Metro QR / dev menu |
| 4 | Phone and laptop on the **same Wi-Fi** | — |

**If the app can't reach the API:** `localhost` on a handset is the handset. Set
`EXPO_PUBLIC_API_URL` in `mobile/.env` to your laptop's LAN IP
(`ip addr | grep "inet "`), then restart Metro.

**For a hosted API:** put the Render URL in `mobile/.env`
(`https://gochi-mobile.onrender.com`) and **rebuild the APK** — this value is
baked in at build time, so restarting is not enough.

---

## 1. The APK check that decides everything (1 minute)

A debug build with `expo-dev-client` installed **does not bundle JavaScript** — it
launches a dev client and waits for Metro. On someone else's phone there is no
Metro, so it shows nothing at all. Confirm yours bundles before you waste an hour
on the rest:

```bash
unzip -l mobile/android/app/build/outputs/apk/debug/app-debug.apk | grep index.android.bundle
```

**Must print a line.** If it's empty, the APK is useless on a judge's phone. Fix:
`debuggableVariants = []` in `mobile/android/app/build.gradle`, then rebuild.

```bash
cd mobile/android && ./gradlew assembleDebug --no-parallel --max-workers=1 \
  -PreactNativeArchitectures=arm64-v8a \
  -Pkotlin.compiler.execution.strategy=in-process
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Flags are mandatory on a 6GB machine — without them Gradle OOMs. Takes ~30 min.

---

## 2. Cold install (2 minutes)

The most realistic judge experience. Metro **not** running.

| # | Action | Expected |
|---|---|---|
| 1 | `adb uninstall com.gochi.app` | — |
| 2 | Install the APK, open it | App launches, **no** dev-menu / "cannot connect" screen |
| 3 | First screen | Auth: "Gochi" + **Continue with Seeker** / **Continue with Google** |
| 4 | Rotate to landscape, back | No crash, layout holds |

---

## 3. Sign in (2 minutes)

**A. Seeker / wallet path** — what judges will use

| # | Action | Expected |
|---|---|---|
| 1 | Tap **Continue with Seeker** | MWA wallet sheet opens |
| 2 | Approve connect | Wallet address shown |
| 3 | Approve sign-in (SIWS) | Proceeds to companion flow |
| 4 | **If your wallet is NOT a Seeker** | Must **not** dead-end. You should reach the companion flow either way — Genesis status is informational, not a gate |

**B. Google path**

| # | Action | Expected |
|---|---|---|
| 1 | Tap **Continue with Google** | Browser/Google sheet → account selected |
| 2 | Returns | Routed to link-wallet |
| 3 | Link a wallet | Completes |

> If step A4 lands on "No Seeker detected", that screen must offer a way onward.
> Genesis is **not** a gate in this build.

---

## 4. Companion creation (3 minutes)

| # | Action | Expected |
|---|---|---|
| 1 | Egg screen → tap to begin | Proceeds |
| 2 | Name screen | Enter a name, continue |
| 3 | Mint / reveal | **Asset mints on devnet.** Spinner, then reveal |
| 4 | Check the reveal screen | Shows an asset address (not "unavailable") |
| 5 | Tutorial screen | 3–4 steps, continue |
| 6 | First sync | Ingest → engine → results |

**If minting says "unavailable":** the server has no payer.
`PAYER_SECRET_KEY_BASE64` must be **300 characters** (base64 of the keyfile JSON
text). A 44-character value is a wallet *address* — public, and unable to sign.

**Verify on devnet:** the asset appears on a devnet explorer under the payer
address, owned by **your** wallet, not the payer.

---

## 5. The companion reacts (3 minutes) ← the demo's core

| # | Action | Expected |
|---|---|---|
| 1 | FAB → **Activity** | Your recent events, newest first |
| 2 | Tap an event | Detail with signature, slot, status |
| 3 | FAB → **Companion** | A line of dialogue, with the trigger noted |
| 4 | FAB → **Progress** | Level, XP bar, XP-to-next, evolution stage |
| 5 | FAB → **Vault** | Asset, wallet, `.skr`, raw balances, custody notice |
| 6 | FAB → **Shield / Staking / Aura** | Each loads; each states what it cannot verify |
| 7 | FAB → **Awards** | Unlocked + locked achievements |
| 8 | Re-run sync | A burst of activity yields **one** summary line, not N |

**If Activity is empty:** expected for a wallet with no recent mainnet swaps, or
one whose last transaction is older than 30 days. Check with:

```bash
cd apps/api && npx tsx -e "
const c=new (require('@solana/web3.js').Connection)('https://mainnet.helius-rpc.com/?api-key=YOUR_KEY','confirmed');
c.getSignaturesForAddress(new (require('@solana/web3.js').PublicKey)('WALLET'),{limit:5}).then(s=>console.log(s.map(x=>x.blockTime)))"
```

---

## 6. Error and empty states (5 minutes)

Every one must offer a way forward. This is what judges poke at.

| # | Action | Expected |
|---|---|---|
| 1 | **Airplane mode** | Offline banner, cached data retained, no crash |
| 2 | Back online, pull to refresh | Recovers without reinstall |
| 3 | Empty FAB screen for a new account | Empty state with an action — not a blank screen |
| 4 | Deny the wallet connection | Explains and offers retry |
| 5 | Expired session | Re-auth path offered |
| 6 | Background the app, return | State reconciles, no duplicate events |

---

## 7. Submission-specific (5 minutes)

| # | Check | Why |
|---|---|---|
| 1 | `adb logcat -c`, then run the full flow, then `adb logcat \| grep -i "error\|exception"` | No unhandled exceptions |
| 2 | Increase system font size to max, revisit each screen | No clipped or overlapping text |
| 3 | Talk through every number on screen | Anything we can't justify out loud comes down |
| 4 | Check the shield screen for a numeric safety score | Must be absent — §58 |
| 5 | Check the vault for a fiat value | Must be absent — §9.3 |
| 6 | Long-press / rapid-tap every button | No duplicate mints, no double XP |

---

## 8. What "broken" looks like, symptom → cause

| Symptom | Likely cause | Fix |
|---|---|---|
| Blank screen, no dev menu | JS not bundled in the APK | `debuggableVariants = []`, rebuild |
| "Cannot reach the server" | `localhost` on the handset | Set LAN IP, restart Metro, **rebuild** |
| Login returns nothing | `mobile/.env` missing/renamed | Must be `mobile/.env` — Expo reads no root `.env` |
| Privy errors | App ID / Client ID wrong for this bundle | Both from `mobile/.env` |
| Mint "unavailable" | No payer on the server | `PAYER_SECRET_KEY_BASE64` = 300 chars |
| Activity always empty | Reading devnet, or no recent swaps | `SOLANA_MAINNET_RPC_URL` must be mainnet |
| First request hangs ~40s | Free-tier host waking | Expected; retry/backoff handles it |
| Typecheck fails on `payerSecretKeyBase64` | `env.ts` missing the export | `optional("PAYER_SECRET_KEY_BASE64")` |

---

## 9. Final acceptance

A fresh install, on a clean device, against the **hosted** API:

- [ ] APK launches with Metro stopped
- [ ] Sign in with a real wallet
- [ ] Companion created and minted on devnet
- [ ] Sync processes real mainnet activity
- [ ] Dialogue appears, no-spam rule holds
- [ ] Progression, vault, pillars, awards all render
- [ ] Airplane mode degrades gracefully
- [ ] No unhandled exceptions in logcat
- [ ] Every failure state offers a recovery path