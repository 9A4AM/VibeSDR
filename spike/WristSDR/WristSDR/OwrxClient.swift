import Foundation
import Combine

/// A grouped profile entry for the picker (SDR device → its profiles). `sdrName` is the device the
/// profile belongs to; `active` marks the one we're currently on.
struct SDRProfile: Identifiable, Hashable {
  let id: String        // OWRX profile id, "sdrId|profileId"
  let name: String      // profile display name (SDR prefix stripped)
  let sdrName: String   // owning SDR device name
  var active: Bool = false
}

/// A DIRECT OpenWebRX / OpenWebRX+ client on the watch — a Swift port of `src/services/OwrxAdapter.ts`.
///
/// SINGLE multiplexed WebSocket (unlike Kiwi's two): JSON text control + binary FFT (type 1) + binary
/// audio (type 2 = 12k, type 4 = 48k HD). Handshake: send `SERVER DE CLIENT …` → server `CLIENT DE
/// SERVER …` ack → `connectionproperties` + `dspcontrol start`. FFT spans the WHOLE profile
/// (center ± samp_rate/2); we slice a view window client-side. Profile switching is EXPLICIT-ONLY
/// (retunes the shared SDR for every listener — see the etiquette rule).
@MainActor
final class OwrxClient: ObservableObject, SDRClient {

  // spike mode → OWRX wire modulation + default passband (Hz offsets from carrier)
  private static let modeMap: [String: (mod: String, lo: Double, hi: Double)] = [
    "usb": ("usb", 0, 2700),   "lsb": ("lsb", -2700, 0),
    "am":  ("am", -4500, 4500), "sam": ("am", -4500, 4500),
    "fm":  ("nfm", -6250, 6250), "nfm": ("nfm", -6250, 6250),
    "cwu": ("cw", 200, 500),   "cwl": ("cw", -500, -200),
    "wfm": ("wfm", -80000, 80000),
  ]
  private static let ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"

  // ── Published surface the UI mirrors ──
  @Published var frequency: Double = 0
  @Published var mode = "am"
  @Published var bwLow: Double = -4500
  @Published var bwHigh: Double = 4500
  @Published var signalLevel: Double = 0
  @Published var signalDb: Double = 0
  @Published var framesPerSec: Double = 0
  @Published var status = "starting"
  @Published var lastError: String? = nil
  @Published var profiles: [SDRProfile] = []
  @Published var clients: Int = 0
  var rowsPushed = 0
  var displaySpanHz: Double { viewBw }

  // ── Endpoint ──
  private let hostPart: String          // host:port
  private var secure: Bool              // wss vs ws (auto-falls-back to ws on a TLS error)
  private var triedInsecureFallback = false
  private var wsURL: URL { URL(string: "\(secure ? "wss" : "ws")://\(hostPart)/ws/")! }

  // ── Server / profile state ──
  private var centerFreq = 0.0
  private var sampRate = 0.0
  private var fftCompression = "none"
  private var audioCompression = "none"
  // Snapshots read by the off-main decode paths (benign single-writer-on-config races).
  nonisolated(unsafe) private var audioCompressionSnapshot = "none"
  private var activeProfileId = ""
  private var started = false
  private var handshaked = false

  // ── View (client-side slice of the whole-profile FFT) ──
  private var viewCenter = 0.0
  private var viewBw = 48_000.0
  nonisolated(unsafe) private var lastRow: [Float] = []

  // ── DAB speed fix (Stuart) — under-state the PCM rate so the resampler stretches DAB back to
  // correct speed/pitch. 1.0 = off. Only applied on the DAB mode. ──
  nonisolated(unsafe) var dabRateScale = 1.0

