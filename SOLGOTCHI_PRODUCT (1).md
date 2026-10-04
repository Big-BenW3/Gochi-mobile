# SOLGOTCHI — V1 PRODUCT & ENGINEERING SPECIFICATION

**Working product name:** Solgotchi

**Codename in source material:** Cyber-Companion

**Platform:** Solana Seeker, Android-first

**Primary frontend:** Flutter

**Alternative frontend:** React Native

**Primary V1 goal:** Turn a user's real onchain activity into the state, personality and progression of a persistent 3D cyber companion that lives with them on Seeker.

**V1 asset scope:** One 3D companion character identity only. The same character is reused through animation, material/texture variants and state-driven visual changes. No collection of different character models is required for V1.

**Navigation:** FAB-first. No permanent bottom tab bar.

**V1 status:** Buildable hackathon MVP with production-minded architecture, explicit fallbacks and clear boundaries around features that depend on APIs the app cannot directly observe.

---

## 0. DOCUMENT PURPOSE

This document is the implementation contract for V1. It translates the uploaded Solgotchi concept into a complete product definition with:

- non-technical explanation;
- exact V1 boundaries;
- user journey;
- game/companion model;
- state machine;
- activity-to-state rules;
- functional requirements;
- non-functional requirements;
- complete navigation and screen map;
- modal and nested-screen inventory;
- Flutter architecture;
- React Native alternative;
- Android/Seeker integration;
- Privy authentication option;
- Solana/Metaplex Core architecture;
- backend and event processing;
- 3D character asset pipeline;
- character modification workflow;
- code-driven animation/state changes;
- error and edge-case behavior;
- testing plan;
- development sequence;
- V1 acceptance criteria.

This document deliberately distinguishes **product intent from implementation claims**. Where the original concept assumes a device capability, the build plan includes a verification/fallback path rather than pretending the capability exists.

---

# 1. PRODUCT DEFINITION

## 1.1 One-sentence definition

**Solgotchi is a mobile virtual-pet game for Seeker where the user's real Solana activity gives their 3D companion energy, strength, protection, progression and personality.**

## 1.2 Plain-English explanation

Imagine a virtual pet that lives on your phone, except it is connected to your Solana life.

When something meaningful happens in the user's wallet, the companion reacts.

A successful swap can give the companion combat energy and progression.

Active staking can keep the companion energized.

The Seeker's hardware-backed wallet can be represented as the companion's protection layer.

The user can open the app at any time and see:

> “What happened to my companion while I was away?”

The application is therefore not meant to be a wallet dashboard with a mascot. The **companion is the product** and the blockchain activity is the source of events that make the companion feel alive.

## 1.3 What Solgotchi is

Solgotchi is a **gamified onchain companion / virtual-pet experience**.

It combines:

1. a persistent 3D character;
2. onchain activity interpretation;
3. companion progression;
4. visual state changes;
5. contextual dialogue;
6. an internal companion vault;
7. lightweight game loops such as care, progression, events and state recovery;
8. a Seeker-native wallet connection experience.

## 1.4 What Solgotchi is not

V1 is not:

- a crypto trading terminal;
- a wallet replacement;
- a copy of a generic NFT profile page;
- a financial-advice product;
- a device-security scanner that claims access to security settings it cannot actually observe;
- an always-on background Android process that assumes unrestricted background execution;
- a full MMORPG;
- a full local LLM assistant;
- a DePIN exploration game;
- a multiplayer raid system.

The uploaded concept explicitly places local LLM, DePIN exploration and multisig co-op raids in V2. Those remain out of V1.

---

# 2. PRODUCT PRINCIPLE

## 2.1 Core principle

> **Your activity gives the companion a life.**

The user's blockchain activity should never be shown as a dry list alone. The app translates activity into character consequences.

For example:

**Raw event:** Swap confirmed.

**Product interpretation:** Companion gained combat experience.

**Visible consequence:** Aura intensifies, XP increases, companion reacts.

**Conversation:** “That move gave me a boost.”

This translation layer is the heart of the experience.

## 2.2 The emotional loop

```text
User acts in real life
        ↓
Solana activity occurs
        ↓
Solgotchi notices
        ↓
Companion state changes
        ↓
User returns later
        ↓
Companion explains what happened
        ↓
User interacts with companion
        ↓
User progresses
        ↓
User becomes more attached
```

## 2.3 Why the app can be sticky

The retention mechanism is not a forced streak.

The user returns because the companion has changed.

The important recurring moments are:

- a new transaction happened;
- the companion leveled up;
- energy recovered from staking;
- shield condition changed;
- a major activity event occurred;
- the companion has a new message;
- a new evolution state is available;
- a daily summary is ready.

---

# 3. V1 OBJECT MODEL

The source concept can be expressed as the following object chain:

```text
User
  ↓
Seeker Identity
  ↓
Companion
  ↓
Companion State
  ↓
Activity Events
  ↓
State Engine
  ↓
Visual State + Dialogue + Progression
```

## 3.1 User

Represents the person using Solgotchi.

Fields:

- internal user ID;
- Privy identity ID if Privy auth is used;
- Seeker wallet public key;
- Seeker ID / `.skr` domain if discoverable;
- Genesis verification state;
- notification preferences;
- created timestamp;
- last active timestamp.

## 3.2 Companion

The user's persistent character.

V1 contains exactly one companion per user.

Fields:

- companion ID;
- owner wallet;
- Seeker ID;
- level;
- XP;
- energy;
- shield health;
- shield durability;
- combat rating;
- aura intensity;
- current condition;
- evolution stage;
- last activity timestamp;
- character asset ID if minted;
- metadata URI;
- current dialogue state.

## 3.3 Activity Event

A normalized event that the engine understands.

Types:

- `SWAP`
- `STAKE_DETECTED`
- `STAKE_CHANGED`
- `WALLET_CONNECTED`
- `GENESIS_VERIFIED`
- `SECURE_SIGNING_CONFIRMED`
- `MANUAL_SECURITY_CHECK`
- `SYSTEM_SYNC`
- `DAILY_RESET`
- `DEMO_EVENT`

The exact blockchain parser can identify additional raw events, but the game engine only consumes normalized event types.

---

# 4. V1 CORE GAME SYSTEM

## 4.1 Is it a game?

Yes, but it is best described as a **gamified virtual-pet / companion game**, not a conventional battle game.

The player does not have to fight another player to enjoy the product.

The game is primarily about:

- keeping a companion alive and energetic;
- seeing it react to real activity;
- progressing its level;
- unlocking states;
- caring about its history;
- collecting achievements;
- exploring the companion's vault;
- responding to contextual events.

Multiplayer can be added later without changing the core companion model.

## 4.2 Player skill vs real-world activity

The product must never require the user to make a trade solely to “feed” the pet.

Real activity is an input, not a forced task.

The user should be able to open the app and have a companion even when their wallet has been quiet.

Quiet periods should result in neutral/idle behavior rather than punishment.

## 4.3 Core V1 pillars

### Pillar A — Shield & Durability

Represents the companion's protective layer.

Source intent: relate protection to the Seeker/Seed Vault security environment.

V1 implementation rule:

- never fabricate a security score;
- only display a measurable security-derived value when the platform/wallet API exposes a verifiable signal;
- otherwise show a truthful qualitative state such as `Protected by Seeker Wallet` and use the shield primarily as a gameplay/status visualization.

### Pillar B — Hunger & Vitality

Represents companion energy.

Observable staking activity contributes to recovery/progression.

### Pillar C — Combat Rating & Aura

Represents the companion's activity energy.

Verified swap activity contributes to combat XP and aura changes.

---

# 5. COMPANION STATE MODEL

## 5.1 Core values

All values are normalized to safe application ranges.

| Variable | Range | Purpose |
|---|---:|---|
| Level | 1–50 | Long-term progression |
| XP | 0+ | Progress toward next level |
| Energy | 0–100 | Current vitality |
| Shield Health | 0–100 | Immediate protection state |
| Shield Durability | 0–100 | Longer-term protection condition |
| Combat Rating | 0–1000 | Companion activity rating |
| Aura | 0–100 | Visual activity intensity |
| Evolution | enum | Visual progression stage |

## 5.2 Suggested V1 conditions

| Condition | Meaning | Visual treatment |
|---|---|---|
| `HEALTHY` | Normal active state | Normal idle |
| `ENERGIZED` | Recent positive activity | More movement / stronger aura |
| `TIRED` | Low energy | Slower animation / subdued aura |
| `ALERT` | Important activity or security event | Alert animation |
| `DAMAGED` | Shield state materially reduced | Damage overlay / armor wear |
| `RECOVERING` | Recent recovery event | Healing animation |
| `EVOLVING` | Threshold reached | Evolution sequence |
| `SLEEPING` | Extended inactivity / night mode | Sleep animation |

These are game states, not claims about the security or health of the real person.

---

# 6. LEVEL SYSTEM — V1

## 6.1 Purpose

Levels provide a long-term progression path from **Level 1 to Level 50**.

Level is separate from any future competitive rank.

A level answers:

> “How much time and activity have I invested in my companion?”

A future ranked mode would answer:

> “How competitive am I?”

## 6.2 XP sources

V1 XP sources:

- validated swap event;
- validated staking state/event;
- validated security interaction/signer state where measurable;
- first daily app visit;
- companion interaction;
- completing a small companion task;
- discovering a new event type;
- recovering the companion from a low-energy state;
- demo-mode scripted activity during hackathon demonstration only.

