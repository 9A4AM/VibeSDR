# Apple Watch — Merging the Two Apps Into One — Brief

**Status:** design draft, not started. **Blocked on:** the standalone spike being proven working first
(Stuart, 2026-07-19: *"just want to make sure all the standalone stuff works before we do"*).
**Related:** `spike/WristSDR/` (standalone), `ios/VibeSDRWatch/` (shipped V9 companion),
[[jr_transport_ws_two_modes]], [[apple_watch_companion]], `BRIEF-menu-relocation.md`

---

## 0. THE SPEC (Stuart, 2026-07-19 — authoritative)

**VibeSDR comes with VibeSDR Jr.** On the watch it is called **VibeSDR Jr**, including in the app list.

### Launch behaviour

| situation | what happens |
|---|---|
| **Phone app running** | Jr icon at the top of the watch face and in the widget stack (as now). Opening Jr goes **straight into Companion mode** — no chooser. |
| **Phone app not running, Series 9+** | A **two-button chooser** (below). |
| **Phone app not running, pre-S9** | **Never sees the chooser or anything standalone — companion only.** |

### The chooser (S9+, phone not running)

Two large buttons:

1. **Companion mode** — glyph: `watch ⇄ iPhone ⇄ server`. Subtitle: *"all audio handled by the
   iPhone."* ★ Bonus: a **speaker icon merged next to the iPhone**.
2. **Standalone** — glyph: `watch ⇄ server`. Subtitle: *"no iPhone required."* ★ Bonus: **speaker
   next to the watch**.

The speaker placement is the whole idea in one picture: it shows WHERE THE SOUND COMES OUT, which is
the difference a user actually feels.

After choosing, you land on the **servers screen**.

### Per-mode behaviour

**Companion**
- The server screen changes the **PHONE's** connection.
- It lists **RTL-TCP and every backend the phone supports** — including ones standalone cannot do.
- The phone app **cold-boots**; if it has a default server it jumps straight to it and the watch
  follows, exactly as today.
- **Audio is the phone's**, throughout.
- **Chat is wired through the iPhone** (see §2c).

**Standalone**
- Everything behaves as the spike does today.

### The mode toggle
- A button at the **top of BOTH server screens**, switchable **at any time**.
- ★ **Only exists when an iPhone is detected.** No iPhone → no button at all.
- Reason it must be reachable mid-session: **running two SDRs at once** — the phone on one server and
  the watch standalone on another.

### What comes from where — the spike wins, without exception

- **ALL screens are lifted from the spike.** Fully customised and correct; they **supersede the
  companion's**.
- **ALL menus and options are lifted from the spike** — the hold-menu, the control grid, every picker
  and sheet. Same rule, no exceptions.
- **The warning/status system is lifted from the spike** too.

★ **So the companion contributes NO UI AT ALL.** Its entire user-facing layer is deleted, not merged.
The only thing it contributes is the WCSession transport, which becomes `PhoneClient: SDRClient`
(§1). If a decision ever seems to need "but the companion did X" — it does not; the spike's version
is the answer by default, and any exception has to be argued explicitly.

This also settles the earlier file-by-file comparison (§1, §2): those tables are now just evidence,
not a decision to make.
- **Favourites AND their use counts sync** between phone and watch (§2d).
- Server connections and waterfall handling behave exactly as they do now in each mode.

---

## 1. ★ The seam already exists — this is not a two-app merge

The spike was built backend-agnostic and already abstracts exactly the thing that differs:

- **`SDRClient` protocol** (`KiwiClient.swift:7`) — the surface `SpikeLink` drives. `UberClient`,
  `KiwiClient` and `OwrxClient` all satisfy it and share one UI.
- **`WaterfallBuffer.push(row:)` takes FINISHED ROWS**, not bins. The spike does
  bins → `SignalProcessor` → row → push (`UberClient.swift:736-772`). The companion receives rows the
  PHONE already rendered — so it pushes at *the same point*, skipping only the DSP stage.

**So "completely different rendering" converges at the row.** Phone Control is not a second renderer;
it is a client that supplies rows from WCSession instead of computing them from bins.

**The work is therefore: implement `PhoneClient: SDRClient` (WCSession-backed) and delete the
companion's duplicate UI.** Not merge it — delete ALL of it, because the spike wins every file:

