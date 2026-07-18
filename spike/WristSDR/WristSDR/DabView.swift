import SwiftUI
import WatchKit
import Combine

/// DAB: a LIST, not a band — ported from the shipping companion's DabView, wired to SpikeLink.
///
/// A DAB multiplex is one wide block carrying a dozen-odd services. There's nothing to hunt for inside
/// it and nothing to tune — the ensemble hands you an id→name map and you switch service with
/// `selectDabService`, which re-sends the demod without moving frequency. So: NO waterfall (a DAB block's
/// spectrum is a featureless slab), and the CROWN SELECTS a service (moves a cursor) rather than tuning.
/// Turning moves the cursor; tapping commits (switching on every detent would tear the audio down as you
/// spun past). The speed-fix lives in the header (the dablin chipmunk workaround), as Stuart asked.
struct DabView: View {
  @EnvironmentObject var link: SpikeLink

  @State private var cursor = 0
  @State private var crown = 0.0
  @State private var lastDetent = 0
  @State private var showProfiles = false
  @State private var showMenu = false
  @State private var showSpeed = false
  @FocusState private var crownFocused: Bool

  private var speedLabel: String {
    speeds.first { abs(link.dabScale - $0.v) < 0.001 }?.l ?? "×\(String(format: "%.2f", link.dabScale))"
  }

  private static let detents = 1000.0
  private let speeds: [(v: Double, l: String)] = [
    (1, "Off"), (0.6667, "×.67"), (0.5, "×.50"), (0.3333, "×.33"), (0.25, "×.25"),
  ]

  var body: some View {
    VStack(spacing: 0) {
      header
      list
    }
    .background(Color.black.ignoresSafeArea())
    // WATER LOCK: the crown still scrolls the cursor and the pinch gesture still fires (both bypass the
    // locked touchSCREEN), so DAB is fully usable wet — crown selects, pinch commits. `.primaryAction` is
    // the Water-Lock-capable hand-gesture hook (same one the main screen uses for crown-mode cycling).
    .overlay(alignment: .bottom) {
      Button(action: commitCursor) { Color.clear.frame(width: 1, height: 1) }
        .buttonStyle(.plain)
        .handGestureShortcut(.primaryAction)
    }
    .focusable(true)
    .focused($crownFocused)
    .digitalCrownRotation($crown, from: 0, through: Self.detents, by: 1,
                          sensitivity: .low, isContinuous: true, isHapticFeedbackEnabled: true)
    .onChange(of: crown) { _, new in
      let detent = Int(new.rounded())
      guard detent != lastDetent else { return }
      var delta = detent - lastDetent
      let range = Int(Self.detents)
      if delta >  range / 2 { delta -= range }
      if delta < -range / 2 { delta += range }
      lastDetent = detent
      let n = link.dabProgrammes.count
      guard n > 0 else { return }
      cursor = min(n - 1, max(0, cursor - delta))   // clamp, don't wrap — a list has ends (crown up = up)
    }
    .sheet(isPresented: $showProfiles) {
      ProfileSheet { id in link.selectProfile(id); showProfiles = false }
        .environmentObject(link)
    }
    // Hold-menu, same as the main screen — the familiar way back to Profiles/Servers/Volume. The list
    // rows use tap; a long press on the background opens the menu. (The header dial button is the quick
    // path; this is the muscle-memory one.)
    .onLongPressGesture(minimumDuration: 0.45) {
      WKInterfaceDevice.current().play(.click)
      showMenu = true
    }
    .navigationDestination(isPresented: $showMenu) {
      ControlMenu { _ in }.environmentObject(link)
    }
    .sheet(isPresented: $showSpeed) {
      DabSpeedSheet(current: link.dabScale, speeds: speeds) { v in link.setDabScale(v); showSpeed = false }
    }
    // Drive the client→UI mirror here too. driverTick lives on ContentView, which isn't rendered on the
    // DAB screen — without this the service list never grows and the "playing" icon never moves once you
    // land on DAB. 4 Hz is plenty for a list (no waterfall to keep smooth).
    .onReceive(Timer.publish(every: 0.25, on: .main, in: .common).autoconnect()) { _ in
      link.driverTick(now: ProcessInfo.processInfo.systemUptime)
    }
    .onAppear {
      crownFocused = true
      if let i = link.dabProgrammes.firstIndex(where: { $0.id == link.dabActiveId }) { cursor = i }
    }
    .onChange(of: link.dabActiveId) { _, id in
      if let i = link.dabProgrammes.firstIndex(where: { $0.id == id }) { cursor = i }
    }
  }

  /// Commit the service under the cursor — from a tap OR the pinch gesture (the latter works in Water
  /// Lock, where taps don't). No-op if the cursor's service is already playing.
  private func commitCursor() {
    guard link.dabProgrammes.indices.contains(cursor) else { return }
    let id = link.dabProgrammes[cursor].id
    guard id != link.dabActiveId else { return }
    link.selectDabService(id)
    WKInterfaceDevice.current().play(.click)
  }