XP must have daily caps for repetitive event classes so a burst of micro-transactions cannot create uncontrolled progression.

## 6.3 XP curve

Use a deterministic formula instead of 50 manually configured thresholds.

Recommended V1:

```text
xp_to_next_level(level) = floor(120 + 80 * level + 12 * level^2)
```

This produces increasing requirements without making the early game too slow.

The backend is authoritative for XP.

## 6.4 Level-up experience

When the user crosses a threshold:

1. persist new level;
2. persist overflow XP;
3. create `LEVEL_UP` event;
4. notify client;
5. play level-up animation;
6. show celebration modal;
7. optionally unlock a cosmetic state/effect;
8. write level-up to history.

Level-up must be idempotent.

A repeated webhook must never grant the reward twice.

---

# 7. ACTIVITY ENGINE

## 7.1 Why an activity engine exists

The app should not put blockchain parsing logic inside Flutter widgets.

Raw chain activity enters the backend, is normalized once, and then passed to the game engine.

```text
Blockchain
   ↓
Ingestion
   ↓
Normalization
   ↓
Validation
   ↓
Deduplication
   ↓
Game Rule Engine
   ↓
Companion State Update
   ↓
Event + Notification
```

## 7.2 Swap activity

A validated swap can affect:

- XP;
- combat rating;
- aura;
- recent activity count;
- contextual dialogue;
- temporary energized state.

Example rule:

```text
base_xp = 40
frequency_multiplier = min(2.0, 1 + daily_swap_count * 0.05)
final_xp = min(100, round(base_xp * frequency_multiplier))
```

Use a daily XP cap, for example 300 XP from swaps, configurable from backend.

The exact economics should be server configuration, not Flutter constants.

## 7.3 Staking activity

Staking can affect:

- energy recovery;
- daily passive XP;
- vitality state;
- dialogue.

Suggested rule:

```text
if active_stake_detected:
    energy_recovery = +20 once per daily cycle
    passive_xp = +25 once per daily cycle
else:
    no staking bonus
```

Do not award the bonus every time the same stake account is read.

Award based on a daily state snapshot.

## 7.4 Security / Seed Vault pillar

The source concept describes Seed Vault verification as the shield layer.

Implementation must distinguish three states:

### Confirmed

A platform-supported signal proves the relevant wallet/security condition.

### Inferred/limited

The wallet is known to be a Seed Vault wallet, but there is no supported API for deeper security inspection.

UI wording:

> “Protected by Seeker Wallet”

rather than:

> “Security score: 87%”

### Unknown

The app cannot verify the required condition.

UI should show:

> “Security status unavailable.”

with a retry option.

Never invent attestation data.

## 7.5 Daily state decay

The companion should not become a punishment machine.

Recommended V1 decay:

- Energy decays slowly while wallet activity is inactive;
- Shield durability does not randomly decay simply because the user did not transact;
- health can enter `TIRED`, but never permanently dies;
- no irreversible loss;
- no forced real-world financial action.

Example:

```text
energy_decay = 4 points / 24 hours of inactivity
minimum_energy = 20
```

The minimum prevents the companion from becoming unusable.

---

# 8. CONTEXTUAL DIALOGUE ENGINE

## 8.1 V1 definition

V1 uses a **template/rule-driven contextual dialogue engine**, not a hosted LLM or on-device LLM.

The original concept places a full local LLM in V2.

## 8.2 Dialogue inputs

- event type;
- companion condition;
- level;
- recent activity count;
- energy;
- shield status;
- time of day;
- last interaction;
- last message ID.

## 8.3 Dialogue example

Swap:

> “That move gave me a boost.”

Staking:

> “I feel the extra energy.”

Level-up:

> “We are getting stronger.”

Long inactivity:

> “You have been quiet. I am still here.”

Recovery:

> “Shield restored. Back online.”

These messages should be authored, short and character-consistent.

## 8.4 No spam rule

The companion must not send a message for every micro-event.

Use:

- cooldown windows;
- event aggregation;
- severity thresholds;
- daily notification caps.

Example:

If 10 swaps happen within five minutes, create one summary event:

> “You made 10 moves. I definitely noticed.”

instead of 10 notifications.

---

# 9. MINI-VAULT

## 9.1 Purpose

The Mini-Vault is the companion's visual storage area.

It should feel like a room/locker/vault belonging to the companion, not a generic wallet screen.

## 9.2 V1 contents

Display:

- companion asset status;
- wallet address, truncated;
- selected token/asset summaries;
- recent protected activity;
- companion ownership information;
- onchain companion asset if minted.

## 9.3 Security boundary

The Mini-Vault must not imply that Solgotchi holds custody of user funds.

The user wallet remains the source of ownership.

The companion vault is a visualization and/or app-controlled state account, not a replacement for Seed Vault Wallet.

---

# 10. COMPANION ASSET MODEL

## 10.1 Recommended V1 asset

Use **Metaplex Core** for the collectible companion asset where an onchain asset is required.

Metaplex Core currently uses a single-account NFT model, supports metadata URIs and plugins, and is documented as the recommended NFT standard for new projects. citeturn764573view2turn764573search3

## 10.2 Important distinction

The 3D model is **not stored inside the Solana account**.

The onchain asset points to metadata.

Typical flow:

```text
Core Asset
   ↓
Metadata URI
   ↓
JSON metadata
   ↓
3D model / images / animation references
```

Use permanent/decentralized metadata storage when practical.

## 10.3 Starter Egg

Source intent:

> User connects, verifies Seeker identity, then mints a Soulbound Starter Egg / companion.

V1 implementation decision:

- the app may call the object a “Starter Egg” in UX;
- true soulbound/non-transferable behavior should only be claimed after the chosen Solana asset/program mechanism is implemented and tested;
- if the hackathon does not require transfer blocking, use a normal Core Asset and clearly document the intended ownership model.

Metaplex Core supports transfer controls/delegation through plugins, but a “soulbound” claim must be enforced by actual program/asset configuration rather than UI wording. citeturn764573search6turn764573view2

---

# 11. ONE 3D CHARACTER V1

## 11.1 Character policy

V1 uses **one character identity only**.

Do not spend hackathon time creating multiple species or multiple base characters.

Instead, make one character feel alive through:

- animation;
- material state;
- aura;
- armor visibility/state;
- eye state;
- damage/recovery effects;
- scale/pose changes;
- particle overlays;
- camera framing.

## 11.2 Recommended base source

Recommended source: **Quaternius Universal Base Characters**.

The current pack provides six game-ready humanoid bases, glTF/FBX/OBJ/Blend formats, humanoid rigging and an average of about 13k triangles; Quaternius lists the pack as CC0 and usable in personal, educational and commercial projects. citeturn810762search0turn810762search1

Official sources:

- https://quaternius.com/packs/universalbasecharacters.html
- https://quaternius.itch.io/universal-base-characters

Recommended starting file for a simple cyber companion prototype:

```text
Base Characters/Godot - UE/Superhero_Male_FullBody.gltf
```

The specific filename/path is an implementation convenience; verify the downloaded pack contents because asset packs can change.

## 11.3 Why this source

It removes two unnecessary blockers:

1. buying a character before the concept is proven;
2. building a humanoid rig from scratch.

The pack already provides an animation-friendly humanoid rig and glTF output. citeturn810762search0

## 11.4 Animation source

Use **Quaternius Universal Animation Library** first.

The current library contains 120+ animations with a humanoid rig, combat, locomotion and emotes, and is listed as CC0; the current changelog shows updates through September 2026. citeturn810762search2

Official sources:

- https://quaternius.com/packs/universalanimationlibrary.html
- https://quaternius.itch.io/universal-animation-library

Mixamo is an alternative for humanoid animations. Adobe states that Mixamo characters and animations can be used royalty-free in personal, commercial and non-profit projects, subject to its service terms and workflow constraints. citeturn976993search1

## 11.5 Character editing workflow

### Step 1 — Download

Download the free CC0 Universal Base Characters standard pack.

### Step 2 — Open in Blender

Use Blender as the source-of-truth 3D editor.

### Step 3 — Rename important nodes

Use predictable node names:

```text
Character_Root
Body
Head
Eyes
Armor_Core
Armor_Shoulders
Armor_Chest
Shield_Ring
Aura_Core
Damage_Crack_L
Damage_Crack_R
Weapon_Core
```

### Step 4 — Rename materials

```text
MAT_Body
MAT_Eyes
MAT_Armor
MAT_Shield
MAT_Aura
MAT_Damage
MAT_Weapon
```

### Step 5 — Prepare animations

Use these animation names:

```text
Idle
Wake
Happy
Concerned
Alert
EnergyPulse
Hit
Recover
Victory
Defeat
Sleep
Wave
Interact
Evolution
```

### Step 6 — Build visual states

At minimum create these V1 visual states from the same character:

```text
STATE_HEALTHY
STATE_ENERGIZED
STATE_TIRED
STATE_ALERT
STATE_DAMAGED
STATE_RECOVERING
STATE_EVOLVING
```

These are **states of one character**, not seven different characters.

### Step 7 — Export GLB

Use GLB for runtime delivery.

Blender's glTF exporter supports meshes, materials, textures, cameras and animations, and a `.glb` packages mesh/texture data into a single binary file. citeturn673859search2turn673859search3

Recommended output:

```text
assets/3d/solgotchi_base.glb
assets/3d/solgotchi_energized.glb
assets/3d/solgotchi_tired.glb
assets/3d/solgotchi_alert.glb
assets/3d/solgotchi_damaged.glb
assets/3d/solgotchi_recovering.glb
```

