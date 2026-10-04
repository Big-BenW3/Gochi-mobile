# Gochi — Design System

**Provenance.** Derived from the Spotify design analysis in
[VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md/tree/main/design-md/spotify).
Spotify was chosen as the base after reviewing the Raycast, PlayStation, Coinbase,
Linear and Spotify analyses. Sections marked **[Gochi]** are deliberate departures
from the Spotify source — the reasons are given in §14.

**The contract.** `SOLGOTCHI_PRODUCT.md` wins over this document on any conflict.
This document governs how it looks; the spec governs what it does.

---

## 1. Core doctrine — content-first darkness

> The interface recedes into near-black so that the content is the only source of colour.

Spotify's "content-first darkness" is the reason this base was chosen. In Gochi the
content is a living 3D companion, so the doctrine becomes literal:

**The companion is the brightest thing on the screen. Always.**

Three consequences, applied everywhere:

1. Chrome is achromatic or near-achromatic. A coloured panel behind the companion
   steals attention from it.
2. Colour is a **signal**, not decoration. If a hue is not carrying state, it is not
   in the palette.
3. Glow is rationed. Only the companion, the FAB, and the two live meters (energy,
   aura) are allowed to bloom. More than three glowing things and none of them read
   as important.

**Why the original palette was replaced.** The concept board used `#7C3AED` (Tailwind
`violet-600`) and `#6B7280` (Tailwind `gray-500`) — defaults, not decisions. It then
layered four equally-weighted saturated neons (violet, cyan, pink, mint), which gave
no focal point. It also had only three neutral steps, too few to separate a card from
a sheet from an overlay, and it was **missing both a damage red and a reward gold** —
so the spec's `DAMAGED` condition and the game's level-up moment, which is supposed
to be its emotional peak, had no colour to live in.

---

## 2. Colour

### 2.1 Neutrals — violet-tinted blacks

Six steps. The blue-violet cast ties the greys to the brand hue, so neutrals and
accents feel like one palette rather than a dark theme with stickers on it.

| Token | Hex | Use |
|---|---|---|
| `ink-950` | `#05060D` | App background, deepest layer |
| `ink-900` | `#0A0C16` | Screen background |
| `ink-850` | `#111426` | Card surface |
| `ink-800` | `#1A1E33` | Raised surface, pressed states |
| `ink-700` | `#262B44` | Meter tracks, strong border |
| `ink-600` | `#343B58` | Highest neutral, faintest text |

**Text** is an opacity ramp of a single off-white. Pure `#FFFFFF` glares against
`ink-950` and is reserved for the single brightest glow.

| Token | Hex | Use |
|---|---|---|
| `fog-50` | `#EDEFF9` | Headings, primary text |
| `fog-200` | `#A8B0CC` | Body, secondary text |
| `fog-400` | `#666E8F` | Tertiary text, disabled, `TIRED` |
| `fog-600` | `#343B58` | Faintest text, `SLEEPING` |

### 2.2 Roles — one primary, one interactive, four semantic

Every hue has exactly one job. This is the core fix for the "four competing neons"
problem.

| Role | Hex | Job |
|---|---|---|
| **Primary** | `#7A6BFF` | Brand, aura, `HEALTHY`, primary buttons |
| **Primary-lit** | `#A99BFF` | `ENERGIZED`, glow highlights, primary pressed |
| **Signal** | `#31D6FF` | Interactive, links, `ALERT` |
| **Damage** | `#FF5B6E` | `DAMAGED` only — the sole red |
| **Recover** | `#3DDC97` | `RECOVERING`, positive confirmations |
| **Evolve** | `#FF6EDB` | `EVOLVING` only |
| **Reward** | `#FFC24B` | XP, level-up, achievements — **never a condition** |

**The 60/30/10 rule.** 60% neutral base, 30% supporting darks, 10% accent. On a dark
app the ratio inverts visually, so in practice: the screen should read as near-black
with the accent appearing on **less than a tenth** of it.

**Borders are alpha, not solid.** `rgba(237,239,249,0.08)` for hairlines, `0.16` for
strong. Solid borders cut visible lines across glows.

### 2.3 Condition → colour

The spec's eight states, each mapped to exactly one hue. Source: spec §5.2.

| Condition | Colour | Animation |
|---|---|---|
| `HEALTHY` | Primary `#7A6BFF` | `Idle` |
| `ENERGIZED` | Primary-lit `#A99BFF` | `EnergyPulse` |
| `TIRED` | Fog-400 `#666E8F` | `Idle` |
| `ALERT` | Signal `#31D6FF` | `Alert` |
| `DAMAGED` | Damage `#FF5B6E` | `Hit` |
| `RECOVERING` | Recover `#3DDC97` | `Recover` |
| `EVOLVING` | Evolve `#FF6EDB` | `Evolution` |
| `SLEEPING` | Ink-600 `#343B58` | `Sleep` |

`TIRED` deliberately reuses a neutral: "drained" should read as *less*, not as a new
colour competing for attention.