  // MARK: - Header (ensemble + speed fix + a way out)

  private var header: some View {
    VStack(spacing: 3) {
      HStack(spacing: 5) {
        Image(systemName: "square.stack.3d.up.fill")
          .font(.system(size: 10, weight: .semibold)).foregroundStyle(.cyan)
        Text(link.dabEnsembleName.isEmpty ? "DAB" : link.dabEnsembleName)
          .font(.system(size: 12, weight: .semibold, design: .rounded))
          .foregroundStyle(.white).lineLimit(1).minimumScaleFactor(0.7)
        Spacer(minLength: 0)
        // No hold-menu on the DAB screen (it's a list, not a control surface), so profile + server
        // switching live in the header instead.
        Button { showProfiles = true } label: {
          Image(systemName: "dial.medium.fill").font(.system(size: 13)).foregroundStyle(.orange)
        }.buttonStyle(.plain)
        Button { link.backToPicker() } label: {
          Image(systemName: "antenna.radiowaves.left.and.right").font(.system(size: 12)).foregroundStyle(.white.opacity(0.7))
        }.buttonStyle(.plain)
        Color.clear.frame(width: 40, height: 1)   // the clock's territory
      }
      // Speed fix — ONE compact button (the inline presets were too small to hit). Opens a sheet with
      // big targets. The label shows the current factor so it doubles as a status readout.
      Button { showSpeed = true } label: {
        HStack(spacing: 4) {
          Image(systemName: "gauge.with.dots.needle.bottom.50percent").font(.system(size: 10, weight: .semibold))
          Text(link.dabScale != 1.0 ? "Speed Fix \(speedLabel)" : "Speed Fix").font(.system(size: 11, weight: .semibold))
        }
        .foregroundColor(link.dabScale != 1.0 ? .black : .white)
        .padding(.horizontal, 10).padding(.vertical, 4)
        .background(link.dabScale != 1.0 ? Color.orange : Color.white.opacity(0.12), in: Capsule())
      }.buttonStyle(.plain)
    }
    .padding(.horizontal, 10)
    .padding(.top, 8)
    .padding(.bottom, 4)
  }

  // MARK: - The services

  private var list: some View {
    ScrollViewReader { proxy in
      ScrollView {
        LazyVStack(spacing: 4) {
          ForEach(Array(link.dabProgrammes.enumerated()), id: \.element.id) { i, svc in
            row(svc, focused: i == cursor)
              .id(svc.id)
              .onTapGesture {
                cursor = i
                link.selectDabService(svc.id)
                WKInterfaceDevice.current().play(.click)
              }
          }
        }
        .padding(.horizontal, 8).padding(.bottom, 8)
      }
      .onChange(of: cursor) { _, i in
        guard link.dabProgrammes.indices.contains(i) else { return }
        withAnimation(.easeOut(duration: 0.15)) { proxy.scrollTo(link.dabProgrammes[i].id, anchor: .center) }
      }
    }
  }

  private func row(_ svc: DabProgramme, focused: Bool) -> some View {
    let playing = svc.id == link.dabActiveId
    return HStack(spacing: 6) {
      // PLAYING and SELECTED are different: the cursor is where the crown is, the speaker is audible.
      Image(systemName: playing ? "speaker.wave.2.fill" : "circle")
        .font(.system(size: playing ? 11 : 7, weight: .semibold))
        .foregroundStyle(playing ? .green : .white.opacity(0.3)).frame(width: 14)
      Text(svc.name)
        .font(.system(size: 14, weight: playing ? .bold : .semibold, design: .rounded))
        .foregroundStyle(playing ? .white : .white.opacity(0.85)).lineLimit(1).minimumScaleFactor(0.7)
      Spacer(minLength: 0)
    }
    .padding(.horizontal, 8).padding(.vertical, 7)
    .background(RoundedRectangle(cornerRadius: 8).fill(focused ? .cyan.opacity(0.22) : .white.opacity(0.08)))
    .overlay(RoundedRectangle(cornerRadius: 8).stroke(focused ? .cyan : .clear, lineWidth: 1.2))
  }
}

/// Big-target speed-fix picker for the DAB screen (the inline header presets were too small to tap).
/// The current factor is highlighted; picking one applies + persists it for the tuned station.
struct DabSpeedSheet: View {
  let current: Double
  let speeds: [(v: Double, l: String)]
  let onPick: (Double) -> Void
  var body: some View {
    List {
      Section(footer: Text("Fixes the dablin “chipmunk” on stations whose rate the server misreads. Remembered per station.").font(.system(size: 10))) {
        ForEach(speeds, id: \.l) { o in
          Button { onPick(o.v) } label: {
            HStack {
              Text(o.l).font(.system(size: 16, weight: .semibold))
              Spacer()
              if abs(current - o.v) < 0.001 { Image(systemName: "checkmark").foregroundColor(.orange) }
            }
          }.buttonStyle(.plain)
        }
      }
    }
    .navigationTitle("Speed fix")
  }
}
