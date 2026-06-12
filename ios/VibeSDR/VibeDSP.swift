import Foundation

// Client-side noise DSP — verbatim Swift ports of the reference skin's
// engines, run on VibePowerModule's audioQ against the MONO packet-rate
// feed (pre 48k conversion), exactly where the skin ran them (its Web Audio
// context followed the stream sample rate, so all tuning constants carry
// over unchanged):
//   NR  — websdr-nr.js   entropy-VAD STFT masker (512-pt, 4096 blocks)
//   NR2 — nr2.js         spectral subtraction    (2048-pt, hop 512)
//   NB  — noise-blanker.js amplitude+flatness impulse blanker (per sample;
//         the JS post-blank FIR bandpass is omitted — the server already
//         band-limits the passband)
// All engines use Double internally (JS does float64 arithmetic).

// MARK: - Radix-2 FFT (port of fft512 / fft.js — same conventions)

final class RadixFFT {
  let n: Int
  private let bits: Int
  private let bitrev: [Int]
  private let twRe: [Double]
  private let twIm: [Double]

  init(size: Int) {
    n = size
    var b = 0; while (1 << b) < size { b += 1 }
    bits = b
    var rev = [Int](repeating: 0, count: size)
    for i in 0..<size {
      var j = 0
      for k in 0..<b { j = (j << 1) | ((i >> k) & 1) }
      rev[i] = j
    }
    bitrev = rev
    let half = size / 2
    var tr = [Double](repeating: 0, count: half)
    var ti = [Double](repeating: 0, count: half)
    for i in 0..<half {
      let a = -2.0 * Double.pi * Double(i) / Double(size)
      tr[i] = cos(a); ti[i] = sin(a)
    }
    twRe = tr; twIm = ti
  }

  func forward(_ re: inout [Double], _ im: inout [Double]) {
    for i in 0..<n {
      let j = bitrev[i]
      if i < j { re.swapAt(i, j); im.swapAt(i, j) }
    }
    var s = 1, len = 2
    while len <= n {
      let half = len >> 1
      let step = n >> s
      var i = 0
      while i < n {
        for j in 0..<half {
          let twIdx = j * step
          let tRe = twRe[twIdx], tIm = twIm[twIdx]
          let idx1 = i + j, idx2 = idx1 + half
          let uRe = re[idx1], uIm = im[idx1]
          let vRe = re[idx2] * tRe - im[idx2] * tIm
          let vIm = re[idx2] * tIm + im[idx2] * tRe
          re[idx1] = uRe + vRe; im[idx1] = uIm + vIm
          re[idx2] = uRe - vRe; im[idx2] = uIm - vIm
        }
        i += len
      }
      s += 1; len <<= 1
    }
  }

  func inverse(_ re: inout [Double], _ im: inout [Double]) {
    for i in 0..<n { im[i] = -im[i] }
    forward(&re, &im)
    let inv = 1.0 / Double(n)
    for i in 0..<n { re[i] *= inv; im[i] = -im[i] * inv }
  }

  static func hannWindow(_ size: Int) -> [Double] {
    var w = [Double](repeating: 0, count: size)
    for i in 0..<size { w[i] = 0.5 * (1 - cos(2 * Double.pi * Double(i) / Double(size - 1))) }
    return w
  }
}

// MARK: - NR2 spectral subtraction (port of NR2Processor, hop-exact feed)

final class NR2Engine {
  private let fftSize = 2048
  private let hopSize = 512
  private let fft = RadixFFT(size: 2048)
  private let window = RadixFFT.hannWindow(2048)

  private var inputBuffer  = [Double](repeating: 0, count: 2048)
  private var outputBuffer = [Double](repeating: 0, count: 2048)
  private var real = [Double](repeating: 0, count: 2048)
  private var imag = [Double](repeating: 0, count: 2048)
  private var magnitude = [Double](repeating: 0, count: 1025)

  private var noiseProfile = [Double](repeating: 0, count: 1025)
  private var noiseProfileCount = 0
  private let learningFrames = 30
  private var isLearning = true

  private let adaptiveNoiseTracking = true
  var noiseAdaptRate = 0.01
  private let signalThreshold = 2.0
  var alpha = 2.0   // over-subtraction factor
  var beta  = 0.01  // spectral floor

  func resetLearning() {
    noiseProfile = [Double](repeating: 0, count: 1025)
    noiseProfileCount = 0
    isLearning = true
  }

  func reset() {
    resetLearning()
    inputBuffer  = [Double](repeating: 0, count: fftSize)
    outputBuffer = [Double](repeating: 0, count: fftSize)
  }

