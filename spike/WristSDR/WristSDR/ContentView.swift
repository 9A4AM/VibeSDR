import SwiftUI
import WatchKit
import AVKit

/// The VibeSDR waterfall screen, recreated — but fed by a socket the WATCH owns.
///
/// Deliberately plain. This is a measurement rig, not a product: it shows the picture, it
/// lets you tune and zoom, and it puts the numbers that matter ON THE SCREEN so you can
/// see the cost while you are causing it.
struct ContentView: View {
  @StateObject private var client = UberClient()
  @StateObject private var vitals = Vitals()
  @Environment(\.scenePhase) private var scenePhase

  @State private var crown = 0.0
  @State private var lastDetent = 0
  @State private var zoomMode = false
  @State private var frame = 0
  @State private var showVolume = false
  @State private var showMenu = false
  @State private var showNumpad = false
  /// Tuning step, now live-settable from the hold-menu instead of the old hardcoded 9 kHz.
  @State private var stepHz: Double = 9_000
  @FocusState private var crownFocused: Bool

  /// 20fps render clock. The waterfall interpolates between the 10fps of real rows, so the
  /// scroll is smooth without the server having to send twice as much.
  private let driver = Timer.publish(every: 1.0 / 20.0, on: .main, in: .common).autoconnect()

  /// Small and wrapping — a huge detent span makes watchOS materialise a detent map that
  /// size and tick haptics across it, which hangs the main thread and gets the app killed.
  private static let detents = 1000.0

  /// The spectrum trace's fill: a 9-stop gradient sampled from the palette LUT (index
  /// 90→235, hot at the top), ported from the shipping app so the trace belongs to the same
  /// instrument as the waterfall. Starts at 90 because black-based palettes are near-invisible
  /// below that.
  private func drawSpectrum(_ ctx: GraphicsContext, _ size: CGSize, _ row: [Double],
                            peaks: [Double], height h: CGFloat) {
    ctx.fill(Path(CGRect(x: 0, y: 0, width: size.width, height: h)), with: .color(.black))
    let n = row.count
    guard n > 1 else { return }
    let wf = client.waterfall

    // Peak-preserving downsample to pixels — a narrow carrier must not fall between two
    // samples and vanish; seeing it spike is the whole point.
    let cols = max(2, Int(size.width))
    var pts: [CGPoint] = []
    pts.reserveCapacity(cols)
    for c in 0..<cols {
      let a = n * c / cols
      let b = max(a + 1, n * (c + 1) / cols)
      var peak: Double = 0
      for i in a..<min(b, n) where row[i] > peak { peak = row[i] }
      let y = h - (CGFloat(peak) / 255) * (h - 2) - 1
      pts.append(CGPoint(x: CGFloat(c) * size.width / CGFloat(cols), y: y))
    }

    let stops = (0...8).map { gi -> Gradient.Stop in
      let idx = Int((90 + (Double(gi) / 8) * 145).rounded())
      return .init(color: wf.lutColor(idx), location: 1 - Double(gi) / 8)
    }.reversed()
    var fill = Path()
    fill.move(to: CGPoint(x: 0, y: h))
    pts.forEach { fill.addLine(to: $0) }
    fill.addLine(to: CGPoint(x: size.width, y: h))
    fill.closeSubpath()
    ctx.fill(fill, with: .linearGradient(Gradient(stops: Array(stops)),
             startPoint: CGPoint(x: 0, y: 0), endPoint: CGPoint(x: 0, y: h)))

    var line = Path()
    line.addLines(pts)
    ctx.stroke(line, with: .color(wf.lutColor(235)), lineWidth: 1.2)

    // Peak hold, in a contrasting hue so it reads as a marker, not part of the trace.
    if wf.peakHold, peaks.count == n {
      var pk: [CGPoint] = []
      pk.reserveCapacity(cols)
      for c in 0..<cols {
        let a = n * c / cols
        let b = max(a + 1, n * (c + 1) / cols)
        var hi: Double = 0
        for i in a..<min(b, n) where peaks[i] > hi { hi = peaks[i] }
        pk.append(CGPoint(x: CGFloat(c) * size.width / CGFloat(cols),
                          y: h - (CGFloat(hi) / 255) * (h - 2) - 1))
      }
      var pl = Path()
      pl.addLines(pk)
      ctx.stroke(pl, with: .color(.cyan.opacity(0.9)), lineWidth: 0.9)
    }
  }

