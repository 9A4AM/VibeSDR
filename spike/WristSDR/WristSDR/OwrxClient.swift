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
  @Published var stationName = ""          // RDS programme-service name (WFM) → band pill
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
  nonisolated(unsafe) private var activeProfileId = ""   // read off-main in buildProfiles
  private var started = false
  private var zeroSecs = 0                                // consecutive no-data seconds (watchdog)
  private var handshaked = false

  // ── View (client-side slice of the whole-profile FFT) ──
  private var viewCenter = 0.0
  private var viewBw = 48_000.0
  nonisolated(unsafe) private var lastRow: [Float] = []

  // ── DAB speed fix (Stuart) — under-state the PCM rate so the resampler stretches DAB back to
  // correct speed/pitch. 1.0 = off. Only applied on the DAB mode. ──
  nonisolated(unsafe) var dabRateScale = 1.0

  // ── Sockets / audio / DSP ──
  // NWConnection (AudioSocket). A URLSessionWebSocketTask swap was tried and made the stall WORSE on
  // watchOS (~15 s cycles vs ~60 s) — reverted. The stall is NOT the transport: OWRX force-feeds a
  // full-profile 8192-bin FFT (~64-80 KB/s, ~16-20 fps) that it will NOT let the client throttle
  // (fps/fft_fps are ignored — measured), and the watch's link/CPU can't sustain it where a desktop can.
  nonisolated(unsafe) private let sock = AudioSocket(name: "owrx")
  nonisolated(unsafe) private let decodeQueue = DispatchQueue(label: "owrx.decode")  // FFT decode
  nonisolated(unsafe) private let audioQueue  = DispatchQueue(label: "owrx.audio")   // audio decode — SEPARATE so a slow FFT can't gap audio
  // FFT coalescing: keep only the LATEST frame so the decode queue can never build a backlog.
  private let fftLock = NSLock()
  nonisolated(unsafe) private var latestFft: [UInt8]? = nil
  nonisolated(unsafe) private var fftScheduled = false
  nonisolated(unsafe) let waterfall: WaterfallBuffer
  private let proc = SignalProcessor()
  nonisolated(unsafe) private let audio = WatchAudio()
  nonisolated(unsafe) private let audioDec = OwrxAudioDecoder()      // 12k
  nonisolated(unsafe) private let hdAudioDec = OwrxAudioDecoder()    // 48k HD/WFM
  private var rateTimer: Timer?
  nonisolated(unsafe) private var frameCount = 0        // bumped off-main; rateTimer reads/resets
  nonisolated(unsafe) private var bytesThisSec = 0      // all inbound WS bytes this second → live KB/s
  nonisolated(unsafe) private var fftThisSec = 0        // FFT frames this second → live FFT fps
  private var kbPerSec = 0                               // read by the status pill + advisory
  var inboundKbPerSec: Int { kbPerSec }                 // SDRClient — drives the heavy-server advisory
  private var fftFps = 0
  nonisolated(unsafe) private var sawFirstFrame = false
  private var everFrame = false
  // OFF by default. We PROVED (2026-07-18) watchOS will not hand the watch a direct wifi route while the
  // phone is reachable — prohibiting the `.other` relay just fails and falls back, costing a ~6 s connect
  // delay for nothing. OWRX's heavy FFT firehose only sustains on the watch's OWN wifi/cellular (phone
  // off/away), and that's the OS's call, not ours. Kept as a lever but disabled; instrumentation stays.
  private var avoidRelayActive = false
  private var preFrameSecs = 0
  private var linkIface = "?"       // which interface the socket actually came up on (wifi/cell/relay)
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
      Task { @MainActor in guard let self else { return }
        self.framesPerSec = Double(self.frameCount)
        self.kbPerSec = self.bytesThisSec / 1024; self.bytesThisSec = 0
        self.fftFps = self.fftThisSec; self.fftThisSec = 0
        if self.frameCount > 0 {
          self.retries = 0; self.zeroSecs = 0
        } else if !self.everFrame, self.avoidRelayActive, !self.retrying {
          // Still waiting for the FIRST frame on a wifi/cellular-only socket. If it never comes, the
          // watch has no non-relay route right now (phone near, wifi asleep) → drop the restriction and
          // reopen so it connects over the relay. Out-of-house this is the normal path.
          self.preFrameSecs += 1
          if self.preFrameSecs >= 6 {
            self.avoidRelayActive = false
            self.status = "no wifi — using phone"
            self.reopen()
          }
        } else if self.everFrame, !self.retrying {
          self.zeroSecs += 1
          // Recover a SILENT stall (data stops with no socket error → the spike shows 'reconnecting'
          // but nothing reconnects → stuck). 15s is long enough to tolerate OWRX's normal multi-second
          // audio stutters (FFT frames count too, so it only fires when EVERYTHING stops). No WS ping —
          // that caused the server-visible connect/disconnect churn.
          if self.zeroSecs >= 15 { self.retry(reason: "no data 15s") }
        }
        if self.everFrame, !self.retrying {
          self.status = "\(self.linkIface) \(self.kbPerSec)KB/s \(self.fftFps)fft cpu:\(Int(CpuMeter.processCpuPercent()))"
        }
        self.frameCount = 0 }
    }
    RunLoop.main.add(t, forMode: .common); rateTimer = t
    audio.start { _, _ in }
    openSocket()
  }

  private func openSocket() {
    sock.onText = { [weak self] s in self?.onText(s) }   // parse OFF main (OWRX+ floods JSON)
    // Decode on a DEDICATED queue, NOT the socket's receive queue. AudioSocket only reads the next
    // frame AFTER onData returns — so decoding inline gates reads, OWRX's send buffer fills, and it
    // STALLS after a few seconds. Copy fast + hand off, so the receive loop never waits on decode.
    sock.onData = { [weak self] d in
      guard let self else { return }
      let bytes = [UInt8](d)
      let type = bytes.first ?? 0
      self.bytesThisSec &+= d.count                        // live link load (all inbound bytes)
      if type == 1 { self.fftThisSec &+= 1 }               // live FFT rate
      if type == 1 {
        // FFT: COALESCE to the latest frame only. Never build a backlog — if decode falls a little
        // behind over time the queue would grow unbounded (memory creep → the ~1-min freeze). The
        // waterfall only needs the newest frame; older ones are stale anyway.
        self.fftLock.lock()
        self.latestFft = bytes
        let alreadyScheduled = self.fftScheduled
        self.fftScheduled = true
        self.fftLock.unlock()
        if !alreadyScheduled { self.decodeQueue.async { self.drainFft() } }
      } else {
        // Audio: must be continuous — process every frame on its OWN queue (never blocked by FFT).
        self.audioQueue.async { self.onBinary(bytes) }
      }
    }
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
          self.sock.open(url: self.wsURL, headers: [("User-Agent", Self.ua)], forceIPv4: true, autoReplyPing: false, avoidRelay: self.avoidRelayActive)
          return
        }
        if !self.everFrame, self.status != "live" { self.status = st }
        if st.contains("ready"), !self.handshaked {
          // AudioSocket reports the live interface as "owrx ws ready [wifi]" — surface it so the pill
          // shows whether OWRX is on real wifi/cellular or the phone relay.
          if let a = st.firstIndex(of: "["), let b = st.firstIndex(of: "]"), a < b {
            self.linkIface = String(st[st.index(after: a)..<b])
          }
          self.handshaked = true
          self.status = "registering"
          self.sock.send(text: "SERVER DE CLIENT client=vibesdr type=receiver")
        }
        if (st.contains("failed") || st.contains("recv:")), !self.goingIdle {
          self.retry(reason: st)
        }
      }
    }
    sock.open(url: wsURL, headers: [("User-Agent", Self.ua)], forceIPv4: true, autoReplyPing: false, avoidRelay: avoidRelayActive)
  }

  // Reopen the socket in place (same handshake path) — used to drop the wifi-only restriction and fall
  // back to the relay when no non-relay route came up.
  private func reopen() {
    preFrameSecs = 0
    handshaked = false
    sock.cancel()
    sock.open(url: wsURL, headers: [("User-Agent", Self.ua)], forceIPv4: true, autoReplyPing: false, avoidRelay: avoidRelayActive)
  }

  // Reconnect on a mid-session drop (flaky server / receive-loop stop), with backoff.
  private var retries = 0
  private var retrying = false
  private func retry(reason: String) {
    guard !retrying, !goingIdle else { return }
    retrying = true; retries += 1
    status = "reconnect \(retries): \(reason)"
    handshaked = false
    sock.cancel()
    let wait = UInt64(min(retries, 5)) * 1_500_000_000
    Task { @MainActor in
      try? await Task.sleep(nanoseconds: wait)
      self.retrying = false
      guard !self.goingIdle else { return }
      self.sock.open(url: self.wsURL, headers: [("User-Agent", Self.ua)], forceIPv4: true, autoReplyPing: false, avoidRelay: self.avoidRelayActive)
    }
  }

  nonisolated private func send(_ obj: [String: Any]) {
    guard let d = try? JSONSerialization.data(withJSONObject: obj),
          let s = String(data: d, encoding: .utf8) else { return }
    sock.send(text: s)
  }

  // ── inbound text / JSON — runs OFF the main actor; only the handled types hop to main, so the
  //    OWRX+ metadata/dial/secondary flood is parsed and dropped without ever touching the UI thread.
  nonisolated private func onText(_ data: String) {
    if data.hasPrefix("CLIENT DE SERVER") {
      // 12 kHz for the narrow demods (output_rate) but keep the full 48 kHz HD channel (hd_output_rate)
      // for WFM — broadcast FM needs the wide audio for hi-fi/stereo, and that's the whole point of the
      // BC FM listening experience. The stall fix rides on the URLSession transport, not on starving the
      // audio. If the watch still can't keep up under load, 24000 here halves the WFM decode as a fallback.
      send(["type": "connectionproperties", "params": ["output_rate": 12000, "hd_output_rate": 48000]])
      send(["type": "dspcontrol", "action": "start"])
      Task { @MainActor in self.status = "connecting" }
      return
    }
    guard let d = data.data(using: .utf8),
          let json = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
          let type = json["type"] as? String else { return }
    switch type {
    case "config":   let v = json["value"] as? [String: Any] ?? [:]; Task { @MainActor in self.onConfig(v) }
    case "profiles": let ps = buildProfiles(json["value"] as? [Any] ?? []); Task { @MainActor in self.profiles = ps }
    case "clients":  if let n = (json["value"] as? NSNumber)?.intValue { Task { @MainActor in self.clients = n } }
    case "smeter":   if let v = (json["value"] as? NSNumber)?.doubleValue, v > 0 { let db = 10 * log10(v); Task { @MainActor in self.signalDb = db } }
    case "sdr_error", "demodulator_error":
      let msg = String(describing: json["value"] ?? "OpenWebRX error"); Task { @MainActor in self.lastError = msg }
    case "metadata":
      if let v = json["value"] as? [String: Any] { onMetadata(v) }
    default: break   // parsed off-main, ignored — never reaches the UI thread
    }
  }

  /// RDS (broadcast FM) station name from the `metadata` message. Keyed protocol:'WFM'; `ps` is the
  /// 8-char programme-service name. Incremental (ps and radiotext arrive separately) so a radiotext-only
  /// update must NOT blank a known ps — only a non-empty ps updates the name. DAB/digital-voice
  /// metadata is handled on the DAB/ADS-B screens, not here.
  nonisolated private func onMetadata(_ v: [String: Any]) {
    let proto = v["protocol"] as? String
    guard proto == "WFM" || v["ps"] != nil || v["radiotext"] != nil else { return }
    if let ps = (v["ps"] as? String)?.trimmingCharacters(in: .whitespaces), !ps.isEmpty {
      Task { @MainActor in if self.stationName != ps { self.stationName = ps } }
    }
  }

  private var lastConfigCenter = 0.0
  private var pendingProfileSwitch = false   // set by selectProfile; forces demod adoption on next config
  private func onConfig(_ c: [String: Any]) {
    let prevCenter = centerFreq
    if let cf = (c["center_freq"] as? NSNumber)?.doubleValue { centerFreq = cf }
    if let sr = (c["samp_rate"] as? NSNumber)?.doubleValue { sampRate = sr }
    if let fc = c["fft_compression"] as? String { fftCompression = fc; fftCompressionSnapshot = fc }
    if let ac = c["audio_compression"] as? String { audioCompression = ac; audioCompressionSnapshot = ac }
    modeSnapshot = mode
    // A RECONNECT re-sends config for the SAME profile — preserve the VFO, zoom and demod so a blip
    // doesn't yank the view/mode back. Only reset those on a genuinely NEW profile (centre changed) OR
    // on an EXPLICIT profile switch (pendingProfileSwitch) — a switch that happens to land on a same-
    // centre profile must still adopt its demod, or the "auto demod on switch" is silently lost.
    let sameProfile = (centerFreq == prevCenter && prevCenter != 0)
    let adopt = !sameProfile || pendingProfileSwitch
    pendingProfileSwitch = false
    if adopt {
      if frequency == 0 || abs(frequency - centerFreq) > sampRate / 2, centerFreq != 0 {
        frequency = centerFreq
        if let off = (c["start_offset_freq"] as? NSNumber)?.doubleValue { frequency = centerFreq + off }
      }
      viewCenter = frequency
      // Show a GENEROUS chunk of the band by default (OWRX profiles are often multi-MHz — a 12 kHz
      // window looked "extremely zoomed"). The crown zoom narrows/widens from here.
      viewBw = min(sampRate > 0 ? sampRate : 192_000, 250_000)
      // ADOPT THE PROFILE'S DEFAULT DEMODULATOR (start_mod) so a switch lands on the right demod.
      if let sm = c["start_mod"] as? String, let spikeMode = Self.wireToSpike[sm.lowercased()] {
        mode = spikeMode; modeSnapshot = spikeMode
        if let p = Self.modeMap[spikeMode] { bwLow = p.lo; bwHigh = p.hi }
      }
      stationName = ""   // new profile/station — drop any stale RDS name until fresh metadata lands
    }
    lastConfigCenter = centerFreq
    audioDec.reset(); hdAudioDec.reset()
    sendDemod()
  }

  private static let wireToSpike: [String: String] = [
    "nfm": "fm", "fm": "fm", "wfm": "wfm", "am": "am", "sam": "sam",
    "usb": "usb", "lsb": "lsb", "cw": "cwu", "dab": "dab",
  ]

  // Decode the LATEST FFT frame (coalesced — see onData). Runs on decodeQueue.
  nonisolated private func drainFft() {
    fftLock.lock()
    let b = latestFft; latestFft = nil; fftScheduled = false
    fftLock.unlock()
    if let b { onBinary(b) }
  }

  // Profile entries can be objects {id,name} OR bare strings — handle both (like the phone). Runs
  // OFF main (a large profiles list must not be grouped on the UI thread — that's the stall).
  nonisolated private func buildProfiles(_ list: [Any]) -> [SDRProfile] {
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
    return out
  }

  nonisolated private func commonPrefix(_ strs: [String]) -> String {
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
    if now - lastFftAt < 0.16 { return }        // ~6 fps — the watch can't chew OWRX's full FFT rate
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
    frameCount &+= 1        // FFT counts as data too — the watchdog must not reconnect while the
                            // waterfall is flowing just because audio momentarily gapped.
    if !sawFirstFrame { sawFirstFrame = true; Task { @MainActor in self.everFrame = true; if self.status != "live" { self.status = "live" } } }
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
    pendingProfileSwitch = true   // force the incoming config to adopt this profile's start_mod
    profiles = profiles.map { var p = $0; p.active = (p.id == id); return p }
    audioDec.reset(); hdAudioDec.reset()
    send(["type": "selectprofile", "params": ["profile": id]])
    status = "switching profile…"
  }
}