  // ── Sockets / audio / DSP ──
  nonisolated(unsafe) private let sock = AudioSocket(name: "owrx")
  nonisolated(unsafe) let waterfall: WaterfallBuffer
  private let proc = SignalProcessor()
  nonisolated(unsafe) private let audio = WatchAudio()
  nonisolated(unsafe) private let audioDec = OwrxAudioDecoder()      // 12k
  nonisolated(unsafe) private let hdAudioDec = OwrxAudioDecoder()    // 48k HD/WFM
  private var rateTimer: Timer?
  nonisolated(unsafe) private var frameCount = 0        // bumped off-main; rateTimer reads/resets
  nonisolated(unsafe) private var sawFirstFrame = false
  private var everFrame = false
  nonisolated(unsafe) private var goingIdle = false

  init(url: String, waterfall: WaterfallBuffer) {
    self.waterfall = waterfall
    // http(s)://host:port[/path] → ws(s)://host:port/ws/  (bare /ws 404s — the route is exactly "/ws/")
    var u = url
    self.secure = u.hasPrefix("https") || u.hasPrefix("wss")
    for p in ["https://", "http://", "wss://", "ws://"] { if u.hasPrefix(p) { u.removeFirst(p.count) } }
    if let slash = u.firstIndex(of: "/") { u = String(u[..<slash]) }
    self.hostPart = u
    proc.autoContrast = 5
  }