| file | spike | companion | verdict |
|---|---|---|---|
| ContentView | **96K** | 64K | spike wins |
| ControlMenu | **43K** | 25K | spike wins |
| DabView | **12K** | 7K | spike wins |
| AircraftView | **9.7K** | 7K | spike wins |
| NumpadView | 10815 | 10815 | byte-identical |
| **FmdxView** | 17K | 33K | ★ spike wins — see §2. Bigger ≠ better: the spike is space-optimised, and the companion's extra bulk is a logo pipeline being DROPPED. |

Everything else in the spike (`UberClient`, `KiwiClient`, `OwrxClient`, `AudioSocket`, `WatchAudio`,
`OpusDecoder`, `SignalProcessor`, `SpikeLink`, `LinkManager`, `Chat`, `SDRDirectory`,
`InstancePickerView`, `VibeMdns`) has no companion equivalent at all.

---

## 2. The one real reconciliation: FmdxView — and it is the LOGO PIPELINE

The companion's FM-DX view is ~2× the size of the spike's, but **not because it does more overall.**
Measured:

- **Chat: the SPIKE is ahead** — 7 refs in `FmdxView` *plus* a whole `Chat.swift` (17 refs) the
  companion does not have. It is simply factored out, so it does not show up in the file size.
- **Logos: the COMPANION is ahead** — 10 logo refs vs 1. The spike's own comment says why:
  *"no logo pipeline on the spike — the frosted fallback, always"* (`FmdxView.swift:125`). The PHONE
  can hand the watch station logos (the v8 logo work); the standalone spike has no way to fetch them.
  That is the whole Background section: 18 lines vs 57.

- **Layout: the SPIKE is ahead.** Its FM-DX view has since been **fully space-optimised** for the
  wrist. So the smaller file is the *better* one — ★ **file size is a misleading proxy here, and a
  merge that "takes the bigger file" would silently undo that layout work.**

So the reconciliation is narrow: **the spike's FmdxView is the base — keep its chat, its
learned-station dial and its optimised layout. Take ONLY the logo pipeline from the companion.**

### ★ RESOLVED — drop the logo, take nothing

**Decision (Stuart, 2026-07-19): remove the logo from the FM-DX screen in companion mode. *"The logo
is barely visible."*** Behind a frosted background on a 40mm screen it is decoration nobody can
actually see.

That was the ONLY thing the companion's FmdxView had over the spike's — so **there is no
reconciliation left. `FmdxView` needs no merge at all: the spike's version wins outright and the
companion's is deleted with the rest of its UI.**

It also removes the mode-difference problem for free: with no logo pipeline, Phone Control and
Standalone render FM-DX identically, so *"screens and options match for all services"* is satisfied
without doing any work for it.

---

## 2b. ★ Two hops, two glyphs — the status chrome changes meaning per mode

**Standalone** has ONE hop: watch → server. The node glyph reports it; the transport glyph
(iPhone/Wi-Fi/cellular) is purely informational — *how* we're reaching the internet, not how well.

**Phone Control has TWO hops**, and today only one of them is reported at all:

```
   watch  ──(A)──  iPhone  ──(B)──  server
```

- **(B) watch→phone is currently INVISIBLE.** It is a real failure point — a pocket, a wall, a flat
  phone — and the user has no way to see it.
- **(A) the node glyph must MIRROR THE PHONE'S link**, not the watch's, because in this mode the
  phone owns the server connection. The watch has no direct opinion about the server and must not
  invent one.

So in Phone Control:

| glyph | reports | source |
|---|---|---|
| triangle node | phone ↔ SERVER | the phone's own reported link health (`serverLink`, `why`) |
| iPhone / Wi-Fi icon | **watch ↔ PHONE** — gains colour | WCSession reachability + freshness of `lastStateAt` |

**Together they localise the fault at a glance**: node red + phone icon green = the server dropped;
node green + phone icon red = you have walked away from your phone. That is the same idea as the hint
pill's hop diagram, made persistent — and it is the diagnostic the companion has always lacked.

★ The transport glyph should **only** take colour in Phone Control mode. In Standalone the node glyph
already covers that hop, and colouring both would say the same thing twice — or worse, disagree.