All files must use the same character rig and visual identity.

## 11.6 V1 renderer strategy

### Recommended Flutter approach

Use `flutter_3d_controller` for the hackathon first.

The currently published package supports GLB/glTF, loading from assets, named animation playback, texture switching, camera control and load/error callbacks on Android. citeturn304997search0turn304997search2

Example:

```dart
final controller = Flutter3DController();

Flutter3DViewer(
  controller: controller,
  src: 'assets/3d/solgotchi_base.glb',
  enableTouch: true,
  onProgress: (value) {
    debugPrint('3D loading: $value');
  },
  onLoad: (src) {
    debugPrint('Loaded $src');
  },
  onError: (error) {
    debugPrint('3D error: $error');
  },
);
```

Animation:

```dart
controller.playAnimation(animationName: 'Happy');
```

## 11.7 State change through code

For V1, prefer **state-specific local GLB variants** rather than assuming the Flutter package exposes arbitrary scene-node/material mutation.

Example state mapping:

```dart
enum CompanionVisualState {
  healthy,
  energized,
  tired,
  alert,
  damaged,
  recovering,
}

String modelForState(CompanionVisualState state) {
  switch (state) {
    case CompanionVisualState.healthy:
      return 'assets/3d/solgotchi_base.glb';
    case CompanionVisualState.energized:
      return 'assets/3d/solgotchi_energized.glb';
    case CompanionVisualState.tired:
      return 'assets/3d/solgotchi_tired.glb';
    case CompanionVisualState.alert:
      return 'assets/3d/solgotchi_alert.glb';
    case CompanionVisualState.damaged:
      return 'assets/3d/solgotchi_damaged.glb';
    case CompanionVisualState.recovering:
      return 'assets/3d/solgotchi_recovering.glb';
  }
}
```

Then combine the model swap with animation:

```dart
void reactToEvent(ActivityEvent event) {
  switch (event.type) {
    case ActivityType.swap:
      state = CompanionVisualState.energized;
      controller.playAnimation(animationName: 'Happy');
      break;
    case ActivityType.stakeDetected:
      state = CompanionVisualState.recovering;
      controller.playAnimation(animationName: 'Recover');
      break;
    case ActivityType.securityAlert:
      state = CompanionVisualState.alert;
      controller.playAnimation(animationName: 'Alert');
      break;
    default:
      controller.playAnimation(animationName: 'Idle');
  }
}
```

This is deliberately simple and deterministic.

## 11.8 Later renderer upgrade

If the team needs real-time mesh-node/material toggles later, move the 3D view behind an explicit renderer interface.

```text
CompanionRenderer
      ↓
Flutter3DRenderer
      ↓
NativeAndroidRenderer (future)
```

The rest of the app should not know which renderer is underneath.

## 11.9 3D asset quality gates

Before accepting a model:

- valid GLB/glTF;
- no missing textures;
- animation names present;
- character centered;
- sensible scale;
- no broken normals;
- no unexpected external network dependency;
- file loads from local asset bundle;
- no more detail than necessary for Seeker mobile;
- no accidental cameras/lights unless needed;
- no huge texture atlases;
- license record stored in repository.

Run the glTF Validator before committing final models.

---

# 12. ASSET REPOSITORY STRUCTURE

Use this exact structure:

```text
assets/
  branding/
    logo.svg
    logo_mark.svg
    logo_white.svg
    app_icon_512.png
    app_icon_adaptive_foreground.png
    app_icon_adaptive_background.png

  3d/
    solgotchi_base.glb
    solgotchi_energized.glb
    solgotchi_tired.glb
    solgotchi_alert.glb
    solgotchi_damaged.glb
    solgotchi_recovering.glb
    solgotchi_preview.png
    solgotchi_card.png

  backgrounds/
    onboarding_01.webp
    onboarding_02.webp
    home_backdrop.webp
    vault_backdrop.webp

  icons/
    shield.svg
    energy.svg
    aura.svg
    xp.svg
    vault.svg
    activity.svg
    settings.svg
    notification.svg
    help.svg

  effects/
    aura_ring.webp
    energy_burst.webp
    shield_pulse.webp
    level_up.webp

  audio/
    tap.wav
    level_up.wav
    alert.wav
    reward.wav
    evolution.wav

  licenses/
    QUATERNIUS-LICENSE.txt
    ASSET-SOURCES.md
```

The exact visual files should remain in the repository so the coding agent never has to invent placeholders.

---

# 13. BRANDING ASSET SPECIFICATION

## Required logo files

Provide:

- full wordmark SVG;
- symbol-only SVG;
- white wordmark;
- monochrome version;
- transparent PNG 1024 px;
- app icon 512 px;
- adaptive Android foreground/background assets.

## Wordmark rules

The logo must be readable at small sizes.

The symbol should work independently as:

- FAB center icon;
- launcher icon;
- notification icon where Android permits;
- avatar;
- loading mark.

Do not rely on text embedded in the launcher icon.

---

# 14. NAVIGATION MODEL — FAB FIRST

## 14.1 No permanent bottom tab bar

The main home screen is dominated by the companion.

A **Floating Action Button** exposes the app's major areas.

## 14.2 Primary FAB

Collapsed:

```text
             [ + ]
```

Expanded:

```text
              [ ✕ ]

       [ Activity ]

 [ Vault ]       [ Messages ]

       [ Profile ]

              [ Home ]
```

The exact layout can adapt to one-hand ergonomics.

## 14.3 FAB actions

### Companion
Returns to the main companion home.

### Activity
Opens the event/activity center.

### Vault
Opens Mini-Vault.

### Messages
Opens companion dialogue/history.

### Profile
Opens profile, progression and settings.

## 14.4 Secondary navigation

Secondary screens may use:

- top-left back button;
- contextual top-right action;
- modal bottom sheet;
- full-screen modal;
- nested stack navigation.

Avoid introducing an accidental second navigation system.

---

# 15. USER JOURNEY — END TO END

## Journey A — First launch

```text
App launch
  ↓
Splash
  ↓
Onboarding 1
  ↓
Onboarding 2
  ↓
Authentication
  ↓
Continue with Seeker
  ↓
MWA authorization
  ↓
Seeker identity resolution
  ↓
Genesis verification
  ↓
Starter Egg
  ↓
Egg opening
  ↓
Companion birth
  ↓
Name companion
  ↓
Short tutorial
  ↓
Companion Home
```

## Journey B — Google/Privy

```text
Authentication
  ↓
Continue with Google
  ↓
Privy authentication
  ↓
Create/restore app account
  ↓
Connect Seeker Wallet
  ↓
MWA
  ↓
Seeker identity + Genesis verification
  ↓
Continue normal companion flow
```

Google auth alone must not falsely imply Seeker ownership.

If no Seeker wallet is linked, the user may enter a **preview/demo state** but cannot claim a real Seeker-bound companion.

Privy currently supports social authentication including Google, Solana wallet connections and multiple client SDKs including Flutter/Android/React Native; exact SDK behavior should be pinned to the current package version during implementation. citeturn825250search1turn825250search2turn825250search13

## Journey C — Returning user

```text
Launch
  ↓
Fast session restore
  ↓
Companion home
  ↓
Sync latest state
  ↓
If meaningful events:
    While You Were Away
  ↓
User explores companion / activity / vault
```

## Journey D — Onchain activity happened while app was closed

```text
Wallet activity
  ↓
Helius / RPC ingestion
  ↓
Normalize
  ↓
Validate
  ↓
Deduplicate
  ↓
Game state update
  ↓
Notification policy
  ↓
User opens app
  ↓
Event summary
  ↓
Companion reaction
```

Helius currently offers webhook and streaming infrastructure for Solana activity, including parsed transaction types and wallet activity. Its current Parsed Streams/Parsed Events products are in open beta, so the integration must be isolated behind an ingestion interface and backed by a history-sync fallback. citeturn702511search2turn702511search5

---

# 16. SCREEN INVENTORY

V1 should contain enough screens to feel like a finished product without turning into feature bloat.

## A. Launch & onboarding

### A01 — Splash Screen

Purpose:

- establish brand;
- initialize local storage;
- restore session;
- initialize 3D asset/cache;
- check network.

States:

- loading;
- restored session;
- first install;
- offline.

Actions:

- none for normal user;
- retry on hard initialization error.

### A02 — Onboarding Screen 1: Your Companion

Message:

> “Meet the companion that lives with your wallet.”

Visual:

3D character preview.

Actions:

- Next;
- Skip.

### A03 — Onboarding Screen 2: Your Activity Gives It Life

Explain:

- swaps affect combat/aura;
- staking supports vitality;
- Seeker security powers the shield.

Actions:

- Get Started;
- Back.

### A04 — Authentication

Actions:

- Continue with Seeker;
- Continue with Google;
- Terms;
- Privacy.

### A05 — Seeker Connection Loading

States:

- connecting;
- wallet unavailable;
- MWA declined;
- timeout.

### A06 — Privy Google Authentication

Web/SDK handoff screen.

States:

- signing in;
- success;
- cancelled;
- failed.

### A07 — Link Seeker Wallet

For Google-auth users.

Actions:

- Connect Seeker Wallet;
- Continue in Preview Mode.

### A08 — Genesis Verification

Shows:

- checking;
- verified;
- not detected;
- retry.

### A09 — Genesis Not Detected

Explain what is required without exposing technical jargon.

Actions:

- Retry;
- Open Wallet;
- Continue Demo/Preview if allowed.