  /** Input MUST be exactly hopSize (512) samples — equivalent to one
   *  iteration of nr2.js process() under the skin's 2048-sample callbacks. */
  func processHop(_ input: [Float]) -> [Float] {
    // Shift input buffer left by hop, append new samples
    for i in 0..<(fftSize - hopSize) { inputBuffer[i] = inputBuffer[i + hopSize] }
    for i in 0..<hopSize { inputBuffer[fftSize - hopSize + i] = Double(input[i]) }

    processFrame()

    var out = [Float](repeating: 0, count: hopSize)
    for i in 0..<hopSize { out[i] = Float(outputBuffer[i]) }

    // Shift output buffer left by hop
    for i in 0..<(fftSize - hopSize) { outputBuffer[i] = outputBuffer[i + hopSize] }
    for i in (fftSize - hopSize)..<fftSize { outputBuffer[i] = 0 }
    return out
  }

  private func processFrame() {
    let half = fftSize / 2
    for i in 0..<fftSize {
      real[i] = inputBuffer[i] * window[i]
      imag[i] = 0
    }
    fft.forward(&real, &imag)
    for i in 0...half {
      magnitude[i] = (real[i] * real[i] + imag[i] * imag[i]).squareRoot()
    }

    if isLearning && noiseProfileCount < learningFrames {
      for i in 0...half { noiseProfile[i] += magnitude[i] }
      noiseProfileCount += 1
      if noiseProfileCount >= learningFrames {
        for i in 0...half { noiseProfile[i] /= Double(learningFrames) }
        isLearning = false
      }
      // During learning, pass through with window compensation
      for i in 0..<fftSize { outputBuffer[i] += inputBuffer[i] * window[i] }
      return
    }

    if !isLearning {
      for i in 0...half {
        if adaptiveNoiseTracking, magnitude[i] < signalThreshold * noiseProfile[i] {
          noiseProfile[i] = (1 - noiseAdaptRate) * noiseProfile[i] + noiseAdaptRate * magnitude[i]
        }
        var cleanMag = magnitude[i] - alpha * noiseProfile[i]
        cleanMag = max(cleanMag, beta * magnitude[i])
        if magnitude[i] > 0 {
          let scale = cleanMag / magnitude[i]
          real[i] *= scale; imag[i] *= scale
        } else {
          real[i] = 0; imag[i] = 0
        }
      }
      // Mirror negative frequencies (real FFT symmetry)
      for i in (half + 1)..<fftSize {
        let m = fftSize - i
        real[i] = real[m]; imag[i] = -imag[m]
      }
    }

    fft.inverse(&real, &imag)
    for i in 0..<fftSize { outputBuffer[i] += real[i] * window[i] }
  }
}

// MARK: - WebSDR NR (entropy-VAD STFT masker — verbatim NREngine port)

final class WebSDRNREngine {
  private static let N_FFT = 512
  private static let HALF = 256
  private static let N_BINS = 257
  private static let HOP = 128
  private static let N_FRAMES = 192
  private static let OUTPUT_FRAMES = 32
  private static let OUTPUT_START = 96
  private static let TIME_PAD = 13
  private static let FREQ_PAD = 3
  private static let AUDIO_BUF = 24576
  static let BLOCK = 4096

  private let fft = RadixFFT(size: 512)
  private let hannWin: [Double]
  private let synthWin: [Double]

  var nbins = 37
  var threshold = 0.057  // entropy VAD threshold
  var mult = 0.1         // peak detection strength
  var squelchMode = true

  private var audio = [Double](repeating: 0, count: AUDIO_BUF)
  private var fRe: [[Double]]
  private var fIm: [[Double]]
  private var fMag: [[Double]]
  private var mask: [[Double]]
  private var smoothed: [[Double]]
  private var entropyRaw = [Double](repeating: 0, count: N_FRAMES)
  private var entropySmoothed = [Double](repeating: 0, count: N_FRAMES)
  private var entropyThresh = [Int8](repeating: 0, count: N_FRAMES)
  private var logistic1 = [Double](repeating: 0, count: N_BINS)
  private var logistic3 = [Double](repeating: 0, count: N_BINS * 3)
  private var max1 = 1.0
  private var max3 = 1.0
  private var olaBuf = [Double](repeating: 0, count: N_FFT - HOP)
  private var flag = 0
  private var prevNbins = -1

  private var t512 = [Double](repeating: 0, count: N_FFT)
  private var tBins = [Double](repeating: 0, count: N_BINS)
  private var t3Bins = [Double](repeating: 0, count: N_BINS * 3)
  private var tSort = [Double](repeating: 0, count: N_BINS * N_FRAMES)
  private var tDiff = [Double](repeating: 0, count: N_BINS * N_FRAMES)
  private var t192 = [Double](repeating: 0, count: N_FRAMES)
  private var work: [[Double]]
  private var mask2: [[Double]]
  private var c2dVert: [[Double]]
  private var c2dHoriz: [[Double]]
  private var c2dTmpRow: [Double]
  private var c2dCol: [Double]
  private var c2dColOut: [Double]
  private var sawPad = [Double](repeating: 0, count: N_FRAMES + 14)
  private var sawOut = [Double](repeating: 0, count: N_FRAMES)
  private var padBuf = [Double](repeating: 0, count: AUDIO_BUF + 512)
  private var wkRe = [Double](repeating: 0, count: N_FFT)
  private var wkIm = [Double](repeating: 0, count: N_FFT)

