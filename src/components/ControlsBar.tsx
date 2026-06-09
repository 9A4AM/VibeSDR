/**
 * ControlsBar — portrait + landscape layouts
 *
 * PORTRAIT (from VibeSDR_Mockup_SAVE.html):
 *   Row 1: signal bar (full width) — gradient fill + peak marker + freq/mode pill
 *   Row 2: [STEP] [CHAT] [MENU] [SHARE]  gap:8
 *   Row 3: [VFO drum flex:1] [Zoom drum flex:1]  gap:8
 *   Footer: clock left · rec timer right
 *
 * LANDSCAPE (from screenshot of old skin — Image 1):
 *   Single row: [VFO drum] [STEP] [sig bar + freq/mode] [CHAT|MENU|SHARE] [Zoom drum]
 *   Below left drum only: clock
 *
 * Theme: reads from ThemeContext so AMBER/WHITE button in menu takes effect instantly.
 */

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import {
  Canvas,
  LinearGradient,
  Path,
  Rect,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import DrumWheel from './DrumWheel';
import { useTheme } from '../contexts/ThemeContext';
import { STEPS, type SDRMode } from '../services/sdrTypes';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatHz(hz: number): string {
  return hz >= 1_000_000
    ? (hz / 1_000_000).toFixed(3)
    : (hz / 1_000).toFixed(3);
}
function freqUnit(hz: number): string {
  return hz >= 1_000_000 ? 'MHz' : 'kHz';
}
function formatStep(s: number): string {
  return s >= 1_000_000 ? s / 1_000_000 + 'M'
       : s >= 1_000     ? s / 1_000 + ' kHz'
       :                  s + ' Hz';
}

// ── Signal gradient (port of sigGradient() from mockup) ───────────────────────
function sigGradColors(sig: number): string[] {
  if (sig < 0.20) return ['#bb1100', '#ff4400'];
  if (sig < 0.58) return ['#bb1100', '#ff4400', '#ffaa00'];
  return ['#bb1100', '#ff4400', '#ffaa00', '#00dd44'];
}
function sigGradPos(sig: number): number[] {
  if (sig < 0.20) return [0, 1];
  if (sig < 0.58) return [0, 0.20 / sig, 1];
  return [0, 0.15, 0.45, 1];
}

// ── SNR text (port of snrToDisplay() from mockup) ─────────────────────────────
function snrToText(snrDb: number): string {
  const dbfs = (snrDb - 30) / 50 * 80 - 127;
  if (dbfs >= -73) { const ab = Math.round(dbfs + 73); return ab > 0 ? `S9+${ab}` : 'S9'; }
  if (dbfs >= -79)  return 'S8';
  if (dbfs >= -85)  return 'S7';
  if (dbfs >= -91)  return 'S6';
  if (dbfs >= -97)  return 'S5';
  if (dbfs >= -103) return 'S4';
  if (dbfs >= -109) return 'S3';
  if (dbfs >= -115) return 'S2';
  return 'S1';
}

// ── Clock (port of tick() from mockup) ───────────────────────────────────────
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const utc   = now.toUTCString().slice(17, 22);
  const local = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const tz    = now.toLocaleDateString([], { timeZoneName: 'short' }).split(', ')[1] || '';
  return `${utc} UTC  ·  ${local} ${tz}`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ControlsBarProps {
  frequency:     number;
  mode:          SDRMode;
  step:          number;
  connected:     boolean;
  signalLevel?:  number;
  peakLevel?:    number;
  snrDb?:        number;
  signalActive?: boolean;
  bottomInset:   number;
  onVfoDelta:    (px: number) => void;
  onBwDelta:     (px: number) => void;
  onMode:        (m: SDRMode) => void;
  onStep:        (s: number)  => void;
  onMenu:        () => void;
  onChat?:       () => void;
  onFreqTap?:    () => void;
  onModeTap?:    () => void;
  instanceHost?: string;
  isRecording?:  boolean;
  recSeconds?:   number;
  chatUnread?:   boolean;
}

// ── Signal bar canvas ─────────────────────────────────────────────────────────

function SignalCanvas({
  width, height, signal = 0, peak = 0,
}: { width: number; height: number; signal?: number; peak?: number }) {
  if (width < 4) return null;
  const fillW = width * Math.min(1, Math.max(0, signal));
  const peakX = width * Math.min(1, Math.max(0, peak));
  const colors = signal > 0.001 ? sigGradColors(signal) : [];
  const pos    = signal > 0.001 ? sigGradPos(signal)    : [];

  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Rect x={0} y={0} width={width} height={height} color="rgba(105,98,82,0.30)" />
      {fillW > 1 && colors.length > 0 && (
        <Rect x={0} y={0} width={fillW} height={height}>
          <LinearGradient start={vec(0,0)} end={vec(fillW,0)} colors={colors} positions={pos} />
        </Rect>
      )}
      {peakX > 2 && (
        <Rect x={peakX - 1} y={0} width={2} height={height} color="rgba(255,245,200,0.92)" />
      )}
    </Canvas>
  );
}