### A10 — Starter Egg

Large egg/companion shell.

Actions:

- Activate Egg.

### A11 — Companion Birth Reveal

Full-screen 3D reveal.

Action:

- Continue.

### A12 — Name Your Companion

Input:

- companion name;
- suggested generated name;
- validation.

Actions:

- Save;
- Randomize.

### A13 — First Companion Tutorial

Three short coach marks:

1. Companion state;
2. Activity events;
3. FAB navigation.

### A14 — First Sync

Progress:

- Wallet connected;
- Identity resolved;
- Companion initialized;
- Activity synchronized.

Action:

- Continue.

---

## B. Main companion experience

### B01 — Companion Home

This is the primary screen.

Contents:

- large 3D companion;
- companion name;
- level;
- XP progress;
- condition badge;
- energy;
- shield;
- aura/combat rating;
- latest event;
- compact “while you were away” teaser if relevant;
- FAB.

Interactions:

- tap companion;
- drag/rotate companion;
- tap energy;
- tap shield;
- tap aura/combat;
- open FAB.

### B02 — Companion Focus

Expanded 3D mode.

Actions:

- rotate;
- zoom;
- interact;
- play idle/emote;
- back.

### B03 — Companion Stats

Displays:

- level;
- XP;
- energy;
- shield health;
- shield durability;
- combat rating;
- aura;
- evolution stage;
- last update.

### B04 — Condition Detail

Explains why the companion is in its current state.

Example:

> “Energized because you completed a recent swap.”

### B05 — While You Were Away

Shows aggregated changes since last meaningful visit.

Sections:

- activity summary;
- state changes;
- XP gained;
- level change;
- dialogue.

### B06 — Daily Companion Summary

Daily summary independent of notifications.

Shows:

- total events;
- XP;
- energy change;
- shield change;
- biggest event;
- current condition.

---

## C. Activity

### C01 — Activity Center

Event categories:

- all;
- swaps;
- staking;
- protection;
- system.

Each item shows:

- event title;
- timestamp;
- impact on companion;
- expandable details.

### C02 — Activity Event Detail

Shows:

- human-readable event;
- original transaction signature when applicable;
- event type;
- detected time;
- game impact;
- processing status.

### C03 — Activity Sync Status

Shows:

- last successful sync;
- blockchain connection;
- ingestion status;
- retry.

### C04 — Transaction Detail

Only for relevant onchain transactions.

Show:

- signature;
- source program/type when available;
- time;
- status;
- companion impact.

Do not expose excessive raw transaction internals by default.

---

## D. Shield / security

### D01 — Shield Overview

Shows:

- shield health;
- durability;
- current protection state;
- latest supporting signal;
- last checked time.

### D02 — Shield History

Timeline of shield state changes.

### D03 — Security Status Detail

Explains:

- what Solgotchi can verify;
- what it cannot verify;
- why a status changed.

### D04 — Security Check Retry

Manual retry state.

### D05 — Security Unavailable

Safe fallback.

Copy must avoid unsupported claims.

---

## E. Staking / vitality

### E01 — Vitality Overview

Shows:

- energy;
- staking contribution;
- recovery progress;
- recent vitality events.

### E02 — Staking Detail

Shows:

- active staking detected or not;
- last sync;
- staking accounts if safely readable;
- effect on companion.

### E03 — Energy History

Timeline/chart-like history.

### E04 — Vitality Rules

Simple explanation of how staking affects the companion.

---

## F. Swap / combat aura

### F01 — Combat Aura Overview

Shows:

- combat rating;
- aura intensity;
- recent swap-derived events;
- XP from swaps.

### F02 — Aura History

Recent aura changes.

### F03 — Combat Rating Rules

Simple explanation.

No trade recommendation.

---

## G. Mini-Vault

### G01 — Companion Vault

Visual vault screen.

Shows:

- companion asset;
- wallet ownership;
- selected assets/items;
- collection status;
- recent vault events.

### G02 — Vault Asset Detail

Shows:

- asset name;
- symbol;
- ownership wallet;
- current role in companion vault;
- transaction history.

### G03 — Companion NFT/Asset Detail

Shows:

- Core asset ID;
- metadata URI;
- collection;
- owner;
- mint status;
- explorer link.

### G04 — Vault Activity

Vault-specific history.

---

## H. Dialogue / companion chat

### H01 — Companion Chat Home

Shows recent contextual conversations.

### H02 — Conversation Thread

Timeline of:

- companion messages;
- activity-triggered messages;
- user responses;
- system events.

### H03 — Suggested Replies

Simple authored choices such as:

- “What happened?”
- “How are you feeling?”
- “Show my activity.”

### H04 — Conversation Context

Explains why the companion produced a message.

Example:

> “This message was triggered by your latest confirmed swap.”

---

## I. Progression

### I01 — Progression Overview

Shows:

- level;
- XP;
- next level;
- unlocked states;
- milestone list.

### I02 — Level Detail

Shows level history.

### I03 — Level-Up Celebration

Full-screen/large modal.

### I04 — Evolution Overview

Shows current stage and next evolution threshold.

### I05 — Evolution Reveal

Visual sequence.

### I06 — Achievements

V1 achievement categories:

- first connection;
- first activity;
- first level-up;
- 7-day companion presence;
- first staking detection;
- first swap event;
- shield recovery;
- aura milestone;
- companion level milestones.

### I07 — Achievement Detail

Shows unlock condition and date.

---

## J. Notifications

### J01 — Notification Center

Filters:

- all;
- companion;
- activity;
- progression;
- system.

### J02 — Notification Detail

Shows complete event/message.

### J03 — Notification Preferences

Controls:

- companion events;
- level-ups;
- important wallet activity;
- daily summary;
- quiet hours.

---

## K. Profile & settings

### K01 — Profile

Shows:

- Seeker name;
- truncated wallet;
- companion;
- level;
- total XP;
- achievements;
- account state.

### K02 — Wallet & Seeker Identity

Shows:

- connected wallet;
- Seeker ID;
- Genesis status;
- connection state.

### K03 — Connection Management

Actions:

- reconnect;
- switch supported account;
- disconnect.

### K04 — Settings

Sections:

- account;
- notifications;
- 3D performance;
- privacy;
- network;
- support;
- about.

### K05 — 3D Performance Settings

Controls:

- model quality;
- animations;
- auto-rotate;
- reduced motion;
- battery mode.

### K06 — About

Shows:

- version;
- build;
- Solgotchi program IDs;
- asset licenses;
- open-source acknowledgments.

### K07 — Help & Support

FAQ and issue reporting.

### K08 — Privacy / Data

Explains:

- wallet public-key usage;
- activity processing;
- notifications;
- data deletion where applicable.

### K09 — Terms

Legal content.

### K10 — Disconnect Confirmation

Destructive confirmation modal.

---

# 17. MODALS, BOTTOM SHEETS AND NESTED STATES

The following must exist even when they are implemented as reusable components rather than standalone route files.

## Global

1. Connection required modal
2. MWA unavailable modal
3. MWA approval pending sheet
4. MWA rejected modal
5. Network offline sheet
6. Retry sync sheet
7. Generic error modal
8. Transaction pending modal
9. Transaction success modal
10. Transaction failed modal
11. Copy wallet address toast
12. Explorer link confirmation
13. Permission explanation dialog

## Onboarding

14. Skip onboarding confirmation
15. Genesis verification details sheet
16. Genesis not detected dialog
17. Starter Egg creation confirmation
18. Companion name validation dialog
19. First-sync error modal

## Companion

20. Companion interaction sheet
21. Rename companion modal
22. Companion status detail sheet
23. Level-up modal
24. Evolution reveal modal
25. Daily summary modal
26. While-you-were-away modal
27. Companion message detail sheet

## Activity

28. Event filter sheet
29. Event details sheet
30. Transaction details sheet
31. Sync status sheet
32. Re-sync confirmation

## Vault

33. Asset filter sheet
34. Vault item detail sheet
35. Core asset details sheet
36. Explorer action sheet

## Settings

37. Notification preferences sheet
38. Quiet-hours picker
39. 3D quality picker
40. Reduced-motion confirmation
41. Disconnect confirmation
42. Clear local cache confirmation
43. Logout confirmation where applicable

## System

44. App update required dialog
45. Unsupported device warning
46. Maintenance modal
47. Rate-limited sync message
48. Session expired modal
49. Auth restore failed dialog
50. Data mismatch recovery dialog

---

# 18. HOME SCREEN STRUCTURE

The home screen is the most important UX surface.

## Vertical structure

```text
┌───────────────────────────────┐
│ Seeker ID       Notifications │
│ Level 08   XP progress        │
├───────────────────────────────┤
│                               │
│        3D COMPANION           │
│                               │
│     [ condition badge ]       │
│                               │
│       “Good to see you.”      │
│                               │
├───────────────────────────────┤
│ Energy     Shield      Aura   │
│  72/100     88/100     42     │
├───────────────────────────────┤
│ Latest Event                  │
│ Swap detected • +40 XP        │
├───────────────────────────────┤
│                         [FAB] │
└───────────────────────────────┘
```

The 3D character should occupy the visual center.

Everything else explains or contextualizes the companion.

---

# 19. COMPANION INTERACTION

The companion must react to direct touches.

## Tap

Play a small attention animation.

## Long press

Open interaction sheet.

## Drag

Rotate the 3D model.

## Double tap

Play favorite emote.

## Interaction sheet actions

- Pet;
- Wake/Sleep depending on state;
- Ask what happened;
- View stats;
- View history.