  private var delayBuf = [Float](repeating: 0, count: BLOCK)
  private var delayReady = false

  init() {
    let nFFT = Self.N_FFT, hop = Self.HOP
    hannWin = RadixFFT.hannWindow(nFFT)
    var sw = [Double](repeating: 0, count: nFFT)
    for k in 0..<nFFT {
      var sumSq = 0.0
      var m = k % hop
      while m < nFFT { sumSq += hannWin[m] * hannWin[m]; m += hop }
      sw[k] = sumSq > 0 ? hannWin[k] / sumSq : 0
    }
    synthWin = sw
    func alloc2d(_ rows: Int, _ cols: Int) -> [[Double]] {
      [[Double]](repeating: [Double](repeating: 0, count: cols), count: rows)
    }
    fRe = alloc2d(Self.N_FRAMES, Self.N_BINS)
    fIm = alloc2d(Self.N_FRAMES, Self.N_BINS)
    fMag = alloc2d(Self.N_FRAMES, Self.N_BINS)
    mask = alloc2d(Self.N_FRAMES, Self.N_BINS)
    smoothed = alloc2d(Self.N_FRAMES, Self.N_BINS)
    work = alloc2d(Self.N_FRAMES, Self.N_BINS)
    mask2 = alloc2d(Self.N_FRAMES, Self.N_BINS)
    let pH = Self.N_FRAMES + 2 * Self.TIME_PAD
    let pW = Self.N_BINS + 2 * Self.FREQ_PAD
    c2dVert = alloc2d(pH, pW)
    c2dHoriz = alloc2d(pH, pW)
    c2dTmpRow = [Double](repeating: 0, count: pW)
    c2dCol = [Double](repeating: 0, count: pH)
    c2dColOut = [Double](repeating: 0, count: pH)
    updateBins()
  }

  func syncBins(bandwidthHz: Double, sampleRate: Double) {
    guard bandwidthHz > 0, sampleRate > 0 else { return }
    let binWidth = sampleRate / Double(Self.N_FFT)
    var bins = Int(ceil(bandwidthHz / binWidth)) + 1
    if bins < 4 { bins = 4 }
    if bins > 257 { bins = 257 }
    nbins = bins
  }

  func reset() {
    audio = [Double](repeating: 0, count: Self.AUDIO_BUF)
    olaBuf = [Double](repeating: 0, count: Self.N_FFT - Self.HOP)
    delayReady = false
    delayBuf = [Float](repeating: 0, count: Self.BLOCK)
    for i in 0..<Self.N_FRAMES {
      for j in 0..<Self.N_BINS {
        fRe[i][j] = 0; fIm[i][j] = 0; fMag[i][j] = 0
        mask[i][j] = 0; smoothed[i][j] = 0
      }
      entropyRaw[i] = 0; entropySmoothed[i] = 0; entropyThresh[i] = 0
    }
  }

  // ---- helpers ----

  private func updateBins() {
    if nbins == prevNbins { return }
    var nb = nbins
    if nb < 4 { nb = 4 }
    if nb > 257 { nb = 257 }
    nbins = nb
    prevNbins = nb
    Self.generateLogistic(&logistic1, nb)
    Self.generateLogistic(&logistic3, nb * 3)
    max1 = Self.entropyMaximum(logistic1, nb)
    max3 = Self.entropyMaximum(logistic3, nb * 3)
    for i in 0..<Self.N_FRAMES {
      for j in 0..<Self.N_BINS { smoothed[i][j] = 0 }
    }
  }

  private static func generateLogistic(_ out: inout [Double], _ n: Int) {
    if n < 4 { return }
    for i in 0..<n { out[i] = Double(i) / Double(n - 1) }
    for i in 1..<(n - 1) { out[i] = log(out[i] / (1 - out[i])) }
    out[n - 1] = 2 * out[n - 2] - out[n - 3]
    out[0] = -out[n - 1]
    let mn = out[0], mx = out[n - 1], rng = mx - mn
    if rng == 0 { return }
    for i in 0..<n { out[i] = (out[i] - mn) / rng }
  }

