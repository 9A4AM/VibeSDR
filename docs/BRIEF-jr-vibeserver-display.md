# BRIEF: Jr on VibeServer — sharp waterfall, working squelch bar, one frame rate

**Project:** VibeSDR Jr (`spike/WristSDR/WristSDR/`)
**Author:** Stuart Carr (Stuey3D) with Claude, 2026-09-17
**Status:** BUILT 2026-09-17 (fixes 1–4; §6 is measure-only and still open). Ships in the next Jr
build. Also in that build: the frequency pad on a shared dial refuses to open until tuning is armed
and says where the arm switch is.

---

## 1. Symptoms (Stuart, same signal, same watch)

- **Waterfall:** on a VibeServer, Jr's waterfall is coarse and blurry. On UberSDR it is clean.
  It is worst on single-user and shared-VFO radios, and only slightly better on
  independent-tuner radios.
- **Squelch sheet:** on a VibeServer the signal bar is pinned at full. On UberSDR it tracks the
  signal. The squelch itself works; only the indication is wrong.

## 2. Fix 1 — oversample: ask VibeServer for 1024 bins, reduce on the watch

**Cause.** `UberClient.openSpectrum()` asks VibeServer for exactly the display width:

```swift
let binsParam = isVibe ? "&bins=\(WaterfallBuffer.width)" : ""   // 128
```

Every other backend sends Jr more than it draws, and Jr reduces on the watch:

| Backend | Bins received |
|---|---|
| UberSDR | 1024 |
| KiwiSDR | 1024 |
| OpenWebRX | The profile's full FFT size |
| VibeServer | 128 |

On a VibeServer, `SignalProcessor`'s 5-tap `[1,2,3,2,1]/9` smooth therefore runs at display
resolution. A one-pixel carrier is smeared across five pixels and loses about 4.8 dB of peak.
At 1024 bins the same smooth covers less than one output pixel after the 8× peak-hold
`decimate()`.

**Change.**

```swift
let binsParam = isVibe ? "&bins=1024" : ""
```

Nothing else needs to change for this fix. `onSpectrumBinary` resizes to the frame length,
the unwrap, smooth and auto-range run as they do for UberSDR, and the span clamp (~2756) already
uses the server's own `binCount` from config.

**Rewrite the comment above `binsParam`.** It currently says "ask for exactly our waterfall
width… Cuts each SPEC frame ~32x". Replace it with the reason for 1024 (oversampling keeps the
picture sharp; 128 made Jr smooth at display resolution), so nobody "optimises" it back.

**TRAP — send 1024 explicitly.** Omitting `bins=` gives 1024 today only because of the server's
`WIRE_BINS_DEFAULT`, which was 4096 before 4 August. Older servers would send Jr 4096 bins.

**TRAP — 1024 is also the ceiling.** When `perClientDsp()` is true, the server caps `bins` at
1024, and the zoom FFT runs at the widest request. Jr at 1024 costs other listeners nothing
there, and anything larger would be silently capped.

## 3. Fix 2 — instant local zoom, up to 8×

1024 bins drawn at 128 pixels leaves 8× headroom. Jr can crop the last real row by up to 8× and
still have at least one genuine bin per pixel.

**Change.** On a crown zoom (VibeServer only to start with):

1. **Crop at once:** crop the last 1024-bin row around the VFO and draw it immediately.
2. **Hand over:** once the server confirms the new span (the existing `specSubscribeSeq` gate),
   switch to its rows, which are again 1024 real bins over the new span.

This removes the pause at each zoom step while Jr waits for the server.

**TRAP — crop after the unwrap.** Take the crop from the unwrapped row (after the unwrap at
~2172). Cropping the raw frame centres on the wrong bin.

**TRAP — rows in flight have the old span.** Frames that arrive between the crown turn and the
server's confirmation still carry the old span. Keep cropping them until the new scale is
confirmed, or the waterfall jumps back for a frame or two.

**TRAP — never crop beyond 8×.** Clamp the local crop at 8× (and keep the 2 MHz widest-span
clamp). Beyond that, hold the last real row until the server's arrives. Never stretch bins to
fill pixels.

## 4. Fix 3 — squelch bar reads the server's gate value

**Cause.** On a VibeServer, `SpikeLink.sqlNorm` uses the dBFS scale `(db + 130) / 90`, but it is
fed `client.signalDb`. For a VibeServer that is `proc.snrDb`, the spectrum SNR, because
`chanSnr` is only set on the UberSDR audio path. An SNR of 25 dB gives (25 + 130) / 90 = 1.7,
which clamps to 1, so the bar is always full.

The server already sends the value its gate compares, on the spectrum socket every frame:

