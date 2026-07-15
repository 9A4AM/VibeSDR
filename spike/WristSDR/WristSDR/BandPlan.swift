import SwiftUI

/// A compact HF band plan for the standalone spike — Region 1 (UK), ported from the phone's
/// src/constants/bandPlan.ts. Feeds the ticker's band label + boundary dividers (the companion
/// got these from the phone; here we compute them from the tuned frequency). UberSDR is HF
/// (10 kHz–30 MHz), so that's all we carry.
struct BandEntry {
  let lo: Double
  let hi: Double
  let name: String
  let color: Color
}

enum BandPlan {
  static let ham       = Color(red: 0xCF/255.0, green: 0,          blue: 0)
  static let broadcast = Color(red: 0x09/255.0, green: 0,          blue: 1)
  static let utility   = Color(red: 0x07/255.0, green: 0xBD/255.0, blue: 0)
  static let cb        = Color(red: 1,          green: 0x77/255.0, blue: 0)

  static let bands: [BandEntry] = [
    BandEntry(lo:       9_000, hi:    148_500, name: "LW Broadcast Band",           color: broadcast),
    BandEntry(lo:     135_700, hi:    137_800, name: "2200m Ham Band",              color: ham),
    BandEntry(lo:     148_500, hi:    283_500, name: "NDB / Navigational Beacons",  color: utility),
    BandEntry(lo:     283_500, hi:    525_000, name: "NDB / Maritime Beacons",      color: utility),
    BandEntry(lo:     472_000, hi:    479_000, name: "630m Ham Band",               color: ham),
    BandEntry(lo:     525_000, hi:  1_705_000, name: "AM Broadcast Band",           color: broadcast),
    BandEntry(lo:   1_800_000, hi:  2_000_000, name: "160m Ham Band",               color: ham),
    BandEntry(lo:   2_300_000, hi:  2_495_000, name: "120m Tropical Broadcast",     color: broadcast),
    BandEntry(lo:   2_495_000, hi:  2_850_000, name: "90m Tropical Broadcast",      color: broadcast),
    BandEntry(lo:   3_500_000, hi:  3_800_000, name: "80m Ham Band",                color: ham),
    BandEntry(lo:   3_800_000, hi:  4_000_000, name: "75m Broadcast Band",          color: broadcast),
    BandEntry(lo:   5_250_000, hi:  5_450_000, name: "60m Ham Band",                color: ham),
    BandEntry(lo:   5_900_000, hi:  6_200_000, name: "49m Broadcast Band",          color: broadcast),
    BandEntry(lo:   7_000_000, hi:  7_200_000, name: "40m Ham Band",                color: ham),
    BandEntry(lo:   7_200_000, hi:  7_450_000, name: "41m Broadcast Band",          color: broadcast),
    BandEntry(lo:   9_400_000, hi:  9_900_000, name: "31m Broadcast Band",          color: broadcast),
    BandEntry(lo:  10_100_000, hi: 10_150_000, name: "30m Ham Band",                color: ham),
    BandEntry(lo:  11_600_000, hi: 12_100_000, name: "25m Broadcast Band",          color: broadcast),
    BandEntry(lo:  13_570_000, hi: 13_870_000, name: "22m Broadcast Band",          color: broadcast),
    BandEntry(lo:  14_000_000, hi: 14_350_000, name: "20m Ham Band",                color: ham),
    BandEntry(lo:  15_100_000, hi: 15_800_000, name: "19m Broadcast Band",          color: broadcast),
    BandEntry(lo:  17_480_000, hi: 17_900_000, name: "16m Broadcast Band",          color: broadcast),
    BandEntry(lo:  18_068_000, hi: 18_168_000, name: "17m Ham Band",                color: ham),
    BandEntry(lo:  21_000_000, hi: 21_450_000, name: "15m Ham Band",                color: ham),
    BandEntry(lo:  21_450_000, hi: 21_850_000, name: "13m Broadcast Band",          color: broadcast),
    BandEntry(lo:  24_890_000, hi: 24_990_000, name: "12m Ham Band",                color: ham),
    BandEntry(lo:  26_965_000, hi: 27_405_000, name: "11m CB Band",                 color: cb),
    BandEntry(lo:  28_000_000, hi: 29_700_000, name: "10m Ham Band",                color: ham),
  ]

  /// The band containing this frequency (ham preferred on any overlap, as the phone does).
  static func band(for hz: Double) -> BandEntry? {
    if let h = bands.first(where: { $0.color == ham && hz >= $0.lo && hz <= $0.hi }) { return h }
    return bands.first { hz >= $0.lo && hz <= $0.hi }
  }
}
