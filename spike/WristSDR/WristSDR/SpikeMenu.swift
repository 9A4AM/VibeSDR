import SwiftUI
import WatchKit

/// The hold-menu, cloned from the shipping watch app's ControlMenu so the spike can be
/// USED out and about, not just measured. Same idiom: long-press the waterfall, a scrolling
/// 2-column grid of tiles appears, each either arming the crown or opening a picker.
///
/// Pared to what the spike actually has plumbing for — Zoom, Volume, Step, Demod. The real
/// app's Brightness/Contrast/Servers/Favourites/Crown-sensitivity hang off a WatchLink this
/// spike doesn't carry, and adding them would be inventing product, not testing it.
struct SpikeMenu: View {
  @ObservedObject var client: UberClient
  @Binding var stepHz: Double
  @Binding var zoomMode: Bool
  let onClose: () -> Void

  static let modes: [String] = ["usb", "lsb", "am", "sam", "fm", "nfm", "cwu", "cwl"]
  static let steps: [Double] = [10, 100, 500, 1_000, 9_000, 10_000, 12_500, 25_000, 100_000]

  private let cols = Array(repeating: GridItem(.flexible(), spacing: 5), count: 2)
  private let closeH: CGFloat = 32

  var body: some View {
    NavigationStack {
      let h: CGFloat = 66
      VStack(spacing: 5) {
        // A visible way out, in the clock's band so it costs no height.
        HStack(spacing: 0) {
          Button(action: onClose) {
            Image(systemName: "xmark")
              .font(.system(size: 15, weight: .semibold))
              .foregroundStyle(.secondary)
              .frame(width: 36, height: closeH)
              .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          Spacer()
          Color.clear.frame(width: 70, height: 1)      // the clock's territory
        }
        .frame(height: closeH)
        .padding(.leading, 8)

        ScrollView {
          LazyVGrid(columns: cols, spacing: 5) {
            // CROWN: one tile, toggles what the crown does — same "explicit, persistent"
            // language as the real app rather than a HUD that times out.
            tile(icon: zoomMode ? "magnifyingglass" : "dial.medium.fill",
                 label: zoomMode ? "Crown: Zoom" : "Crown: Tune", h: h) {
              zoomMode.toggle()
              WKInterfaceDevice.current().play(.click)
              onClose()
            }

            // VOLUME: watchOS has no in-app slider — the Now Playing app owns it. This
            // reports where the audio is going and how to reach the level.
            NavigationLink { volumeInfo } label: {
              tileFace(name: "VOLUME", value: client.audioLive ? "ON" : "—", h: h)
            }
            .buttonStyle(.plain)

            NavigationLink {
              PickerList(title: "Step", items: Self.steps.map(stepLabel),
                         current: stepLabel(stepHz)) { label in
                if let hz = Self.steps.first(where: { stepLabel($0) == label }) { stepHz = hz }
              }
            } label: {
              tileFace(name: "STEP", value: stepLabel(stepHz), h: h)
            }
            .buttonStyle(.plain)

            NavigationLink {
              PickerList(title: "Demod", items: Self.modes, current: client.mode) { m in
                client.setMode(m)
                stepHz = Self.defaultStep(for: m)     // sensible step for the new mode
              }
            } label: {
              tileFace(name: "DEMOD", value: client.mode.uppercased(), h: h)
            }
            .buttonStyle(.plain)
          }
          .padding(.horizontal, 5)
          .padding(.bottom, 24)
        }
      }
    }
  }

  private var volumeInfo: some View {
    VStack(spacing: 8) {
      Text("AUDIO").font(.system(size: 11, weight: .bold, design: .rounded))
        .foregroundStyle(.secondary)
      Text(client.audioRoute)
        .font(.system(size: 11, design: .rounded)).foregroundStyle(.white)
        .multilineTextAlignment(.center)
      Text("Turn the Crown to set volume (this is the Now Playing app).\nOr side-swipe → Control Centre.")
        .font(.system(size: 9)).foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
    }
    .padding(.horizontal, 10)
    .navigationTitle("Volume")
  }

  // A named-value tile FACE (no button — the NavigationLink is the button).
  private func tileFace(name: String, value: String, h: CGFloat) -> some View {
    VStack(spacing: 1) {
      Text(name)
        .font(.system(size: max(9, h * 0.13), weight: .semibold, design: .rounded))
        .foregroundStyle(.secondary).lineLimit(1)
      Text(value)
        .font(.system(size: h * 0.24, weight: .semibold, design: .rounded))
        .lineLimit(1).minimumScaleFactor(0.6)
    }
    .foregroundStyle(.white)
    .frame(maxWidth: .infinity).frame(height: h)
    .background(RoundedRectangle(cornerRadius: h * 0.30).fill(.white.opacity(0.16)))
    .contentShape(Rectangle())
  }

  private func tile(icon: String, label: String, h: CGFloat,
                    action: @escaping () -> Void) -> some View {
    Button(action: action) {
      VStack(spacing: 2) {
        Image(systemName: icon).font(.system(size: h * 0.30, weight: .semibold))
        Text(label)
          .font(.system(size: h * 0.16, weight: .semibold, design: .rounded))
          .lineLimit(1).minimumScaleFactor(0.6)
      }
      .foregroundStyle(.white)
      .frame(maxWidth: .infinity).frame(height: h)
      .background(RoundedRectangle(cornerRadius: h * 0.30).fill(.white.opacity(0.16)))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }

  private func stepLabel(_ hz: Double) -> String {
    if hz <= 0 { return "—" }
    if hz >= 1_000 {
      let k = hz / 1_000
      return k == k.rounded() ? String(format: "%.0fk", k) : String(format: "%.1fk", k)
    }
    return String(format: "%.0fHz", hz)
  }

  /// A starting step that suits the mode, so switching to (say) SSB doesn't leave you
  /// jumping in 9 kHz broadcast steps.
  static func defaultStep(for mode: String) -> Double {
    switch mode {
    case "usb", "lsb", "cwu", "cwl": return 100
    case "fm":                        return 100_000
    case "nfm":                       return 12_500
    default:                          return 9_000     // am / sam — MW raster
    }
  }
}

/// Ported verbatim from the shipping app so the picker looks and behaves identically.
struct PickerList: View {
  let title: String
  let items: [String]
  let current: String
  let onPick: (String) -> Void
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    List {
      ForEach(items, id: \.self) { item in
        Button {
          onPick(item)
          dismiss()
        } label: {
          HStack {
            Text(item.uppercased())
              .font(.system(size: 16, weight: .semibold, design: .rounded))
            Spacer()
            if item.lowercased() == current.lowercased() {
              Image(systemName: "checkmark").foregroundStyle(.green)
            }
          }
        }
        .buttonStyle(.plain)
      }
    }
    .navigationTitle(title)
  }
}

/// Direct frequency entry, laid out like the system passcode pad — the same idea as the
/// shipping app's NumpadView, compacted for the spike. You dial the number you were
/// thinking of, then say whether it was kHz or MHz ("7.155" is three different
/// frequencies until you do). A native TextField is useless here: watchOS hands it the
/// alphanumeric Scribble surface, which reads "1" as "l".
struct SpikeNumpad: View {
  let current: Double
  let onEnter: (Double) -> Void          // Hz
  let onClose: () -> Void