  private static func pearson(_ x: [Double], _ xOff: Int, _ y: [Double], _ yOff: Int, _ n: Int) -> Double {
    var sx = 0.0, sy = 0.0, sxy = 0.0, sx2 = 0.0, sy2 = 0.0
    for i in 0..<n {
      let xi = x[xOff + i], yi = y[yOff + i]
      sx += xi; sy += yi; sxy += xi * yi; sx2 += xi * xi; sy2 += yi * yi
    }
    let nn = Double(n)
    let d = ((nn * sx2 - sx * sx) * (nn * sy2 - sy * sy)).squareRoot()
    return d == 0 ? 0 : (nn * sxy - sx * sy) / d
  }

  private static func entropyMaximum(_ logistic: [Double], _ n: Int) -> Double {
    var tmp = [Double](repeating: 0, count: n)
    tmp[n - 1] = 1
    return 1 - pearson(tmp, 0, logistic, 0, n)
  }

  private static func man1d(_ data: [Double], _ nb: Int) -> Double {
    var vals: [Double] = []
    vals.reserveCapacity(nb)
    for i in 0..<nb {
      let v = data[i]
      if v != 0 && !v.isNaN { vals.append(v) }
    }
    if vals.isEmpty { return 0 }
    vals.sort()
    let n = vals.count
    let med = n % 2 == 0 ? (vals[n / 2] + vals[n / 2 - 1]) / 2 : vals[(n - 1) / 2]
    var diffs = vals.map { abs($0 - med) }
    diffs.sort()
    return n % 2 == 0 ? (diffs[n / 2] + diffs[n / 2 - 1]) / 2 : diffs[(n - 1) / 2]
  }

  private func man2d(_ mag: [[Double]], _ frames: Int, _ nb: Int) -> Double {
    var n = 0
    for j in 0..<frames {
      for i in 0..<nb {
        let v = mag[j][i]
        if v != 0 { tSort[n] = v; n += 1 }
      }
    }
    if n == 0 { return 0 }
    tSort[0..<n].sort()
    let med = n % 2 == 0 ? (tSort[n / 2] + tSort[n / 2 - 1]) / 2 : tSort[(n - 1) / 2]
    for i in 0..<n { tDiff[i] = abs(tSort[i] - med) }
    tDiff[0..<n].sort()
    return n % 2 == 0 ? (tDiff[n / 2] + tDiff[n / 2 - 1]) / 2 : tDiff[(n - 1) / 2]
  }

  private static func atd1d(_ data: [Double], _ manVal: Double, _ nb: Int) -> Double {
    var sum = 0.0
    for i in 0..<nb {
      let d = data[i] - manVal
      sum += d * d
    }
    return nb == 0 ? 0 : (sum / Double(nb)).squareRoot()
  }

  private static func atd2d(_ mag: [[Double]], _ manVal: Double, _ frames: Int, _ nb: Int) -> Double {
    var sum = 0.0
    let cnt = frames * nb
    for j in 0..<frames {
      for i in 0..<nb {
        let d = abs(mag[j][i] - manVal)
        sum += d * d
      }
    }
    return cnt == 0 ? 0 : (sum / Double(cnt)).squareRoot() - manVal
  }

  // ---- STFT / ISTFT ----

  private func rfft(_ inp: [Double], _ outRe: inout [Double], _ outIm: inout [Double]) {
    for i in 0..<Self.N_FFT { wkRe[i] = inp[i]; wkIm[i] = 0 }
    fft.forward(&wkRe, &wkIm)
    for i in 0..<Self.N_BINS { outRe[i] = wkRe[i]; outIm[i] = wkIm[i] }
  }

  private func irfft(_ inRe: [Double], _ inIm: [Double], _ out: inout [Double]) {
    for i in 0..<Self.N_BINS { wkRe[i] = inRe[i]; wkIm[i] = inIm[i] }
    for i in 1..<Self.HALF {
      wkRe[Self.N_FFT - i] = inRe[i]
      wkIm[Self.N_FFT - i] = -inIm[i]
    }
    fft.inverse(&wkRe, &wkIm)
    for i in 0..<Self.N_FFT { out[i] = wkRe[i] }
  }

  private func stftFull() {
    let bufN = Self.AUDIO_BUF
    for i in 0..<bufN { padBuf[256 + i] = audio[i] }
    for i in 1...256 { padBuf[256 - i] = audio[i] }
    for i in 1...255 { padBuf[256 + bufN - 1 + i] = audio[bufN - 1 - i] }
    for seg in 0..<Self.N_FRAMES {
      let start = seg * Self.HOP
      for i in 0..<Self.N_FFT { t512[i] = padBuf[start + i] * hannWin[i] }
      rfft(t512, &fRe[seg], &fIm[seg])
    }
  }

  private func updateMagnitudes() {
    let nb = nbins
    for j in 0..<Self.N_FRAMES {
      for i in 0..<nb {
        let re = fRe[j][i], im = fIm[j][i]
        fMag[j][i] = (re * re + im * im).squareRoot()
      }
    }
  }

