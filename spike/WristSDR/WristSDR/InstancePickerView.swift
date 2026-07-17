import SwiftUI

/// The spike's instance picker — a wrist port of the phone's InstancePickerScreen.
///
/// Favourites at the top (six sort modes + drag-to-reorder in Manual), then the directories
/// (UberSDR / Receiverbook / KiwiSDR / FM-DX) each expandable into their server list, plus a
/// manual custom-URL add. Only UberSDR is connectable today; other rows show a "soon" hint until
/// their protocol lands in the spike.
struct InstancePickerView: View {
  @EnvironmentObject var favs: FavStore
  let onConnect: (SDRServer) -> Void

  private static let amber = Color(red: 0xff/255, green: 0xaa/255, blue: 0x00/255)
  private static let cream = Color(red: 0xf5/255, green: 0xe6/255, blue: 0xc8/255)
  private static let dim   = Color.white.opacity(0.45)

  @State private var openDir: String? = nil
  @State private var lists: [String: [SDRServer]] = [:]     // directoryId -> servers
  @State private var loading: Set<String> = []
  @State private var errored: Set<String> = []
  @State private var meta: [String: (dist: Double?, snr: Double?)] = [:]   // url -> live dist/snr
  @State private var showCustom = false

  var body: some View {
    List {
      favouritesSection
      directoriesSection
      customSection
    }
    .listStyle(.carousel)
    .navigationTitle("VibeSDR")
    .task { await preloadForFavourites() }
    .sheet(isPresented: $showCustom) { CustomServerSheet { name, url, type in
      favs.addCustom(name: name, url: url, type: type)
    } }
  }

  // ── Favourites ────────────────────────────────────────────────────────────────
  @ViewBuilder private var favouritesSection: some View {
    let list = favs.sorted(meta: meta)
    Section {
      if list.isEmpty {
        Text("No favourites yet — tap ♥ on a server below.")
          .font(.system(size: 12)).foregroundColor(Self.dim)
      } else {
        ForEach(list) { f in favRow(f) }
          .onMove(perform: favs.sort == .manual ? { favs.move(from: $0, to: $1) } : nil)
      }
    } header: {
      HStack {
        Text("FAVOURITES").font(.system(size: 13, weight: .bold)).foregroundColor(Self.amber)
        Spacer()
        Button { favs.sort = favs.sort.next } label: {
          Text("⇅ \(favs.sort.label)").font(.system(size: 10, weight: .semibold)).foregroundColor(Self.amber)
        }.buttonStyle(.plain)
      }
    } footer: {
      if favs.sort == .manual {
        Text("≡ Tap and hold a server to drag it into order").font(.system(size: 10)).foregroundColor(Self.dim)
      }
    }
  }

  @ViewBuilder private func favRow(_ f: Favourite) -> some View {
    Button { connect(url: f.url, name: f.name, type: f.serverType) } label: {
      HStack(spacing: 8) {
        typeBadge(f.serverType)
        VStack(alignment: .leading, spacing: 1) {
          Text(f.name).font(.system(size: 15)).foregroundColor(Self.cream).lineLimit(1)
          Text(favSubtitle(f)).font(.system(size: 9.5)).foregroundColor(Self.dim).lineLimit(1)
        }
        Spacer()
        Button { favs.toggle(SDRServer(name: f.name, url: f.url, host: "", serverType: f.serverType)) } label: {
          Image(systemName: "heart.fill").font(.system(size: 13)).foregroundColor(.red)
        }.buttonStyle(.plain)
      }
    }.buttonStyle(.plain)
  }

  private func favSubtitle(_ f: Favourite) -> String {
    switch favs.sort {
    case .nearest:
      let d = meta[f.url.trimmedTrailingSlash.lowercased()]?.dist
      return d != nil ? "◍ \(Int(d!.rounded())) km" : "◍ distance unknown"
    case .snr:
      let s = meta[f.url.trimmedTrailingSlash.lowercased()]?.snr ?? f.bestSnr
      return s != nil ? "▲ SNR \(Int(s!.rounded())) dB" : "▽ no SNR data"
    case .type: return "▣ \(f.serverType.display)"
    default:    return f.visits > 0 ? "★ \(f.visits) visit\(f.visits == 1 ? "" : "s")" : f.url
    }
  }

  // ── Directories ───────────────────────────────────────────────────────────────
  @ViewBuilder private var directoriesSection: some View {
    Section("DIRECTORIES") {
      ForEach(Directories.all) { dir in
        Button { toggleDir(dir.id) } label: {
          HStack {
            VStack(alignment: .leading, spacing: 1) {
              Text(dir.name).font(.system(size: 15)).foregroundColor(Self.amber)
              Text(dir.desc).font(.system(size: 9.5)).foregroundColor(Self.dim).lineLimit(1)
            }
            Spacer()
            if loading.contains(dir.id) { ProgressView().scaleEffect(0.6) }
            else { Image(systemName: openDir == dir.id ? "chevron.up" : "chevron.down").foregroundColor(Self.dim) }
          }
        }.buttonStyle(.plain)

        if openDir == dir.id {
          if errored.contains(dir.id) {
            Text("Couldn't load — tap to retry").font(.system(size: 12)).foregroundColor(.orange)
              .onTapGesture { Task { await load(dir.id) } }
          }
          ForEach(sortedServers(lists[dir.id] ?? [])) { serverRow($0) }
        }
      }
    }
  }

