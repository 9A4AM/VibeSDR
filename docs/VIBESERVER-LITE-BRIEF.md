# VibeServer Lite — build brief

> ★★★ **SUPERSEDED FOR LINUX (Stuart, 2026-09-22).** There is no separate Linux Lite. 32-bit ARM is
> published as the ordinary `vibeserver` package (armhf, ARMv7+NEON, cross-compiled — see
> `vibeserver/linux/armhf-toolchain.cmake`) in the same apt repository, and reports itself as
> "VibeServer". *"VibeServer Lite"* now names the **Android** app for older devices only. The
> "separate apt package" rule below is retired; the performance work it describes still applies.

*Stuart, 2026-09-16: "what this is going to be is VibeServer lite. Any changes stay away from the
working VibeServer. This is a technical demo of what can be done with optimisation."*

## What it is

A VibeServer that runs on a Raspberry Pi Zero W — ARMv6, one in-order 1 GHz core, no NEON, 512 MB —
and lists itself on the public directory like any other server. A narrowband receiver: NFM, AM,
SSB and CW, and mono broadcast FM if the mono chain below is built. No DAB, no WFM stereo, no
advanced RDS, no eye, no CEQ. One listener at a time is the honest target; a second is a bonus.

The point is not the product. The point is that the same engine, optimised properly, reaches a
board most software abandons, and that Kiko's people in southern Brazil can run a receiver on a
board that costs what a coffee does.

## The rule

**VibeServer Lite is a separate flavour. Nothing built for it changes the working VibeServer.**

- Shared engine improvements (kernels, the decimation planner, the resampler) are welcome in
  `vibedsp` because every platform benefits and the test suites pin them. That is what the
  2026-09-16 optimisation pass was.
- Anything Lite needs that VibeServer does not — the mono FM chain, the stripped feature set, the
  ARMv6 packaging, a lower spectrum rate — is added as a build flavour (`VIBE_LITE`) or a config
  profile, never as a change to VibeServer's defaults or behaviour. If a Lite change would alter
  what VibeServer does, it is the wrong change.
- The two are released separately. Lite ships as its own apt package (`vibeserver-lite`, armhf,
  ARMv6 baseline) so the working server's users never receive it by accident.

## What the numbers say (measured 2026-09-16, ARMv6 build on a Pi 3, % of one A53 core)

Scale by roughly 2.5–3 for the ARM1176 in a Zero W.

| Path | Now | Zero W estimate |
|---|---|---|
| NFM 250 kS/s | 8.4 | 20–25 |
| NFM 1.024 MS/s | 16 | 40–50 |
| WFM stereo 1.024 MS/s | 51 | 130+ (no) |
| WFM mono 1.024 MS/s, as the chain stands | 43 | 110+ (no) |
| WFM mono 1.024 MS/s, 120 kHz (171 kHz channel) | 28 | 70–85 (marginal) |

Fixed costs beside the DSP: cloudflared averages ~0.5 % of a Pi 500 core and 43 MB (~5 % of a
Zero W, more while streaming); Opus encode at 48 kHz mono, unmeasured on ARMv6 — measure it, and
fall back to PCM at 24 kHz if it is more than ~10 %.

## Build order

0. **The integer CIC front end** (`VIBE_LITE` only). RTL dongles are not usable at 250 kS/s (the
   225-300 k range leaves the tuner IF wide open, aliases and drops samples), so Lite pays for a
   1.024 MS/s input. Today every input sample costs a u8→float conversion, an NCO multiply and the
   first FIR stage, all at 1 M/s on a core with no vector unit — that is the 16 % (Pi 3, ARMv6)
   against 8 % at 250 k. A third-order CIC decimating by 4, in integers, straight on the dongle's
   bytes (about ten adds per sample, no float at the input rate), then the NCO and the existing
   chain at 256 kS/s. Lite can do this because it tunes the DONGLE for its one listener, so the
   channel is near DC and the NCO moves after the decimator; VibeServer cannot, because its NCO
   before the decimator is what lets several listeners share one dongle. Expected: NFM 1.024 MS/s
   ≈ the 250 k figure (8 % Pi 3 → 20-25 % Zero W); mono FM becomes plausible with item 1.
1. **The mono FM chain** (`VIBE_LITE` only). Discriminator, then decimate to ~64 kHz *immediately*,
   then the 15 kHz low-pass and de-emphasis at that rate. Today the audio low-pass runs at the
   256 kHz channel rate, which is most of the mono cost. Let the channel sit at 150 kHz rather
   than the 256 kHz the 1.5× rule and the 150 kHz floor produce. Target: mono FM ≤ 25 % of the
   Pi 3 figure, i.e. ≤ 60 % of a Zero W. Measure with `bench_wfm` (`VIBE_WFM_MONO=1`) before and
   after; the numbers above are the baseline.
2. **The ARMv6 build.** Already in `vibeserver/CMakeLists.txt`: `-marm -march=armv6 -mfpu=vfp`
   and `-latomic` on `armv6l`. The apt flavour needs a cross-compile (32-bit containers do not run
   on the Mac): a CMake toolchain file for `arm-linux-gnueabihf` with those flags, built in the
   `vibeserver-build:bookworm-arm64-armhf` image, packaged as `vibeserver-lite`. Raspberry Pi OS
   armhf is ARMv6-baseline, so one package runs on every 32-bit Pi (without NEON on a Pi 2/3).
3. **The stripped profile.** Compile DAB, the eye, advanced RDS and CEQ out under `VIBE_LITE`
   (not disabled — out, so the binary and its RAM shrink). Spectrum at 10 fps, 512 bins. Mode
   list on the directory card is whatever the build has, so the card is honest automatically.
4. **Memory.** 512 MB shared with the GPU split and cloudflared. Check RSS under one listener;
   the pipeline's buffers are sized for 2.4 MS/s and can be trimmed for a 1.024 MS/s ceiling.
5. **Measure on the Zero W itself** before any claim — Stuart has one (2026-09-16). The Pi 3 proxy is only a proxy; the ARM1176
   has half the cache and no dual issue, and the USB and Wi-Fi share one bus.

## Not in scope

DAB (0.6 core-seconds per second of air even on NEON), WFM stereo, RDS beyond PS/RT if mono FM
lands, the pocket-box access point (see POCKET-VIBESERVER-BRIEF.md — a Zero W *could* be that box
for narrowband, later).
