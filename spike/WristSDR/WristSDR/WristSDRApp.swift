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
    }
  }
}