**These are game states.** They describe the companion, never the user. The spec is
explicit, and the distinction is load-bearing — see §10.

---

## 3. Typography

### 3.1 Families

| Family | Weights | Role |
|---|---|---|
| **Space Grotesk** | 500, 700 | Display — headings, wordmark, companion name |
| **Manrope** | 400, 600 | Body and UI copy |
| **JetBrains Mono** | 500 | Stats, wallet addresses, signatures, levels |

All three are SIL Open Font License and ship as `.ttf` inside the
`@expo-google-fonts` packages, so there is no asset licensing to track and no
network fetch at runtime.

**Neither SF Pro nor Circular is used, deliberately.** SF Pro's licence restricts it
to Apple platforms — bundling it in an Android app submitted to a store is a licence
violation. SpotifyMixUI / CircularSp are proprietary to Spotify. Inter was rejected as
the body face: it is the correct choice for a fintech dashboard and reads as exactly
that next to a cartoon companion.

### 3.2 Scale — four sizes, two weights

A hard cap, enforced by review. Hierarchy comes from size, weight and opacity, not from
bolding everything.

| Token | Size | Weight | Use |
|---|---|---|---|
| `display` | 26 | 700 | Screen titles, companion name |
| `title` | 17 | 600 | Section headings, card titles |
| `body` | 14–15 | 400 | All body and UI copy |
| `caption` | 11–12 | 400–500 | Labels, badges, timestamps |

**Numbers are always mono.** Stat values, levels and addresses use JetBrains Mono so
digits align in a row and addresses are unambiguous. A level badge pads to two digits
(`LVL 08`) so the top bar does not reflow when the level gains a digit.

**Monospace for large numbers is the single highest-value rule here.** It is what makes
`72` and `100` sit on the same baseline instead of looking like different magnitudes.

---

## 4. Spacing and layout

### 4.1 8-point grid

`4 · 8 · 16 · 24 · 32 · 48 · 64`, with a **20px page gutter** used on every screen so
content edges line up between routes.

**Relationship-based spacing.** Related elements sit closer together than unrelated
ones. If two items are 8px apart, the gap to the next group is 16–24px.

### 4.2 Layout

- **Portrait-only.** Spec §20: no user flow requires rotation.
- **Single column, baseline 375dp.** Wider screens centre the column and cap content
  at 480dp rather than stretching — a companion stretched to 600dp wide looks broken,
  not immersive.
- **Primary actions in the bottom third** (thumb zone).
- **Bottom tab bar is forbidden.** Spec §14.1. The concept board's home mock shows one;
  that is an error in the board and is corrected here. Navigation is FAB-first.

---

## 5. Shape

Spotify's pill-and-circle geometry, carried over with one adjustment.

| Token | Value | Use |
|---|---|---|
| `chip` | 12 | Chips, small tiles |
| `control` | 16 | Buttons, inputs |
| `card` | 20 | Cards, sheets |
| `pill` | 999 | FAB, badges, tag chips |
| `circle` | 50% | Icon buttons, avatars |

**[Gochi]** Spotify uses full pills for primary buttons. Gochi uses `control` (16) for
buttons and reserves pills for things that genuinely float — the FAB and badges. A pill
should keep *meaning* "floating"; if buttons are pills too, the FAB loses its identity
as the one control you reach for without looking.

---

## 6. Depth and elevation

Shadows are **tinted, never neutral**. A grey or black shadow on a violet-black canvas
reads as grime; a violet shadow reads as depth. Soft and few — hard, distinct shadows
make a dark interface look cheap.

| Level | Treatment | Use |
|---|---|---|
| Base | `ink-900` | Screen background |
| Surface | `ink-850` + `card` shadow | Cards, list rows |
| Raised | `ink-800` | Pressed, secondary bars |
| Overlay | `ink-850` + `sheet` shadow | Bottom sheets, modals |
| Float | `sheet` → `float` shadow | FAB |

`shadow*` props and `elevation` are both set on every level, because React Native
ignores `shadow*` on Android and `elevation` on iOS.

**Glow** is a shadow with zero offset and a coloured tint. Allowed on: the companion,
the FAB, and the energy/aura meters. Nowhere else.

---

## 7. Motion

One duration set for the whole app — animation that is fast somewhere and slow
elsewhere feels unfinished.

| Token | ms | Use |
|---|---|---|
| `press` | 90 | Touch response |
| `quick` | 160 | Small state flips |
| `enter` | 240 | View arriving |
| `exit` | 180 | View leaving — shorter so it never feels like waiting |
| `celebrate` | 700 | Level-up, evolution only |

Press feedback is a **fill change, not a scale**. Scaling a button shifts its
neighbours and makes a column of them feel unstable.

**Reduced motion is honoured.** Spec §20 requires respecting the OS setting; every
decorative animation must have a static equivalent.

---

## 8. Component rules

- **Buttons**: three weights — `primary` (filled, one per screen), `secondary`
  (outlined), `tertiary` (text). Minimum height 44dp in every weight, so switching
  weight never changes the target size. Primary label is dark-on-violet, never
  light-on-violet, which fails contrast.