  var body: some View {
    ZStack {
      Color.black.ignoresSafeArea()

      // The waterfall itself — the same buffer the shipped watch app draws with, so the
      // picture is a fair comparison and not a different renderer flattering itself.
      //
      // The trace advances on the RENDER clock (20fps), not on the data clock (10fps):
      // rows are interpolated between real samples, which is what makes 10fps of honest
      // data look like a smooth scroll. Take that away and JR would need twice the frames
      // for the same feel — and twice the CPU we are here to measure.
      Canvas { ctx, size in
        _ = frame                                   // read it, so SwiftUI must redraw
        let wf = client.waterfall
        wf.tick(at: ProcessInfo.processInfo.systemUptime)

        // Top third = the SPECTRUM TRACE, the rest = the waterfall — the same split as the
        // shipped watch app, so the resume-lag behaviour is a fair comparison. A scrolling
        // waterfall hides a stutter; a bouncing trace shows it, which is the whole reason
        // this is here.
        let specH = (size.height / 3).rounded()

        if let img = wf.makeImage() {
          ctx.draw(Image(decorative: img, scale: 1),
                   in: CGRect(x: 0, y: specH, width: size.width, height: size.height - specH))
        }
        drawSpectrum(ctx, size, wf.specRow, peaks: wf.peakRow, height: specH)
      }
      .ignoresSafeArea()

      // The VFO — fixed at centre, the band slides under it. Same idea as the phone.
      Rectangle()
        .fill(.red.opacity(0.9))
        .frame(width: 1.5)
        .ignoresSafeArea()

      // Wrist-raise refill: the spectrum is deliberately held ~1s to line up with the audio,
      // so on resume the delay buffer is empty for a beat. Say "syncing" rather than showing a
      // frozen picture — honest, and it clears itself the instant the buffer fills.
      if client.spectrumSyncing {
        Text("SYNCING…")
          .font(.system(size: 11, weight: .semibold, design: .rounded))
          .foregroundStyle(.white.opacity(0.85))
          .padding(.horizontal, 10).padding(.vertical, 4)
          .background(.black.opacity(0.6), in: Capsule())
      }

      VStack(spacing: 0) {
        Spacer()

        // THE NUMBERS. On screen, while you cause them.
        VStack(spacing: 1) {
          Text(freqText)
            .font(.system(size: 20, weight: .semibold, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(.white)
            // Tap the frequency to TYPE one — jump bands without spinning the crown.
            .onTapGesture { showNumpad = true }

          HStack(spacing: 6) {
            Text(String(format: "CPU %.0f%%", vitals.cpu))
              .foregroundStyle(vitals.cpu > 80 ? .red : .green)
            Text(String(format: "%.0ffps", client.framesPerSec))
              .foregroundStyle(.white.opacity(0.75))
            Text(client.audioLive ? String(format: "AUD %.0f/s", client.audioPerSec) : "NO AUDIO")
              .foregroundStyle(client.audioLive ? .white.opacity(0.75) : .red)
            Text(String(format: "%.0f%%", vitals.battery * 100))
              .foregroundStyle(.white.opacity(0.55))
          }
          .font(.system(size: 9, weight: .medium, design: .rounded))
          .monospacedDigit()

          HStack(spacing: 5) {
            Text(zoomMode ? "CROWN: ZOOM" : "CROWN: TUNE")
              .foregroundStyle(zoomMode ? .yellow : .cyan)
            Text("STEP \(stepText)")
              .foregroundStyle(.white.opacity(0.6))
            Text("HOLD ▸ MENU")
              .foregroundStyle(.white.opacity(0.4))
          }
          .font(.system(size: 8, weight: .bold, design: .rounded))

          // SAY WHAT IS WRONG. This used to show the audio route once status hit "live",
          // which meant a spectrum socket that was open and silent was completely invisible
          // — the screen looked healthy and the waterfall was empty. The thing that is
          // BROKEN always wins the line.
          Text(socketLine)
            .font(.system(size: 8))
            .foregroundStyle(.white.opacity(0.7))
            .lineLimit(4)
            .multilineTextAlignment(.center)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(.black.opacity(0.72), in: RoundedRectangle(cornerRadius: 8))
        .padding(.bottom, 4)
      }

      // The way IN to volume + output. Top-left, out of the clock's way.
      VStack {
        HStack {
          Button { showVolume = true } label: {
            Image(systemName: client.audioLive ? "speaker.wave.2.fill" : "speaker.slash.fill")
              .font(.system(size: 12, weight: .semibold))
              .foregroundStyle(client.audioLive ? .white : .red)
              .frame(width: 34, height: 28)
              .background(.black.opacity(0.6), in: Capsule())
          }
          .buttonStyle(.plain)
          Spacer()
        }
        .padding(.leading, 6)
        .padding(.top, 8)
        Spacer()
      }
    }
    // WHERE THE AUDIO WENT, and how loud.
    //
    // watchOS has NO SwiftUI volume control. `VolumeView` does not exist here (that is
    // iOS/tvOS); the watch has only `AVRoutePickerView` and the storyboard-era
    // `WKInterfaceVolumeControl`, neither of which drops into a SwiftUI view.
    //
    // For JR that is a real design constraint, not an oversight to fix later: the Digital
    // Crown is the volume control on a watch, and it is only that inside a media context.
    // JR will have to CHOOSE — crown tunes, or crown sets volume — and say which, exactly
    // as the companion app does with its crown modes. Worth knowing now.
    .sheet(isPresented: $showVolume) {
      VStack(spacing: 8) {
        Text("AUDIO")
          .font(.system(size: 11, weight: .bold, design: .rounded))
          .foregroundStyle(.secondary)
        Text(client.audioRoute)
          .font(.system(size: 11, design: .rounded))
          .foregroundStyle(.white)
          .multilineTextAlignment(.center)
        Text("Volume: side-swipe → Control Centre.\nwatchOS has no in-app volume slider for SwiftUI.")
          .font(.system(size: 9))
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
      }
      .padding(.horizontal, 8)
    }
    // The hold-menu and the numpad — full-screen, the way the shipping app presents them.
    .fullScreenCover(isPresented: $showMenu) {
      SpikeMenu(client: client, stepHz: $stepHz, zoomMode: $zoomMode) { showMenu = false }
    }
    .fullScreenCover(isPresented: $showNumpad) {
      SpikeNumpad(current: client.frequency,
                  onEnter: { client.tuneTo($0) },
                  onClose: { showNumpad = false })
    }
    // LONG-PRESS anywhere → the control menu (zoom / volume / step / demod), same idiom as
    // the shipping app. (The old long-press 5fps↔10fps toggle is gone: it saved barely any
    // CPU for a visible drop in smoothness — not worth a gesture.)
    .onLongPressGesture(minimumDuration: 0.45) {
      showMenu = true
      WKInterfaceDevice.current().play(.start)
    }
    .focusable(true)
    .focused($crownFocused)
    .digitalCrownRotation($crown, from: 0, through: Self.detents, by: 1,
                          sensitivity: .medium, isContinuous: true,
                          isHapticFeedbackEnabled: true)
    .onChange(of: crown) { _, new in
      let detent = Int(new.rounded())
      guard detent != lastDetent else { return }
      // Unwrap: the crown is continuous, so 999 → 0 is one step, not a leap of 999.
      var delta = detent - lastDetent
      let range = Int(Self.detents)
      if delta >  range / 2 { delta -= range }
      if delta < -range / 2 { delta += range }
      lastDetent = detent

      if zoomMode { client.zoom(delta: delta) }
      else        { client.tune(delta: delta, step: stepHz) }
    }
    .onReceive(driver) { _ in
      frame &+= 1
      // Drain the spectrum delay queue on the MAIN actor (the Canvas draw closure is not
      // main-isolated and pushing the waterfall from there would trap).
      client.drainSpectrum(now: ProcessInfo.processInfo.systemUptime)
    }
    // WRIST UP → check the sockets are still alive. watchOS suspended us while the screen
    // was off and the WebSockets died with it; without this the waterfall never comes back.
    .onChange(of: scenePhase) { _, phase in
      switch phase {
      case .active:
        Vitals.crumb("SCENE → active")
        client.resumeSpectrum()
        client.reconnectIfNeeded()
      // Wrist down. Drop the WATERFALL only — the audio keeps playing, which is the entire
      // reason this app declares WKBackgroundModes=[audio] and a .longFormAudio session.
      case .background:
        Vitals.crumb("SCENE → background (wrist down)")
        client.suspend()
      default: break
      }
    }
    .onAppear {
      crownFocused = true
      vitals.framesPerSec = { client.framesPerSec }
      vitals.audioPerSec  = { client.audioPerSec }
      vitals.audioLive    = { client.audioLive }
      vitals.start()
      client.start()
    }
  }

  /// Whatever is most WRONG, in priority order. A screen that reports the healthy half
  /// while the broken half is silent is worse than a screen that reports nothing.
  /// BOTH sockets, side by side, always. Every round of this bug has been lost to a screen
  /// that showed one socket's story and hid the other's.
  private var socketLine: String {
    "S: \(client.specWsState.isEmpty ? "—" : client.specWsState)\nA: \(client.audioWsState.isEmpty ? "—" : client.audioWsState)"
  }

  private var diagLine: String {
    if client.unknownFlags != 0 {
      return String(format: "spec: unknown frame flags 0x%02X", client.unknownFlags)
    }
    if client.framesPerSec == 0 {
      if !client.wsDiag.isEmpty { return client.wsDiag }
      if client.status != "live" { return client.status }
      return "spec: connected, 0 frames"
    }
    if client.rowsPushed == 0 {
      // Frames arriving, no rows drawn — the data is being thrown away somewhere between
      // the socket and the screen, which is a different bug entirely.
      return "spec: \(Int(client.framesPerSec))fps but 0 rows drawn · bins=\(client.binCount)"
    }
    return client.audioRoute
  }

  private var freqText: String {
    let f = client.frequency
    if f >= 1_000_000 {
      return String(format: "%.3f MHz", f / 1_000_000)
    }
    return String(format: "%.0f kHz", f / 1_000)
  }

  private var stepText: String {
    if stepHz >= 1_000 {
      let k = stepHz / 1_000
      return k == k.rounded() ? String(format: "%.0fk", k) : String(format: "%.1fk", k)
    }
    return String(format: "%.0f", stepHz)
  }
}