  @ViewBuilder private func serverRow(_ s: SDRServer) -> some View {
    Button { connect(url: s.url, name: s.name, type: s.serverType) } label: {
      HStack(spacing: 8) {
        typeBadge(s.serverType)
        VStack(alignment: .leading, spacing: 1) {
          Text(s.name).font(.system(size: 14)).foregroundColor(s.full ? Self.dim : Self.cream).lineLimit(1)
          Text(serverSubtitle(s)).font(.system(size: 9)).foregroundColor(Self.dim).lineLimit(1)
        }
        Spacer()
        Button { favs.toggle(s) } label: {
          Image(systemName: favs.isFav(s.url) ? "heart.fill" : "heart")
            .font(.system(size: 13)).foregroundColor(favs.isFav(s.url) ? .red : Self.dim)
        }.buttonStyle(.plain)
      }.opacity(s.full ? 0.5 : 1)
    }.buttonStyle(.plain).disabled(s.full)
  }

  /// Simplified wrist sort: by distance from the user when the directory reports it (UberSDR gives
  /// server-side distance); otherwise by country with the user's own country first, rest alphabetical.
  private func sortedServers(_ list: [SDRServer]) -> [SDRServer] {
    let userCC = Locale.current.region?.identifier.uppercased()
    if list.contains(where: { $0.distance != nil }) {
      return list.sorted { ($0.distance ?? .infinity) < ($1.distance ?? .infinity) }
    }
    return list.sorted { a, b in
      let ac = a.countryCode ?? "ZZ", bc = b.countryCode ?? "ZZ"
      let aUser = (ac == userCC), bUser = (bc == userCC)
      if aUser != bUser { return aUser }                        // user's country first
      if ac != bc { return ac < bc }                            // then alphabetical by country
      return a.name.localizedCaseInsensitiveCompare(b.name) == .orderedAscending
    }
  }

  private func serverSubtitle(_ s: SDRServer) -> String {
    var bits: [String] = []
    if let cc = s.countryCode { bits.append(cc) } else if !s.location.isEmpty { bits.append(s.location) }
    if let d = s.distance { bits.append("\(Int(d.rounded())) km") }
    if let sn = s.bestSnr { bits.append("SNR \(Int(sn.rounded()))") }
    if !s.serverType.connectable { bits.append("· soon") }
    return bits.joined(separator: " · ")
  }

  // ── Custom URL ────────────────────────────────────────────────────────────────
  @ViewBuilder private var customSection: some View {
    Section {
      Button { showCustom = true } label: {
        Label("Add custom server", systemImage: "plus.circle").font(.system(size: 14)).foregroundColor(Self.amber)
      }.buttonStyle(.plain)
    }
  }

  // ── Badge ─────────────────────────────────────────────────────────────────────
  @ViewBuilder private func typeBadge(_ t: ServerType) -> some View {
    Text(String(t.display.prefix(1)))
      .font(.system(size: 11, weight: .bold)).foregroundColor(.black)
      .frame(width: 20, height: 20).background(Self.amber.opacity(0.85), in: Circle())
  }

  // ── Actions ───────────────────────────────────────────────────────────────────
  private func connect(url: String, name: String, type: ServerType) {
    guard type.connectable else { return }   // other protocols land as adapters are added
    let host = URL(string: url)?.host ?? url.replacingOccurrences(of: "https://", with: "")
      .replacingOccurrences(of: "http://", with: "").trimmedTrailingSlash
    favs.registerVisit(url)
    onConnect(SDRServer(name: name, url: url, host: host, serverType: type))
  }

  private func toggleDir(_ id: String) {
    if openDir == id { openDir = nil; return }
    openDir = id
    if lists[id] == nil { Task { await load(id) } }
  }

  private func load(_ id: String) async {
    errored.remove(id); loading.insert(id)
    defer { loading.remove(id) }
    do {
      let servers = try await Directories.fetch(id)
      lists[id] = servers
      ingestMeta(servers)
      favs.mergeMeta(servers)
    } catch { errored.insert(id) }
  }

  /// Preload every directory once so Nearest/SNR on favourites have data without opening each.
  private func preloadForFavourites() async {
    await withTaskGroup(of: [SDRServer].self) { group in
      for dir in Directories.all { group.addTask { (try? await Directories.fetch(dir.id)) ?? [] } }
      for await servers in group { ingestMeta(servers); favs.mergeMeta(servers) }
    }
  }

  private func ingestMeta(_ servers: [SDRServer]) {
    for s in servers {
      let k = s.url.trimmedTrailingSlash.lowercased()
      let cur = meta[k]
      meta[k] = (dist: s.distance ?? cur?.dist, snr: s.bestSnr ?? cur?.snr)
    }
  }
}

// ── Custom-server sheet ────────────────────────────────────────────────────────
struct CustomServerSheet: View {
  @Environment(\.dismiss) private var dismiss
  let onAdd: (_ name: String, _ url: String, _ type: ServerType) -> Void
  @State private var url = ""
  @State private var name = ""
  @State private var type: ServerType = .ubersdr

  var body: some View {
    List {
      Section("ADDRESS") {
        TextField("sdr.example.com", text: $url).font(.system(size: 14))
        TextField("Name (optional)", text: $name).font(.system(size: 14))
      }
      Section("TYPE") {
        Picker("Type", selection: $type) {
          ForEach(ServerType.allCases, id: \.self) { Text($0.display).tag($0) }
        }
      }
      Section {
        Button("Save favourite") {
          let clean = url.trimmingCharacters(in: .whitespaces)
          guard !clean.isEmpty else { return }
          let full = clean.contains("://") ? clean : "https://\(clean)"
          onAdd(name.trimmingCharacters(in: .whitespaces), full.trimmedTrailingSlash, type)
          dismiss()
        }.disabled(url.trimmingCharacters(in: .whitespaces).isEmpty)
      }
    }
    .navigationTitle("Custom server")
  }
}