// ── Freq + mode pill ──────────────────────────────────────────────────────────

function FreqModePill({
  freqStr, unit, modeLabel, snrText, connected, signalActive,
  onFreqTap, onModeTap,
}: {
  freqStr: string; unit: string; modeLabel: string; snrText: string;
  connected: boolean; signalActive?: boolean;
  onFreqTap?: () => void; onModeTap?: () => void;
}) {
  const { theme: t } = useTheme();
  return (
    <View style={pill.row}>
      <View style={[pill.dot, connected ? pill.dotOn : pill.dotOff]} />
      <TouchableOpacity style={[pill.freqBox, { backgroundColor: t.pillBg }]}
                        onPress={onFreqTap} activeOpacity={0.80} hitSlop={8}>
        <Text style={[pill.freq, { color: t.freqColor, fontSize: t.freqSize, width: t.freqWidth,
                                    fontFamily: t.font,
                                    textShadowColor: t.freqGlowColor }]}
              numberOfLines={1} adjustsFontSizeToFit>
          {freqStr}
        </Text>
        <Text style={[pill.unit, { color: t.unitColor, fontFamily: t.font }]}>{unit}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[pill.modeBtn, { backgroundColor: t.pillBg }]}
                        onPress={onModeTap} activeOpacity={0.80} hitSlop={8}>
        <Text style={[pill.modeLbl, { color: t.modeColor, fontSize: t.modeSize,
                                       letterSpacing: t.modeLs, fontFamily: t.font }]}>
          {modeLabel}
        </Text>
        <Text style={[pill.snr, { color: t.snrColor, fontFamily: t.font,
                                   opacity: signalActive ? 0.90 : 0.45 }]}>
          {snrText}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const pill = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'stretch', justifyContent: 'center' },
  dot:     { width: 7, height: 7, borderRadius: 3.5, marginRight: 5, alignSelf: 'center' },
  dotOn:   { backgroundColor: '#00cc44' },
  dotOff:  { backgroundColor: '#333' },
  freqBox: {
    flexDirection: 'row', alignItems: 'flex-end',
    borderTopLeftRadius: 5, borderBottomLeftRadius: 5,
    paddingLeft: 13, paddingRight: 10, paddingVertical: 5, gap: 5,
  },
  freq: {
    letterSpacing: 1.5, textAlign: 'center',
    textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6,
  },
  unit: { fontSize: 11, letterSpacing: 1, alignSelf: 'flex-end', paddingBottom: 2, flexShrink: 0 },
  modeBtn: {
    borderTopRightRadius: 5, borderBottomRightRadius: 5,
    borderLeftWidth: 1, borderLeftColor: 'rgba(70,60,45,0.45)',
    paddingVertical: 6, paddingLeft: 13, paddingRight: 11,
    alignItems: 'center', justifyContent: 'center', gap: 2, flexShrink: 0,
  },
  modeLbl: { fontWeight: 'bold',
             textShadowColor: 'rgba(255,160,0,0.6)', textShadowOffset: { width:0,height:0 }, textShadowRadius: 5 },
  snr:     { fontSize: 9, width: 58, textAlign: 'center' },
});

// ── Icon buttons ──────────────────────────────────────────────────────────────

// Chat bubble SVG — from mockup line 1413
const CHAT_PATH = Skia.Path.MakeFromSVGString(
  'M3 4.5A1.5 1.5 0 0 1 4.5 3h11A1.5 1.5 0 0 1 17 4.5v8A1.5 1.5 0 0 1 15.5 14H7l-4 3V4.5Z'
)!;
// Share — from mockup line 1423
const SHARE_LINES = Skia.Path.MakeFromSVGString('M13.3 5L6.7 9M13.3 15L6.7 11')!;
const SHARE_C1    = Skia.Path.MakeFromSVGString('M15 4m-1.8 0a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0')!;
const SHARE_C2    = Skia.Path.MakeFromSVGString('M15 16m-1.8 0a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0')!;
const SHARE_C3    = Skia.Path.MakeFromSVGString('M5 10m-1.8 0a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0')!;