Do not make interaction produce unlimited XP.

The interaction is primarily emotional and visual.

---

# 20. ORIENTATION & MOBILE BEHAVIOR

## V1 orientation

**Portrait-first across the entire app.**

No normal user flow should require rotation.

### 3D companion screen

Portrait.

Use a large centered model with touch rotation.

### Fullscreen reveal

Still portrait unless a later renderer test demonstrates a compelling reason to support landscape.

### Accessibility

Respect:

- system font scaling;
- reduced motion;
- touch target sizes;
- screen-reader labels;
- contrast;
- Android back navigation.

---

# 21. TECHNICAL ARCHITECTURE

## 21.1 Recommended V1 topology

```text
                         SEEKER DEVICE
┌────────────────────────────────────────────────────────────┐
│                         Flutter App                         │
│                                                            │
│  UI / Navigation / State / 3D / Local Cache / Analytics   │
│                     │                                      │
│              Native Android Bridge                         │
│               │             │                              │
│              MWA        Seed Vault                         │
└───────────────┬─────────────┬──────────────────────────────┘
                │             │
                │ signs       │ secure wallet context
                ↓             ↓
        ┌───────────────────────────┐
        │       Solana Network      │
        │                           │
        │  Core Asset               │
        │  Solgotchi Program        │
        │  Stake Accounts           │
        │  User Wallet Activity     │
        └─────────────┬─────────────┘
                      │
                      ↓
               Helius / RPC Layer
                      │
                      ↓
             Event Ingestion Service
                      │
         ┌────────────┴────────────┐
         ↓                         ↓
   Event Normalizer          History Sync
         │                         │
         └────────────┬────────────┘
                      ↓
                Game Engine
                      │
          ┌───────────┼───────────┐
          ↓           ↓           ↓
       State       Dialogue    Notifications
       Update       Engine        Engine
          │           │           │
          └───────────┴───────────┘
                      ↓
                    API
                      ↓
                    App
```

## 21.2 Key architectural rule

**The backend is authoritative for progression.**

The client is authoritative only for presentation.

Never let Flutter calculate permanent XP independently and trust it.

---

# 22. DATA STORAGE

## 22.1 PostgreSQL

Use PostgreSQL for:

- users;
- companions;
- activity events;
- state snapshots;
- level progression;
- achievements;
- notification records;
- dialogue history;
- sync cursors;
- idempotency keys.

## 22.2 Redis

Use Redis for:

- short-lived caches;
- rate limiting;
- sync locks;
- event dedupe windows;
- notification cooldowns.

## 22.3 Object storage / metadata

Use persistent storage for:

- NFT metadata JSON;
- static companion image previews;
- versioned asset manifests.

Metaplex recommends durable metadata references and Core assets use a URI to metadata. citeturn764573search3turn764573view2

---

# 23. DATABASE MODEL

## users

```text
id UUID PK
privy_user_id TEXT NULL
wallet_address TEXT UNIQUE
seeker_id TEXT NULL
genesis_verified BOOLEAN
created_at TIMESTAMP
updated_at TIMESTAMP
last_seen_at TIMESTAMP
```

## companions

```text
id UUID PK
user_id UUID FK
name TEXT
level INT
xp BIGINT
energy INT
shield_health INT
shield_durability INT
combat_rating INT
aura INT
condition TEXT
evolution_stage INT
asset_address TEXT NULL
metadata_uri TEXT NULL
last_state_update TIMESTAMP
created_at TIMESTAMP
updated_at TIMESTAMP
```

## activity_events

```text
id UUID PK
user_id UUID FK
signature TEXT NULL
slot BIGINT NULL
event_type TEXT
source TEXT NULL
payload JSONB
occurred_at TIMESTAMP
ingested_at TIMESTAMP
processed_at TIMESTAMP NULL
idempotency_key TEXT UNIQUE
```

## state_changes

```text
id UUID PK
companion_id UUID FK
event_id UUID FK
before_state JSONB
after_state JSONB
reason TEXT
created_at TIMESTAMP
```

## achievements

```text
id UUID PK
user_id UUID FK
achievement_key TEXT
unlocked_at TIMESTAMP
metadata JSONB
UNIQUE(user_id, achievement_key)
```

## notifications

```text
id UUID PK
user_id UUID FK
type TEXT
title TEXT
body TEXT
payload JSONB
read_at TIMESTAMP NULL
created_at TIMESTAMP
```

---

# 24. EVENT PROCESSING

## 24.1 Ingestion

Source options:

- Helius webhooks;
- Helius parsed streams/events;
- Solana RPC history fallback.

Helius supports address/program filtering and parsed transaction types through its current event products. citeturn702511search2turn702511search3

## 24.2 Normalization

Raw transaction data becomes:

```json
{
  "type": "SWAP",
  "wallet": "...",
  "signature": "...",
  "timestamp": 1760000000,
  "source": "JUPITER",
  "assets": ["...", "..."],
  "status": "confirmed"
}
```

## 24.3 Validation

Validate:

- wallet matches user;
- transaction exists;
- transaction succeeded;
- timestamp is plausible;
- event has not already been processed;
- transaction is within accepted observation window.

## 24.4 Idempotency

Every event must have a stable idempotency key.

Recommended:

```text
network + signature + event_type
```

Never increment XP simply because the webhook was delivered twice.

## 24.5 Ordering

Blockchain activity can arrive out of order from external systems.

Use:

- slot;
- block time;
- server ingestion time;
- deterministic reconciliation.

When two state updates conflict, process from the latest authoritative state snapshot and replay eligible events rather than blindly applying deltas twice.

---

# 25. GAME ENGINE

## 25.1 Engine responsibility

Input:

```text
NormalizedActivityEvent
CurrentCompanionState
CurrentTime
```

Output:

```text
StatePatch
GameEvents[]
DialogueEvent?
NotificationEvent?
AchievementUpdates[]
```

## 25.2 Engine pseudocode

```text
process(event, state):

  if event.idempotency_key already processed:
      return no-op

  validate event

  snapshot = state

  switch event.type:

    SWAP:
      add capped combat XP
      increase combat rating
      increase aura
      set condition = ENERGIZED
      queue dialogue

    STAKE_DETECTED:
      restore energy
      add daily staking XP once
      set condition = RECOVERING
      queue dialogue

    SECURITY_EVENT:
      update shield only if signal is verified
      otherwise record informational event
      queue dialogue if meaningful

    DAILY_RESET:
      apply daily passive rules
      apply gentle energy decay

  calculate level
  evaluate achievements
  evaluate evolution
  create state change record
  persist atomically
```

## 25.3 Atomic update requirement

The following must commit as one logical operation:

- event processed marker;
- companion state;
- XP change;
- achievements;
- dialogue event;
- notification event.

If any part fails, the entire state mutation must be retriable.

---

# 26. EVOLUTION SYSTEM

The companion has a small number of V1 visual milestones.

Suggested thresholds:

| Evolution | Trigger |
|---|---|
| Stage 1 | New companion |
| Stage 2 | Level 10 |
| Stage 3 | Level 20 |
| Stage 4 | Level 35 |
| Stage 5 | Level 50 |

Each evolution can change:

- aura strength;
- armor appearance;
- eye glow;
- idle animation;
- interaction emotes;
- character title.

Because there is only one 3D model identity, evolution is implemented by editing the same model and creating state variants/animation variants.

---

# 27. “WHILE YOU WERE AWAY” LOGIC

## 27.1 Trigger

If the app has been inactive long enough and new meaningful events have been processed, show the summary.

## 27.2 Meaningful event ranking

Priority:

1. level-up;
2. evolution;
3. major activity burst;
4. staking state change;
5. shield change;
6. ordinary XP change.

## 27.3 Aggregation

Example:

```text
Since your last visit:

+160 XP
+20 Energy
+1 Level
3 Swap events
1 Staking update

Your companion evolved to Stage 2.
```

Then play the appropriate reaction.

---

# 28. NOTIFICATION SYSTEM

## 28.1 Notification priorities

### Critical

- companion level-up;
- evolution;
- important account/auth state issue.

### High

- meaningful wallet event;
- shield state change;
- major sync issue.

### Normal

- daily summary;
- companion message.

## 28.2 Notification requirements

- user can disable categories;
- daily cap;
- quiet hours;
- deep-link into relevant screen;
- dedupe repeated notifications.

## 28.3 Android background constraint

Do not assume the app can execute continuously in the background.

The backend handles observation.

Android notifications are the delivery mechanism.

When the app is reopened, it performs a fresh state reconciliation.

---

# 29. AUTHENTICATION ARCHITECTURE

## 29.1 Seeker path

The primary path is:

```text
User
 ↓
Continue with Seeker
 ↓
Mobile Wallet Adapter
 ↓
User approves wallet connection
 ↓
Public key returned
 ↓
Backend links wallet to app account
```

## 29.2 Google path

Use Privy for app identity.

```text
Google
 ↓
Privy
 ↓
Application session
 ↓
Connect Seeker Wallet
 ↓
MWA
 ↓
Seeker identity
```

Privy supports Google authentication and Solana wallets, and its access tokens can be sent to a backend so the backend can authenticate the request. citeturn825250search1turn825250search14

## 29.3 Account linking rule

One Solana wallet should resolve to one active Solgotchi companion account unless an explicit multi-account feature is implemented later.

Prevent:

- two Google accounts claiming the same companion;
- duplicate companion records caused by race conditions;
- accidental loss of wallet linkage.

---