  private func istftBlock(_ outBuf: inout [Float]) {
    var outIdx = 0
    for f in 0..<Self.OUTPUT_FRAMES {
      let fi = Self.OUTPUT_START + f
      irfft(fRe[fi], fIm[fi], &t512)
      for i in 0..<Self.N_FFT { t512[i] *= synthWin[i] }
      for i in 0..<Self.HOP { outBuf[outIdx + i] = Float(olaBuf[i] + t512[i]) }
      outIdx += Self.HOP
      for i in 0..<Self.HALF { olaBuf[i] = olaBuf[i + Self.HOP] }
      for i in 0..<Self.HOP { olaBuf[Self.HALF + i] = 0 }
      for i in 0..<(Self.N_FFT - Self.HOP) { olaBuf[i] += t512[Self.HOP + i] }
    }
  }

  // ---- entropy VAD ----

  private func fastEntropy() {
    let nb = nbins
    let n3 = nb * 3
    for i in 1..<(Self.N_FRAMES - 1) {
      for j in 0..<nb {
        t3Bins[j] = fMag[i - 1][j]
        t3Bins[j + nb] = fMag[i][j]
        t3Bins[j + 2 * nb] = fMag[i + 1][j]
      }
      t3Bins[0..<n3].sort()
      let dx = t3Bins[n3 - 1] - t3Bins[0]
      if dx == 0 { entropyRaw[i] = 0; continue }
      let base = t3Bins[0]
      for j in 0..<n3 { t3Bins[j] = (t3Bins[j] - base) / dx }
      let v = Self.pearson(t3Bins, 0, logistic3, 0, n3)
      entropyRaw[i] = v.isNaN ? 0 : 1 - v
    }
    for (frame, _) in [(0, 0), (Self.N_FRAMES - 1, 0)] {
      for j in 0..<nb { tBins[j] = fMag[frame][j] }
      tBins[0..<nb].sort()
      let dx = tBins[nb - 1] - tBins[0]
      if dx == 0 { entropyRaw[frame] = 0; continue }
      let base = tBins[0]
      for j in 0..<nb { tBins[j] = (tBins[j] - base) / dx }
      let v = Self.pearson(tBins, 0, logistic1, 0, nb)
      entropyRaw[frame] = v.isNaN ? 0 : 1 - v
    }
  }

  private func smoothEntropy() {
    entropySmoothed[0] = (entropyRaw[0] + entropyRaw[1]) / 2
    for i in 1..<(Self.N_FRAMES - 1) {
      entropySmoothed[i] = (entropyRaw[i - 1] + entropyRaw[i] + entropyRaw[i + 1]) / 3
    }
    entropySmoothed[Self.N_FRAMES - 1] =
      (entropyRaw[Self.N_FRAMES - 2] + entropyRaw[Self.N_FRAMES - 1]) / 2
  }

  private func processEntropy() {
    fastEntropy()
    smoothEntropy()
    var count = 0
    for i in 0..<Self.N_FRAMES { entropyThresh[i] = 0 }
    for i in 0..<Self.N_FRAMES where entropySmoothed[i] > threshold {
      entropyThresh[i] = 1
      if i > 31 && i < 161 { count += 1 }
    }
    if count > 22 || Self.longestConsecutive(entropyThresh) > 16 {
      flag = 2
      Self.removeOutliers(&entropyThresh, 0, 6, 1)
      Self.removeOutliers(&entropyThresh, 1, 2, 0)
    }
  }

  private static func longestConsecutive(_ arr: [Int8]) -> Int {
    var cur = 0, best = 0
    for v in arr {
      if v == 1 { cur += 1 }
      else { if cur > best { best = cur }; cur = 0 }
    }
    return max(best, cur)
  }

  private static func removeOutliers(_ a: inout [Int8], _ value: Int8, _ threshold: Int, _ replace: Int8) {
    var first = 0
    while first < a.count {
      if a[first] == value {
        var idx = first
        while idx < a.count && a[idx] == value { idx += 1 }
        let end = idx
        if end - first + 1 < threshold {
          for i in first..<end { a[i] = replace }
        }
        first = end
      } else {
        var idx = first
        while idx < a.count && a[idx] != value { idx += 1 }
        first = idx
      }
    }
  }

  // ---- smoothing / masking ----

  private static let sawKernel: [Double] = [
    0, 0.14285714, 0.28571429, 0.42857143, 0.57142857,
    0.71428571, 0.85714286, 1.0, 0.85714286, 0.71428571,
    0.57142857, 0.42857143, 0.28571429, 0.14285714, 0,
  ]
  private static let sawKernelSum = 6.916666666666667