Reuse the existing severity mapping (`LinkQuality`, `ContentView.swift`) so the two glyphs cannot
develop different ideas of what yellow means.

---

## 2c. ★ Chat must ROUTE THROUGH THE PHONE in Phone Control

**The watch must not open its own chat connection when a phone is driving.** `PhoneClient` implements
the existing chat surface (`supportsChat` / `chatLog` / `chatActivity` / `sendChat` — already
`SDRClient` requirements) by **proxying over WCSession**. One server connection, one participant.

Three reasons, and the third needs new protocol:

1. **Identity.** A second connection is a second user on the server. Switch device mid-conversation
   and you appear as two people. (`ChatIdentity` already shares one saved name across every backend —
   `Chat.swift:8`, keyed `vibe.kiwi.ident` — so the NAME matches, but a separate connection is still a
   separate participant.)
2. **History.** One log, visible on both devices. Proxying gives this for free; the watch should
   request the backlog on attach rather than starting empty.
3. **★ READ STATE — and this does not exist today.** `chatActivity` is a *bump counter*, not a read
   marker (`SpikeLink.swift:101`). So nothing stops the phone showing a pile of unread messages you
   already read on the wrist, or both devices notifying for the same line. **Needs a shared read
   watermark that syncs BOTH ways**: reading on the watch clears the phone's unread, and vice versa.
   Watermark (last-read message id/timestamp), not a count — counts drift and cannot be reconciled.

**Standalone is different and that is correct.** There the watch genuinely is its own client with its
own connection, so it *is* a separate participant — unavoidable. `ChatIdentity` at least keeps the
name consistent. Do not try to unify the two modes here; they are honestly different situations.

---

## 2d. ★ FAVOURITES SYNC — a driver for the merge, not a nice-to-have

Stuart (2026-07-19): *"we need to build the sync with the phone app of the favourites."* Already on
the picker roadmap ([[instance_picker_overhaul]]) as "favourites … phone↔spike sync".

**Today they are two unrelated stores:**

| | key | where |
|---|---|---|
| spike (watch) | `vibe.spike.favourites` | UserDefaults |
| phone | `vsdr_favourites` (+ `vsdr_rtltcp_favs`) | AsyncStorage |

Nothing connects them, so a server saved on the phone is invisible on the wrist and vice versa.

### The design problem: sync must be OPPORTUNISTIC

Standalone has **no phone**. So sync cannot be the source of truth — the watch must work fully with
its own list and reconcile *when a phone happens to be reachable*. That means both sides can edit
while apart, i.e. a genuine two-way merge:

- **Per-entry timestamps, last-write-wins.** A whole-list overwrite would silently discard whichever
  side synced second.
- ★ **Deletions are the hard case.** With a naive union merge, a favourite deleted on the phone comes
  back from the watch's copy on the next sync — the classic resurrection bug. Needs tombstones (a
  deleted-at marker kept for a while), not just absence.
- **Order is user intent** once drag-reorder lands, so it must sync too, and it conflicts differently
  from membership.
- **Don't sync the whole picker.** `lsv_last_tune:*` and `lsv_display_prefs:*` are per-device by
  design (the watch's brightness is not the phone's, see [[small_screen_splash_overlap]]).

### ★★ Do NOT sync PINs by default

`vs_pin:<host>:<port>` (`InstancePickerScreen.tsx:601`) is a **credential**, not a preference.
Pushing VibeServer PINs to a watch because a favourite synced is a security decision made on the
user's behalf. Either leave PINs device-local, or make it an explicit opt-in — never a side effect.

### Why it argues for merging FIRST

In Phone Control the WCSession pipe already exists, so sync is plumbing rather than new transport.
Building it twice — once in the companion, once in the spike — is exactly the duplication the merge
exists to remove.

---

## 2e. ★ THE PRODUCT SHAPE — and the build consequence

Stuart (2026-07-19): *"you buy VibeSDR and get VibeSDR Jr with it. VibeSDR Jr is a remote control and
remote waterfall for the main app and has wider compatibility than the full standalone VibeSDR Jr
which needs an S9 or newer."*