function IconBtn({
  onPress, borderColor, children,
}: { onPress?: () => void; borderColor: string; children: React.ReactNode }) {
  return (
    <TouchableOpacity
      style={[ib.btn, { borderColor }]}
      onPress={onPress} activeOpacity={0.75}
    >
      {children}
    </TouchableOpacity>
  );
}
const ib = StyleSheet.create({
  btn: {
    flex: 1, minHeight: 36, backgroundColor: 'rgba(20,10,0,0.75)',
    borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center',
  },
});

// ── PORTRAIT layout ───────────────────────────────────────────────────────────

function PortraitBar({
  freqStr, unit, modeLabel, snrText, connected, signalActive,
  signal, peak, stepLabel,
  onFreqTap, onModeTap, onStep, onChat, onMenu, onShare,
  onVfoDelta, onBwDelta,
  clock, isRecording, recTime, chatUnread,
}: any) {
  const { theme: t } = useTheme();
  const [sigW, setSigW] = useState(0);
  const DRUM_H = 60;
  const SIG_H  = 34;

  return (
    <View style={p.col}>
      {/* Row 1 — signal bar */}
      <View style={p.sigFrame} onLayout={e => setSigW(e.nativeEvent.layout.width)}>
        <SignalCanvas width={sigW} height={SIG_H} signal={signal} peak={peak} />
        <FreqModePill
          freqStr={freqStr} unit={unit} modeLabel={modeLabel} snrText={snrText}
          connected={connected} signalActive={signalActive}
          onFreqTap={onFreqTap} onModeTap={onModeTap}
        />
      </View>

      {/* Row 2 — buttons */}
      <View style={p.btnRow}>
        <TouchableOpacity style={[p.btn, { borderColor: t.btnBorder }]} onPress={onStep} activeOpacity={0.75}>
          <Text style={[p.btnTxt, { color: t.btnText, fontFamily: t.font, fontSize: t.btnSize }]}>{stepLabel}</Text>
        </TouchableOpacity>
        <IconBtn onPress={onChat} borderColor={chatUnread ? 'rgba(40,140,255,0.85)' : t.btnBorder}>
          <Canvas style={{ width: 20, height: 20 }}>
            <Path path={CHAT_PATH} color={t.btnText} strokeWidth={1.6} style="stroke" strokeCap="round" strokeJoin="round" />
          </Canvas>
        </IconBtn>
        <IconBtn onPress={onMenu} borderColor={isRecording ? 'rgba(220,40,40,0.90)' : t.btnBorder}>
          <View style={p.hamburger}>
            <View style={[p.hline, { backgroundColor: t.btnText }]} />
            <View style={[p.hline, { backgroundColor: t.btnText }]} />
            <View style={[p.hline, { backgroundColor: t.btnText }]} />
          </View>
        </IconBtn>
        <IconBtn onPress={onShare} borderColor={t.btnBorder}>
          <Canvas style={{ width: 20, height: 20 }}>
            <Path path={SHARE_LINES} color={t.btnText} strokeWidth={1.6} style="stroke" strokeCap="round" />
            <Path path={SHARE_C1}    color={t.btnText} strokeWidth={1.6} style="stroke" />
            <Path path={SHARE_C2}    color={t.btnText} strokeWidth={1.6} style="stroke" />
            <Path path={SHARE_C3}    color={t.btnText} strokeWidth={1.6} style="stroke" />
          </Canvas>
        </IconBtn>
      </View>

      {/* Row 3 — drums (50/50) */}
      <View style={p.drumRow}>
        <DrumWheel type="vfo"  height={DRUM_H} onDelta={onVfoDelta} style={p.drum} />
        <DrumWheel type="zoom" height={DRUM_H} onDelta={onBwDelta}  style={p.drum} />
      </View>

      {/* Footer — clock + rec timer */}
      <View style={p.clockRow}>
        <Text style={[p.clock, { color: t.clockColor, fontFamily: t.font }]}>{clock}</Text>
        {isRecording && (
          <View style={p.recRow}>
            <View style={p.recDot} />
            <Text style={[p.recTime, { fontFamily: t.font }]}>{recTime}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const p = StyleSheet.create({
  col:      { gap: 7 },
  sigFrame: { height: 34, borderRadius: 7, overflow: 'hidden',
              backgroundColor: 'rgba(105,98,82,0.30)', justifyContent: 'center' },
  btnRow:   { flexDirection: 'row', gap: 8 },
  btn:      { flex: 1, minHeight: 36, backgroundColor: 'rgba(20,10,0,0.75)',
              borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  btnTxt:   { letterSpacing: 0.5, textAlign: 'center' },
  hamburger:{ gap: 4 },
  hline:    { width: 16, height: 1.5, borderRadius: 1 },
  drumRow:  { flexDirection: 'row', gap: 8 },
  drum:     { flex: 1 },
  clockRow: { flexDirection: 'row', justifyContent: 'space-between',
              alignItems: 'center', marginTop: 4, paddingHorizontal: 2 },
  clock:    { fontSize: 8, letterSpacing: 1 },
  recRow:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  recDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: '#e05050' },
  recTime:  { fontSize: 8, letterSpacing: 1, color: '#e05050' },
});

// ── LANDSCAPE layout ──────────────────────────────────────────────────────────
// Reference: Image 1 screenshot of old skin
// Single row: [VFO drum] [STEP] [sig bar + freq/mode pill] [CHAT] [MENU] [SHARE] [Zoom drum]
// Clock below left drum only.

function LandscapeBar({
  freqStr, unit, modeLabel, snrText, connected, signalActive,
  signal, peak, stepLabel,
  onFreqTap, onModeTap, onStep, onChat, onMenu, onShare,
  onVfoDelta, onBwDelta,
  clock, isRecording, recTime, chatUnread,
}: any) {
  const { theme: t } = useTheme();
  const [sigW, setSigW] = useState(0);
  const DRUM_H = 68;  // slightly taller in landscape to fill the bar height
  const SIG_H  = 44;

  return (
    <View style={l.row}>
      {/* Left: VFO drum + clock below */}
      <View style={l.drumWrap}>
        <DrumWheel type="vfo" height={DRUM_H} onDelta={onVfoDelta} style={l.drum} />
        <Text style={[l.clock, { color: t.clockColor, fontFamily: t.font }]}>{clock}</Text>
        {isRecording && (
          <View style={l.recRow}>
            <View style={l.recDot} />
            <Text style={[l.recTime, { fontFamily: t.font }]}>{recTime}</Text>
          </View>
        )}
      </View>

      {/* Centre-left: STEP button (vertical, like old skin's 1kHz pill) */}
      <TouchableOpacity
        style={[l.stepBtn, { borderColor: t.btnBorder }]}
        onPress={onStep} activeOpacity={0.75}
      >
        <Text style={[l.stepTxt, { color: t.btnText, fontFamily: t.font }]}>{stepLabel}</Text>
      </TouchableOpacity>

      {/* Centre: signal bar + freq/mode pill (flex:1) */}
      <View style={l.centre} onLayout={e => setSigW(e.nativeEvent.layout.width)}>
        <View style={[l.sigFrame, { height: SIG_H }]}>
          <SignalCanvas width={sigW} height={SIG_H} signal={signal} peak={peak} />
          <FreqModePill
            freqStr={freqStr} unit={unit} modeLabel={modeLabel} snrText={snrText}
            connected={connected} signalActive={signalActive}
            onFreqTap={onFreqTap} onModeTap={onModeTap}
          />
        </View>
      </View>

      {/* Centre-right: CHAT | MENU | SHARE stacked */}
      <View style={l.iconCol}>
        <IconBtn onPress={onChat} borderColor={chatUnread ? 'rgba(40,140,255,0.85)' : t.btnBorder}>
          <Canvas style={{ width: 18, height: 18 }}>
            <Path path={CHAT_PATH} color={t.btnText} strokeWidth={1.6} style="stroke" strokeCap="round" strokeJoin="round" />
          </Canvas>
        </IconBtn>
        <IconBtn onPress={onMenu} borderColor={isRecording ? 'rgba(220,40,40,0.90)' : t.btnBorder}>
          <View style={p.hamburger}>
            <View style={[p.hline, { backgroundColor: t.btnText }]} />
            <View style={[p.hline, { backgroundColor: t.btnText }]} />
            <View style={[p.hline, { backgroundColor: t.btnText }]} />
          </View>
        </IconBtn>
        <IconBtn onPress={onShare} borderColor={t.btnBorder}>
          <Canvas style={{ width: 18, height: 18 }}>
            <Path path={SHARE_LINES} color={t.btnText} strokeWidth={1.6} style="stroke" strokeCap="round" />
            <Path path={SHARE_C1}    color={t.btnText} strokeWidth={1.6} style="stroke" />
            <Path path={SHARE_C2}    color={t.btnText} strokeWidth={1.6} style="stroke" />
            <Path path={SHARE_C3}    color={t.btnText} strokeWidth={1.6} style="stroke" />
          </Canvas>
        </IconBtn>
      </View>

      {/* Right: Zoom drum */}
      <View style={l.drumWrap}>
        <DrumWheel type="zoom" height={DRUM_H} onDelta={onBwDelta} style={l.drum} />
      </View>
    </View>
  );
}

const l = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  drumWrap: { width: 130, alignItems: 'stretch' },  // fixed width drums, like old skin
  drum:     { flex: 1 },
  clock:    { fontSize: 8, letterSpacing: 1, marginTop: 3, textAlign: 'center' },
  recRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, marginTop: 1 },
  recDot:   { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#e05050' },
  recTime:  { fontSize: 7, letterSpacing: 1, color: '#e05050' },
  stepBtn:  { width: 52, backgroundColor: 'rgba(20,10,0,0.75)', borderWidth: 1,
              borderRadius: 4, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  stepTxt:  { fontSize: 12, letterSpacing: 0.5, textAlign: 'center' },
  centre:   { flex: 1, justifyContent: 'center' },
  sigFrame: { borderRadius: 7, overflow: 'hidden',
              backgroundColor: 'rgba(105,98,82,0.30)', justifyContent: 'center' },
  iconCol:  { width: 48, gap: 4, justifyContent: 'center' },
});

// ── Root component ────────────────────────────────────────────────────────────

export default function ControlsBar({
  frequency, mode, step, connected, bottomInset,
  signalLevel, peakLevel, snrDb = 40, signalActive,
  onVfoDelta, onBwDelta, onMode, onStep,
  onMenu, onChat, onFreqTap, onModeTap,
  instanceHost = 'ubersdr',
  isRecording = false, recSeconds = 0, chatUnread = false,
}: ControlsBarProps) {
  const { theme: t } = useTheme();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const freqStr   = useMemo(() => formatHz(frequency),  [frequency]);
  const unit      = useMemo(() => freqUnit(frequency),   [frequency]);
  const stepLabel = useMemo(() => formatStep(step),      [step]);
  const snrText   = useMemo(() => snrToText(snrDb),      [snrDb]);
  const clock     = useClock();

  const cycleStep = useCallback(() => {
    const idx = STEPS.indexOf(step);
    onStep(STEPS[(idx + 1) % STEPS.length]);
  }, [step, onStep]);

  const handleShare = useCallback(async () => {
    await Share.share({
      message: `VibeSDR — ${freqStr} ${unit} ${mode.toUpperCase()} — ${instanceHost}`,
    });
  }, [freqStr, unit, mode, instanceHost]);

  const h  = Math.floor(recSeconds / 3600);
  const m  = Math.floor((recSeconds % 3600) / 60);
  const sc = recSeconds % 60;
  const recTime = `${h}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}`;

  const shared = {
    freqStr, unit, modeLabel: mode.toUpperCase(), snrText,
    connected, signalActive,
    signal: signalLevel, peak: peakLevel,
    stepLabel,
    onFreqTap, onModeTap,
    onStep: cycleStep, onChat, onMenu, onShare: handleShare,
    onVfoDelta, onBwDelta,
    clock, isRecording, recTime, chatUnread,
  };

  return (
    <View style={[
      r.bar,
      isLandscape ? r.barLandscape : r.barPortrait,
      { paddingBottom: Math.max(bottomInset, 10) },
    ]}>
      <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[r.border, isLandscape ? r.borderLandscape : r.borderPortrait]} pointerEvents="none" />

      {isLandscape
        ? <LandscapeBar {...shared} />
        : <PortraitBar  {...shared} />
      }
    </View>
  );
}

const r = StyleSheet.create({
  bar: {
    overflow: 'hidden',
    paddingTop: 8,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.85,
    shadowRadius: 12,
    elevation: 12,
  },
  barPortrait: {
    borderTopLeftRadius:  18,
    borderTopRightRadius: 18,
  },
  barLandscape: {
    borderTopLeftRadius:  14,
    borderTopRightRadius: 14,
    paddingTop: 10,
  },
  border: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1,
    borderColor: 'rgba(255,160,0,0.22)',
    borderBottomWidth: 0,
  },
  borderPortrait: {
    borderTopLeftRadius:  18,
    borderTopRightRadius: 18,
  },
  borderLandscape: {
    borderTopLeftRadius:  14,
    borderTopRightRadius: 14,
  },
});