```json
{"type":"sig","chan":<dBFS>,"floor":<dBFS>}
```

With per-listener squelch, `chan` is that listener's own `sigChanDb`. The web client uses this
message; Jr ignores it.

**Change.**

1. **Read `sig`:** in the JSON handler (`UberClient.swift` ~2275), when `isVibe`, handle `sig`:
   set `chanDbfs = chan` and `chanSnr = chan - floor`. Also mark the values as fresh, so the
   existing packet-over-spectrum preference applies.
2. **Feed the needle the gate's unit:** in `SpikeLink.pollSignal` and the ~771 path, pass
   `signalDbfs` on a VibeServer and `signalDb` elsewhere. Add a single computed property (e.g.
   `client.sqlNeedleDb`) so the rule lives in one place.
3. **Check the result:** on the same signal, the bar and the Passing/Off label should agree with
   when the audio actually opens.

**TRAP — the −30 correction is UberSDR-only.** It corrects radiod's audio-packet SNR offset.
Never apply it to the VibeServer `chan − floor` figure.

**TRAP — old Jr builds stay broken.** No server change can fix the indicator for the current
store Jr. This fix ships in the V11 Jr.

## 5. Fix 4 — one frame rate: 5 fps on every backend and connection

**Decision (Stuart).** 5 fps looks good on the watch, and Jr's row interpolation smooths it.
Remove the relay-versus-own-connection rate switching.

**Current state.**

- **VibeServer (checked):** `applyVibeFrameRate()` asks for 5 fps on the phone relay and **15**
  otherwise.
- **UberSDR, Kiwi (not checked):** their off-relay targets are believed to be 10–20. Read
  `LinkManager` and the Kiwi client before changing them.
- **OpenWebRX:** ignores rate requests. Jr keeps thinning its frames locally.

**Change.**

1. **Fixed target:** 5 fps on every backend and connection.
2. **Keep sending it:** `applyVibeFrameRate()` still sends `fftRate: 5` on every spectrum
   (re)connect. Only the `onRelay ? 5 : 15` choice goes. The same applies to UberSDR's
   `set_rate` divisor and Kiwi's equivalent.
3. **Interpolator:** `setExpectedRowRate(5)` is always seeded.
4. **Result:** at 1024 bins, VibeServer and UberSDR now cost the same on every connection
   (about 42 kb/s for 1024 u8 bins plus the 22-byte header at 5 fps).

**TRAP — don't delete the rate request.** A VibeServer listener who never asks for a rate sits on
the server's 2 fps idle floor. That is the bug described above `setFftRate`.

**TRAP — keep the ability to back off.** Fix the *target* at 5, but leave `LinkManager` able to
step down on a failing link, or a weak cellular connection will stall instead of degrading.

**TRAP — re-check the audio alignment.** The waterfall's ~1 s delay to line up with the audio
cushion is now only 5 rows. The old tuning was done at 15, so confirm it still lines up.

**TRAP — VibeServer frames are uncompressed.** VibeServer sends full `binary8` frames (0x03)
only. UberSDR's measured rate benefits from delta frames, so compare the kB/s in Jr's link
readout rather than working it out.

## 6. Measure only — the server's wide-path peak-hold

On single-user and shared-VFO radios, `onSpectrum` peak-holds `step` source bins into each
output bin. Zoomed out, that is many noisy bins per pixel, so the floor sits higher and looks
grainier than radiod's power-averaged bins. The channeliser (zoom) path builds real bins, which
is why independent-tuner radios look slightly cleaner.

**Do not change this in this brief.** After fixes 1–3 ship, compare Jr on the same signal and
antenna in three setups: a VibeServer single/shared radio, a VibeServer independent-tuner radio,
and UberSDR. Only if the wide path is still visibly worse, prototype averaging linear power over
groups of 2–4 source bins, then peak-holding the group means, and judge it on the same
comparison.

**TRAP — test more than one arrangement.** On the channeliser path the zoom FFT is sized to the
widest request, so compare with Jr as the only listener and with a browser also connected.

## 7. Done when

- Jr on a VibeServer receives 1024-bin frames (Jr's debug log shows the frame size) and matches
  UberSDR's sharpness on the same signal.
- Crown zoom on a VibeServer paints immediately up to 8×, with no jump back and no stretched bins.
- The VibeServer squelch bar tracks the signal, and Passing/Off matches the audio.
- Jr asks for 5 fps on every backend and connection, and a VibeServer never drops to the 2 fps
  idle floor.
- The kB/s readout is recorded for a VibeServer and UberSDR session on the relay and on Wi-Fi.
- Wide-path comparison results are noted in this brief (§6).
