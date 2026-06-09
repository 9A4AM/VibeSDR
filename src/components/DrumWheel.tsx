/**
 * DrumWheel — LED trapezoid drum wheel using declarative Skia Canvas.
 *
 * Matches the original HTML canvas design: trapezoid, green LED glow,
 * red needle, tick marks, icon. Physics: FRICTION=0.974, MAX_VEL=580.
 *
 * Uses declarative @shopify/react-native-skia Canvas JSX (not offscreen
 * Surface.Make) so it works correctly on New Architecture / Fabric.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, PixelRatio, ViewStyle } from 'react-native';
import {
  Canvas,
  Fill,
  Rect,
  Path,
  Line,
  Skia,
  vec,
  BlurMask,
  LinearGradient,
  RadialGradient,
  Group,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

// ── Constants ──────────────────────────────────────────────────────────────────

const FRICTION    = 0.974;
const MAX_VEL     = 580;
const MIN_VEL     = 0.8;
const LSV_PX_STEP = 22;
const UPDATE_RATE = 40; // Hz

// ── Types ──────────────────────────────────────────────────────────────────────

export type DrumType = 'vfo' | 'zoom';

interface Props {
  type:    DrumType;
  width?:  number;   // pass 0 or omit to use onLayout measurement
  height:  number;
  onDelta: (pxDelta: number) => void;
  style?:  ViewStyle;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function DrumWheel({ type, width: widthProp = 0, height, onDelta, style }: Props) {
  const dpr = PixelRatio.get();
  const [measuredW, setMeasuredW] = useState(widthProp);
  const W   = Math.round((widthProp > 0 ? widthProp : measuredW) * dpr);
  const H   = Math.round(height * dpr);

  // scroll state drives tick mark positions
  const [scroll, setScroll] = useState(0);

  const scrollRef  = useRef(0);
  const vel        = useRef(0);
  const lastX      = useRef(0);
  const lastT      = useRef(0);
  const rafId      = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const rafTS      = useRef(0);
  const pending    = useRef(0);
  const lastSend   = useRef(0);
  const touching   = useRef(false);

  // ── Throttled send ──────────────────────────────────────────────────────────

  const sendDelta = useCallback((dPx: number) => {
    const now = performance.now();
    if (now - lastSend.current < 1000 / UPDATE_RATE) return;
    lastSend.current = now;
    onDelta(dPx);
  }, [onDelta]);

  // ── Inertia loop ────────────────────────────────────────────────────────────

  const inertia = useCallback((ts: number) => {
    const dt   = Math.min(0.05, (ts - rafTS.current) / 1000);
    rafTS.current = ts;

    const fric = type === 'vfo' ? FRICTION : 0.90;
    vel.current *= Math.pow(fric, dt * 60);

    if (Math.abs(vel.current) < Math.max(MIN_VEL, 1)) {
      vel.current = 0;
      if (pending.current) { sendDelta(pending.current); pending.current = 0; }
      rafId.current = null;
      return;
    }

    const dx = vel.current * dt;
    scrollRef.current -= dx;
    pending.current   += dx;

    if (Math.abs(pending.current) >= LSV_PX_STEP || performance.now() - lastSend.current > 25) {
      sendDelta(pending.current);
      pending.current = 0;
    }

    setScroll(scrollRef.current);
    rafId.current = requestAnimationFrame(inertia);
  }, [type, sendDelta]);

  const startInertia = useCallback(() => {
    if (Math.abs(vel.current) < MIN_VEL) return;
    vel.current = Math.max(-MAX_VEL, Math.min(MAX_VEL, vel.current));
    if (rafId.current) cancelAnimationFrame(rafId.current);
    rafTS.current = performance.now();
    rafId.current = requestAnimationFrame(inertia);
  }, [inertia]);

  // ── Gesture ─────────────────────────────────────────────────────────────────

  const gesture = Gesture.Pan()
    .runOnJS(true)
    .onBegin(e => {
      if (rafId.current) { cancelAnimationFrame(rafId.current); rafId.current = null; }
      touching.current = true;
      vel.current     = 0;
      pending.current = 0;
      lastX.current   = e.absoluteX;
      lastT.current   = performance.now();
    })
    .onUpdate(e => {
      if (!touching.current) return;
      const now = performance.now();
      const dt  = Math.max(8, now - lastT.current);
      const dx  = e.absoluteX - lastX.current;

      scrollRef.current -= dx;
      vel.current = Math.max(-MAX_VEL, Math.min(MAX_VEL, dx / (dt / 1000)));
      pending.current += dx;

      if (Math.abs(pending.current) >= LSV_PX_STEP) {
        sendDelta(pending.current);
        pending.current = 0;
      }

      lastX.current = e.absoluteX;
      lastT.current = now;
      setScroll(scrollRef.current);
    })
    .onEnd(() => {
      touching.current = false;
      if (pending.current) { sendDelta(pending.current); pending.current = 0; }
      startInertia();
    })
    .onFinalize(() => { touching.current = false; });

  useEffect(() => () => { if (rafId.current) cancelAnimationFrame(rafId.current); }, []);

  // ── Geometry (all in physical pixels) ──────────────────────────────────────

  const cx     = W / 2;
  const trapH  = Math.max(12, Math.round(H * 0.56));
  const trapWT = Math.max(26, Math.round(W * 0.42));
  const trapWB = Math.max(14, Math.round(W * 0.22));
  const tx0    = Math.max(0, cx - trapWT / 2);
  const tx1    = Math.min(W, cx + trapWT / 2);
  const bx0    = cx - trapWB / 2;
  const bx1    = cx + trapWB / 2;
  const nMidY  = trapH + (H - trapH) * 0.5;

  // Trapezoid path
  const trapPath = (() => {
    const p = Skia.Path.Make();
    p.moveTo(tx0, 0); p.lineTo(tx1, 0);
    p.lineTo(bx1, trapH); p.lineTo(bx0, trapH); p.close();
    return p;
  })();

  // Tick marks
  const pxs = W > 120 ? 13 : W > 80 ? 11 : W > 55 ? 9 : 7;
  const i0  = Math.floor((scroll - W / 2) / pxs) - 1;
  const i1  = Math.ceil( (scroll + W / 2) / pxs) + 1;
  const ticks: Array<{ x: number; tY: number; tH: number; major: boolean; med: boolean }> = [];
  for (let i = i0; i <= i1; i++) {
    const x = W / 2 - scroll + i * pxs;
    if (x < -2 || x > W + 2) continue;
    const major = i % 8 === 0;
    const med   = i % 4 === 0;
    const tH2   = major ? H * 0.70 : med ? H * 0.48 : H * 0.26;
    const tY    = (H - tH2) / 2;
    ticks.push({ x, tY, tH: tH2, major, med });
  }

  // Icon paths
  const iconSz = Math.max(7, Math.round(trapH * 0.58));
  const iconCY = Math.round(trapH * 0.50);
  const iconPath = buildIconPath(type === 'vfo', cx, iconCY, iconSz);

  // Edge vignette width/height
  const eW = Math.max(3, W * 0.09);
  const eH = Math.max(2, H * 0.09);

  // Needle
  const nTop = trapH;
  const nBot = H - 1;

  // +/- label size (for positioning)
  const pmFontSz = Math.max(8, Math.round(H * 0.30));

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[{ height: height }, style]}
        onLayout={widthProp <= 0 ? e => setMeasuredW(e.nativeEvent.layout.width) : undefined}
      >
        <Canvas style={StyleSheet.absoluteFill}>
          {/* Background */}
          <Fill color="#060605" />

          {/* Green radial glows — trapezoid area (3 layers) */}
          {[
            [W * 0.95, [[0, 0.10], [0.20, 0.06], [0.50, 0.02], [1, 0]]],
            [W * 0.58, [[0, 0.22], [0.25, 0.10], [0.55, 0.03], [1, 0]]],
            [W * 0.28, [[0, 0.38], [0.30, 0.16], [0.70, 0.04], [1, 0]]],
          ].map(([r, stops], gi) => (
            <Rect key={`gg${gi}`} x={0} y={0} width={W} height={H}>
              <RadialGradient
                c={vec(cx, trapH)}
                r={r as number}
                colors={(stops as number[][]).map(([, a]) => `rgba(0,200,50,${a.toFixed(3)})`)}
                positions={(stops as number[][]).map(([p]) => p)}
              />
            </Rect>
          ))}

          {/* Red radial glows — needle area (2 layers) */}
          {[
            [W * 0.70, [[0, 0.10], [0.25, 0.04], [0.60, 0.01], [1, 0]]],
            [W * 0.32, [[0, 0.28], [0.30, 0.10], [0.70, 0.02], [1, 0]]],
          ].map(([r, stops], ri) => (
            <Rect key={`rg${ri}`} x={0} y={trapH} width={W} height={H - trapH}>
              <RadialGradient
                c={vec(cx, nMidY)}
                r={r as number}
                colors={(stops as number[][]).map(([, a]) => `rgba(210,15,15,${a.toFixed(3)})`)}
                positions={(stops as number[][]).map(([p]) => p)}
              />
            </Rect>
          ))}

          {/* Left edge vignette */}
          <Rect x={0} y={0} width={eW} height={H}>
            <LinearGradient start={vec(0, 0)} end={vec(eW, 0)}
              colors={['rgba(0,200,50,0.20)', 'rgba(0,200,50,0)']} />
          </Rect>
          {/* Right edge vignette */}
          <Rect x={W - eW} y={0} width={eW} height={H}>
            <LinearGradient start={vec(W, 0)} end={vec(W - eW, 0)}
              colors={['rgba(0,200,50,0.20)', 'rgba(0,200,50,0)']} />
          </Rect>
          {/* Top edge vignette */}
          <Rect x={0} y={0} width={W} height={eH}>
            <LinearGradient start={vec(0, 0)} end={vec(0, eH)}
              colors={['rgba(0,200,50,0.20)', 'rgba(0,200,50,0)']} />
          </Rect>
          {/* Bottom edge vignette */}
          <Rect x={0} y={H - eH} width={W} height={eH}>
            <LinearGradient start={vec(0, H)} end={vec(0, H - eH)}
              colors={['rgba(0,200,50,0.20)', 'rgba(0,200,50,0)']} />
          </Rect>

          {/* Tick marks */}
          {ticks.map((t, i) => (
            <Line key={i}
              p1={vec(t.x, t.tY)} p2={vec(t.x, t.tY + t.tH)}
              color={t.major ? 'rgba(145,140,130,0.48)' : t.med ? 'rgba(95,90,84,0.32)' : 'rgba(58,55,50,0.20)'}
              strokeWidth={t.major ? (W > 55 ? 1.6 : 1.2) : 0.8}
            />
          ))}

          {/* Trapezoid fill */}
          <Path path={trapPath} color="rgba(5,5,4,0.93)" />

          {/* Trapezoid left edge glow */}
          <Line p1={vec(tx0, 0)} p2={vec(bx0, trapH)} color="rgba(0,200,50,0.30)" strokeWidth={3}>
            <BlurMask blur={W > 70 ? 3 : 2} style="normal" respectCTM />
          </Line>
          <Line p1={vec(tx0, 0)} p2={vec(bx0, trapH)} color="rgba(0,200,50,0.60)" strokeWidth={0.9} />

          {/* Trapezoid right edge glow */}
          <Line p1={vec(tx1, 0)} p2={vec(bx1, trapH)} color="rgba(0,200,50,0.30)" strokeWidth={3}>
            <BlurMask blur={W > 70 ? 3 : 2} style="normal" respectCTM />
          </Line>
          <Line p1={vec(tx1, 0)} p2={vec(bx1, trapH)} color="rgba(0,200,50,0.60)" strokeWidth={0.9} />

          {/* Trapezoid bottom edge glow */}
          <Line p1={vec(bx0, trapH)} p2={vec(bx1, trapH)} color="rgba(0,200,50,0.30)" strokeWidth={3}>
            <BlurMask blur={W > 70 ? 3 : 2} style="normal" respectCTM />
          </Line>
          <Line p1={vec(bx0, trapH)} p2={vec(bx1, trapH)} color="rgba(0,200,50,0.60)" strokeWidth={0.9} />

          {/* Icon */}
          <Path path={iconPath} color="rgba(0,200,50,0.90)" strokeWidth={1.3} style="stroke"
            strokeCap="round" strokeJoin="round">
            <BlurMask blur={2} style="normal" respectCTM />
          </Path>

          {/* Red needle — 4 glow layers */}
          <Line p1={vec(cx, nTop)} p2={vec(cx, nBot)} color="rgba(210,15,15,0.05)" strokeWidth={W > 70 ? 16 : 12}>
            <BlurMask blur={W > 70 ? 9 : 6} style="normal" respectCTM />
          </Line>
          <Line p1={vec(cx, nTop)} p2={vec(cx, nBot)} color="rgba(210,15,15,0.15)" strokeWidth={W > 70 ? 8 : 6}>
            <BlurMask blur={W > 70 ? 6 : 4} style="normal" respectCTM />
          </Line>
          <Line p1={vec(cx, nTop)} p2={vec(cx, nBot)} color="rgba(210,15,15,0.45)" strokeWidth={W > 70 ? 3.5 : 2.5}>
            <BlurMask blur={W > 70 ? 4 : 3} style="normal" respectCTM />
          </Line>
          <Line p1={vec(cx, nTop)} p2={vec(cx, nBot)} color="rgba(255,120,100,0.98)" strokeWidth={W > 70 ? 1.2 : 0.9}>
            <BlurMask blur={W > 70 ? 2.5 : 2} style="normal" respectCTM />
          </Line>

          {/* Outer border glow */}
          <Rect x={1} y={1} width={W - 2} height={H - 2}
            color="rgba(0,200,50,0.08)" strokeWidth={5} style="stroke">
            <BlurMask blur={W > 70 ? 7 : 4.5} style="normal" respectCTM />
          </Rect>
          {/* Outer border solid */}
          <Rect x={0.5} y={0.5} width={W - 1} height={H - 1}
            color="rgba(0,200,50,0.70)" strokeWidth={0.9} style="stroke" />
        </Canvas>

        {/* +/− labels as RN Text (avoids Skia font loading) */}
        <View style={[StyleSheet.absoluteFill, { flexDirection: 'row', justifyContent: 'space-between',
          paddingHorizontal: Math.max(4, Math.round((widthProp > 0 ? widthProp : measuredW) * 0.04)),
          paddingTop: (trapH / dpr) + ((height - trapH / dpr) * 0.5) - pmFontSz / dpr * 0.65 }]}
          pointerEvents="none"
        >
          <Text style={{ color: 'rgba(0,200,50,0.70)', fontSize: pmFontSz / dpr, lineHeight: pmFontSz / dpr * 1.2, fontFamily: 'Nixie One' }}>−</Text>
          <Text style={{ color: 'rgba(0,200,50,0.70)', fontSize: pmFontSz / dpr, lineHeight: pmFontSz / dpr * 1.2, fontFamily: 'Nixie One' }}>+</Text>
        </View>
      </View>
    </GestureDetector>
  );
}

// ── Icon path builders ─────────────────────────────────────────────────────────

function buildIconPath(isTune: boolean, cx: number, cy: number, sz: number): ReturnType<typeof Skia.Path.Make> {
  const p = Skia.Path.Make();
  const s = sz / 14;
  const ox = cx - 7 * s;
  const oy = cy - 7 * s;

  if (isTune) {
    // Radio icon
    p.moveTo(ox + 9 * s, oy + 1 * s);
    p.lineTo(ox + 11.5 * s, oy + 4.5 * s);
    p.addRRect({
      rect: { x: ox + 1.5 * s, y: oy + 4.5 * s, width: 11 * s, height: 8 * s },
      rx: 1.2 * s, ry: 1.2 * s,
    });
    p.addCircle(ox + 4.5 * s, oy + 9 * s, 2 * s);
  } else {
    // Magnifier icon
    p.addCircle(ox + 6 * s, oy + 6 * s, 4 * s);
    p.moveTo(ox + 9.2 * s, oy + 9.2 * s);
    p.lineTo(ox + 13 * s, oy + 13 * s);
    p.moveTo(ox + 3.5 * s, oy + 6 * s);
    p.lineTo(ox + 8.5 * s, oy + 6 * s);
  }

  return p;
}
