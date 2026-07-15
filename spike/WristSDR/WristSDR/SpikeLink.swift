import Foundation
import SwiftUI
import WatchKit

/// A `WatchLink`-shaped adapter for the STANDALONE spike.
///
/// The ported companion views (ContentView / ControlMenu / NumpadView) were written against
/// the phone-fed `WatchLink` — an `@EnvironmentObject` exposing frequency, span, the
/// waterfall buffer, the VFO colour, band-plan fields and so on. This class presents the SAME
/// published surface, but backs it with the spike's own direct-to-UberSDR `UberClient`
/// instead of a WCSession pipe to a phone.
///
/// Everything the phone used to compute and mirror (band plan, S-meter text, the two-hop
/// link diagnostics) either derives from the spike's own socket health or is stubbed blank
/// with a NOTE — there is no phone in this chain, and there is no band plan in the spike yet.
@MainActor
final class SpikeLink: ObservableObject {

  /// The direct UberSDR client — sockets, DSP, Opus, audio. Untouched except that it now
  /// draws into a buffer WE own (see `waterfall`).
  let client: UberClient

  /// The waterfall buffer, OWNED here and injected into the client so its processed 0-255
  /// rows land in the exact buffer the ported views draw from.
  ///
  /// `nonisolated(unsafe)` for the same reason `UberClient.waterfall` was: SwiftUI's `Canvas`
  /// draw closure is not main-actor-isolated, and the ported `ContentView` reads
  /// `link.waterfall` from inside it. The buffer itself is built for cross-thread use — rows
  /// in from the data path, pixels out on the render clock.
  nonisolated(unsafe) let waterfall = WaterfallBuffer()

  // ── Mirrored / derived state the ported views consume ──────────────────────
  @Published var frequency = 0.0
  @Published var span = 0.0
  @Published var snr = 0.0
  /// The spike has no server-supplied meter string (that was a phone/OWRX/FM-DX concept).
  /// STUB: blank → the readout shows "—". NOTE for later: could derive an S-meter from the
  /// DSP's own level.
  @Published var meter = ""
  /// Smoothed 0..1 meter fill behind the frequency pill. STUB: the spike's DSP does not
  /// surface a normalised level yet, so this stays 0 (empty bar). NOTE for later.
  @Published var level = 0.0
  @Published var mode = ""
  @Published var step = 9_000.0

  /// Always true — we are DIRECT, there is no phone hop to lose.
  @Published var reachable = true
  @Published var everGotRow = false
  @Published var lastRowAt: Date? = nil
  @Published var lastStateAt: Date? = nil
  /// WHY there are no rows. Direct link, so effectively always "live"; the row-gap logic in
  /// ContentView still surfaces a "spectrum stalled" hint if the socket goes quiet.
  @Published var why = "live"
  /// Derived from OUR OWN socket health: 3 while spectrum frames are flowing, 1 when they
  /// have stalled. There is no far (server↔phone) hop to score independently.
  @Published var serverLink = 3
  /// No phone → no boot handshake. Always "ready" so the placeholder shows "Waiting for
  /// signal" on a cold start rather than a phone-setup message.
  @Published var phoneStatus = "ready"

  /// LOCAL stand-ins. The watch has no in-app system-volume control (see the note in the
  /// spike's ContentView / ControlMenu), so these are cosmetic local state the crown/menu
  /// can nudge. NOTE: they do not change actual output loudness — that is Control Centre.
  @Published var volume = 1.0
  @Published var muted = false

  @Published var battery: Double = -1

  // ── Band plan: NONE yet in the spike. Left blank; the label/edges simply don't draw. ──
  @Published var bandName = ""
  @Published var bandColor: Color? = nil
  @Published var bandLo = 0.0
  @Published var bandHi = 0.0

  // ── VFO + filter, from the phone's picker originally; here, sensible defaults. ──
  /// Filter passband edges as Hz offsets from the carrier. The spike's DSP does not report
  /// them, so the dashed passband edges are suppressed (lo == hi). NOTE for later.
  @Published var filtLo = 0.0
  @Published var filtHi = 0.0
  /// VFO needle colour — ORANGE by default (#FF8C00). The user will fine-tune the exact hex
  /// on device.
  @Published var needle = Color(hex: "#FF8C00") ?? .orange
  /// Needle intensity 1…10; 7 is a slightly-brighter-than-stock starting point.
  @Published var needleI = 7.0
  @Published var peakHold = true