# 30. SOLANA MOBILE / SEEKER INTEGRATION

## 30.1 Mobile Wallet Adapter

Use MWA to request authorization and signed transactions.

Do not ask users to copy/paste seed phrases.

## 30.2 Seed Vault

Seed Vault is a hardware-backed key custody and signing service used by supported Seeker wallet implementations. Solana Mobile publishes an Android Seed Vault SDK for wallet applications. citeturn764573search1turn467759search0

Solgotchi should treat Seed Vault as the trusted wallet boundary and never attempt to access private keys.

## 30.3 Seeker identity

Current Solana Mobile documentation describes Seeker ID as consisting of a Seeker Genesis Token and a `.skr` domain held in the user's Seed Vault Wallet. citeturn467759search7

The onboarding logic should therefore treat:

```text
Genesis Token
+
.skr identity
```

as the Seeker identity model when those records are available.

## 30.4 Genesis verification

The verification service should:

1. identify connected wallet;
2. query/index the wallet's Genesis Token status;
3. resolve `.skr` identity if available;
4. store verification timestamp;
5. periodically revalidate.

Never trust client-supplied “Genesis verified = true”.

---

# 31. ONCHAIN PROGRAM SCOPE

## 31.1 Do not put everything onchain

For V1, do not write every swap or every animation state to Solana.

That would create unnecessary cost, latency and complexity.

Use the blockchain for what needs onchain ownership/verification.

Use the backend database for fast game state.

## 31.2 Onchain companion account

Recommended PDA fields:

```rust
pub struct CompanionState {
    pub owner: Pubkey,
    pub companion_asset: Pubkey,
    pub level: u16,
    pub xp_checkpoint: u64,
    pub evolution_stage: u8,
    pub created_at: i64,
    pub updated_at: i64,
}
```

The backend holds the more frequently changing values unless a product decision later requires them onchain.

## 31.3 Checkpoint model

Write onchain checkpoints for:

- companion creation;
- evolution;
- major level milestones;
- ownership-critical changes.

Not for every minor UI state mutation.

---

# 32. MINT / CREATION FLOW

## 32.1 Recommended V1 flow

```text
Connect wallet
 ↓
Verify Seeker identity
 ↓
Initialize companion
 ↓
Create Core Asset
 ↓
Write metadata URI
 ↓
Create companion state PDA
 ↓
Persist asset address in backend
 ↓
Show birth animation
```

## 32.2 Fee strategy

The uploaded concept mentions zero-fee starter minting.

V1 may use an application-funded payer if the transaction architecture allows it and the team can safely operate that payer.

Otherwise clearly explain the wallet transaction to the user.

Do not label a transaction “free” if the user actually pays network fees.

Metaplex currently documents Core mint costs around 0.003 SOL for a base asset, though current protocol fees must be checked at implementation time. citeturn764573view2

---

# 33. FLUTTER ARCHITECTURE

## 33.1 Project structure

```text
lib/
  app/
    app.dart
    router.dart
    theme.dart

  core/
    errors/
    networking/
    storage/
    analytics/
    constants/

  auth/
    presentation/
    application/
    data/

  seeker/
    mwa/
    identity/
    genesis/

  companion/
    domain/
    data/
    application/
    presentation/

  activity/
    domain/
    data/
    application/
    presentation/

  vault/
    domain/
    data/
    presentation/

  dialogue/
    domain/
    application/
    presentation/

  progression/
    domain/
    application/
    presentation/

  settings/
    presentation/

  widgets/
    companion_3d/
    fab_navigation/
    stat_cards/
    event_cards/
    state_badges/
```

## 33.2 State management

Recommended:

- Riverpod or Bloc;
- repository interfaces;
- immutable state models;
- event-driven refresh.

Do not bind screens directly to RPC responses.

## 33.3 Repository pattern

```dart
abstract class CompanionRepository {
  Future<Companion> getCompanion();
  Future<Companion> syncCompanion();
  Future<List<ActivityEvent>> getRecentActivity();
}
```

---

# 34. REACT NATIVE ALTERNATIVE

If the team decides React Native is faster, use:

- React Native;
- TypeScript;
- Solana Mobile Wallet Adapter bindings;
- Privy React Native SDK;
- local persistence;
- a dedicated 3D renderer component.

Solana Mobile maintains official mobile stack repositories and Seed Vault SDK resources, while Privy publishes React Native/mobile Solana integration guidance. citeturn467759search2turn825250search2

Keep the same backend contracts so the frontend decision does not change product logic.

---

# 35. 3D PERFORMANCE STRATEGY

V1 target:

- smooth idle animation;
- responsive touch rotation;
- no 3D screen permanently consuming CPU while hidden;
- pause animation when app is backgrounded;
- downgrade quality on low-battery/thermal conditions.

## Rendering rules

Only keep one active 3D model renderer on screen.

Do not render multiple character copies simultaneously unless absolutely necessary.

Lists should use 2D rendered previews, not live 3D instances.

## 3D card previews

Pre-render:

- companion front view;
- energetic state;
- tired state;
- alert state;
- damaged state.

This keeps roster/history UI light.

---

# 36. OFFLINE BEHAVIOR

## App opens offline

Show:

- cached companion;
- last updated time;
- local interaction;
- clear offline banner.

Disable:

- blockchain sync;
- new mint;
- transaction actions;
- data that requires fresh verification.

## Network returns

Run:

```text
refresh session
 ↓
refresh wallet linkage
 ↓
refresh companion state
 ↓
backfill missed activity
 ↓
reconcile local cache
```

---

# 37. ERROR & EDGE CASES

## Authentication

### User rejects MWA

Return to auth with:

> “Wallet connection cancelled.”

Do not treat it as account failure.

### MWA unavailable

Show troubleshooting.

### Session expires

Preserve cached companion data and request re-authentication.

### Google account works but Seeker wallet is absent

Allow preview/demo state, but do not claim verified Seeker ownership.

---

## Genesis

### Genesis NFT not found

Show explicit reason and retry.

### Indexer temporarily unavailable

Show:

> “We could not verify your Seeker identity right now.”

Do not mark verified.

### User switches wallet

Revalidate the new wallet and prevent cross-account data leakage.

---

## Blockchain activity

### Duplicate webhook

Ignore using idempotency key.

### Out-of-order event

Reconcile from authoritative state.

### Transaction failed

Do not award game XP.

### Transaction is pending

Do not award final XP until the configured confirmation threshold is met.

### Same swap parsed twice

Deduplicate.

### Unsupported transaction

Store raw event if useful, but do not affect game state.

---

## Staking

### Staking account exists but data is stale

Show last verified timestamp.

### User unstakes

Next daily snapshot removes future passive reward and recalculates vitality behavior.

Do not retroactively delete previous XP.

---

## Security

### No public API for security attestation

Use qualitative status.

### Seed Vault wallet present

Show:

> “Protected by Seeker Wallet.”

Do not display a fake numeric score.

### Security status unavailable

Do not reduce shield just because an API failed.

Availability failure must never look like user fault.

---

## Progression

### XP race condition

Serialize companion updates or use optimistic concurrency with version checks.

### Level-up duplicate

Use unique level milestone key.

### Offline client displays stale level

Server state wins after sync.

---

## 3D

### Model fails to load

Fallback to:

- static companion image;
- retry;
- cached low-quality model if available.

### Animation missing

Play idle.

### Texture missing

Use base material.

### Device is thermally constrained

Switch to reduced 3D mode.

---

# 38. SECURITY REQUIREMENTS

1. Never request or store seed phrases/private keys.
2. Never store wallet secrets in app storage.
3. Use MWA/Seed Vault for user-authorized signing.
4. Keep API keys on server.
5. Validate all webhook signatures/authentication mechanisms supplied by provider.
6. Never trust client-provided XP, wallet activity, Genesis verification or companion level.
7. Use server-side idempotency.
8. Rate-limit public APIs.
9. Protect admin/configuration endpoints.
10. Log state changes with traceable event IDs.
11. Never include private wallet data in analytics payloads unless explicitly required.
12. Separate development/test wallets from production wallets.

Seed Vault documentation states that secrets remain within the secure execution environment and provides a wallet API for wallet applications; Solgotchi should not attempt to bypass that boundary. citeturn467759search0turn467759search1

---

# 39. PRIVACY REQUIREMENTS

Data minimization:

- wallet public key: required for onchain identity;
- transaction signatures: required for verification/history;
- wallet names/labels: optional;
- private transaction reasoning: not collected;
- seed/private keys: never collected;
- notification preferences: local + backend as required;
- Google identity: only if using Google/Privy.

The app must explain that blockchain data is public and cannot be made private by Solgotchi.

---

# 40. API CONTRACTS

## GET /v1/me

Returns:

```json
{
  "id": "user_123",
  "wallet": "...",
  "seekerId": "name.skr",
  "genesisVerified": true,
  "companionId": "comp_123"
}
```

## GET /v1/companion

Returns complete display state.

## POST /v1/companion/sync

Starts/reconciles activity sync.

## GET /v1/activity

Paginated activity.

## GET /v1/activity/:id

Event detail.

## GET /v1/progression

Level/XP/evolution.

## GET /v1/achievements

Achievements.

## GET /v1/notifications

Notification feed.

## POST /v1/notifications/read

Mark read.

## POST /v1/companion/interaction

Records direct companion interaction for analytics/limited gameplay effects.

## GET /v1/vault

Companion vault information.

---

# 41. ADMIN / CONFIGURATION SURFACE

The game engine should not require a new app release for simple numeric tuning.

