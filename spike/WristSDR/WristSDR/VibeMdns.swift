import Foundation
import Network
import Combine

/// A VibeServer advertised on the local network via Bonjour (`_vibesdr._tcp`). `host` is the resolved
/// `host:port` ready to drop into a `ws://` URL; `pinRequired` comes from the TXT record.
struct VibeAd: Identifiable, Equatable {
  let id: String          // Bonjour service name (stable key)
  let name: String        // friendly name from the TXT `name` (falls back to the service name)
  let host: String        // resolved host:port
  let pinRequired: Bool
}

/// Watch-side mDNS discovery of VibeServers. The phone advertises `_vibesdr._tcp` with TXT keys
/// name / proto / pin; the watch browses for them so a user's own phone-server appears in the picker
/// without typing an address. (Info.plist must declare `_vibesdr._tcp` in NSBonjourServices — watchOS
/// silently blocks NWBrowser for undeclared types.)
@MainActor
final class VibeMdns: ObservableObject {
  @Published var found: [VibeAd] = []
  private var browser: NWBrowser?
  private var resolvers: [String: NWConnection] = [:]
  private var stopped = true

  func start() {
    stopped = false
    guard browser == nil else { return }
    spawnBrowser()
    scheduleWake()
  }

  /// Some watchOS network stacks don't populate the Bonjour browse from cold until there's other network
  /// activity — which is why VibeServer only appeared AFTER connecting to another instance first. Nudge it:
  /// respawn the browser every few seconds until we've actually found something (then stop nudging).
  private func scheduleWake() {
    Task { @MainActor in
      try? await Task.sleep(nanoseconds: 3_000_000_000)
      guard !stopped, found.isEmpty else { return }
      browser?.cancel(); browser = nil
      spawnBrowser()
      scheduleWake()
    }
  }

  private func spawnBrowser() {
    let params = NWParameters.tcp
    params.includePeerToPeer = false
    let b = NWBrowser(for: .bonjourWithTXTRecord(type: "_vibesdr._tcp", domain: nil), using: params)
    b.stateUpdateHandler = { [weak self] st in
      Vitals.crumb("MDNS browser state: \(st)")
      // watchOS reaps the browser periodically (-65569 DefunctConnection). Respawn on failure unless we
      // were deliberately stopped — WITHOUT clearing `found`, so the list doesn't flicker out and back.
      guard case .failed = st else { return }
      Task { @MainActor in
        guard let self, !self.stopped else { return }
        self.browser?.cancel(); self.browser = nil
        try? await Task.sleep(nanoseconds: 800_000_000)
        guard !self.stopped else { return }
        self.spawnBrowser()
      }
    }
    b.browseResultsChangedHandler = { [weak self] results, _ in
      Task { @MainActor in self?.handle(results) }
    }
    b.start(queue: .main)
    browser = b
    Vitals.crumb("MDNS browser (re)started for _vibesdr._tcp")
  }

  func stop() {
    stopped = true
    browser?.cancel(); browser = nil
    resolvers.values.forEach { $0.cancel() }; resolvers.removeAll()
    found = []
  }

  private func handle(_ results: Set<NWBrowser.Result>) {
    var live = Set<String>()
    for r in results {
      Vitals.crumb("MDNS endpoint: \(r.endpoint) meta: \(r.metadata)")
      guard case let .service(name, _, _, _) = r.endpoint else { continue }
      var pin = false
      var friendly = name
      if case let .bonjour(txt) = r.metadata {
        if let proto = Self.txt(txt, "proto"), proto != "vibeserver" { continue }   // ignore rtltcp adverts
        pin = Self.txt(txt, "pin") == "1"
        if let n = Self.txt(txt, "name"), !n.isEmpty { friendly = n }
      }
      live.insert(name)
      // Resolve host:port once per service (Bonjour gives a service endpoint, not an address).
      if resolvers[name] == nil, !found.contains(where: { $0.id == name }) {
        resolve(endpoint: r.endpoint, name: name, friendly: friendly, pin: pin)
      }
    }
    found.removeAll { !live.contains($0.id) }
  }

  private func resolve(endpoint: NWEndpoint, name: String, friendly: String, pin: Bool) {
    Vitals.crumb("MDNS resolve start: \(name)")
    let conn = NWConnection(to: endpoint, using: .tcp)
    resolvers[name] = conn
    conn.stateUpdateHandler = { [weak self] state in
      switch state {
      case .waiting(let e): Vitals.crumb("MDNS resolve \(name) waiting: \(e)")   // usually = can't route (relay)
      case .failed(let e):  Vitals.crumb("MDNS resolve \(name) failed: \(e)")
      default: break
      }
      guard case .ready = state,
            let path = conn.currentPath,
            case let .hostPort(host, port)? = path.remoteEndpoint else { return }
      // Strip any IPv6 scope id ("fe80::1%en0" → "fe80::1").
      let h = "\(host)".split(separator: "%").first.map(String.init) ?? "\(host)"
      let hp = "\(h):\(port.rawValue)"
      Vitals.crumb("MDNS resolved \(name) → \(hp) pin=\(pin)")
      Task { @MainActor in
        self?.upsert(VibeAd(id: name, name: friendly, host: hp, pinRequired: pin))
      }
      conn.cancel()
    }
    conn.start(queue: .main)
  }

  private func upsert(_ ad: VibeAd) {
    if let i = found.firstIndex(where: { $0.id == ad.id }) { found[i] = ad } else { found.append(ad) }
    resolvers[ad.id]?.cancel(); resolvers[ad.id] = nil
  }

  private static func txt(_ txt: NWTXTRecord, _ key: String) -> String? {
    if case let .string(v) = txt.getEntry(for: key) { return v }
    return nil
  }
}