  /// Input-aware display unit, exactly as the companion.
  @Published var displayUnit: DisplayUnit = .auto {
    didSet { UserDefaults.standard.set(displayUnit.rawValue, forKey: "vibe.displayUnit") }
  }
  enum DisplayUnit: String { case auto, hz, khz, mhz }

  private var lastRowsPushed = 0
  private var batteryTimer: Timer?
  private var stateTick = 0

  init() {
    // Sonar Green by default, baked into the buffer before the client draws anything.
    waterfall.setLUT(Self.sonarGreenLUT)
    waterfall.peakHold = true
    client = UberClient(waterfall: waterfall)

    if let raw = UserDefaults.standard.string(forKey: "vibe.displayUnit"),
       let u = DisplayUnit(rawValue: raw) {
      displayUnit = u
    }
    // Seed the readout with the client's boot frequency/mode so the screen isn't blank
    // before the first frame lands.
    frequency = client.frequency
    mode = client.mode
    updateBand()
  }

  /// Band label + boundary edges for the ticker, from the tuned frequency (Region 1 HF plan).
  private func updateBand() {
    let b = BandPlan.band(for: frequency)
    bandName = b?.name ?? ""
    bandColor = b?.color
    bandLo = b?.lo ?? 0
    bandHi = b?.hi ?? 0
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  func start() {
    startBatteryMonitor()
    client.start()
  }

  /// Called from the ported ContentView's 20fps driver tick. Drains the audio-synced
  /// spectrum delay queue (the spike's own row cadence — MUST run on the main actor) and
  /// mirrors the client's state onto our published surface.
  func driverTick(now: Double) {
    client.drainSpectrum(now: now)

    if frequency != client.frequency { frequency = client.frequency; updateBand() }
    if mode != client.mode { mode = client.mode }
    let sp = client.spanHz
    if span != sp { span = sp }
    // Passband edges → the VFO's dashed LSB/USB lines (drawVFO), and the bandwidth UI.
    if filtLo != client.bwLow { filtLo = client.bwLow }
    if filtHi != client.bwHigh { filtHi = client.bwHigh }
    // Signal meter — bar fill + SNR text, computed for free by the spectrum DSP. Round the
    // text so it doesn't invalidate the view on sub-dB jitter.
    if abs(level - client.signalLevel) > 0.005 { level = client.signalLevel }
    let mt = "\(Int(client.signalDb.rounded()))dB"
    if meter != mt { meter = mt }

    // A new row was drawn → the spectrum is alive.
    if client.rowsPushed != lastRowsPushed {
      lastRowsPushed = client.rowsPushed
      lastRowAt = Date()
      if !everGotRow { everGotRow = true }
    }

    // Our own socket-health score, standing in for the phone's link meter.
    let sl = client.framesPerSec > 0 ? 3 : (everGotRow ? 1 : 3)
    if serverLink != sl { serverLink = sl }

    // Surface a RECONNECT so the UI shows the "Reconnecting" pill, not the hard "link lost"
    // overlay (a phone-companion concept — there's no watch↔phone link to lose here). We're
    // recovering whenever frames have stopped after having flowed, and we're NOT intentionally
    // backgrounded (wrist-down keeps the audio and drops the waterfall on purpose).
    let recovering = everGotRow && client.framesPerSec == 0 && !isBackground
    let newWhy = recovering ? "reconnecting" : "live"
    if why != newWhy { why = newWhy }

    // The "state" channel is always fresh on a direct link — touch it about once a second
    // so ContentView's hint debouncer has a clock even when rows have stopped.
    stateTick += 1
    if stateTick >= 20 { stateTick = 0; lastStateAt = Date() }
  }

  func ping() { /* no phone to announce ourselves to */ }

  /// True while the spectrum has been intentionally dropped for wrist-down (audio keeps
  /// playing). Used by the scene handler to tell a real suspend from a quick glance-away.
  var isBackground: Bool { client.status.hasPrefix("background") }

  // ── Scene lifecycle passthroughs (the spike's socket watchdog) ──────────────
  func resume() { client.resumeSpectrum() }
  func reconnectIfNeeded() { client.reconnectIfNeeded() }
  func suspend() { client.suspend() }

  // ── Controls the ported views call ──────────────────────────────────────────
  func tune(delta: Int) {
    client.tune(delta: delta, step: step)
    frequency = client.frequency
  }

  func zoom(delta: Int) { client.zoom(delta: delta) }

  /// LOCAL volume nudge — cosmetic (see `volume`). One detent = one 1/16 step, matching the
  /// companion's quantisation so the meter feels the same.
  func volume(delta: Int) {
    volume = min(1, max(0, volume + Double(delta) / 16))
    if !muted { client.setVolume(volume) }   // drives the engine's real output gain
  }

  func setMuted(_ m: Bool) {
    muted = m
    client.setVolume(m ? 0 : volume)          // real mute/unmute, not just a glyph
  }

  func setMode(_ m: String) {
    client.setMode(m)
    mode = client.mode
  }

  func setStep(_ hz: Double) { step = hz }

  /// Passband edges (Hz offsets from carrier). Pushed to the server + mirrored to filtLo/filtHi
  /// (which drive the VFO's dashed sideband lines).
  func setBandwidth(_ low: Double, _ high: Double) {
    client.setBandwidth(low, high)
    filtLo = low; filtHi = high
  }

  /// Crown step per demod: fine for voice (0.1 kHz), coarse for wide FM. Hz.
  func bwStep() -> Double {
    switch mode {
    case "wfm":               return 5_000
    case "fm", "nfm":         return 500
    default:                  return 100     // am/sam/usb/lsb/cw — 0.1 kHz
    }
  }

  /// Symmetric-sideband modes default to SYNC ON (adjusting one edge mirrors the other);
  /// SSB is asymmetric so it defaults OFF. The user can override either way.
  var symmetricMode: Bool { !(mode == "usb" || mode == "lsb") }

  /// Absolute tune, from the numpad.
  func tune(toHz hz: Double) {
    client.tuneTo(hz)
    frequency = client.frequency
  }

  // ── Battery ─────────────────────────────────────────────────────────────────
  private func startBatteryMonitor() {
    let dev = WKInterfaceDevice.current()
    dev.isBatteryMonitoringEnabled = true
    let read = { [weak self] in
      let lvl = Double(WKInterfaceDevice.current().batteryLevel)
      Task { @MainActor in self?.battery = lvl }
    }
    read()
    let t = Timer(timeInterval: 60, repeats: true) { _ in read() }
    RunLoop.main.add(t, forMode: .common)
    batteryTimer = t
  }

  // ── Sonar Green LUT ──────────────────────────────────────────────────────────
  /// The 12-stop Sonar Green gradient from `src/assets/colormaps.ts`, expanded to a 256-entry
  /// RGBA LUT by linear interpolation across the evenly-spaced stops.
  static let sonarGreenLUT: [UInt8] = {
    let stops: [(Double, Double, Double)] = [
      (0x00, 0x00, 0x00), (0x00, 0x08, 0x00), (0x00, 0x1a, 0x00), (0x00, 0x33, 0x00),
      (0x00, 0x50, 0x00), (0x00, 0x78, 0x00), (0x00, 0xaa, 0x00), (0x00, 0xcc, 0x00),
      (0x00, 0xff, 0x00), (0x80, 0xff, 0x80), (0xcc, 0xff, 0xcc), (0xef, 0xff, 0xff),
    ]
    var lut = [UInt8](repeating: 0, count: 256 * 4)
    let segs = Double(stops.count - 1)
    for i in 0..<256 {
      let p = Double(i) / 255.0 * segs
      let s = min(Int(p), stops.count - 2)
      let f = p - Double(s)
      let a = stops[s], b = stops[s + 1]
      let r = a.0 + (b.0 - a.0) * f
      let g = a.1 + (b.1 - a.1) * f
      let bl = a.2 + (b.2 - a.2) * f
      lut[i * 4 + 0] = UInt8(max(0, min(255, r.rounded())))
      lut[i * 4 + 1] = UInt8(max(0, min(255, g.rounded())))
      lut[i * 4 + 2] = UInt8(max(0, min(255, bl.rounded())))
      lut[i * 4 + 3] = 255
    }
    return lut
  }()
}

/// "#rrggbb" → Color. Shared by the adapter and the ported views (the companion carried this
/// on WatchLink; here it lives with the adapter).
extension Color {
  init?(hex: String) {
    var s = hex.trimmingCharacters(in: .whitespaces)
    if s.hasPrefix("#") { s.removeFirst() }
    guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
    self.init(
      red:   Double((v >> 16) & 0xff) / 255,
      green: Double((v >>  8) & 0xff) / 255,
      blue:  Double( v        & 0xff) / 255
    )
  }
}