Backend-configurable values:

```text
swapXpBase
swapDailyCap
stakingDailyXp
stakingEnergyRecovery
energyDecay
levelCurveVersion
evolutionThresholds
notificationCooldowns
dailyNotificationCap
```

Configuration must be versioned.

Example:

```text
GAME_CONFIG_V1
```

A companion should retain the configuration version under which an event was processed for audit/debugging.

---

# 42. ANALYTICS

## Product metrics

Track:

- onboarding completion;
- wallet connection success;
- Genesis verification success;
- companion creation;
- first companion interaction;
- first activity event processed;
- D1 return;
- D7 return;
- average sessions/day;
- activity-to-return correlation;
- level progression;
- notification open rate;
- 3D load failures;
- sync failures.

## Do not optimize for

- number of blockchain transactions artificially generated by users;
- spam swaps;
- meaningless notification volume.

The game should reward naturally occurring meaningful activity.

---

# 43. TESTING STRATEGY

## Unit tests

Test:

- XP calculations;
- daily caps;
- energy decay;
- shield state rules;
- event dedupe;
- level progression;
- evolution thresholds;
- notification cooldowns;
- dialogue selection.

## Integration tests

Test:

- Helius/RPC ingestion;
- event normalization;
- database transaction;
- state engine;
- API response;
- push notification.

## Mobile tests

Test on:

- Seeker physical device;
- Android emulator for early development;
- poor network;
- revoked wallet authorization;
- cold start;
- warm start;
- app background/foreground;
- low battery;
- screen size changes.

## Blockchain tests

Test:

- devnet companion mint;
- failed transaction;
- duplicate transaction event;
- incorrect wallet;
- stale indexer;
- malformed webhook;
- program upgrade compatibility.

---

# 44. DEMO MODE — HACKATHON SAFETY NET

V1 must contain an internal, clearly gated demo mode for presentation/testing.

Demo mode is not a fake production state.

It is a deterministic simulation that runs through the same game engine as real events.

## Demo sequence

```text
Fresh companion
 ↓
Demo swap event
 ↓
Aura rises
 ↓
XP increases
 ↓
Demo staking event
 ↓
Energy recovers
 ↓
Demo security signal
 ↓
Shield updates
 ↓
Level-up
 ↓
Evolution
 ↓
While You Were Away
```

This ensures the 2–3 minute demonstration never depends on:

- finding a real user;
- waiting for a specific blockchain event;
- receiving a webhook at the right moment;
- network conditions outside the team's control.

The UI must not display “Demo” during a public production submission unless the build is specifically marked as a demo build; the demo environment should be configured separately.

---

# 45. DEVELOPMENT BUILD PLAN

## Phase 0 — Repository & foundations

Deliver:

- Flutter project;
- navigation shell;
- typography/layout tokens;
- environment config;
- API client;
- local storage;
- logging;
- analytics interface.

## Phase 1 — Seeker identity

Deliver:

- MWA integration;
- wallet authorization;
- Genesis verification;
- `.skr` resolution;
- connection state;
- reconnect flow.

Acceptance:

> Physical Seeker can connect and the backend knows which wallet owns the session.

## Phase 2 — Companion creation

Deliver:

- Starter Egg screen;
- Core Asset creation;
- metadata;
- companion PDA;
- birth reveal;
- companion naming.

Acceptance:

> A verified user can create exactly one companion.

## Phase 3 — 3D character

Deliver:

- download Quaternius base;
- modify in Blender;
- establish rig and node naming;
- add animations;
- create state variants;
- export GLB;
- integrate renderer;
- cache model.

Acceptance:

> Companion loads locally and can play at least Idle, Happy, Alert, Recover and Evolution animations.

## Phase 4 — State engine

Deliver:

- companion database state;
- activity event schema;
- XP;
- energy;
- shield;
- aura;
- conditions;
- evolution.

Acceptance:

> A deterministic test event changes state correctly.

## Phase 5 — Onchain activity ingestion

Deliver:

- Helius/RPC adapter;
- wallet event backfill;
- swap detection;
- staking detection;
- dedupe;
- retry;
- sync status.

Acceptance:

> A real transaction can become a game event without manual intervention.

## Phase 6 — Dialogue + notifications

Deliver:

- template engine;
- event-triggered dialogue;
- notification service;
- cooldowns;
- notification center.

Acceptance:

> A meaningful event creates a contextual companion response.

## Phase 7 — Mini-Vault

Deliver:

- vault UI;
- companion asset details;
- wallet ownership;
- asset history.

## Phase 8 — Progression

Deliver:

- Level 1–50;
- achievements;
- evolution;
- history;
- level-up presentation.

## Phase 9 — Full edge-case hardening

Deliver:

- offline mode;
- sync recovery;
- stale indexer recovery;
- duplicate event tests;
- MWA rejection;
- session restore;
- 3D fallback.

## Phase 10 — Submission package

Deliver:

- production APK/AAB as required by submission flow;
- dApp Store metadata;
- icon;
- screenshots;
- demo build;
- demo script;
- GitHub README;
- architecture diagram;
- asset credits.

---

# 46. EXACT V1 SCOPE

## INCLUDED

### Identity

- Seeker wallet connection;
- Seeker ID lookup;
- Genesis verification;
- Google/Privy authentication as secondary onboarding path;
- wallet linking.

### Companion

- one 3D companion;
- companion naming;
- stats;
- conditions;
- interaction;
- visual reactions;
- progression;
- evolution.

### Activity

- swap detection;
- staking detection;
- security signal handling with honest fallback;
- activity history;
- onchain transaction references;
- sync state.

### Game systems

- XP;
- Level 1–50;
- energy;
- shield;
- combat rating;
- aura;
- evolution;
- achievements;
- daily summary;
- while-you-were-away.

### Companion communication

- rule-based contextual messages;
- conversation history;
- suggested replies.

### Vault

- companion vault;
- Core Asset detail;
- ownership information;
- vault activity.

### Platform

- FAB navigation;
- notifications;
- settings;
- privacy;
- help;
- offline state;
- retry/recovery.

### Hackathon reliability

- demo simulation mode;
- deterministic replay;
- cached 3D fallback.

---

# 47. EXCLUDED FROM V1

The following remain V2/future scope:

- full local LLM;
- autonomous AI companion reasoning;
- GPS/DePIN exploration;
- multisig co-op raids;
- multiple companion collection;
- breeding;
- marketplace;
- player trading of companions;
- guilds;
- advanced multiplayer combat;
- full RPG inventory;
- complex 3D world exploration;
- user-created companion models;
- dynamic generative character creation.

These exclusions are intentional.

---

# 48. V1 ACCEPTANCE CRITERIA

V1 is complete when all of the following are true.

## Identity

- User can launch the app and connect a Seeker wallet.
- User can see the resolved wallet address.
- User can see Seeker identity when available.
- Genesis verification has a real backend verification path.

## Companion

- Verified user can create one companion.
- Companion survives app restarts.
- Companion has persistent level and state.
- User can interact with it.

## 3D

- One local GLB loads on Seeker.
- Idle animation works.
- At least four contextual animations work.
- State changes alter the visible character.
- Static fallback exists.

## Activity

- Real transaction can be observed.
- Transaction is normalized.
- Duplicate event does not double-award.
- XP/state changes are recorded.
- User can see the event in Activity.

## Staking

- Active staking can be detected or explicitly marked unavailable.
- Energy rule is deterministic.

## Security

- Supported Seeker/Seed Vault-related signal is represented when available.
- Unsupported security detail does not become a fake numeric score.

## Progression

- Level 1 starts correctly.
- XP increases.
- Level-up works.
- Evolution works.
- Achievement unlock works.

## Communication

- Meaningful event can produce a contextual message.
- Notification cooldowns work.

## Reliability

- App handles offline launch.
- App handles rejected wallet authorization.
- App handles stale activity data.
- App handles 3D failure.
- Demo mode runs deterministically.

---

# 49. RECOMMENDED V1 SCREEN TOTAL

For planning purposes, the complete V1 should be treated as approximately:

**70–80 user-facing/nested states** when loading, empty, success, error and modal variants are included.

The product does not need 70 unique visual compositions.

Reusable components should cover many states.

The key principle is:

> **Every meaningful action has a predictable destination, feedback state, failure state and recovery path.**

---

# 50. ASSET LICENSING CHECKLIST

For every external asset used:

1. record the source URL;
2. record author/creator;
3. record license;
4. download and preserve the license text if provided;
5. store attribution requirements in `assets/licenses/`;
6. do not mix CC-BY and CC0 assumptions;
7. do not modify a No-Derivatives asset;
8. do not use a Non-Commercial asset in a build that is commercially distributed.

Sketchfab currently provides downloadable content under various licenses, including Creative Commons variants, and its current Terms state that the license attached to each downloaded asset governs reuse. Therefore every individual Sketchfab asset must be checked rather than assuming “free download = free commercial use.” citeturn976993search0turn976993search5

For the V1 character, the preferred route is Quaternius CC0 to reduce licensing ambiguity. citeturn810762search0

---

# 51. ART DIRECTION FOR THE ONE CHARACTER

The character should be designed as:

- compact enough for portrait mobile composition;
- expressive through body language;
- recognizable as a single mascot silhouette;
- easy to recolor and texture;
- rigged for humanoid animation;
- able to read clearly on both a full screen and a small card;
- built with obvious attachment zones for future armor/cosmetics.

## Required visual attachment zones