  private func sawtoothSmooth1d(_ arr: inout [Double], _ n: Int) {
    let kLen = 15, pad = 7
    for i in 0..<sawPad.count { sawPad[i] = 0 }
    for i in 0..<n { sawPad[i + pad] = arr[i] }
    for i in 0..<n {
      var s = 0.0
      for k in 0..<kLen { s += sawPad[i + k] * Self.sawKernel[k] }
      sawOut[i] = s / Self.sawKernelSum
    }
    for i in 0..<n { arr[i] = sawOut[i] }
  }

  private func sawtoothConvolve(_ src: [[Double]], _ dst: inout [[Double]]) {
    let nb = nbins
    for i in 0..<nb {
      for j in 0..<Self.N_FRAMES { t192[j] = src[j][i] }
      sawtoothSmooth1d(&t192, Self.N_FRAMES)
      for j in 0..<Self.N_FRAMES { dst[j][i] = t192[j] }
    }
  }

  private func convolve2d(_ data: inout [[Double]]) {
    let nb = nbins, nf = Self.N_FRAMES
    let pH = nf + 2 * Self.TIME_PAD
    let pW = nb + 2 * Self.FREQ_PAD
    for _ in 0..<3 {
      for i in 0..<pH {
        for j in 0..<c2dVert[i].count { c2dVert[i][j] = 0; c2dHoriz[i][j] = 0 }
      }
      for i in 0..<nf {
        for j in 0..<nb {
          c2dVert[i + Self.TIME_PAD][j + Self.FREQ_PAD] = data[i][j]
          c2dHoriz[i + Self.TIME_PAD][j + Self.FREQ_PAD] = data[i][j]
        }
      }
      for i in 0..<nf {
        let row = i + Self.TIME_PAD
        let leftVal = data[i][0], rightVal = data[i][nb - 1]
        for j in 0..<Self.FREQ_PAD {
          c2dVert[row][j] = leftVal
          c2dVert[row][nb + Self.FREQ_PAD + j] = rightVal
          c2dHoriz[row][j] = leftVal
          c2dHoriz[row][nb + Self.FREQ_PAD + j] = rightVal
        }
      }
      // Frequency-wise 3-tap box
      for i in 0..<pH {
        for j in 0..<c2dTmpRow.count { c2dTmpRow[j] = 0 }
        for j in 1..<(pW - 1) {
          c2dTmpRow[j] = (c2dVert[i][j - 1] + c2dVert[i][j] + c2dVert[i][j + 1]) / 3
        }
        c2dTmpRow[0] = (c2dVert[i][0] + c2dVert[i][1]) / 2
        c2dTmpRow[pW - 1] = (c2dVert[i][pW - 2] + c2dVert[i][pW - 1]) / 2
        for j in 0..<pW { c2dVert[i][j] = c2dTmpRow[j] }
      }
      // Time-wise 13-tap box
      for j in 0..<pW {
        for i in 0..<pH { c2dCol[i] = c2dHoriz[i][j] }
        for i in 0..<pH {
          var s = 0.0
          var cnt = 0
          for k in -6...6 {
            let ii = i + k
            if ii >= 0 && ii < pH { s += c2dCol[ii]; cnt += 1 }
          }
          c2dColOut[i] = cnt > 0 ? s / Double(cnt) : 0
        }
        for i in 0..<pH { c2dHoriz[i][j] = c2dColOut[i] }
      }
      for i in 0..<pH {
        for j in 0..<pW {
          let avg = (c2dVert[i][j] + c2dHoriz[i][j]) / 2
          c2dVert[i][j] = avg
          c2dHoriz[i][j] = avg
        }
      }
    }
    for i in 0..<nf {
      for j in 0..<nb { data[i][j] = c2dVert[i + Self.TIME_PAD][j + Self.FREQ_PAD] }
    }
  }

  private func fastPeaks(_ smoothedIn: [[Double]], _ maskOut: inout [[Double]], _ manG: Double, _ atdG: Double) {
    let nb = nbins
    let alpha = 0.5
    for each in 0..<Self.N_FRAMES {
      if entropyThresh[each] == 0 && squelchMode { continue }
      if entropyThresh[each] == 0 && entropyRaw[each] < threshold { continue }
      for j in 0..<nb { tBins[j] = smoothedIn[each][j] }
      let manLocal = Self.man1d(tBins, nb)
      let atdLocal = Self.atd1d(tBins, manLocal, nb)
      var entFrac = entropyRaw[each] / max3
      if entFrac > 1 { entFrac = 1 }
      let atdG2 = atdG * (1 - entFrac)
      let manG2 = manG * (1 - entFrac)
      let w1 = exp(-alpha * abs(manG2 - manLocal))
      let manFix = manLocal * w1 + manG2 * (1 - w1)
      let w2 = exp(-alpha * abs(atdG2 - atdLocal))
      let atdFix = atdLocal * w2 + atdG2 * (1 - w2)
      let thresh = manFix + atdFix * mult
      for i in 0..<nb where tBins[i] > thresh { maskOut[each][i] = 1 }
    }
  }

