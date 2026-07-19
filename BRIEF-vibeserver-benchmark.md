# VibeServer — Benchmark & Bottleneck Finder — Brief

**Status:** design draft, not started
**Related:** `VibeServer-MultiClient-Brief.md` (§1 — "the real ceiling is host throughput, discovered
at runtime, not declared"), `tools/pi-bench`, `BRIEF-public-demo-server.md`

---

## 0. Why

A VibeServer owner currently has no way to answer the only question that matters before they share a
receiver: **"what can my hardware actually do, and what will break first?"** They find out by
inviting people in and watching it fall over.

The multi-client brief already commits to discovering the ceiling at runtime rather than declaring it
per-platform. This is the owner-facing half of that: a **Benchmark** button in VibeServer setup that
measures the host and the link, then **names the bottleneck in plain English**.

The CPU counter on the server screen (shipped 2026-07-19) is the live version of this. The benchmark
is the deliberate one.

---

## 1. Two halves, one verdict

### A. Local hardware
Reuse **`tools/pi-bench`'s workload** so results are directly comparable with the Pi figures we
already trust (SSB 30% / WFM 108% of a Pi 3 core, post-optimisation).

Measure, at 2.4 MSPS:
- Max sustainable **fftRate** before frames are dropped
- **Per-mode demod cost** — SSB, AM, WFM stereo (WFM is ~3.5× SSB, and it is the one that decides)
- Derived: **how many concurrent listeners** this host supports at each rate

### B. The link
**Upload is what matters** — serving is upstream. A download-heavy speedtest measures the wrong
direction and would flatter a typical domestic connection.

- Sustained **upstream** throughput, plus jitter (which is what the Link Management ladder reacts to)
- ★ **Distinguish LAN from internet serving.** Serving to a laptop in the same house needs no internet
  at all, and telling that owner their upload is poor is noise. Ask, or infer from whether the server
  is LAN-bound.

### C. The verdict
Output is a **sentence, not a table**: *"This phone can serve about 4 listeners at 10 fps. Your
upload is the limit beyond that."* Raw numbers underneath for the curious.

---

## 2. ★ Honesty constraints (the part that makes it worth having)

- **Peak ≠ sustained.** A 10-second burst will not reveal the thermal throttling that shows up 20
  minutes in — and a phone on a shelf serving all evening is exactly the thermally-limited case. Either
  run long enough to matter, or say plainly that it is a short-run figure.
- **A speedtest measures one moment.** Contended evening broadband is not the same connection as
  10am. Present it as an indication, not a guarantee.
- **Never run it unasked.** It burns data and battery. Explicit button, with the data cost stated
  before it starts — an owner on a metered connection must not discover the cost afterwards.
- **Don't invent a bottleneck.** If the host is comfortable and the link is fine, say so. A tool that
  always finds a problem trains people to ignore it.

---

## 3. Where it fits

- **Standalone VibeServer** — Stuart: *"a useful metric going forward for the standalone VibeServer."*
  A headless server needs this more than the phone app does; there is no screen to feel warm.
- **Multi-radio pool** — feeds the capacity guard directly ([[vibeserver_multiradio]]): the benchmark
  says how many radios/clients the host can carry, the runtime guard enforces it.
- **The Pi 5 demo server** — would have answered "can 20 users share this?" by measurement rather
  than by my arithmetic in `BRIEF-public-demo-server.md` §3.
