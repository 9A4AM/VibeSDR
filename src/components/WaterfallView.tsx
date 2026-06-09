/**
 * WaterfallView — 120Hz ProMotion waterfall + spectrum with peak hold.
 *
 * Architecture:
 *   - Ring buffer stores ROWS rows of colourised pixels at bin resolution.
 *   - On each spectrum frame: write new row, rebuild display-order SkImage.
 *   - Reanimated useDerivedValue drives a smooth Y-translate that runs on the
 *     UI thread at full display rate (120Hz ProMotion) — no JS involvement.
 *   - Each new row animates sliding in from the top over the inter-frame period,
 *     matching the "flowing river" feel of the original NativeWaterfall.
 *   - Spectrum: downsampled to screen width, 5-pt smoothed, quadratic curves.
 *   - Peak hold: per-bin decay at PEAK_DECAY rate, drawn as glowing white line.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Canvas,
  Skia,
  Image as SkiaImage,
  Path,
  Group,
  LinearGradient,
  BlurStyle,
  vec,
  AlphaType,
  ColorType,
  type SkImage,
} from '@shopify/react-native-skia';
import {
  useSharedValue,
  useDerivedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { getColorLUT } from '../assets/colormapUtils';

// ── Constants ──────────────────────────────────────────────────────────────────

const ROWS        = 256;    // waterfall history depth — 256 rows at ~20fps = ~12s
const SPEC_FRAC   = 0.26;   // fraction of height for spectrum panel
const PEAK_DECAY  = 0.984;  // peak hold decay factor per data frame (~3s to -6dB)
const SPEC_PTS    = 512;    // max spectrum path points (downsampled from bin count)
const SMOOTH_W    = 5;      // spectrum smoothing kernel half-width

// ── Props ──────────────────────────────────────────────────────────────────────

export interface WaterfallViewProps {
  bins:          Float32Array | null;
  binCount:      number;
  centerHz:      number;
  bwHz:          number;
  tuneHz:        number;
  dbMin?:        number;
  dbMax?:        number;
  colormap?:     string;
  width:         number;
  height:        number;
  onPanDelta?:   (dxPx: number) => void;
  onZoomDelta?:  (dyPx: number) => void;
  onTapTune?:    (hz: number) => void;
  onPinchZoom?:  (scale: number) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Downsample bins to at most maxPts points by taking the max in each window. */
function downsample(bins: Float32Array, maxPts: number): Float32Array {
  const n = bins.length;
  if (n <= maxPts) return bins;
  const out = new Float32Array(maxPts);
  const ratio = n / maxPts;
  for (let i = 0; i < maxPts; i++) {
    const lo = Math.floor(i * ratio);
    const hi = Math.min(n, Math.ceil((i + 1) * ratio));
    let mx = bins[lo];
    for (let j = lo + 1; j < hi; j++) if (bins[j] > mx) mx = bins[j];
    out[i] = mx;
  }
  return out;
}