  private static func findMax2d(_ data: [[Double]], _ frames: Int, _ nb: Int) -> Double {
    var mx = -Double.infinity
    for j in 0..<frames {
      for i in 0..<nb where data[j][i] > mx { mx = data[j][i] }
    }
    return mx
  }

  private func smoothAndMask() {
    let nb = nbins
    for i in 0..<Self.N_FRAMES {
      for j in 0..<Self.N_BINS { mask[i][j] = 0 }
    }
    sawtoothConvolve(fMag, &smoothed)
    var manG = man2d(smoothed, Self.N_FRAMES, nb)
    var atdG = Self.atd2d(smoothed, manG, Self.N_FRAMES, nb)
    fastPeaks(smoothed, &mask, manG, atdG)

    for i in 0..<Self.N_FRAMES {
      for j in 0..<nb { work[i][j] = mask[i][j] == 0 ? 0 : fMag[i][j] }
    }
    let initial = Self.findMax2d(fMag, Self.N_FRAMES, nb)
    let maxWork = Self.findMax2d(work, Self.N_FRAMES, nb)
    var multiplier = initial > 0 ? maxWork / initial : 1
    if multiplier > 1 { multiplier = 1 }

    manG = man2d(work, Self.N_FRAMES, nb)
    atdG = Self.atd2d(work, manG, Self.N_FRAMES, nb)
    sawtoothConvolve(work, &smoothed)

    for i in 0..<Self.N_FRAMES {
      for j in 0..<Self.N_BINS { mask2[i][j] = 0 }
    }
    fastPeaks(smoothed, &mask2, manG, atdG)

    for i in 0..<Self.N_FRAMES {
      for j in 0..<nb {
        let v1 = mask2[i][j] * multiplier
        if mask[i][j] > v1 { mask[i][j] = v1 }
        else { mask[i][j] = max(mask[i][j], mask2[i][j]) }
      }
    }
    var maskRef = mask
    sawtoothConvolve(maskRef, &mask)
    maskRef = mask
    convolve2d(&maskRef)
    mask = maskRef
  }

  // ---- main entry ----

  private func processBlock(_ samples: [Float]) -> [Float] {
    updateBins()
    let nb = nbins
    if nb < 4 { return samples }

    let bufN = Self.AUDIO_BUF, blk = Self.BLOCK
    for i in 0..<(bufN - blk) { audio[i] = audio[i + blk] }
    for i in 0..<blk { audio[bufN - blk + i] = Double(samples[i]) }

    stftFull()
    updateMagnitudes()

    flag = 0
    processEntropy()

    var out = [Float](repeating: 0, count: blk)
    if flag == 2 || !squelchMode {
      smoothAndMask()
      for f in 0..<Self.OUTPUT_FRAMES {
        let fi = Self.OUTPUT_START + f
        for j in 0..<nb {
          fRe[fi][j] *= mask[fi][j]
          fIm[fi][j] *= mask[fi][j]
        }
        for j in nb..<Self.N_BINS { fRe[fi][j] = 0; fIm[fi][j] = 0 }
      }
      istftBlock(&out)
    } else {
      // Pure-noise frame in squelch mode: silence, clear OLA tail
      for i in 0..<olaBuf.count { olaBuf[i] = 0 }
    }
    return out
  }

  /** One block of lookahead, as upstream: returns the PREVIOUS processed
   *  block; nil on the very first call (caller passes the input through). */
  func processWithDelay(_ samples: [Float]) -> [Float]? {
    if !delayReady {
      delayBuf = processBlock(samples)
      delayReady = true
      return nil
    }
    let result = delayBuf
    delayBuf = processBlock(samples)
    return result
  }
}

// MARK: - Noise blanker (port of noise-blanker.js, minus the FIR bandpass)

final class NoiseBlankerEngine {
  var threshold = 10.0
  private let blankDuration = 0.003
  private let blankSamples: Int
  private let avgWindow: Int
  private let fftSize = 128
  private var fftBuffer: [Double]
  private var fftBufferPos = 0
  var spectralFlatnessThreshold = 0.3
  private let cosTable: [Double]
  private let sinTable: [Double]
  private let window: [Double]
  private var avgLevel = 0.0001
  private var blankCounter = 0
  private var history: [Double]
  private var historyPos = 0
  private var historySum = 0.0
  private let warmupSamples: Int
  private var warmupCounter = 0

