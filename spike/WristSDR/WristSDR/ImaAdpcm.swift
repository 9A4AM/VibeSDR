import Foundation

/// IMA-ADPCM decoder — a Swift port of `src/services/imaAdpcm.ts` ('kiwi' flavour).
///
/// KiwiSDR uses the libcsdr/Kientzle variant: the step is sampled from the CURRENT index
/// BEFORE decoding a nibble, and the index adjusts AFTER. Nibble order is low-then-high.
/// Two streams need it: the audio (persistent state, s16 clamp, server may preset via
/// `MSG audio_adpcm_state=<index>,<prev>`) and the waterfall (u8 0..255 clamp, fresh per
/// frame, drop the first 10 ADPCM-settling samples).
final class ImaAdpcmDecoder {
  private static let indexTable = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8]
  private static let stepTable: [Int] = [
    7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34,
    37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143,
    157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494,
    544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552,
    1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026,
    4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442,
    11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623,
    27086, 29794, 32767,
  ]

  private var index = 0
  private var predictor = 0
  private let clampLo: Int
  private let clampHi: Int

  init(clampLo: Int = -32768, clampHi: Int = 32767) {
    self.clampLo = clampLo
    self.clampHi = clampHi
  }

  func reset() { index = 0; predictor = 0 }

  /// Kiwi `MSG audio_adpcm_state=<index>,<prev>`.
  func setState(index: Int, predictor: Int) {
    self.index = min(max(index, 0), 88)
    self.predictor = predictor
  }

  @inline(__always) private func decodeNibble(_ nibble: Int) -> Int {
    let step = Self.stepTable[index]
    var diff = step >> 3
    if nibble & 1 != 0 { diff += step >> 2 }
    if nibble & 2 != 0 { diff += step >> 1 }
    if nibble & 4 != 0 { diff += step }
    if nibble & 8 != 0 { diff = -diff }
    predictor = min(max(predictor + diff, clampLo), clampHi)
    index = min(max(index + Self.indexTable[nibble], 0), 88)
    return predictor
  }

  /// Decode a payload (2 samples/byte, low nibble first) into Int16 PCM.
  func decode(_ data: ArraySlice<UInt8>) -> [Int16] {
    var out = [Int16](repeating: 0, count: data.count * 2)
    var o = 0
    for b in data {
      out[o] = Int16(clamping: decodeNibble(Int(b) & 0x0f)); o += 1
      out[o] = Int16(clamping: decodeNibble((Int(b) >> 4) & 0x0f)); o += 1
    }
    return out
  }
  func decode(_ data: [UInt8]) -> [Int16] { decode(data[...]) }
}

/// Kiwi waterfall frame → u8 bins (dBm = bin − 255 upstream). Fresh state per frame; the
/// first 10 samples are the ADPCM settling pad (openwebrx.js waterfall_recv).
func decodeKiwiWaterfallFrame(_ data: ArraySlice<UInt8>) -> [UInt8] {
  let dec = ImaAdpcmDecoder(clampLo: 0, clampHi: 255)
  let all = dec.decode(data)
  let pad = 10
  guard all.count > pad else { return [] }
  return all[pad...].map { UInt8(clamping: $0) }
}