  // ── Lifecycle ──
  func start() {
    started = true
    let t = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
      Task { @MainActor in guard let self else { return }; self.framesPerSec = Double(self.frameCount); self.frameCount = 0 }
    }
    RunLoop.main.add(t, forMode: .common); rateTimer = t
    audio.start { _, _ in }
    openSocket()
  }

  private func openSocket() {
    sock.onText = { [weak self] s in Task { @MainActor in self?.onText(s) } }
    sock.onData = { [weak self] d in self?.onBinary([UInt8](d)) }   // decode OFF main (Kiwi lesson)
    sock.onState = { [weak self] st in
      Task { @MainActor in
        guard let self else { return }
        // wss → ws auto-fallback: a plain-HTTP OWRX box (most self-hosted ones) refuses TLS with
        // "-9836 bad protocol version". If we tried wss and hit that, retry once as ws.
        let lower = st.lowercased()
        if self.secure, !self.triedInsecureFallback,
           lower.contains("9836") || lower.contains("protocol version") || lower.contains("tls") || lower.contains("secure") {
          self.triedInsecureFallback = true
          self.secure = false
          self.handshaked = false
          self.status = "retrying (ws)…"
          self.sock.cancel()
          self.sock.open(url: self.wsURL, headers: [("User-Agent", Self.ua)], forceIPv4: true)
          return
        }
        if !self.everFrame, self.status != "live" { self.status = st }
        if st.contains("ready"), !self.handshaked {
          self.handshaked = true
          self.status = "registering"
          self.sock.send(text: "SERVER DE CLIENT client=vibesdr type=receiver")
        }
        if (st.contains("failed") || st.contains("recv:")), !self.goingIdle {
          self.lastError = "Lost the connection to this OpenWebRX server.\n[\(st)]"
          self.status = "dropped"
        }
      }
    }
    sock.open(url: wsURL, headers: [("User-Agent", Self.ua)], forceIPv4: true)
  }

  private func send(_ obj: [String: Any]) {
    guard let d = try? JSONSerialization.data(withJSONObject: obj),
          let s = String(data: d, encoding: .utf8) else { return }
    sock.send(text: s)
  }

  // ── inbound text / JSON ──
  private func onText(_ data: String) {
    if data.hasPrefix("CLIENT DE SERVER") {
      // Server ack → negotiate output rate, then start the DSP.
      send(["type": "connectionproperties", "params": ["output_rate": 12000, "hd_output_rate": 48000]])
      send(["type": "dspcontrol", "action": "start"])
      status = "connecting"
      return
    }
    guard let d = data.data(using: .utf8),
          let json = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
          let type = json["type"] as? String else { return }
    switch type {
    case "config":   onConfig(json["value"] as? [String: Any] ?? [:])
    case "profiles": onProfiles(json["value"] as? [Any] ?? [])
    case "clients":  if let n = (json["value"] as? NSNumber)?.intValue { clients = n }
    case "smeter":   if let v = (json["value"] as? NSNumber)?.doubleValue, v > 0 { signalDb = 10 * log10(v) }
    case "sdr_error", "demodulator_error":
      lastError = String(describing: json["value"] ?? "OpenWebRX error")
    default: break
    }
  }

  private func onConfig(_ c: [String: Any]) {
    if let cf = (c["center_freq"] as? NSNumber)?.doubleValue { centerFreq = cf }
    if let sr = (c["samp_rate"] as? NSNumber)?.doubleValue { sampRate = sr }
    if let fc = c["fft_compression"] as? String { fftCompression = fc; fftCompressionSnapshot = fc }
    if let ac = c["audio_compression"] as? String { audioCompression = ac; audioCompressionSnapshot = ac }
    modeSnapshot = mode
    // Fresh profile → land the VFO at (or near) the profile centre, reset the view to a sensible span.
    if frequency == 0 || abs(frequency - centerFreq) > sampRate / 2, centerFreq != 0 {
      frequency = centerFreq
      if let off = (c["start_offset_freq"] as? NSNumber)?.doubleValue { frequency = centerFreq + off }
    }
    viewCenter = frequency
    // Show a GENEROUS chunk of the band by default (OWRX profiles are often multi-MHz — a 12 kHz
    // window looked "extremely zoomed"). The crown zoom narrows/widens from here.
    viewBw = min(sampRate > 0 ? sampRate : 192_000, 250_000)
    audioDec.reset(); hdAudioDec.reset()
    sendDemod()
  }

  // Profile entries can be objects {id,name} OR bare strings — handle both (like the phone).
  private func onProfiles(_ list: [Any]) {
    let raw: [(id: String, name: String)] = list.compactMap { el in
      if let d = el as? [String: Any] {
        let id = (d["id"] as? String) ?? String(describing: d["id"] ?? "")
        return id.isEmpty ? nil : (id, (d["name"] as? String) ?? id)
      } else if let s = el as? String { return (s, s) }
      return nil
    }
    // Group by SDR (id prefix before "|"); SDR name = common prefix of the group's profile names.
    var groups: [String: [(id: String, name: String)]] = [:]
    for r in raw { groups[String(r.id.split(separator: "|").first ?? ""), default: []].append(r) }
    var out: [SDRProfile] = []
    for (_, items) in groups.sorted(by: { $0.key < $1.key }) {
      let sdrName = commonPrefix(items.map { $0.name }).trimmingCharacters(in: .whitespaces)
      for it in items {
        var pname = it.name
        if !sdrName.isEmpty, pname.hasPrefix(sdrName) { pname = String(pname.dropFirst(sdrName.count)).trimmingCharacters(in: .whitespaces) }
        out.append(SDRProfile(id: it.id, name: pname.isEmpty ? it.name : pname,
                              sdrName: sdrName.isEmpty ? "SDR" : sdrName, active: it.id == activeProfileId))
      }
    }
    profiles = out
  }

  private func commonPrefix(_ strs: [String]) -> String {
    guard var pre = strs.first else { return "" }
    for s in strs.dropFirst() {
      var k = pre.startIndex, j = s.startIndex
      while k < pre.endIndex, j < s.endIndex, pre[k] == s[j] { k = pre.index(after: k); j = s.index(after: j) }
      pre = String(pre[..<k]); if pre.isEmpty { break }
    }
    return pre
  }

  // ── inbound binary (FFT type 1 / audio type 2,4) ──
  nonisolated private func onBinary(_ buf: [UInt8]) {
    guard buf.count > 1 else { return }
    let type = buf[0]
    let payload = buf[1...]
    switch type {
    case 1: onFft(payload)
    case 2: onAudio(payload, 12_000, audioDec)
    case 4: onAudio(payload, 48_000, hdAudioDec)
    default: break
    }
  }

  // Audio decoded + played on the socket queue (OFF main), like UberClient/KiwiClient.
  nonisolated private func onAudio(_ payload: ArraySlice<UInt8>, _ rate: Int, _ dec: OwrxAudioDecoder) {
    var pcm: [Int16]
    if audioCompressionSnapshot == "adpcm" {
      pcm = dec.decode(payload)
    } else {
      let bytes = Array(payload); let n = bytes.count >> 1
      pcm = [Int16](repeating: 0, count: n)
      for i in 0..<n { pcm[i] = Int16(bitPattern: UInt16(bytes[i*2]) | (UInt16(bytes[i*2+1]) << 8)) }  // LE
    }
    guard !pcm.isEmpty else { return }
    // DAB speed fix: under-state the rate so the resampler stretches DAB back to correct speed.
    let playRate = (modeSnapshot == "dab") ? Int(Double(rate) * dabRateScale) : rate
    audio.play(pcm: pcm, rate: Int32(playRate), channels: 1)
    frameCount &+= 1                                   // off-main; no per-frame main hop
    if !sawFirstFrame { sawFirstFrame = true; Task { @MainActor in self.everFrame = true; if self.status != "live" { self.status = "live" } } }
  }
  nonisolated(unsafe) private var modeSnapshot = "am"   // read off-main in onAudio; benign

  // FFT decoded off main; slice the view window; hop to main to enqueue the row.
  nonisolated(unsafe) private var lastFftAt = 0.0
  nonisolated private func onFft(_ payload: ArraySlice<UInt8>) {
    // THROTTLE to ~10 fps. OWRX pushes FFT fast and each frame is a whole-profile ADPCM decode +
    // DSP — at full rate that pegged a watch core (>100%). The waterfall doesn't need more than
    // ~10 fps; SKIP the decode entirely on dropped frames (the decode is the expensive part).
    let now = ProcessInfo.processInfo.systemUptime
    if now - lastFftAt < 0.095 { return }
    lastFftAt = now
    var row: [Float]
    if fftCompressionSnapshot == "adpcm" {
      row = decodeOwrxFftFrame(payload)
    } else {
      let bytes = Array(payload); let n = bytes.count / 4
      row = [Float](repeating: 0, count: n)
      bytes.withUnsafeBytes { rb in
        for i in 0..<n { row[i] = Float(bitPattern: rb.loadUnaligned(fromByteOffset: i*4, as: UInt32.self)) }
      }
    }
    guard row.count > 8 else { return }
    lastRow = row
    Task { @MainActor in self.pushSlice(row) }
  }
  nonisolated(unsafe) private var fftCompressionSnapshot = "none"

  private func defaultSpanForMode() -> Double {
    switch mode { case "wfm": return 200_000; case "fm", "nfm": return 30_000; default: return 12_000 }
  }

  // ── View slice: the FFT spans center±sampRate/2; extract [viewCenter±viewBw/2], decimate to width.
  private var specQueue: [(t: Double, row: [UInt8])] = []
  private let spectrumDelay = 0.15
  private var out256 = [UInt8]()

  private func pushSlice(_ row: [Float]) {
    guard sampRate > 0, !row.isEmpty else { return }
    let n = row.count
    let lo = centerFreq - sampRate / 2
    let hzPerBin = sampRate / Double(n)
    let vlo = viewCenter - viewBw / 2, vhi = viewCenter + viewBw / 2
    var i0 = Int((vlo - lo) / hzPerBin), i1 = Int((vhi - lo) / hzPerBin)
    i0 = max(0, min(n - 1, i0)); i1 = max(i0 + 1, min(n, i1))
    let slice = Array(row[i0..<i1])
    let processed = proc.process(slice, centerHz: viewCenter, bwHz: viewBw)
    signalLevel = proc.level
    let dec = decimate(processed, to: WaterfallBuffer.width)
    if dec.count == WaterfallBuffer.width { rowsPushed += 1; specQueue.append((ProcessInfo.processInfo.systemUptime, dec)) }
  }

  func drainSpectrum(now: Double) {
    while let first = specQueue.first, now - first.t >= spectrumDelay {
      waterfall.push(row: first.row); specQueue.removeFirst()
    }
  }

  private func decimate(_ r: [UInt8], to width: Int) -> [UInt8] {
    let n = r.count
    if n == width { return r }
    guard n > 0 else { return [] }
    if out256.count != width { out256 = [UInt8](repeating: 0, count: width) }
    let ratio = Double(n) / Double(width)
    for i in 0..<width {
      let a = Int(Double(i) * ratio), b = min(n, max(a + 1, Int(Double(i + 1) * ratio)))
      var m: UInt8 = 0; for j in a..<b { if r[j] > m { m = r[j] } }
      out256[i] = m
    }
    return out256
  }

  // ── Control ──
  private func sendDemod() {
    guard started, centerFreq != 0 else { return }
    modeSnapshot = mode; fftCompressionSnapshot = fftCompression
    let m = Self.modeMap[mode] ?? ("am", -4500, 4500)
    var params: [String: Any] = [
      "offset_freq": Int((frequency - centerFreq).rounded()),
      "mod": m.mod, "squelch_level": -150, "secondary_mod": false,
    ]
    if mode == "dab" || mode == "drm" { params["low_cut"] = NSNull(); params["high_cut"] = NSNull() }
    else { params["low_cut"] = Int(bwLow.rounded()); params["high_cut"] = Int(bwHigh.rounded()) }
    send(["type": "dspcontrol", "params": params])
  }

  func tune(delta: Int, step: Double) {
    guard delta != 0 else { return }
    let base = delta > 0 ? (frequency / step).rounded(.down) : (frequency / step).rounded(.up)
    var f = (base + Double(delta)) * step
    // CLAMP to the profile window — NEVER auto-switch (etiquette). Edge = a hard wall.
    let half = sampRate / 2
    if half > 0 { f = min(max(f, centerFreq - half), centerFreq + half) }
    guard f != frequency else { return }
    frequency = f; viewCenter = f
    sendDemod()
  }
  func tuneTo(_ hz: Double) {
    var f = hz; let half = sampRate / 2
    if half > 0 { f = min(max(f, centerFreq - half), centerFreq + half) }
    guard f != frequency else { return }
    frequency = f; viewCenter = f
    sendDemod()
  }
  func zoom(delta: Int) {
    let factor = pow(2.0, Double(-delta))
    let maxSpan = sampRate > 0 ? sampRate : 200_000
    viewBw = min(maxSpan, max(2_000, viewBw * factor))
  }
  func setVolume(_ v: Double) { audio.setVolume(Float(v)) }
  func setMode(_ m: String) {
    guard m != mode else { return }
    mode = m; modeSnapshot = m
    if let p = Self.modeMap[m] { bwLow = p.lo; bwHigh = p.hi }
    audioDec.reset(); hdAudioDec.reset()
    sendDemod()
  }
  func setBandwidth(_ low: Double, _ high: Double) { bwLow = low; bwHigh = high; sendDemod() }
  func resumeSpectrum() {}
  func suspend() { specQueue.removeAll(); status = "background · audio only" }
  func reconnectIfNeeded() {}
  func goIdle() {
    goingIdle = true
    rateTimer?.invalidate(); rateTimer = nil
    sock.cancel(); audio.stop()
    if status != "dropped" { status = "idle" }
  }

  /// EXPLICIT profile switch (from the profile menu only — never automatic). Retunes the shared SDR.
  func selectProfile(_ id: String) {
    activeProfileId = id
    profiles = profiles.map { var p = $0; p.active = (p.id == id); return p }
    audioDec.reset(); hdAudioDec.reset()
    send(["type": "selectprofile", "params": ["profile": id]])
    status = "switching profile…"
  }
}