- **Busy implies disabled.** A spinner that can still be tapped misreports state.
- **Cards**: one component, one padding/radius/border. Consistency only holds if it is
  not re-declared per screen.
- **Meter tracks** are lighter than the page background, or an empty meter reads as
  "no value" rather than "zero".
- **Every error state has a recovery action.** This is a product rule from spec §53,
  not a preference — `ErrorState` takes a required `onRetry`.
- **Empty states guide.** They state what will appear and offer the action that
  produces it.
- **Cached data is shown, never replaced by a spinner.** Spec §53 rule 9: sync quietly
  behind visible content, with an offline banner if the network is gone.

---

## 9. Navigation

**FAB-first, no tab bar.** The FAB is the only global navigation. Collapsed it is a
single `+`; expanded it fans out to Companion · Activity · Vault · Messages · Profile.

Thumb-zone placement is not decoration here: the FAB is the primary navigation control
in an app whose main screen has no other chrome.

Secondary navigation uses a top-left back button, a contextual top-right action, or a
bottom sheet. No second navigation system (spec §14.4).

---

## 10. Emotional design

**The peak is the companion reacting to something that happened while you were away.**
Level-up and evolution are the peaks within it. Everything else is support.

- **Peak-end rule.** The user remembers the best moment and the last moment. Invest
  there; do not spread motion budget evenly.
- **Celebrate small wins intentionally.** A level-up is not subtle because the
  underlying XP number is small.
- **Quiet periods feel calm, not punitive** (spec §4.2, §7.5). A tired companion is
  low-energy and slow, never guilt-inducing. The user must never feel the app wants
  them to trade.
- **Motion is a trust signal.** In a crypto app, polish reads as safety. This is the
  documented lesson from Phantom in the design skill's industry reference, and it is
  why 3D work is not a luxury in this project.

### 10.1 The honesty rule

This is the one non-negotiable in the entire design system.

> Never present an unverified value as a fact.

Concretely:

- **No numeric security score.** Spec §7.4 and §58 Limit 1. A dApp cannot inspect
  device security settings. Say "Protected by Seeker Wallet", or say the status is
  unavailable. Never render `87%`.
- **Conditions describe the companion, not the person.** An `ALERT` badge must not
  imply the user's wallet is compromised.
- **An API failure is never the user's fault.** Shield state must not drop because a
  status endpoint timed out. Availability failure looks like a bug, and the UI must
  say "unavailable", never "at risk".
- **Never call a transaction free if the user pays the fee** (spec §32.2).
- **Never claim soulbound** unless transfer restriction is actually enforced by the
  asset, not just worded in the UI.

Banned strings in code review: `security score`, `safe`, `guaranteed`, `risk: N%`.

---

## 11. Accessibility

- Minimum touch target **44×44dp** regardless of visual size.
- Respect OS font scaling — layouts use flex and wrap, never fixed text heights.
- Respect reduced motion; every animation has a static equivalent.
- Contrast: body text `#A8B0CC` on `#0A0C16` is comfortably above AA. Never place
  `fog-400` on `ink-950` for primary reading — it is tertiary text only.
- Screen-reader labels on every icon-only control.
- Android back navigation is handled on every screen.

---

## 12. Do

- Use one accent colour for one job.
- Let the companion be the brightest element.
- Show cached data and sync behind it.
- Tint every shadow.
- Give every error a way forward.
- Pair mono numbers with a small neutral label above.
- Keep the 4-size / 2-weight typographic budget.
- Animate the moment that matters, not all of them.

## 13. Don't

- Don't add a bottom tab bar (spec §14.1; the board's mock is wrong).
- Don't glow more than three things.
- Use `reward` gold for anything except progression.
- Use `damage` red for anything except `DAMAGED`.
- Render a security percentage.
- Put a CTA outside the thumb zone.
- Cover cached content with a spinner.
- Hard-code a value the server owns.

---

## 14. What changed from the Spotify base, and why

| Spotify | Gochi | Why |
|---|---|---|
| CircularSp / SpotifyMixUI | Space Grotesk + Manrope + JetBrains Mono | Proprietary; SF Pro also unusable on Android |
| Single green accent | One primary + one interactive + four semantic roles | The game has seven states and needed them colour-coded |
| Pill primary buttons | `control` radius; pills reserved for floating | Keeps "pill" meaning "floating" |
| 3–4 neutral greys | Six violet-tinted steps | Real elevation range on a dark canvas |
| Neutral shadows | Tinted violet shadows | Neutral shadows read as dirt on violet-black |
| Dense desktop layout | Portrait, single column, 375dp baseline | It is a phone app |
| Sidebar navigation | FAB-first, no tab bar | Spec §14.1 |
| Album art as colour source | The 3D companion as colour source | Same doctrine, different content |
| Dense grid browsing | Peak-end emotional design | A virtual pet is not a music library |

---

*Implemented in `mobile/src/global.css` (colour, type, radius) and
`mobile/src/theme/tokens.ts` (shadows, motion, spacing, layout). Keep them in sync.*