/** 5-point boxcar smooth in-place on a Float32Array copy. */
function smooth(arr: Float32Array, w: number): Float32Array {
  const out = new Float32Array(arr.length);
  const len = arr.length;
  for (let i = 0; i < len; i++) {
    let sum = 0, count = 0;
    for (let k = -w; k <= w; k++) {
      const j = i + k;
      if (j >= 0 && j < len) { sum += arr[j]; count++; }
    }
    out[i] = sum / count;
  }
  return out;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function WaterfallView({
  bins,
  binCount,
  centerHz,
  bwHz,
  tuneHz,
  dbMin       = -120,
  dbMax       = -20,
  colormap    = 'gqrx',
  width,
  height,
  onPanDelta,
  onZoomDelta,
  onTapTune,
  onPinchZoom,
}: WaterfallViewProps) {
  const specH  = Math.round(height * SPEC_FRAC);
  const wfH    = height - specH;
  const rowH   = wfH / ROWS;

  // ── Colourmap LUT ──────────────────────────────────────────────────────────
  const lut = useMemo(() => getColorLUT(colormap), [colormap]);

  // ── Ring buffer ────────────────────────────────────────────────────────────
  const pixBuf       = useRef<Uint8Array | null>(null);
  const rowHead      = useRef(0);
  const lastBinCount = useRef(0);

  const ensureBuffer = useCallback((n: number) => {
    if (n !== lastBinCount.current) {
      pixBuf.current      = new Uint8Array(n * ROWS * 4);
      rowHead.current     = 0;
      lastBinCount.current = n;
    }
  }, []);

  // ── Peak hold buffer ───────────────────────────────────────────────────────
  const peakBuf = useRef<Float32Array | null>(null);

  // ── Waterfall image state ──────────────────────────────────────────────────
  const [wfImage,   setWfImage]   = useState<SkImage | null>(null);

  // ── Spectrum + peak paths ──────────────────────────────────────────────────
  const [specPath,  setSpecPath]  = useState<ReturnType<typeof Skia.Path.Make> | null>(null);
  const [fillPath,  setFillPath]  = useState<ReturnType<typeof Skia.Path.Make> | null>(null);
  const [peakPath,  setPeakPath]  = useState<ReturnType<typeof Skia.Path.Make> | null>(null);

  // ── Smooth scroll (Reanimated, runs on UI thread at display rate) ──────────
  // scrollFrac: 0 = new row just arrived (off-screen above), 1 = row fully settled
  const scrollFrac = useSharedValue(1);

  // Image transform: slide in from top — runs on UI thread, no JS each frame
  const wfTransform = useDerivedValue(() => [
    { translateY: -(1 - scrollFrac.value) * rowH },
  ]);

  // ── Inter-frame timing estimate ────────────────────────────────────────────
  const lastFrameTs  = useRef(0);
  const avgFrameMs   = useRef(150); // initial guess: 150ms between spectrum frames

  // ── Process new spectrum data ──────────────────────────────────────────────
  useEffect(() => {
    if (!bins || bins.length === 0 || width < 4) return;

    const n = bins.length;
    ensureBuffer(n);
    const buf = pixBuf.current!;
    const dbRange = dbMax - dbMin;

    // ── 1. Update peak hold ──────────────────────────────────────────────────
    if (!peakBuf.current || peakBuf.current.length !== n) {
      peakBuf.current = new Float32Array(n).fill(dbMin);
    }
    const peak = peakBuf.current;
    for (let i = 0; i < n; i++) {
      peak[i] = Math.max(bins[i], peak[i] * PEAK_DECAY + dbMin * (1 - PEAK_DECAY));
    }

    // ── 2. Write new row into ring buffer ────────────────────────────────────
    const rowOff = rowHead.current * n * 4;
    for (let i = 0; i < n; i++) {
      const idx = Math.max(0, Math.min(255, Math.round(((bins[i] - dbMin) / dbRange) * 255)));
      const l   = idx * 4;
      buf[rowOff + i * 4]     = lut[l];
      buf[rowOff + i * 4 + 1] = lut[l + 1];
      buf[rowOff + i * 4 + 2] = lut[l + 2];
      buf[rowOff + i * 4 + 3] = 255;
    }
    rowHead.current = (rowHead.current + 1) % ROWS;

    // ── 3. Assemble display-order image (newest row at top) ──────────────────
    const display = new Uint8Array(n * ROWS * 4);
    const head    = rowHead.current;
    for (let r = 0; r < ROWS; r++) {
      const srcRow = (head - 1 - r + ROWS * 2) % ROWS;
      const srcOff = srcRow * n * 4;
      display.set(buf.subarray(srcOff, srcOff + n * 4), r * n * 4);
    }

    const img = Skia.Image.MakeImage(
      { width: n, height: ROWS, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Opaque },
      Skia.Data.fromBytes(display),
      n * 4,
    );
    if (img) setWfImage(img);

    // ── 4. Build smooth spectrum path ────────────────────────────────────────
    const ds   = downsample(bins, Math.min(SPEC_PTS, Math.round(width)));
    const sm   = smooth(ds, SMOOTH_W);
    const npts = sm.length;
    const xScale = width / (npts - 1);

    const specP = Skia.Path.Make();
    const fillP = Skia.Path.Make();

    // Use quadratic bezier curves for smooth appearance
    const yOf = (i: number) => {
      const t = Math.max(0, Math.min(1, (sm[i] - dbMin) / dbRange));
      return specH * (1 - t * 0.90);
    };

    let x0 = 0, y0 = yOf(0);
    specP.moveTo(x0, y0);
    fillP.moveTo(x0, specH);
    fillP.lineTo(x0, y0);

    for (let i = 1; i < npts; i++) {
      const x1  = i * xScale;
      const y1  = yOf(i);
      const mx  = (x0 + x1) / 2;
      specP.quadTo(x0, y0, mx, (y0 + y1) / 2);
      fillP.quadTo(x0, y0, mx, (y0 + y1) / 2);
      x0 = x1; y0 = y1;
    }
    specP.lineTo(width, yOf(npts - 1));
    fillP.lineTo(width, yOf(npts - 1));
    fillP.lineTo(width, specH);
    fillP.close();

    setSpecPath(specP);
    setFillPath(fillP);

    // ── 5. Build peak hold path ──────────────────────────────────────────────
    const pkDs  = downsample(peak, Math.min(SPEC_PTS, Math.round(width)));
    const pkSm  = smooth(pkDs, 2); // lighter smoothing on peak
    const pkP   = Skia.Path.Make();
    const pkXSc = width / (pkSm.length - 1);

    let px0 = 0, py0 = specH * (1 - Math.max(0, Math.min(1, (pkSm[0] - dbMin) / dbRange)) * 0.90);
    pkP.moveTo(px0, py0);
    for (let i = 1; i < pkSm.length; i++) {
      const px1 = i * pkXSc;
      const py1 = specH * (1 - Math.max(0, Math.min(1, (pkSm[i] - dbMin) / dbRange)) * 0.90);
      const mx  = (px0 + px1) / 2;
      pkP.quadTo(px0, py0, mx, (py0 + py1) / 2);
      px0 = px1; py0 = py1;
    }
    setPeakPath(pkP);

    // ── 6. Smooth scroll animation ───────────────────────────────────────────
    const now = Date.now();
    if (lastFrameTs.current > 0) {
      const dt = now - lastFrameTs.current;
      avgFrameMs.current = avgFrameMs.current * 0.8 + dt * 0.2; // EMA
    }
    lastFrameTs.current = now;

    // Slide new row in over the measured inter-frame period (capped 80–600ms)
    const duration = Math.max(80, Math.min(600, avgFrameMs.current * 1.1));
    scrollFrac.value = 0;
    scrollFrac.value = withTiming(1, { duration, easing: Easing.linear });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bins, dbMin, dbMax, lut, width, specH, rowH, ensureBuffer]);

  // ── Tuning cursor ──────────────────────────────────────────────────────────
  const cursorX = useMemo(() => {
    if (!bwHz || !width) return width / 2;
    return ((tuneHz - (centerHz - bwHz / 2)) / bwHz) * width;
  }, [tuneHz, centerHz, bwHz, width]);

  const cursorPath = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(cursorX, 0);
    p.lineTo(cursorX, height);
    return p;
  }, [cursorX, height]);

  // ── Memoised paints ────────────────────────────────────────────────────────
  const specLinePaint = useMemo(() => {
    const p = Skia.Paint();
    p.setColor(Skia.Color('rgba(255,215,60,0.92)'));
    p.setStrokeWidth(1.5);
    p.setStyle(1);
    p.setAntiAlias(true);
    return p;
  }, []);

  const peakPaint = useMemo(() => {
    const p = Skia.Paint();
    p.setColor(Skia.Color('rgba(255,255,255,0.70)'));
    p.setStrokeWidth(1);
    p.setStyle(1);
    p.setAntiAlias(true);
    // Subtle glow via mask filter
    p.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 1.5, false));
    return p;
  }, []);

  const cursorPaint = useMemo(() => {
    const p = Skia.Paint();
    p.setColor(Skia.Color('rgba(255,70,70,0.80)'));
    p.setStrokeWidth(1);
    p.setStyle(1);
    return p;
  }, []);

  // ── Gesture tracking refs (Pan needs deltas, not cumulative translation) ──
  const lastPanX = useRef(0);
  const lastPanY = useRef(0);
  const pinchRef = useRef(1);

  // ── Tap → tune to frequency at tap X position ─────────────────────────────
  const tapGesture = useMemo(() =>
    Gesture.Tap()
      .runOnJS(true)
      .maxDuration(300)
      .onEnd(e => {
        if (!bwHz || !centerHz) return;
        const hz = Math.round((centerHz - bwHz / 2) + (e.x / width) * bwHz);
        onTapTune?.(hz);
      }),
    [bwHz, centerHz, width, onTapTune],
  );

  // ── Pan → horizontal = spectrum pan, vertical = zoom ─────────────────────
  const panGesture = useMemo(() =>
    Gesture.Pan()
      .runOnJS(true)
      .minDistance(4)
      .onStart(() => { lastPanX.current = 0; lastPanY.current = 0; })
      .onUpdate(e => {
        const dx = e.translationX - lastPanX.current;
        const dy = e.translationY - lastPanY.current;
        lastPanX.current = e.translationX;
        lastPanY.current = e.translationY;
        if (Math.abs(dx) >= Math.abs(dy)) {
          onPanDelta?.(-dx); // drag right = pan spectrum left = lower freqs on right
        } else {
          onZoomDelta?.(dy);
        }
      }),
    [onPanDelta, onZoomDelta],
  );

  // ── Pinch → zoom spectrum ─────────────────────────────────────────────────
  const pinchGesture = useMemo(() =>
    Gesture.Pinch()
      .runOnJS(true)
      .onStart(() => { pinchRef.current = 1; })
      .onUpdate(e => {
        const delta = e.scale / pinchRef.current;
        pinchRef.current = e.scale;
        onPinchZoom?.(delta);
      }),
    [onPinchZoom],
  );

  // ── Compose: tap or pan (exclusive), pinch simultaneous ──────────────────
  const gesture = useMemo(() =>
    Gesture.Simultaneous(
      Gesture.Exclusive(tapGesture, panGesture),
      pinchGesture,
    ),
    [tapGesture, panGesture, pinchGesture],
  );

  // ── Clip rect for waterfall (prevents scroll overshooting) ────────────────
  const wfClip = useMemo(
    () => Skia.XYWHRect(0, specH, width, wfH),
    [specH, width, wfH],
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.root, { width, height }]}>
        <Canvas style={{ width, height }}>

          {/* ── Spectrum fill ───────────────────────────────────────────────── */}
          {fillPath && (
            <Path path={fillPath} style="fill">
              <LinearGradient
                start={vec(0, 0)}
                end={vec(0, specH)}
                colors={['rgba(255,200,50,0.22)', 'rgba(255,180,30,0.04)']}
              />
            </Path>
          )}

          {/* ── Peak hold line ──────────────────────────────────────────────── */}
          {peakPath && <Path path={peakPath} paint={peakPaint} />}

          {/* ── Spectrum line ───────────────────────────────────────────────── */}
          {specPath && <Path path={specPath} paint={specLinePaint} />}

          {/* ── Waterfall (smooth-scrolling, clipped) ───────────────────────── */}
          {wfImage && (
            <Group clip={wfClip}>
              <SkiaImage
                image={wfImage}
                x={0}
                y={specH}
                width={width}
                height={wfH}
                transform={wfTransform}
                fit="fill"
              />
            </Group>
          )}

          {/* ── Tuning cursor ────────────────────────────────────────────────── */}
          <Path path={cursorPath} paint={cursorPaint} />

        </Canvas>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden', backgroundColor: '#000' },
});
