/**
 * WaterfallView — 120Hz ProMotion waterfall + spectrum, v1.5 visual parity.
 *
 * Layout (top → bottom), all in dp:
 *   ┌──────────────────────────────────────────┐
 *   │ BAND_H (20)  — band plan strip           │  coloured allocations + labels
 *   ├──────────────────────────────────────────┤
 *   │ TICK_H (22)  — frequency ticker          │  green glow "7.153M" labels
 *   ├──────────────────────────────────────────┤
 *   │ specH        — spectrum trace            │  LUT-gradient fill + peak hold
 *   ├──────────────────────────────────────────┤
 *   │ wfH          — waterfall                 │  Skia image ring buffer
 *   └──────────────────────────────────────────┘
 *   Acrylic sideband panels + LED needle span band-strip-bottom → screen bottom.
 *
 * Architecture:
 *   - SignalProcessor (M9PSY pipeline + UberSDR auto-range) maps raw dBFS bins
 *     → LUT indices; this component never touches dB maths directly.
 *   - Ring buffer stores LUT *indices* (1 byte/bin); the RGBA display buffer is
 *     persistent and updated incrementally (memmove + colourise ONE new row per
 *     frame). Palette switches recolourise the whole buffer from the index ring.
 *   - TWO stacked canvases (power): the bottom one holds only the waterfall
 *     texture and is the only thing Reanimated redraws at 120Hz ProMotion; the
 *     top one (spectrum/bands/needle) repaints at the 10Hz data rate.
 *   - Needle + sideband-edge glows are Gaussian blurs — the most expensive Skia
 *     primitive — so they are pre-rendered ONCE into offscreen image strips and
 *     composited as plain textures, never re-blurred per frame.
 *   - Reanimated useDerivedValue drives the scroll translate on the UI thread
 *     at full display rate (120Hz ProMotion) — zero JS work per scroll tick.
 *   - Text (band labels, ticker, dB axis) rendered as absolutely-positioned RN
 *     <Text> overlays — crisper than Skia text and uses the expo-font faces.
 *
 * Visuals ported 1:1 from vibeWaterfall.ts v1.5 (M9PSY / Stuey3D):
 *   - BAND_COLS, label sizing rules, bottom border rgba(255,200,80,0.25)
 *   - niceTick / fmtHz ticker with #00aa33 glow text, minGap 52px
 *   - dB axis: 5 stops, amber rgba(255,180,60,0.90), faint reference lines
 *   - Spectrum fill: colormap LUT sampled at 9 stops, indices 15→235
 *   - Peak hold line: VFO colour (matches user's needle selection)
 *   - Acrylic sidebands: 4-stop gradient 0.03→0.28 alpha in VFO colour
 *   - Needle: 3-layer LED glow (28/16/6 blur), needleScale = clamp(.25,1,pxPerHz×4000)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio, StyleSheet, Text, View } from 'react-native';
import {
  Canvas,
  Skia,
  Image as SkiaImage,
  Path,
  Rect,
  LinearGradient,
  BlurStyle,
  vec,
  AlphaType,
  ColorType,
  type SkImage,
  type SkPath,
} from '@shopify/react-native-skia';
import {
  useSharedValue,
  useDerivedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { getColorLUT } from '../assets/colormapUtils';
import { SignalProcessor, type SignalProcessorSettings } from '../assets/signalProcessor';
import { BAND_PLAN, type Band } from '../constants/bandPlan';

// ── Layout constants (vibeWaterfall.ts v1.5) ──────────────────────────────────

const BAND_H   = 20;   // band plan strip height
const TICK_H   = 22;   // frequency ticker height
const ROWS     = 256;  // waterfall history depth

// Band type → colour. Indices match v1.5 BAND_COLS: ham=red, broadcast=blue,
// utility=green, cb=orange. (Screenshot reference: 40m Ham red, 41m B/C blue.)
const BAND_COLS: Record<string, string> = {
  ham:       'rgba(207,0,0,0.92)',
  broadcast: 'rgba(9,0,255,0.92)',
  utility:   'rgba(7,189,0,0.92)',
  cb:        'rgba(255,119,0,0.92)',
};

// ── Helpers (ported verbatim from v1.5) ──────────────────────────────────────

function niceTick(approx: number): number {
  const pow  = Math.pow(10, Math.floor(Math.log10(approx)));
  const norm = approx / pow;
  const nice = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
  return nice * pow;
}

function fmtHz(hz: number): string {
  if (hz >= 1e9) return (hz / 1e9).toFixed(2) + 'G';
  if (hz >= 1e6) return (hz / 1e6).toFixed(3) + 'M';
  if (hz >= 1e3) return (hz / 1e3).toFixed(hz < 1e5 ? 1 : 0) + 'k';
  return hz.toFixed(0) + 'Hz';
}

function hexRgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** 11m CB special-case (typed 'utility' in bandPlan.ts but coloured orange). */
function bandColor(b: Band): string {
  if (b.name.includes('CB')) return BAND_COLS.cb;
  return BAND_COLS[b.type] ?? BAND_COLS.utility;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface WaterfallViewProps {
  bins:        Float32Array | null;
  binCount:    number;
  centerHz:    number;
  bwHz:        number;
  tuneHz:      number;
  /** Filter edges (Hz offsets from carrier; low negative, high positive). */
  filterLow?:  number;
  filterHigh?: number;
  /** Manual range — only used when wfCoarse='manual'. */
  dbMin?:      number;
  dbMax?:      number;
  wfCoarse?:   'auto' | 'manual';
  colormap?:   string;
  width:       number;
  height:      number;
  ituRegion?:  number;            // 1/2/3 — filters regional band plan entries
  fontFamily?: string;            // default Atkinson Hyperlegible (accessibility skin)
  onPanDelta?:  (dxPx: number) => void;
  onZoomDelta?: (dyPx: number) => void;
  onTapTune?:   (hz: number) => void;
  onPinchZoom?: (scale: number) => void;

  // Display settings (SignalProcessor + layout)
  specShow?:       boolean;
  specFrac?:       number;        // spectrum fraction of (height − BAND_H − TICK_H)
  autoContrast?:   number;        // 0–20, default 10 (UberSDR calibration)
  specSmoothing?:  number;        // 1–10 → smoothingFrames
  specFloor?:      number;        // ±20 dB
  specPeakScale?:  number;        // 10 = 1.0×
  peakHold?:       boolean;
  spatialSmooth?:  boolean;
  wfBrightness?:   number;
  wfContrast?:     number;
  wfSharpness?:    number;
  frameRate?:      'native' | '20fps' | '60fps';
  needleColor?:    string;        // VFO colour — needle, sidebands, peak hold
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WaterfallView({
  bins, binCount, centerHz, bwHz, tuneHz,
  filterLow = -3000, filterHigh = 3000,
  dbMin = -120, dbMax = -20, wfCoarse = 'auto',
  colormap = 'gqrx', width, height,
  ituRegion = 1, fontFamily = 'Atkinson Hyperlegible',
  onPanDelta, onZoomDelta, onTapTune, onPinchZoom,
  specShow = true, specFrac = 0.26,
  autoContrast = 10, specSmoothing = 5, specFloor = 0, specPeakScale = 10,
  peakHold = true, spatialSmooth = true,
  wfBrightness = 0, wfContrast = 0, wfSharpness = 0,
  frameRate = '60fps', needleColor = '#ff2020',
}: WaterfallViewProps) {

  // ── Vertical layout ─────────────────────────────────────────────────────────
  const tickTop  = BAND_H;
  const specTop  = tickTop + TICK_H;
  const below    = Math.max(0, height - specTop);
  const specH    = specShow ? Math.round(below * Math.max(0.05, Math.min(0.65, specFrac))) : 0;
  const wfTop    = specTop + specH;
  const wfH      = height - wfTop;
  const wfRenderH = wfH + Math.ceil(wfH / ROWS) + 2; // hide bottom-edge judder
  const rowH      = wfRenderH / ROWS;

  const FRAME_DUR_MAX = frameRate === 'native' ? 80 : frameRate === '20fps' ? 400 : 150;

  // ── Signal processor (owns all dB→index maths) ──────────────────────────────
  const proc = useRef(new SignalProcessor());
  useEffect(() => {
    const patch: Partial<SignalProcessorSettings> = {
      autoContrast,
      manualRange: wfCoarse === 'manual' ? { minDb: dbMin, maxDb: dbMax } : null,
      specFloor, specPeakScale,
      smoothingFrames: specSmoothing,
      spatialSmooth, peakHold,
      wfBrightness, wfContrast, wfSharpness,
    };
    proc.current.applySettings(patch);
  }, [autoContrast, wfCoarse, dbMin, dbMax, specFloor, specPeakScale,
      specSmoothing, spatialSmooth, peakHold, wfBrightness, wfContrast, wfSharpness]);

  // ── Colormap LUT + derived spectrum colours (9 stops, idx 15→235) ───────────
  const lut = useMemo(() => getColorLUT(colormap), [colormap]);
  const specGradColors = useMemo(() => {
    const stops: string[] = [];
    for (let gi = 0; gi <= 8; gi++) {
      const idx = Math.max(0, Math.min(255, Math.round(15 + (gi / 8) * 220)));
      stops.push(`rgba(${lut[idx * 4]},${lut[idx * 4 + 1]},${lut[idx * 4 + 2]},1)`);
    }
    return stops.reverse(); // gradient runs top→bottom; hot colour at top
  }, [lut]);

  // ── Ring buffer of LUT indices + persistent RGBA display buffer ────────────
  const idxBuf       = useRef<Uint8Array | null>(null);
  const dispBuf      = useRef<Uint8Array | null>(null); // display order, newest row first
  const rowHead      = useRef(0);
  const lastBinCount = useRef(0);

  // ── Display state ───────────────────────────────────────────────────────────
  const [wfImage,  setWfImage]  = useState<SkImage | null>(null);
  const [specPath, setSpecPath] = useState<SkPath | null>(null);
  const [peakPath, setPeakPath] = useState<SkPath | null>(null);
  const [liveRange, setLiveRange] = useState({ dbMin: -120, dbMax: -20 });

  // ── Smooth scroll (UI thread) ───────────────────────────────────────────────
  const scrollFrac  = useSharedValue(1);
  const wfTransform = useDerivedValue(() => [
    { translateY: -(1 - scrollFrac.value) * rowH },
  ]);
  const lastFrameTs = useRef(0);
  const avgFrameMs  = useRef(150);

  // ── Frame processing ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!bins || bins.length === 0 || width < 4) return;
    const n = bins.length;

    // 1. M9PSY pipeline + UberSDR auto-range
    const frame = proc.current.process(bins, centerHz, bwHz);
    setLiveRange(prev =>
      prev.dbMin === frame.dbMin && prev.dbMax === frame.dbMax
        ? prev : { dbMin: frame.dbMin, dbMax: frame.dbMax });

    // 2. Ring buffer write (LUT indices — kept only for palette switches/resize)
    if (n !== lastBinCount.current || !idxBuf.current || !dispBuf.current) {
      idxBuf.current  = new Uint8Array(n * ROWS);
      dispBuf.current = new Uint8Array(n * ROWS * 4);
      rowHead.current = 0;
      lastBinCount.current = n;
    }
    idxBuf.current.set(frame.row, rowHead.current * n);
    rowHead.current = (rowHead.current + 1) % ROWS;

    // 3. Incremental display update — shift history down one row (native
    //    memmove) and colourise ONLY the new row, instead of reassembling all
    //    ROWS×n pixels every frame.
    const disp = dispBuf.current;
    disp.copyWithin(n * 4, 0, n * 4 * (ROWS - 1));
    for (let i = 0; i < n; i++) {
      const l = frame.row[i] * 4;
      const d = i * 4;
      disp[d]     = lut[l];
      disp[d + 1] = lut[l + 1];
      disp[d + 2] = lut[l + 2];
      disp[d + 3] = 255;
    }
    const img = Skia.Image.MakeImage(
      { width: n, height: ROWS, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Opaque },
      Skia.Data.fromBytes(disp),
      n * 4,
    );
    if (img) setWfImage(img);

    // 4. Spectrum + peak paths from normalised [0,1] traces
    if (specShow && specH > 4) {
      const spec = frame.spec;
      const sLen = spec.length;
      const baseline = wfTop;
      const sp = Skia.Path.Make();
      sp.moveTo(0, baseline);
      for (let px = 0; px < width; px++) {
        const v = spec[Math.floor((px / width) * sLen)];
        sp.lineTo(px, baseline - v * specH);
      }
      sp.lineTo(width, baseline);
      sp.close();
      setSpecPath(sp);

      if (peakHold) {
        const pk = frame.peak;
        const pp = Skia.Path.Make();
        for (let px = 0; px < width; px++) {
          const v = pk[Math.floor((px / width) * sLen)];
          const y = baseline - v * specH;
          if (px === 0) pp.moveTo(px, y); else pp.lineTo(px, y);
        }
        setPeakPath(pp);
      } else {
        setPeakPath(null);
      }
    } else {
      setSpecPath(null);
      setPeakPath(null);
    }

    // 5. Scroll animation timing
    const now = Date.now();
    if (lastFrameTs.current > 0) {
      const dt = now - lastFrameTs.current;
      avgFrameMs.current = avgFrameMs.current * 0.8 + dt * 0.2;
    }
    lastFrameTs.current = now;
    const duration = Math.max(80, Math.min(FRAME_DUR_MAX, avgFrameMs.current * 1.1));
    scrollFrac.value = 0;
    scrollFrac.value = withTiming(1, { duration, easing: Easing.linear });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bins]);

  // Re-colourise instantly on palette change (no waiting for next data frame).
  // Full rebuild from the index ring — rare, only on user palette switch.
  useEffect(() => {
    const buf  = idxBuf.current;
    const disp = dispBuf.current;
    const n = lastBinCount.current;
    if (!buf || !disp || !n) return;
    const head = rowHead.current;
    for (let r = 0; r < ROWS; r++) {
      const srcOff = ((head - 1 - r + ROWS * 2) % ROWS) * n;
      const dstOff = r * n * 4;
      for (let i = 0; i < n; i++) {
        const l = buf[srcOff + i] * 4;
        const d = dstOff + i * 4;
        disp[d] = lut[l]; disp[d + 1] = lut[l + 1];
        disp[d + 2] = lut[l + 2]; disp[d + 3] = 255;
      }
    }
    const img = Skia.Image.MakeImage(
      { width: n, height: ROWS, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Opaque },
      Skia.Data.fromBytes(disp), n * 4,
    );
    if (img) setWfImage(img);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lut]);

  // ── Frequency geometry ──────────────────────────────────────────────────────
  const visStart = centerHz - bwHz / 2;
  const pxPerHz  = bwHz > 0 ? width / bwHz : 0;
  const hzToX    = useCallback((hz: number) => (hz - visStart) * pxPerHz,
    [visStart, pxPerHz]);

  // ── Band plan segments (visible, region-filtered) ───────────────────────────
  const bandSegs = useMemo(() => {
    if (!(bwHz > 0)) return [];
    const visEnd = visStart + bwHz;
    const segs: Array<{ x0: number; x1: number; color: string; label: string; key: string }> = [];
    for (const b of BAND_PLAN) {
      if (b.regions && !b.regions.includes(ituRegion)) continue;
      if (b.hi < visStart || b.lo > visEnd) continue;
      const x0 = Math.max(0, hzToX(b.lo));
      const x1 = Math.min(width, hzToX(b.hi));
      const px = x1 - x0;
      if (px <= 0) continue;
      const label = px < 28 ? '' : px < 60 ? (b.bandLabel ?? b.name.split(' ')[0]) : b.name;
      segs.push({ x0, x1, color: bandColor(b), label, key: `${b.lo}-${b.hi}` });
    }
    return segs;
  }, [visStart, bwHz, width, ituRegion, hzToX]);

  // ── Frequency ticks ─────────────────────────────────────────────────────────
  const ticks = useMemo(() => {
    if (!(bwHz > 0)) return [];
    const targetTicks  = Math.max(4, Math.min(8, Math.floor(width / 70)));
    let spacing = niceTick(bwHz / targetTicks);
    const minGapPx = 52;
    while (spacing * pxPerHz < minGapPx) spacing *= 2;
    const first = Math.ceil(visStart / spacing) * spacing;
    const out: Array<{ x: number; label: string; showLabel: boolean }> = [];
    let lastLabelX = -999;
    for (let f = first; f <= visStart + bwHz; f += spacing) {
      const x = hzToX(f);
      const showLabel = x - lastLabelX >= minGapPx;
      if (showLabel) lastLabelX = x;
      out.push({ x, label: fmtHz(f), showLabel });
    }
    return out;
  }, [visStart, bwHz, width, pxPerHz, hzToX]);

  // ── dB axis labels (5 stops over spectrum panel) ────────────────────────────
  const dbLabels = useMemo(() => {
    if (!specShow || specH < 40) return [];
    const range = liveRange.dbMax - liveRange.dbMin;
    const out: Array<{ y: number; label: string }> = [];
    for (let di = 0; di <= 4; di++) {
      const frac = di / 4;
      out.push({
        y: wfTop - frac * specH,
        label: Math.round(liveRange.dbMin + frac * range) + 'dB',
      });
    }
    return out;
  }, [specShow, specH, wfTop, liveRange]);

  // ── Needle + sideband geometry (v1.5) ───────────────────────────────────────
  const needle = useMemo(() => {
    if (!(bwHz > 0) || !(tuneHz > 0)) return null;
    const nX = hzToX(tuneHz);
    let loX = hzToX(tuneHz + filterLow);
    let hiX = hzToX(tuneHz + filterHigh);
    const minSbPx = filterLow === 0 && filterHigh === 0 ? 20 : 4;
    if (nX - loX < minSbPx) loX = nX - minSbPx;
    if (hiX - nX < minSbPx) hiX = nX + minSbPx;
    const scale = Math.max(0.25, Math.min(1.0, pxPerHz * 4000));
    // Quantised scale (0.05 steps) so the pre-rendered glow strips are not
    // re-blurred on every zoom tick — only on meaningful scale changes.
    const scaleQ = Math.round(scale * 20) / 20;
    return { nX, loXc: Math.max(0, loX), hiXc: Math.min(width, hiX), loX, hiX, scale, scaleQ };
  }, [bwHz, tuneHz, filterLow, filterHigh, hzToX, pxPerHz, width]);

  // ── Skia paints ─────────────────────────────────────────────────────────────
  const peakPaint = useMemo(() => {
    const p = Skia.Paint();
    p.setColor(Skia.Color(hexRgba(needleColor, 0.85)));
    p.setStrokeWidth(1);
    p.setStyle(1);
    p.setAntiAlias(true);
    p.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 2, false));
    return p;
  }, [needleColor]);

  // ── Pre-rendered glow strips (power) ────────────────────────────────────────
  // Gaussian blur masks are the most expensive primitive Skia draws. Rendering
  // the needle (σ 28/16/6) and sideband edges (σ 8) live meant re-blurring
  // full-height layers on every canvas repaint. Instead they are blurred ONCE
  // here into offscreen raster strips and composited as plain textures.
  const dpr = PixelRatio.get();

  const needleStrip = useMemo(() => {
    if (height < 4) return null;
    const sc = needle?.scaleQ ?? 1;
    // σ in MakeBlur(…, false) is device px; ±3σ in dp covers the full halo.
    const halfW = Math.ceil((3 * 28 * sc) / dpr + 2 * sc + 2);
    const w = halfW * 2;
    const surface = Skia.Surface.Make(Math.ceil(w * dpr), Math.ceil(height * dpr));
    if (!surface) return null;
    const c = surface.getCanvas();
    c.scale(dpr, dpr);
    const path = Skia.Path.Make();
    path.moveTo(halfW, 0); path.lineTo(halfW, height);
    const layer = (alpha: number, blur: number, sw: number) => {
      const p = Skia.Paint();
      p.setColor(Skia.Color(alpha >= 1 ? needleColor : hexRgba(needleColor, alpha)));
      p.setStrokeWidth(sw);
      p.setStyle(1);
      p.setAntiAlias(true);
      p.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, blur, false));
      c.drawPath(path, p);
    };
    layer(0.35, 28 * sc, 1.5 * sc);  // outer halo
    layer(0.70, 16 * sc, 0.8 * sc);  // mid glow
    layer(1.00,  6 * sc, 0.5);       // core filament
    return { img: surface.makeImageSnapshot(), halfW, w };
  }, [needleColor, needle?.scaleQ, height, dpr]);

  const edgeStrip = useMemo(() => {
    const h = height - BAND_H;
    if (h < 4) return null;
    const sc = needle?.scaleQ ?? 1;
    const halfW = Math.ceil((3 * 8) / dpr + sc + 2);
    const w = halfW * 2;
    const surface = Skia.Surface.Make(Math.ceil(w * dpr), Math.ceil(h * dpr));
    if (!surface) return null;
    const c = surface.getCanvas();
    c.scale(dpr, dpr);
    const path = Skia.Path.Make();
    path.moveTo(halfW, 0); path.lineTo(halfW, h);
    const p = Skia.Paint();
    p.setColor(Skia.Color(hexRgba(needleColor, 0.35)));
    p.setStrokeWidth(sc);
    p.setStyle(1);
    p.setAntiAlias(true);
    p.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 8, false));
    c.drawPath(path, p);
    return { img: surface.makeImageSnapshot(), halfW, w, h };
  }, [needleColor, needle?.scaleQ, height, dpr]);

  // ── Gestures (tap-to-tune / pan / pinch-zoom) ───────────────────────────────
  const lastPanX = useRef(0);
  const lastPanY = useRef(0);
  const pinchRef = useRef(1);

  const tapGesture = useMemo(() =>
    Gesture.Tap().runOnJS(true).maxDuration(300).onEnd((e: any) => {
      if (!bwHz || !centerHz) return;
      if (e.y < BAND_H) return; // band strip taps reserved (future: band jump)
      onTapTune?.(Math.round(visStart + (e.x / width) * bwHz));
    }), [bwHz, centerHz, visStart, width, onTapTune]);

  const panGesture = useMemo(() =>
    Gesture.Pan().runOnJS(true).minDistance(4)
      .onStart(() => { lastPanX.current = 0; lastPanY.current = 0; })
      .onUpdate((e: any) => {
        const dx = e.translationX - lastPanX.current;
        const dy = e.translationY - lastPanY.current;
        lastPanX.current = e.translationX;
        lastPanY.current = e.translationY;
        if (Math.abs(dx) >= Math.abs(dy)) onPanDelta?.(-dx);
        else onZoomDelta?.(dy);
      }), [onPanDelta, onZoomDelta]);

  const pinchGesture = useMemo(() =>
    Gesture.Pinch().runOnJS(true)
      .onStart(() => { pinchRef.current = 1; })
      .onUpdate((e: any) => {
        const delta = e.scale / pinchRef.current;
        pinchRef.current = e.scale;
        onPinchZoom?.(delta);
      }), [onPinchZoom]);

  const gesture = useMemo(() =>
    Gesture.Simultaneous(Gesture.Exclusive(tapGesture, panGesture), pinchGesture),
    [tapGesture, panGesture, pinchGesture]);

  // ── Render ──────────────────────────────────────────────────────────────────
  // Canvas 1 (bottom): waterfall texture only — the ONLY thing the 120Hz
  // Reanimated scroll repaints. Canvas 2 (top): everything else, repainted at
  // the 10Hz data rate. The canvas bounds clip the over-tall scrolling image.
  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.root, { width, height }]}>

        <Canvas style={{ position: 'absolute', left: 0, top: wfTop, width, height: wfH }}>
          {wfImage && (
            <SkiaImage image={wfImage} x={0} y={0}
                       width={width} height={wfRenderH}
                       transform={wfTransform} fit="fill" />
          )}
        </Canvas>

        <Canvas style={{ position: 'absolute', left: 0, top: 0, width, height }}>

          {/* Opaque header backing — WebGL parity rgb(2,2,2) */}
          <Rect x={0} y={0} width={width} height={wfTop} color="rgb(2,2,2)" />

          {/* ── Band plan strip ── */}
          {bandSegs.map(s => (
            <Rect key={s.key} x={s.x0} y={0} width={s.x1 - s.x0} height={BAND_H}
                  color={s.color} />
          ))}
          <Rect x={0} y={BAND_H - 1} width={width} height={1}
                color="rgba(255,200,80,0.25)" />

          {/* ── Ticker backing + tick marks ── */}
          <Rect x={0} y={tickTop} width={width} height={TICK_H}
                color="rgba(0,10,4,0.85)" />
          {ticks.map((t, i) => (
            <Rect key={i} x={t.x - 0.5} y={tickTop} width={1} height={5}
                  color="rgba(0,180,60,0.45)" />
          ))}

          {/* ── Spectrum: LUT-gradient fill, faint dB reference lines, peak ── */}
          {specShow && dbLabels.map((d, i) => (
            <Rect key={i} x={0} y={d.y} width={width} height={0.5}
                  color="rgba(255,180,0,0.12)" />
          ))}
          {specShow && specPath && (
            <Path path={specPath} style="fill">
              <LinearGradient start={vec(0, specTop)} end={vec(0, wfTop)}
                              colors={specGradColors} />
            </Path>
          )}
          {specShow && peakHold && peakPath && (
            <Path path={peakPath} paint={peakPaint} />
          )}

          {/* ── Acrylic sideband panels (band-strip bottom → screen bottom) ── */}
          {needle && needle.nX > needle.loXc && (
            <Rect x={needle.loXc} y={BAND_H}
                  width={needle.nX - needle.loXc} height={height - BAND_H}>
              <LinearGradient
                start={vec(needle.loXc, 0)} end={vec(needle.nX, 0)}
                colors={[hexRgba(needleColor, 0.03), hexRgba(needleColor, 0.06),
                         hexRgba(needleColor, 0.14), hexRgba(needleColor, 0.28)]}
                positions={[0, 0.15, 0.55, 1]} />
            </Rect>
          )}
          {needle && needle.hiXc > needle.nX && (
            <Rect x={needle.nX} y={BAND_H}
                  width={needle.hiXc - needle.nX} height={height - BAND_H}>
              <LinearGradient
                start={vec(needle.nX, 0)} end={vec(needle.hiXc, 0)}
                colors={[hexRgba(needleColor, 0.28), hexRgba(needleColor, 0.14),
                         hexRgba(needleColor, 0.06), hexRgba(needleColor, 0.03)]}
                positions={[0, 0.45, 0.85, 1]} />
            </Rect>
          )}
          {needle && needle.loXc > 0 && edgeStrip && (
            <SkiaImage image={edgeStrip.img} x={needle.loXc - edgeStrip.halfW} y={BAND_H}
                       width={edgeStrip.w} height={edgeStrip.h} fit="fill" />
          )}
          {needle && needle.hiXc < width && edgeStrip && (
            <SkiaImage image={edgeStrip.img} x={needle.hiXc - edgeStrip.halfW} y={BAND_H}
                       width={edgeStrip.w} height={edgeStrip.h} fit="fill" />
          )}

          {/* ── LED needle: halo → glow → filament (cached strip) ── */}
          {needle && needleStrip && (
            <SkiaImage image={needleStrip.img} x={needle.nX - needleStrip.halfW} y={0}
                       width={needleStrip.w} height={height} fit="fill" />
          )}

        </Canvas>

        {/* ── Text overlays (RN Text — crisp, uses expo-font faces) ── */}

        {/* Band labels — clipped to segment width, white with dark shadow */}
        {bandSegs.filter(s => s.label).map(s => (
          <View key={'bl' + s.key} pointerEvents="none"
                style={[styles.bandLabelWrap,
                        { left: s.x0 + 2, width: s.x1 - s.x0 - 4, height: BAND_H }]}>
            <Text numberOfLines={1}
                  style={[styles.bandLabel, { fontFamily }]}>{s.label}</Text>
          </View>
        ))}

        {/* Ticker labels — green LED glow */}
        {ticks.filter(t => t.showLabel).map((t, i) => (
          <Text key={'tk' + i} pointerEvents="none"
                style={[styles.tickLabel, { fontFamily, left: t.x - 40, top: tickTop + 5 }]}>
            {t.label}
          </Text>
        ))}

        {/* dB axis — amber, left edge of spectrum */}
        {dbLabels.map((d, i) => (
          <Text key={'db' + i} pointerEvents="none"
                style={[styles.dbLabel, { fontFamily, top: d.y - 14 }]}>
            {d.label}
          </Text>
        ))}

      </View>
    </GestureDetector>
  );
}

// ── Styles (typography from v1.5 canvas calls) ───────────────────────────────

const styles = StyleSheet.create({
  root: { overflow: 'hidden', backgroundColor: '#000' },
  bandLabelWrap: {
    position: 'absolute', top: 0,
    alignItems: 'center', justifyContent: 'flex-end',
    overflow: 'hidden', paddingBottom: 2,
  },
  bandLabel: {
    fontSize: 9, fontWeight: 'bold', color: '#ffffff',
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 0 },
  },
  tickLabel: {
    position: 'absolute', width: 80, textAlign: 'center',
    fontSize: 11, fontWeight: 'bold', color: '#00aa33',
    textShadowColor: '#00cc44', textShadowRadius: 5,
    textShadowOffset: { width: 0, height: 0 },
  },
  dbLabel: {
    position: 'absolute', left: 4,
    fontSize: 11, fontWeight: 'bold', color: 'rgba(255,180,60,0.90)',
    textShadowColor: 'rgba(0,0,0,0.75)', textShadowRadius: 2.5,
    textShadowOffset: { width: 0, height: 0 },
  },
});