| mode | what it is | who does the DSP | hardware |
|---|---|---|---|
| **Phone Control** | remote control + remote waterfall for the main app | the PHONE (watch renders finished rows) | **wider — older watches** |
| **Standalone** | its own receiver: own sockets, own DSP, own Opus | the WATCH | **Series 9+** |

The split falls out of the architecture rather than being a marketing tier, which is what makes it
honest: Phone Control only renders rows, Standalone runs the whole DSP chain.

### Why ONE app and not a separate Jr listing — settled

Stuart (2026-07-19): *"we couldn't do a separate listing as we couldn't detect an already installed
version to prevent duplicates."*

A standalone Jr listing would need to know whether the buyer already owns VibeSDR, and **watchOS/iOS
gives no reliable way to detect another app's presence** — so you would get duplicate installs,
duplicate purchases and a support burden, or an entitlement-sharing scheme far heavier than the
feature warrants. Bundling is also the natural distribution: a watch app ships INSIDE its iOS host,
which is already how the V9 companion reaches users.

**So: buy VibeSDR, get Jr.** One purchase, one install, two modes. Do not re-open this — it is a
store-mechanics constraint, not a preference.

### ★★ But the build currently forbids it

`tools/build_opus_watchos.sh` states the position outright:

> *"TWO SLICES, because watchOS is two architectures: **arm64_32** — Series 4–8 (ILP32) … **arm64** —
> Series 9 onwards. JR TARGETS SERIES 9+, so this builds **arm64 ONLY**."*

So today **the binary cannot install on a Series 4–8 at all** — not merely "Standalone is
unavailable", the whole app is absent. To deliver "Phone Control has wider compatibility":

1. **Exclude Opus from the arm64_32 slice** rather than cross-compiling it. ★ **CONFIRMED by Stuart
   (2026-07-19): companion mode does no audio on the watch at all** — *"it's all done on the phone;
   the phone just sends a waterfall slice for the watch to show, and the watch sends tuning and demod
   commands back."* So on a Series 4–8 (Phone Control only) the entire audio stack is dead weight and
   libopus need never be linked.

   **The pattern already exists** — the simulator stub written today (`OpusDecoder.swift`,
   `#if targetEnvironment(simulator)`) is exactly this shape. Widen the condition to
   `#if targetEnvironment(simulator) || arch(arm64_32)` and link libopus for arm64 only. Cross-
   compiling libopus for ILP32 (which `build_opus_watchos.sh` calls "the awkward one") is then
   unnecessary.
2. **Gate the mode toggle on DEVICE CAPABILITY, not preference.** On a Series 4–8 the toggle must not
   offer Standalone; it should say plainly *why* ("standalone reception needs Series 9 or newer"),
   never silently fail or hide with no reason.
3. Re-check the smallest supported SCREEN. The script notes that dropping Series 4–8 "means the
   smallest screen to design for is 42mm rather than 41mm" — supporting them again widens the
   layout target, and today's 41mm simulator work becomes the floor rather than the edge case.

★ Do not treat this as a packaging detail. It is the difference between the product story being true
and being unshippable.

---

## 3. What must NOT regress

- **Chat** — explicitly called out. Working on both today; must survive.
- **The V9 companion is shipped and field-validated** ([[apple_watch_companion]]). Users have it. A
  merge that degrades Phone Control to make Standalone tidy is a regression for the only mode that
  currently ships.
- **WCSession stays the companion transport.** [[jr_transport_ws_two_modes]] settled this: a
  watch↔phone WebSocket is architecturally impossible out of the house. Do not re-attempt it during
  the merge.
- Link Management, per-host RTL-SDR memory, plain-English status and the interpolator cadence fix all
  landed in the SPIKE (2026-07-19). Merging before the standalone is proven means debugging new code
  inside a merge — which is why Stuart gated it.

---

## 4. Open questions

- **Where does the mode toggle live**, and can it be changed later without a reinstall? (It should be
  a setting, not a one-time choice.)
- **Does Phone Control get Link Management?** The phone owns the server link, so the watch's ladder is
  the wrong lever — the *phone's* Link Management would apply instead. Probably: hide the control in
  Phone Control mode rather than show one that does nothing.
- **One target or two?** A single target with a runtime mode is the point; confirm nothing in the
  companion's Info.plist / entitlements forces a split.
- Which app's bundle ID ships — the companion's (users have it installed) almost certainly.