  @State private var entry = ""
  @State private var askUnit = false
  private let cols = Array(repeating: GridItem(.flexible(), spacing: 4), count: 3)

  var body: some View {
    VStack(spacing: 4) {
      // Readout + backspace, in the clock's band.
      HStack(spacing: 6) {
        Button(action: onClose) {
          Image(systemName: "xmark").font(.system(size: 14, weight: .semibold))
            .foregroundStyle(.secondary).frame(width: 30, height: 30)
        }.buttonStyle(.plain)
        Text(entry.isEmpty ? "—" : entry)
          .font(.system(size: 18, weight: .semibold, design: .rounded))
          .monospacedDigit().foregroundStyle(.white)
          .frame(maxWidth: .infinity, alignment: .trailing).lineLimit(1).minimumScaleFactor(0.5)
        Button { if !entry.isEmpty { entry.removeLast() } } label: {
          Image(systemName: "delete.left")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(entry.isEmpty ? .clear : .white).frame(width: 30, height: 30)
        }.buttonStyle(.plain).disabled(entry.isEmpty)
      }
      .padding(.horizontal, 6)

      if askUnit {
        // Say what the number was.
        Text("that was…").font(.system(size: 11)).foregroundStyle(.secondary)
        HStack(spacing: 6) {
          unitButton("kHz", 1_000)
          unitButton("MHz", 1_000_000)
        }
        Spacer(minLength: 0)
      } else {
        LazyVGrid(columns: cols, spacing: 4) {
          ForEach(1...9, id: \.self) { key("\($0)") }
          key(".")
          key("0")
          Button { if Double(entry) != nil { askUnit = true } } label: {
            Text("↵").font(.system(size: 20, weight: .bold, design: .rounded))
              .frame(maxWidth: .infinity, minHeight: 34)
              .background(RoundedRectangle(cornerRadius: 8).fill(.green.opacity(0.28)))
              .foregroundStyle(.white)
          }.buttonStyle(.plain).disabled(Double(entry) == nil)
        }
        .padding(.horizontal, 5).padding(.bottom, 16)
      }
    }
  }

  private func key(_ s: String) -> some View {
    Button {
      if s == "." && entry.contains(".") { return }
      entry += s
    } label: {
      Text(s).font(.system(size: 20, weight: .semibold, design: .rounded))
        .frame(maxWidth: .infinity, minHeight: 34)
        .background(RoundedRectangle(cornerRadius: 8).fill(.white.opacity(0.16)))
        .foregroundStyle(.white)
    }.buttonStyle(.plain)
  }

  private func unitButton(_ label: String, _ mult: Double) -> some View {
    Button {
      if let v = Double(entry), v > 0 {
        onEnter((v * mult).rounded())
        WKInterfaceDevice.current().play(.success)
      }
      onClose()
    } label: {
      Text(label).font(.system(size: 16, weight: .semibold, design: .rounded))
        .frame(maxWidth: .infinity, minHeight: 38)
        .background(RoundedRectangle(cornerRadius: 9).fill(.white.opacity(0.18)))
        .foregroundStyle(.white)
    }.buttonStyle(.plain)
  }
}
