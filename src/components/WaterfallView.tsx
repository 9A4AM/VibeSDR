/**
 * WaterfallView — GPU-accelerated spectrum + scrolling waterfall.
 *
 * Architecture:
 *   - Ring buffer (Uint8Array RGBA) stores the last ROWS rows of colourised FFT data.
 *   - On each new spectrum frame the ring head advances by one row; the oldest row
 *     is overwritten with fresh colourmap-mapped data.
 *   - Skia.Image.MakeImage() turns the pixel buffer into a SkImage without copying to JS;
 *     the Canvas component draws it stretched to fill the waterfall region.
 *   - The spectrum line is drawn as a Skia Path on top of the waterfall each frame.
 *   - All heavy work (colourmap LUT, pixel writes) stays in typed arrays — no JS objects.
 *
 * Colourmap: 256-entry RGBA LUT built once from the selected palette name.
 * dB range: dbMin..dbMax → LUT index 0..255.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Canvas,
  Skia,
  Image as SkiaImage,
  Path,
  LinearGradient,
  vec,
  AlphaType,
  ColorType,
  type SkImage,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { getColorLUT } from '../assets/colormapUtils';

// ── Constants ──────────────────────────────────────────────────────────────────

const ROWS           = 512;   // waterfall history depth (rows)
const SPECTRUM_FRAC  = 0.22;  // fraction of height given to spectrum line view

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
  /** px delta left = lower freq, right = higher freq (caller maps to Hz) */
  onPanDelta?:   (dxPx: number) => void;
  onZoomDelta?:  (dyPx: number) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WaterfallView({
  bins,
  binCount,
  centerHz,
  bwHz,
  tuneHz,
  dbMin   = -120,
  dbMax   = -20,
  colormap = 'gqrx',
  width,
  height,
  onPanDelta,
  onZoomDelta,
}: WaterfallViewProps) {
  const specH = Math.round(height * SPECTRUM_FRAC);
  const wfH   = height - specH;

  // ── Pixel ring buffer ──────────────────────────────────────────────────────

  // Allocated lazily when binCount is known.
  const pixBuf     = useRef<Uint8Array | null>(null);
  const rowHead    = useRef(0);   // index of the next row to write (top of waterfall = newest)
  const lastBinCount = useRef(0);

  const ensureBuffer = useCallback((n: number) => {
    if (n !== lastBinCount.current) {
      pixBuf.current   = new Uint8Array(n * ROWS * 4);
      rowHead.current  = 0;
      lastBinCount.current = n;
    }
  }, []);

  // ── Colourmap LUT ──────────────────────────────────────────────────────────

  const lut = useMemo(() => getColorLUT(colormap), [colormap]);

  // ── Waterfall Skia image state ─────────────────────────────────────────────

  const [wfImage, setWfImage] = useState<SkImage | null>(null);

  // ── Spectrum path state ────────────────────────────────────────────────────

  const [specPath, setSpecPath] = useState<ReturnType<typeof Skia.Path.Make> | null>(null);
  const [fillPath, setFillPath] = useState<ReturnType<typeof Skia.Path.Make> | null>(null);

  // ── Render new frame ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!bins || bins.length === 0) return;

    const n = bins.length;
    ensureBuffer(n);
    const buf = pixBuf.current!;

    // ── 1. Write new row into ring buffer ─────────────────────────────────

    const dbRange = dbMax - dbMin;
    const rowOff  = rowHead.current * n * 4;

    for (let i = 0; i < n; i++) {
      const db  = bins[i];
      const idx = Math.max(0, Math.min(255, Math.round(((db - dbMin) / dbRange) * 255)));
      const l   = idx * 4;
      buf[rowOff + i * 4]     = lut[l];
      buf[rowOff + i * 4 + 1] = lut[l + 1];
      buf[rowOff + i * 4 + 2] = lut[l + 2];
      buf[rowOff + i * 4 + 3] = 255;
    }

    // Advance head (wraps around ROWS)
    rowHead.current = (rowHead.current + 1) % ROWS;

    // ── 2. Assemble display-order pixel buffer (newest row at top) ────────

    // We need to copy the ring in display order (newest = head-1 downward)
    const display = new Uint8Array(n * ROWS * 4);
    const head    = rowHead.current; // points to NEXT write slot = oldest row

    for (let r = 0; r < ROWS; r++) {
      // r=0 → newest (head - 1 mod ROWS), r=ROWS-1 → oldest (head)
      const srcRow = (head - 1 - r + ROWS * 2) % ROWS;
      const srcOff = srcRow * n * 4;
      const dstOff = r * n * 4;
      display.set(buf.subarray(srcOff, srcOff + n * 4), dstOff);
    }

    // ── 3. Build SkImage from pixel buffer ────────────────────────────────

    const skData = Skia.Data.fromBytes(display);
    const info = {
      width:     n,
      height:    ROWS,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Opaque,
    };
    const img = Skia.Image.MakeImage(info, skData, n * 4);
    if (img) setWfImage(img);

    // ── 4. Build spectrum path ────────────────────────────────────────────

    const path = Skia.Path.Make();
    const fill = Skia.Path.Make();
    const xScale = width / n;

    path.moveTo(0, specH);
    fill.moveTo(0, specH);

    for (let i = 0; i < n; i++) {
      const db  = bins[i];
      const t   = Math.max(0, Math.min(1, (db - dbMin) / dbRange));
      const x   = i * xScale;
      const y   = specH * (1 - t * 0.92);
      if (i === 0) {
        path.moveTo(x, y);
        fill.moveTo(x, y);
      } else {
        path.lineTo(x, y);
        fill.lineTo(x, y);
      }
    }

    fill.lineTo(width, specH);
    fill.lineTo(0,     specH);
    fill.close();

    setSpecPath(path);
    setFillPath(fill);
  }, [bins, dbMin, dbMax, lut, width, specH, ensureBuffer]);

  // ── Gesture: pan (x) + zoom (y) ───────────────────────────────────────────

  const panGesture = useMemo(() =>
    Gesture.Pan()
      .runOnJS(true)
      .onUpdate(e => {
        if (Math.abs(e.velocityX) > Math.abs(e.velocityY)) {
          onPanDelta?.(e.translationX);
        } else {
          onZoomDelta?.(e.translationY);
        }
      }),
    [onPanDelta, onZoomDelta]
  );

  // ── Tuning cursor position ─────────────────────────────────────────────────

  const cursorX = useMemo(() => {
    if (!bwHz || !width) return width / 2;
    const halfBw = bwHz / 2;
    const lo     = centerHz - halfBw;
    const hi     = centerHz + halfBw;
    return ((tuneHz - lo) / (hi - lo)) * width;
  }, [tuneHz, centerHz, bwHz, width]);

  // ── Cursor path ────────────────────────────────────────────────────────────

  const cursorPath = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(cursorX, 0);
    p.lineTo(cursorX, height);
    return p;
  }, [cursorX, height]);

  // ── Paint objects (memoised) ───────────────────────────────────────────────

  const specLinePaint = useMemo(() => {
    const p = Skia.Paint();
    p.setColor(Skia.Color('rgba(255,220,80,0.85)'));
    p.setStrokeWidth(1.4);
    p.setStyle(1); // stroke
    p.setAntiAlias(true);
    return p;
  }, []);

  const cursorPaint = useMemo(() => {
    const p = Skia.Paint();
    p.setColor(Skia.Color('rgba(255,80,80,0.75)'));
    p.setStrokeWidth(1);
    p.setStyle(1);
    return p;
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <GestureDetector gesture={panGesture}>
      <View style={[styles.root, { width, height }]}>
        <Canvas style={{ width, height }}>

          {/* ── Waterfall ──────────────────────────────────────────────── */}
          {wfImage && (
            <SkiaImage
              image={wfImage}
              x={0}
              y={specH}
              width={width}
              height={wfH}
              fit="fill"
            />
          )}

          {/* ── Spectrum fill gradient ──────────────────────────────────── */}
          {fillPath && (
            <Path path={fillPath} style="fill">
              <LinearGradient
                start={vec(0, 0)}
                end={vec(0, specH)}
                colors={['rgba(255,200,60,0.18)', 'rgba(255,200,60,0.03)']}
              />
            </Path>
          )}

          {/* ── Spectrum line ───────────────────────────────────────────── */}
          {specPath && (
            <Path path={specPath} paint={specLinePaint} />
          )}

          {/* ── Tuning cursor ───────────────────────────────────────────── */}
          <Path path={cursorPath} paint={cursorPaint} />

        </Canvas>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden', backgroundColor: '#000' },
});
