/**
 * DrumWheel — faithful native port of drawDrum() from VibeSDR_Mockup_SAVE.html
 *
 * All magic numbers, physics constants, and visual constants are copied
 * directly from the mockup's JavaScript. No creative interpretation.
 *
 * Dependencies: @shopify/react-native-skia, react-native-gesture-handler
 *
 * Physics (from mockup, line 1604):
 *   const FRICTION=0.974, MAX_VEL=580, PX_STEP=22, GRIP=7;
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import {
  Canvas,
  Fill,
  Group,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Skia,
  rect,
  vec,
} from '@shopify/react-native-skia';
import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useDerivedValue,
  runOnJS,
  withDecay,
  cancelAnimation,
} from 'react-native-reanimated';

// ── Physics constants — must match mockup exactly ─────────────────────────────
const FRICTION = 0.974;
const MAX_VEL  = 580;
const PX_STEP  = 22;
const GRIP     = 7;

// ── Colour helpers matching _LED_G / _LED_R in mockup ────────────────────────
const G = (a: number) => `rgba(0,200,50,${a})`;
const R = (a: number) => `rgba(210,15,15,${a})`;

export interface DrumWheelProps {
  type:    'vfo' | 'zoom';
  height?: number;   // dp — default 60 (matches --drum-h: 60px)
  onDelta: (pxDelta: number) => void;
  style?:  ViewStyle;
}

// ── Pure draw function — renders one frame to a Skia Canvas ──────────────────
// Exact port of drawDrum(ctx, W, H, scrollVal, isTune) from mockup lines 1518–1599.
function DrumCanvas({
  W, H, scrollVal, isTune,
}: { W: number; H: number; scrollVal: number; isTune: boolean }) {
  if (W < 4 || H < 4) return null;

  const cx    = W / 2;
  const trapH = Math.max(12, Math.round(H * 0.56));
  const nMidY = trapH + (H - trapH) * 0.50;

  // ── Tick marks ─────────────────────────────────────────────────────────────
  const pxs = W > 120 ? 13 : W > 80 ? 11 : W > 55 ? 9 : 7;
  const i0  = Math.floor((scrollVal - W / 2) / pxs) - 1;
  const i1  = Math.ceil((scrollVal + W / 2) / pxs) + 1;
  const ticks: React.ReactNode[] = [];
  for (let i = i0; i <= i1; i++) {
    const sx = W / 2 - scrollVal + i * pxs;
    if (sx < -2 || sx > W + 2) continue;
    const major = i % 8 === 0;
    const med   = i % 4 === 0;
    const tH2   = major ? H * 0.70 : med ? H * 0.48 : H * 0.26;
    const tY    = (H - tH2) / 2;
    const color = major ? 'rgba(145,140,130,0.48)'
                : med   ? 'rgba(95,90,84,0.32)'
                :         'rgba(58,55,50,0.20)';
    const lw = major ? (W > 55 ? 1.6 : 1.2) : 0.8;
    const p  = Skia.Path.Make();
    p.moveTo(sx, tY); p.lineTo(sx, tY + tH2);
    ticks.push(
      <Path key={i} path={p} color={color} strokeWidth={lw} style="stroke" />,
    );
  }

  // ── Trapezoid path ─────────────────────────────────────────────────────────
  const trapWtop = Math.max(26, Math.round(W * 0.42));
  const trapWbot = Math.max(14, Math.round(W * 0.22));
  const tx0 = Math.max(0, cx - trapWtop / 2);
  const tx1 = Math.min(W, cx + trapWtop / 2);
  const bx0 = cx - trapWbot / 2;
  const bx1 = cx + trapWbot / 2;
  const trapPath = Skia.Path.Make();
  trapPath.moveTo(tx0, 0); trapPath.lineTo(tx1, 0);
  trapPath.lineTo(bx1, trapH); trapPath.lineTo(bx0, trapH);
  trapPath.close();

  // Trapezoid edge lines
  const edgePath = Skia.Path.Make();
  edgePath.moveTo(tx0, 0); edgePath.lineTo(bx0, trapH);
  edgePath.moveTo(tx1, 0); edgePath.lineTo(bx1, trapH);
  edgePath.moveTo(bx0, trapH); edgePath.lineTo(bx1, trapH);

  // ── Icon paths ─────────────────────────────────────────────────────────────
  const iconSz = Math.max(7, Math.round(trapH * 0.58));
  const iconCY = Math.round(trapH * 0.50);
  const s      = iconSz / 14;
  const ox     = cx - 7 * s;
  const oy     = iconCY - 7 * s;

  let iconPath  = Skia.Path.Make();
  let iconPath2 = Skia.Path.Make(); // dim lines for tune icon
  let iconPath3 = Skia.Path.Make(); // circle/dot for tune icon

  if (isTune) {
    // Antenna line
    iconPath.moveTo(ox + 9 * s, oy + 1 * s);
    iconPath.lineTo(ox + 11.5 * s, oy + 4.5 * s);
    // Radio body (rounded rect approx)
    const bodyRRect = {
      rect: rect(ox + 1.5 * s, oy + 4.5 * s, 11 * s, 8 * s),
      rx: 1.2 * s, ry: 1.2 * s,
    };
    iconPath.addRRect(bodyRRect);
    // Dim vertical lines
    [[8.5, 6.5, 8.5, 11], [10, 6.5, 10, 11], [11.5, 6.5, 11.5, 11]].forEach(([x1, y1, x2, y2]) => {
      iconPath2.moveTo(ox + x1 * s, oy + y1 * s);
      iconPath2.lineTo(ox + x2 * s, oy + y2 * s);
    });
    // Circle + dot
    iconPath3.addCircle(ox + 4.5 * s, oy + 9 * s, 2 * s);
    iconPath3.addCircle(ox + 4.5 * s, oy + 9 * s, 0.55 * s);
  } else {
    // Magnifying glass
    iconPath.addCircle(ox + 6 * s, oy + 6 * s, 4 * s);
    iconPath.moveTo(ox + 9.2 * s, oy + 9.2 * s);
    iconPath.lineTo(ox + 13 * s, oy + 13 * s);
    iconPath.moveTo(ox + 3.5 * s, oy + 6 * s);
    iconPath.lineTo(ox + 8.5 * s, oy + 6 * s);
  }

  // ── Needle paths ───────────────────────────────────────────────────────────
  const nTop = trapH, nBot = H - 1;
  const needleLayers: [number, number, number, number][] = [
    [16, 0.05, 18, 0.12],
    [8,  0.15, 12, 0.30],
    [3.5, 0.45, 8, 0.70],
  ];

  // ── Border rect ────────────────────────────────────────────────────────────
  const borderR = rect(0.5, 0.5, W - 1, H - 1);
  const borderGlowR = rect(1, 1, W - 2, H - 2);

  return (
    <>
      {/* Background */}
      <Rect x={0} y={0} width={W} height={H} color="#060605" />

      {/* Radial green glows — upper zone (3 layers from mockup) */}
      {([
        [W * 0.95, [[0, 0.10], [0.20, 0.06], [0.50, 0.02], [1, 0]]],
        [W * 0.58, [[0, 0.22], [0.25, 0.10], [0.55, 0.03], [1, 0]]],
        [W * 0.28, [[0, 0.38], [0.30, 0.16], [0.70, 0.04], [1, 0]]],
      ] as [number, [number, number][]][]).map(([r0, stops], ki) => (
        <Rect key={`gg${ki}`} x={0} y={0} width={W} height={H}>
          <RadialGradient
            c={vec(cx, trapH)} r={r0}
            colors={stops.map(([, a]) => G(a))}
            positions={stops.map(([p]) => p)}
          />
        </Rect>
      ))}

      {/* Radial red glows — lower needle zone (2 layers from mockup) */}
      {([
        [W * 0.70, [[0, 0.10], [0.25, 0.04], [0.60, 0.01], [1, 0]]],
        [W * 0.32, [[0, 0.28], [0.30, 0.10], [0.70, 0.02], [1, 0]]],
      ] as [number, [number, number][]][]).map(([r0, stops], ki) => (
        <Rect key={`rg${ki}`} x={0} y={trapH} width={W} height={H - trapH}>
          <RadialGradient
            c={vec(cx, nMidY)} r={r0}
            colors={stops.map(([, a]) => R(a))}
            positions={stops.map(([p]) => p)}
          />
        </Rect>
      ))}

      {/* Edge gradients (4 edges from mockup) */}
      <Rect x={0} y={0} width={Math.max(3, W * 0.09)} height={H}>
        <LinearGradient start={vec(0, 0)} end={vec(Math.max(3, W * 0.09), 0)} colors={[G(0.20), G(0)]} />
      </Rect>
      <Rect x={W - Math.max(3, W * 0.09)} y={0} width={Math.max(3, W * 0.09)} height={H}>
        <LinearGradient start={vec(W, 0)} end={vec(W - Math.max(3, W * 0.09), 0)} colors={[G(0.20), G(0)]} />
      </Rect>
      <Rect x={0} y={0} width={W} height={Math.max(2, H * 0.09)}>
        <LinearGradient start={vec(0, 0)} end={vec(0, Math.max(2, H * 0.09))} colors={[G(0.16), G(0)]} />
      </Rect>
      <Rect x={0} y={H - Math.max(2, H * 0.09)} width={W} height={Math.max(2, H * 0.09)}>
        <LinearGradient start={vec(0, H)} end={vec(0, H - Math.max(2, H * 0.09))} colors={[G(0.16), G(0)]} />
      </Rect>

      {/* Tick marks */}
      {ticks}

      {/* Trapezoid fill */}
      <Path path={trapPath} color="rgba(5,5,4,0.93)" />

      {/* Trapezoid edges — green glow */}
      <Path path={edgePath} color={G(0.60)} strokeWidth={0.9} style="stroke" />

      {/* Icon — bright lines */}
      <Path path={iconPath} color={G(0.90)} strokeWidth={1.3 / s} style="stroke"
            strokeCap="round" strokeJoin="round" />
      {isTune && (
        <>
          <Path path={iconPath2} color={G(0.28)} strokeWidth={1.0 / s} style="stroke" />
          <Path path={iconPath3} color={G(0.90)} strokeWidth={1.3 / s} style="stroke"
                strokeCap="round" strokeJoin="round" />
        </>
      )}

      {/* Needle — 3 glow layers + core (from mockup lines 1587–1594) */}
      {needleLayers.map(([lw, sc, , sg], i) => {
        const np = Skia.Path.Make();
        np.moveTo(cx, nTop); np.lineTo(cx, nBot);
        return (
          <Path key={`n${i}`} path={np}
                color={R(sc)}
                strokeWidth={W > 70 ? lw : lw * 0.7}
                style="stroke" />
        );
      })}
      <Path
        path={(() => { const p = Skia.Path.Make(); p.moveTo(cx, nTop); p.lineTo(cx, nBot); return p; })()}
        color="rgba(255,120,100,0.98)"
        strokeWidth={W > 70 ? 1.2 : 0.9}
        style="stroke"
      />

      {/* Border glow */}
      <Rect rect={borderGlowR} color={G(0.08)} strokeWidth={5} style="stroke" />
      <Rect rect={borderR} color={G(0.70)} strokeWidth={0.9} style="stroke" />
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DrumWheel({
  type, height = 60, onDelta, style,
}: DrumWheelProps) {
  const [size, setSize] = React.useState({ w: 0, h: height });
  const scroll   = useSharedValue(0);
  const velRef   = useRef(0);
  const accRef   = useRef(0);
  const lastXRef = useRef(0);
  const lastTRef = useRef(0);
  const animRef  = useRef<number | null>(null);
  const [scrollVal, setScrollVal] = React.useState(0);

  // Notify parent and update local draw state
  const commitSteps = useCallback((steps: number) => {
    const px = steps * PX_STEP;
    setScrollVal(v => ((v + px) % 10000 + 10000) % 10000);
    onDelta(px);
  }, [onDelta]);

  // Physics loop (runs on JS thread for simplicity, matches mockup animateDrum)
  const animate = useCallback(() => {
    velRef.current *= FRICTION;
    if (Math.abs(velRef.current) < 0.8) { velRef.current = 0; animRef.current = null; return; }
    accRef.current += velRef.current;
    const steps = Math.trunc(accRef.current / PX_STEP);
    if (steps) { accRef.current -= steps * PX_STEP; commitSteps(steps); }
    animRef.current = requestAnimationFrame(animate);
  }, [commitSteps]);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onBegin(e => {
      lastXRef.current = e.x;
      lastTRef.current = Date.now();
      velRef.current = 0; accRef.current = 0;
      if (animRef.current !== null) { cancelAnimationFrame(animRef.current); animRef.current = null; }
    })
    .onUpdate(e => {
      const now = Date.now();
      const dx  = e.x - lastXRef.current;
      const dt  = Math.max(1, now - lastTRef.current);
      velRef.current = Math.max(-MAX_VEL, Math.min(MAX_VEL, (dx / dt) * GRIP * 10));
      lastXRef.current = e.x;
      lastTRef.current = now;
      accRef.current += dx;
      const steps = Math.trunc(accRef.current / PX_STEP);
      if (steps) { accRef.current -= steps * PX_STEP; commitSteps(steps); }
    })
    .onEnd(() => {
      if (Math.abs(velRef.current) > 0.8) animRef.current = requestAnimationFrame(animate);
    });

  // ± label sizing (matches mockup line 1580)
  const pmFontSz = Math.max(8, Math.round(height * 0.30));
  const trapH    = Math.max(12, Math.round(height * 0.56));
  const pmTop    = trapH + (height - trapH) * 0.50 - pmFontSz / 2;

  return (
    <GestureDetector gesture={pan}>
      <View
        style={[s.wrap, { height }, style]}
        onLayout={e => setSize({ w: e.nativeEvent.layout.width, h: height })}
      >
        {size.w > 0 && (
          <Canvas style={StyleSheet.absoluteFill}>
            <DrumCanvas
              W={size.w} H={height}
              scrollVal={scrollVal}
              isTune={type === 'vfo'}
            />
          </Canvas>
        )}

        {/* ± labels — native Text, positioned absolute to match mockup's pmCY */}
        <View style={[s.pmRow, { top: pmTop }]} pointerEvents="none">
          <Text style={[s.pmLabel, { fontSize: pmFontSz }]}>−</Text>
          <Text style={[s.pmLabel, { fontSize: pmFontSz }]}>+</Text>
        </View>
      </View>
    </GestureDetector>
  );
}

const s = StyleSheet.create({
  wrap: {
    // matches .drum-wrap CSS: border-radius 6px, border var(--drum-border), box-shadow var(--drum-glow)
    borderRadius:  6,
    overflow:      'hidden',
    borderWidth:   1,
    borderColor:   'rgba(0,200,50,0.22)',
    // Glow: 0 0 8px 2px rgba(0,185,45,0.18)
    shadowColor:   '#00b92d',
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius:  6,
    elevation:     2,
  },
  pmRow: {
    position:         'absolute',
    left:             4,
    right:            4,
    flexDirection:    'row',
    justifyContent:   'space-between',
    alignItems:       'center',
  },
  pmLabel: {
    // matches ctx.font = `bold ${pmFontSz}px "Courier New",monospace` + color ledG(0.70)
    fontFamily:  'Courier New',
    fontWeight:  'bold',
    color:       'rgba(0,200,50,0.70)',
    lineHeight:  1.2,
  },
});