  init(sampleRate: Double) {
    blankSamples = max(1, Int(sampleRate * blankDuration))
    avgWindow = max(1, Int(sampleRate * 0.020))
    fftBuffer = [Double](repeating: 0, count: fftSize)
    history = [Double](repeating: 0, count: avgWindow)
    warmupSamples = avgWindow * 2
    var ct = [Double](repeating: 0, count: fftSize * fftSize / 2)
    var st = [Double](repeating: 0, count: fftSize * fftSize / 2)
    for k in 0..<(fftSize / 2) {
      for n in 0..<fftSize {
        let idx = k * fftSize + n
        let angle = -2.0 * Double.pi * Double(k) * Double(n) / Double(fftSize)
        ct[idx] = cos(angle); st[idx] = sin(angle)
      }
    }
    cosTable = ct; sinTable = st
    var w = [Double](repeating: 0, count: blankSamples)
    for i in 0..<blankSamples {
      let t = Double(i + 1) / Double(blankSamples)
      w[i] = 0.5 * (1.0 - cos(Double.pi * t))
    }
    window = w
  }

  private func isBroadbandClick() -> Bool {
    // Windowed 128-pt DFT, then spectral flatness (geo/arith mean ratio)
    var windowed = [Double](repeating: 0, count: fftSize)
    for i in 0..<fftSize {
      let w = 0.5 * (1.0 - cos(2.0 * Double.pi * Double(i) / Double(fftSize)))
      windowed[i] = fftBuffer[i] * w
    }
    let half = fftSize / 2
    var geometricMean = 1.0
    var arithmeticMean = 0.0
    let epsilon = 1e-10
    for k in 0..<half {
      var re = 0.0, im = 0.0
      for n in 0..<fftSize {
        let idx = k * fftSize + n
        re += windowed[n] * cosTable[idx]
        im += windowed[n] * sinTable[idx]
      }
      let mag = (re * re + im * im).squareRoot() + epsilon
      geometricMean *= pow(mag, 1.0 / Double(half))
      arithmeticMean += mag / Double(half)
    }
    if arithmeticMean < epsilon { return false }
    return geometricMean / arithmeticMean > spectralFlatnessThreshold
  }

  func process(_ samples: inout [Float]) {
    for i in 0..<samples.count {
      let sample = Double(samples[i])
      let absSample = abs(sample)
      fftBuffer[fftBufferPos] = sample
      fftBufferPos = (fftBufferPos + 1) % fftSize
      historySum -= history[historyPos]
      history[historyPos] = absSample
      historySum += absSample
      historyPos = (historyPos + 1) % avgWindow
      avgLevel = max(historySum / Double(avgWindow), 0.0001)
      if warmupCounter < warmupSamples {
        warmupCounter += 1
        continue
      }
      if absSample > avgLevel * threshold, isBroadbandClick() {
        blankCounter = blankSamples
      }
      if blankCounter > 0 {
        let windowPos = blankSamples - blankCounter
        samples[i] = Float(sample * window[windowPos])
        blankCounter -= 1
      }
    }
  }

  func reset() {
    for i in 0..<history.count { history[i] = 0 }
    historyPos = 0; historySum = 0; avgLevel = 0.0001
    blankCounter = 0; warmupCounter = 0
    for i in 0..<fftBuffer.count { fftBuffer[i] = 0 }
    fftBufferPos = 0
  }
}

// MARK: - Block chunker (packet sizes → engine block sizes)

/** Accumulates arbitrary-length packet audio, runs `process` per fixed block,
 *  and returns exactly as many samples as went in (zero-primed while the
 *  first block's worth of latency fills — the steady-state delay equals one
 *  block, matching the skin's ScriptProcessorNode buffering). `process` may
 *  return nil to pass that block through unchanged (websdr NR's first call). */
final class BlockChunker {
  private var inFifo: [Float] = []
  private var outFifo: [Float] = []
  private let block: Int
  private let process: ([Float]) -> [Float]?

  init(block: Int, process: @escaping ([Float]) -> [Float]?) {
    self.block = block
    self.process = process
    inFifo.reserveCapacity(block * 2)
    outFifo.reserveCapacity(block * 2)
  }

  func run(_ samples: [Float]) -> [Float] {
    inFifo.append(contentsOf: samples)
    while inFifo.count >= block {
      let blk = Array(inFifo[0..<block])
      inFifo.removeFirst(block)
      outFifo.append(contentsOf: process(blk) ?? blk)
    }
    let n = samples.count
    if outFifo.count >= n {
      let out = Array(outFifo[0..<n])
      outFifo.removeFirst(n)
      return out
    }
    var out = [Float](repeating: 0, count: n - outFifo.count)
    out.append(contentsOf: outFifo)
    outFifo.removeAll(keepingCapacity: true)
    return out
  }

  func reset() {
    inFifo.removeAll(keepingCapacity: true)
    outFifo.removeAll(keepingCapacity: true)
  }
}
