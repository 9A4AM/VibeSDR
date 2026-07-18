import SwiftUI

/// WristSDR — the VibeSDR JR standalone wrist receiver.
///
/// A DIRECT UberSDR client running entirely on the watch: its own sockets, its own DSP,
/// its own Opus decode, its own audio. No phone in the chain at any point.
///
/// The UI is a pixel-faithful clone of the shipping COMPANION watch app (waterfall, spectrum
/// trace, orange VFO, Sonar Green palette, control menu, numpad), but wired to `SpikeLink` —
/// a `WatchLink`-shaped adapter over the spike's own `UberClient` — instead of a WCSession
/// pipe to a phone.
///
/// A separate Xcode project with its own bundle identifier, so it cannot collide with VibeSDR
/// or its watch app on the device.
@main
struct WristSDRApp: App {
  @StateObject private var link = SpikeLink()
  @StateObject private var favs = FavStore()
  /// One-time first-use tip: the "Return to App" watch setting is what makes wrist-down listening +
  /// spectrum-resume-on-raise work (the killer feature — half-hour drives on cellular). Shown once.
  @AppStorage("seenReturnToAppTip") private var seenReturnTip = false
  @State private var showReturnTip = false

  var body: some Scene {
    WindowGroup {
      // NavigationStack so the numpad and control menu can be PUSHED, exactly as the
      // companion does — a sheet's mandatory header steals ~100pt on a watch.
      NavigationStack {
        if link.serverName.isEmpty {
          // Instance picker first — pick a server, THEN the receiver connects to it.
          InstancePickerView { server in
            link.start(url: server.url, host: server.host, type: server.serverType, name: server.name)
          }
          .environmentObject(favs)
        } else {
          // Route by screen, like the companion: DAB is a service LIST, not a waterfall band.
          switch link.screen {
          case .sdr:
            ContentView()
              .environmentObject(link)
              .navigationBarHidden(true)
          case .dab:
            DabView()
              .environmentObject(link)
              .environmentObject(favs)
              .navigationBarHidden(true)
          case .adsb:
            AircraftView()
              .environmentObject(link)
              .environmentObject(favs)
              .navigationBarHidden(true)
          }
        }
      }
      // First-use card: show once the FIRST time a server is connected (so it lands in context, not on
      // the empty picker). Explains the "Return to App" setting behind wrist-down listening.
      .onChange(of: link.serverName) { _, name in
        if !name.isEmpty, !seenReturnTip { showReturnTip = true }
      }
      .sheet(isPresented: $showReturnTip) {
        ReturnToAppTip { seenReturnTip = true; showReturnTip = false }
      }
    }
  }
}

/// One-time onboarding card: how to get uninterrupted wrist-down listening (audio keeps playing, the
/// spectrum resumes the instant you raise your wrist). It hinges on the watch NOT jumping back to the
/// clock face — the "Return to App" / "Return to Last App" setting.
struct ReturnToAppTip: View {
  let onDismiss: () -> Void
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 8) {
        HStack(spacing: 6) {
          Image(systemName: "applewatch.radiowaves.left.and.right").foregroundStyle(.orange)
          Text("Wrist-down listening").font(.headline)
        }
        Text("Great for out and about — audio keeps playing with your wrist down, and the waterfall is ready to go the instant you raise it.")
          .font(.system(size: 13)).foregroundStyle(.white.opacity(0.85))
        Text("For it to work, stop the watch jumping to the clock face:")
          .font(.system(size: 12)).foregroundStyle(.white.opacity(0.6))
        Text("Settings › General › Return to Clock → set VibeSDR to **Return to App** (or a long delay).")
          .font(.system(size: 12, weight: .medium)).foregroundStyle(.cyan)
        Button(action: onDismiss) {
          Text("Got it").font(.system(size: 15, weight: .semibold)).frame(maxWidth: .infinity)
        }.tint(.orange).padding(.top, 4)
      }
      .padding(.horizontal, 4)
    }
    .navigationTitle("Tip")
  }
}