```text
Head
Eyes
Chest
Shoulders
Arms
Hands
Back
Feet
Aura
Shield
```

## Required visual state changes

### Healthy

Clean armor, normal glow, relaxed stance.

### Energized

Brighter aura, upright stance, stronger idle movement.

### Tired

Lower posture, slower idle, reduced aura.

### Alert

Eyes/visor activated, defensive stance, shield pulse.

### Damaged

Armor wear/cracks, unstable aura.

### Recovering

Healing particles, stable pose, brighter shield.

### Evolving

Dedicated transformation sequence.

---

# 52. UI COMPONENT LIBRARY

Build reusable components before individual screens.

## Core components

- `PrimaryButton`
- `SecondaryButton`
- `TertiaryButton`
- `FABRoot`
- `FABAction`
- `TopBar`
- `StatTile`
- `ProgressBar`
- `ConditionBadge`
- `ActivityCard`
- `NotificationRow`
- `CompanionCard`
- `LevelBadge`
- `AchievementBadge`
- `StateTimelineItem`
- `BottomSheet`
- `ConfirmationDialog`
- `ErrorState`
- `OfflineBanner`
- `LoadingState`
- `EmptyState`
- `3DCompanionView`
- `3DStaticFallback`
- `WalletChip`
- `SeekerIdentityChip`
- `ExplorerLink`

---

# 53. UX RULES

1. Never expose blockchain terminology when ordinary language works better.
2. Every important state change gets visible feedback.
3. Never block the whole experience because a non-critical sync failed.
4. Never claim a security property that was not verified.
5. Never force the user to understand RPC, PDA, transaction signatures or NFT metadata in order to use the companion.
6. Wallet actions must clearly identify when the user is being asked to sign something.
7. The companion should always have something interesting to say or show, even when there was no recent transaction.
8. Quiet periods should feel calm, not punitive.
9. Do not use constant loading spinners for cached data; display cached state and sync in the background.
10. Every failed operation needs a human-readable recovery path.

---

# 54. BUILD ORDER FOR THE CODING AGENT

The coding agent should implement in this order:

```text
01. Flutter shell
02. Design tokens/components
03. Navigation + FAB
04. Splash/onboarding/auth
05. MWA bridge
06. Privy auth (if enabled)
07. Seeker identity/Genesis service
08. Backend auth
09. Companion database model
10. Companion creation
11. Core Asset mint
12. 3D viewer
13. Character animations
14. Companion state engine
15. Activity API
16. Helius/RPC ingestion
17. Swap normalization
18. Staking normalization
19. Security signal adapter
20. XP/level system
21. Evolution
22. Dialogue engine
23. Notifications
24. Activity screens
25. Vault screens
26. Progression screens
27. Settings
28. Offline/cache
29. Demo simulation
30. Hardening/tests
31. Submission build
```

Do not build screens first and invent the data model later.

Build the state engine first so every screen has one source of truth.

---

# 55. TEST SCENARIO MATRIX

## Scenario 1

New Seeker user.

Expected:

Onboarding → wallet → Genesis → Egg → Companion.

## Scenario 2

Returning user with no new activity.

Expected:

Home opens immediately with cached companion and no false event.

## Scenario 3

Swap while app closed.

Expected:

Event detected → XP/aura update → notification → While You Were Away.

## Scenario 4

Staking detected.

Expected:

Energy recovery and daily XP occur exactly once.

## Scenario 5

Indexer duplicates an event.

Expected:

No duplicate progression.

## Scenario 6

Wallet rejects transaction.

Expected:

No game reward.

## Scenario 7

Security API unavailable.

Expected:

No shield damage; status becomes unavailable.

## Scenario 8

3D model fails.

Expected:

Static fallback; rest of app remains usable.

## Scenario 9

User goes offline.

Expected:

Cached companion available; sync postponed.

## Scenario 10

User levels up while app is closed.

Expected:

Open → summary → level-up → animation → progression record.

---

# 56. FUTURE-PROOFING

The product should be structured so these V2 features can be added without rebuilding V1:

- multiple companion species;
- companion personalities;
- local LLM;
- multiplayer;
- guilds;
- DePIN exploration;
- expanded onchain assets;
- collectible cosmetics;
- companion marketplace.

The key abstraction is:

```text
Activity Event
     ↓
Game Engine
     ↓
Companion State
     ↓
Renderer / Dialogue / Notification
```

Any future activity source can feed the same engine.

Any future character can use the same renderer contract.

---

# 57. IMPLEMENTATION NOTES FROM CURRENT TOOLING VERIFICATION

## Solana Mobile

Current Solana Mobile materials describe Seeker as providing a hardware-backed Seed Vault, Seeker ID, Genesis Token and the Solana dApp Store ecosystem. citeturn764573search2turn467759search7

Solana Mobile's public repositories include Seed Vault SDK resources and mobile-stack tooling. citeturn467759search2turn467759search0

## Helius

Helius currently provides parsed Solana activity products and webhook/stream infrastructure suitable for wallet-event monitoring. New parsed stream/event products are currently described as open beta, so production code should retain a standard RPC/history fallback. citeturn702511search2turn702511search5

## Metaplex Core

Metaplex currently documents Core as the recommended NFT standard for new Solana projects, with single-account assets, metadata URI support and plugins including attributes/delegates. citeturn764573view2turn764573search3

## Flutter 3D

The currently published `flutter_3d_controller` package supports GLB/glTF rendering, animations, textures, camera control and Android. `model_viewer_plus` is another current option but uses a web-view-based model viewer. For V1, local GLB + `flutter_3d_controller` is the preferred first implementation because it keeps the asset path simple. citeturn304997search0turn304997search3

## 3D asset licensing

Quaternius' current Universal Base Characters pack is CC0 and includes humanoid rigging and glTF output. Its current Universal Animation Library is also CC0. citeturn810762search0turn810762search2

---

# 58. IMPORTANT FEASIBILITY LIMITS

These are not blockers to V1, but they must remain explicit.

## Limit 1 — Deep device security inspection

A general dApp should not assume it can inspect every device security setting or produce a meaningful security percentage. Use only verifiable signals exposed by the wallet/platform; otherwise present a qualitative protection state.

## Limit 2 — Always-on app execution

The app cannot rely on unrestricted Android background execution. Backend ingestion and push notifications must handle offscreen activity.

## Limit 3 — Real-time onchain writes for every event

Not necessary for V1. Use offchain game state plus onchain ownership/checkpoints.

## Limit 4 — External data dependency

Helius, RPC providers, Solana indexers and any identity service can experience delays/outages. All external integrations require retry and fallback behavior.

## Limit 5 — Asset licensing

A downloaded 3D asset is not automatically safe to ship commercially. Preserve the exact license for every asset.

---

# 59. FINAL PRODUCT SUMMARY

Solgotchi V1 is a **Seeker-native virtual companion that turns real Solana activity into a persistent game state.**

The user has one 3D companion.

The companion has:

- a level;
- energy;
- shield;
- durability;
- combat rating;
- aura;
- condition;
- evolution;
- activity history;
- contextual dialogue;
- a mini-vault.

The user's real activity becomes game input:

```text
SWAP
 ↓
COMBAT / AURA

STAKE
 ↓
ENERGY / VITALITY

SEEKER / SECURITY SIGNAL
 ↓
SHIELD / DURABILITY
```

The companion changes while the user is away.

The user comes back and discovers:

> **What happened to my Solgotchi?**

That is the product loop.

The blockchain does not replace the game.

**The blockchain gives the game a real life.**

---

# 60. SOURCE & VERIFICATION REFERENCES

## User-provided source

The uploaded Cyber-Companion/Solgotchi specification is the primary product source for the V1 concept, terminology and original three-pillar model.

## Current external references checked during this specification

Solana Mobile / Seeker:

- https://solanamobile.com/
- https://github.com/solana-mobile
- https://github.com/solana-mobile/seed-vault-sdk
- https://github.com/solana-mobile/solana-mobile-docs

Seeker ID:

- https://github.com/solana-mobile/solana-mobile-docs/blob/main/solana-mobile-stack/seeker-id.mdx

Metaplex Core:

- https://developers.metaplex.com/core
- https://developers.metaplex.com/core/what-is-an-asset
- https://developers.metaplex.com/smart-contracts/core/update
- https://developers.metaplex.com/core/transfer

Helius:

- https://www.helius.dev/blog/parsed-events-and-streams
- https://www.helius.dev/solana-webhooks-websockets/

Flutter 3D:

- https://pub.dev/packages/flutter_3d_controller
- https://pub.dev/packages/model_viewer_plus

3D assets:

- https://quaternius.com/packs/universalbasecharacters.html
- https://quaternius.itch.io/universal-base-characters
- https://quaternius.itch.io/universal-animation-library
- https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html
- https://sketchfab.com/terms

Blender/glTF:

- https://docs.blender.org/manual/en/5.3/addons/import_export/scene_gltf2.html

Privy:

- https://docs.privy.io/authentication
- https://docs.privy.io/guide/react/wallets/embedded/third-party-auth
- https://pub.dev/packages/privy_flutter

---

# 61. HANDOFF RULE

The coding team should treat this file as the V1 contract.

When an implementation decision is ambiguous:

1. preserve the user's ability to use the companion;
2. prefer the simplest verifiable implementation;
3. never invent blockchain/device data;
4. keep the 3D character local and deterministic;
5. keep progression server-authoritative;
6. make external providers replaceable;
7. keep the FAB navigation model intact;
8. do not add new V1 features without updating the scope section.

**End of V1 specification.**
