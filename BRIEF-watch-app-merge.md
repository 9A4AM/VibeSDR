# Apple Watch — Merging the Two Apps Into One — Brief

**Status:** design draft, not started. **Blocked on:** the standalone spike being proven working first
(Stuart, 2026-07-19: *"just want to make sure all the standalone stuff works before we do"*).
**Related:** `spike/WristSDR/` (standalone), `ios/VibeSDRWatch/` (shipped V9 companion),
[[jr_transport_ws_two_modes]], [[apple_watch_companion]], `BRIEF-menu-relocation.md`

---

## 0. The shape (Stuart's spec)

One app. A **mode toggle on first open — Standalone / Phone Control**. From there:

- **Screens and options MATCH across all services.** One menu, one set of controls, whichever mode.
- **Keep the working chat boxes.**
- **Connection and waterfall rendering stay completely separate underneath.**

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
companion's duplicate UI.** Not merge it — delete it, because:

| file | spike | companion | verdict |
|---|---|---|---|
| ContentView | **96K** | 64K | spike wins |
| ControlMenu | **43K** | 25K | spike wins |
| DabView | **12K** | 7K | spike wins |
| AircraftView | **9.7K** | 7K | spike wins |
| NumpadView | 10815 | 10815 | byte-identical |
| **FmdxView** | 17K | **33K** | ★ **companion is AHEAD — reconcile, don't discard** |

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

★ **But that pipeline only works when a phone is attached.** A merged app would show real station
logos in Phone Control and frosted fallbacks in Standalone — a visible difference between modes,
which cuts against "screens and options match for all services". Decide deliberately:
  1. accept the difference (logos are a bonus of having a phone), or
  2. give Standalone its own logo fetch (it already does its own directory + learned stations, so this
     is not out of character), or
  3. drop logos from the merged app entirely for consistency (almost certainly wrong — they are good).

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
