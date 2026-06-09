/**
 * ControlsBar — scales from 320dp (iPhone SE Display Zoom) to 430dp+
 *
 * PORTRAIT — 4 rows (locked, do not change):
 *   Row 1: signal bar + freq/mode pill
 *   Row 2: [STEP] [MENU] [CHAT] [SHARE]
 *   Row 3: [VFO drum flex:1] [Zoom drum flex:1]
 *   Row 4: clock · rec timer
 *
 * LANDSCAPE — single row:
 *   [VFO drum] [STEP/MENU col] [sig bar + pill flex:2] [CHAT/SHARE col] [Zoom drum]
 *
 * Scaling: useUiScale() — port of computeUiScale() from skin
 *   Portrait:  scale = clamp(0.75, W/390, 1.45)  → 320dp = 0.82
 *   Landscape: scale = clamp(0.58, W/926, 1.45)  → 568dp = 0.61
 */

import React, {
  useCallback, useEffect, useMemo, useState,
} from 'react';
import {
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
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
import { useUiScale } from '../hooks/useUiScale';
import { STEPS, type SDRMode } from '../services/sdrTypes';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatHz(hz: number): string {
  return hz >= 1_000_000 ? (hz / 1_000_000).toFixed(3) : (hz / 1_000).toFixed(3);
}
function freqUnit(hz: number): string {
  return hz >= 1_000_000 ? 'MHz' : 'kHz';
}
function formatStep(s: number): string {
  return s >= 1_000_000 ? s / 1_000_000 + 'M'
       : s >= 1_000     ? s / 1_000 + 'k'
       :                  s + 'Hz';
}

// ── Signal gradient — port of sigGradient() ──────────────────────────────────
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

// ── SNR text — port of snrToDisplay() ────────────────────────────────────────
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

// ── Clock — port of tick() ────────────────────────────────────────────────────
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

// ── SVG paths (from mockup HTML) ──────────────────────────────────────────────
const CHAT_PATH   = Skia.Path.MakeFromSVGString('M3 4.5A1.5 1.5 0 0 1 4.5 3h11A1.5 1.5 0 0 1 17 4.5v8A1.5 1.5 0 0 1 15.5 14H7l-4 3V4.5Z')!;
const SHARE_LINES = Skia.Path.MakeFromSVGString('M13.3 5L6.7 9M13.3 15L6.7 11')!;
const SHARE_C1    = Skia.Path.MakeFromSVGString('M15 4m-1.8 0a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0')!;
const SHARE_C2    = Skia.Path.MakeFromSVGString('M15 16m-1.8 0a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0')!;
const SHARE_C3    = Skia.Path.MakeFromSVGString('M5 10m-1.8 0a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0')!;

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

function SignalCanvas({ width, height, signal = 0, peak = 0 }:
  { width: number; height: number; signal?: number; peak?: number }) {
  if (width < 4) return null;
  const fillW  = width * Math.min(1, Math.max(0, signal));
  const peakX  = width * Math.min(1, Math.max(0, peak));
  const colors = signal > 0.001 ? sigGradColors(signal) : [];
  const pos    = signal > 0.001 ? sigGradPos(signal) : [];
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
// All sizes passed as props from parent so they scale with useUiScale()

function FreqModePill({ freqStr, unit, modeLabel, snrText, connected, signalActive,
  onFreqTap, onModeTap, freqFontSize, freqWidth, unitFontSize, modeFontSize,
  modeLs, snrWidth, pillPadH, pillPadV, modePadH, modePadV, gap,
}: any) {
  const { theme: t } = useTheme();
  return (
    <View style={pm.row}>
      <View style={[pm.dot, connected ? pm.dotOn : pm.dotOff]} />
      <TouchableOpacity
        style={[pm.freqBox, { backgroundColor: t.pillBg, paddingHorizontal: pillPadH, paddingVertical: pillPadV, gap }]}
        onPress={onFreqTap} activeOpacity={0.80} hitSlop={8}
      >
        <Text style={[pm.freq, {
          color: t.freqColor, fontSize: freqFontSize, width: freqWidth,
          fontFamily: t.font, textShadowColor: t.freqGlowColor,
        }]} numberOfLines={1} adjustsFontSizeToFit>
          {freqStr}
        </Text>
        <Text style={[pm.unit, { color: t.unitColor, fontFamily: t.font, fontSize: unitFontSize }]}>
          {unit}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[pm.modeBtn, { backgroundColor: t.pillBg, paddingHorizontal: modePadH, paddingVertical: modePadV }]}
        onPress={onModeTap} activeOpacity={0.80} hitSlop={8}
      >
        <Text style={[pm.modeLbl, { color: t.modeColor, fontSize: modeFontSize, letterSpacing: modeLs, fontFamily: t.font }]}>
          {modeLabel}
        </Text>
        <Text style={[pm.snr, { color: t.snrColor, fontFamily: t.font, width: snrWidth, opacity: signalActive ? 0.90 : 0.45 }]}>
          {snrText}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const pm = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'stretch', justifyContent: 'center' },
  dot:     { width: 7, height: 7, borderRadius: 3.5, marginRight: 5, alignSelf: 'center', flexShrink: 0 },
  dotOn:   { backgroundColor: '#00cc44' },
  dotOff:  { backgroundColor: '#333' },
  freqBox: { flexDirection: 'row', alignItems: 'flex-end', borderTopLeftRadius: 5, borderBottomLeftRadius: 5 },
  freq:    { letterSpacing: 1.5, textAlign: 'center', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6 },
  unit:    { letterSpacing: 1, alignSelf: 'flex-end', paddingBottom: 2, flexShrink: 0 },
  modeBtn: { borderTopRightRadius: 5, borderBottomRightRadius: 5,
             borderLeftWidth: 1, borderLeftColor: 'rgba(70,60,45,0.45)',
             alignItems: 'center', justifyContent: 'center', gap: 2, flexShrink: 0 },
  modeLbl: { fontWeight: 'bold', textShadowColor: 'rgba(255,160,0,0.6)',
             textShadowOffset: { width:0,height:0 }, textShadowRadius: 5 },
  snr:     { fontSize: 9, textAlign: 'center' },
});

// ── Hamburger icon ────────────────────────────────────────────────────────────

function Hamburger({ color, lineW }: { color: string; lineW: number }) {
  return (
    <View style={{ gap: 3 }}>
      <View style={{ width: lineW, height: 1.5, borderRadius: 1, backgroundColor: color }} />
      <View style={{ width: lineW, height: 1.5, borderRadius: 1, backgroundColor: color }} />
      <View style={{ width: lineW, height: 1.5, borderRadius: 1, backgroundColor: color }} />
    </View>
  );
}

// ── Share icon canvas ─────────────────────────────────────────────────────────

function ShareIcon({ size, color }: { size: number; color: string }) {
  return (
    <Canvas style={{ width: size, height: size }}>
      <Path path={SHARE_LINES} color={color} strokeWidth={1.6} style="stroke" strokeCap="round" />
      <Path path={SHARE_C1}    color={color} strokeWidth={1.6} style="stroke" />
      <Path path={SHARE_C2}    color={color} strokeWidth={1.6} style="stroke" />
      <Path path={SHARE_C3}    color={color} strokeWidth={1.6} style="stroke" />
    </Canvas>
  );
}

// ── PORTRAIT ──────────────────────────────────────────────────────────────────

function PortraitBar({ freqStr, unit, modeLabel, snrText, connected, signalActive,
  signal, peak, stepLabel, onFreqTap, onModeTap, onStep, onChat, onMenu, onShare,
  onVfoDelta, onBwDelta, clock, isRecording, recTime, chatUnread }: any) {

  const { theme: t } = useTheme();
  const s = useUiScale();
  const [sigW, setSigW] = useState(0);

  // All dp values go through s.r() — port of applyUiScale()'s r() function
  const SIG_H      = s.r(34);
  const DRUM_H     = s.r(60);
  const ROW_GAP    = s.r(7);
  const COL_GAP    = s.r(8);
  const BAR_PAD_H  = s.r(12);
  const BTN_H      = s.r(36);
  const ICON_SZ    = s.r(20);
  const HBURG_W    = s.r(16);
  // Freq pill sizing — from skin line 4315: font-size r(17), width r(110) at small; r(26)/r(148) at normal
  // We use the same formula: base values scaled
  const FREQ_FONT  = s.r(26);
  const FREQ_W     = s.r(148);
  const UNIT_FONT  = s.r(11);
  const MODE_FONT  = s.r(14);
  const MODE_LS    = s.f(1.5);
  const SNR_W      = s.r(58);
  const PILL_PAD_H = s.r(10);
  const PILL_PAD_V = s.r(5);
  const MODE_PAD_H = s.r(11);
  const MODE_PAD_V = s.r(6);
  const PILL_GAP   = s.r(5);
  const BTN_FONT   = s.f(t.btnSize);
  const CLOCK_FONT = s.f(8);

  return (
    <View style={{ gap: ROW_GAP }}>

      {/* Row 1 — signal bar */}
      <View style={[por.sigFrame, { height: SIG_H }]}
            onLayout={e => setSigW(e.nativeEvent.layout.width)}>
        <SignalCanvas width={sigW} height={SIG_H} signal={signal} peak={peak} />
        <FreqModePill
          freqStr={freqStr} unit={unit} modeLabel={modeLabel} snrText={snrText}
          connected={connected} signalActive={signalActive}
          onFreqTap={onFreqTap} onModeTap={onModeTap}
          freqFontSize={FREQ_FONT} freqWidth={FREQ_W} unitFontSize={UNIT_FONT}
          modeFontSize={MODE_FONT} modeLs={MODE_LS} snrWidth={SNR_W}
          pillPadH={PILL_PAD_H} pillPadV={PILL_PAD_V}
          modePadH={MODE_PAD_H} modePadV={MODE_PAD_V} gap={PILL_GAP}
        />
      </View>

      {/* Row 2 — 4 equal buttons */}
      <View style={{ flexDirection: 'row', gap: COL_GAP }}>

        {/* STEP */}
        <TouchableOpacity
          style={[por.btn, { minHeight: BTN_H, borderColor: t.btnBorder }]}
          onPress={onStep} activeOpacity={0.75}
        >
          <Text style={[por.btnTxt, { color: t.btnText, fontFamily: t.font, fontSize: BTN_FONT }]}>
            {stepLabel}
          </Text>
        </TouchableOpacity>

        {/* MENU */}
        <TouchableOpacity
          style={[por.btn, { minHeight: BTN_H, borderColor: isRecording ? 'rgba(220,40,40,0.90)' : t.btnBorder }]}
          onPress={onMenu} activeOpacity={0.75}
        >
          <Hamburger color={t.btnText} lineW={HBURG_W} />
        </TouchableOpacity>

        {/* CHAT */}
        <TouchableOpacity
          style={[por.btn, { minHeight: BTN_H, borderColor: chatUnread ? 'rgba(40,140,255,0.85)' : t.btnBorder }]}
          onPress={onChat} activeOpacity={0.75}
        >
          <Canvas style={{ width: ICON_SZ, height: ICON_SZ }}>
            <Path path={CHAT_PATH} color={t.btnText} strokeWidth={1.6} style="stroke" strokeCap="round" strokeJoin="round" />
          </Canvas>
        </TouchableOpacity>

        {/* SHARE */}
        <TouchableOpacity
          style={[por.btn, { minHeight: BTN_H, borderColor: t.btnBorder }]}
          onPress={onShare} activeOpacity={0.75}
        >
          <ShareIcon size={ICON_SZ} color={t.btnText} />
        </TouchableOpacity>

      </View>

      {/* Row 3 — drums 50/50 */}
      <View style={{ flexDirection: 'row', gap: COL_GAP }}>
        <DrumWheel type="vfo"  height={DRUM_H} onDelta={onVfoDelta} style={{ flex: 1 }} />
        <DrumWheel type="zoom" height={DRUM_H} onDelta={onBwDelta}  style={{ flex: 1 }} />
      </View>

      {/* Row 4 — clock + rec */}
      <View style={por.clockRow}>
        <Text style={[por.clock, { color: t.clockColor, fontFamily: t.font, fontSize: CLOCK_FONT }]}>
          {clock}
        </Text>
        {isRecording && (
          <View style={por.recRow}>
            <View style={por.recDot} />
            <Text style={[por.recTime, { fontFamily: t.font, fontSize: CLOCK_FONT }]}>{recTime}</Text>
          </View>
        )}
      </View>

    </View>
  );
}

const por = StyleSheet.create({
  sigFrame: { borderRadius: 7, overflow: 'hidden', backgroundColor: 'rgba(105,98,82,0.30)', justifyContent: 'center' },
  btn:      { flex: 1, backgroundColor: 'rgba(20,10,0,0.75)', borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  btnTxt:   { letterSpacing: 0.5, textAlign: 'center' },
  clockRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2 },
  clock:    { letterSpacing: 1 },
  recRow:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  recDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: '#e05050' },
  recTime:  { letterSpacing: 1, color: '#e05050' },
});

// ── LANDSCAPE ─────────────────────────────────────────────────────────────────

function LandscapeBar({ freqStr, unit, modeLabel, snrText, connected, signalActive,
  signal, peak, stepLabel, onFreqTap, onModeTap, onStep, onChat, onMenu, onShare,
  onVfoDelta, onBwDelta, clock, isRecording, recTime, chatUnread }: any) {

  const { theme: t } = useTheme();
  const s = useUiScale();
  const [sigW, setSigW] = useState(0);

  const DRUM_H    = s.r(44);   // landscape drum height from skin BASE_LSV_DH=44
  const SIG_H     = s.r(48);
  const GAP       = s.r(6);
  const BTN_W     = s.r(56);
  const FREQ_FONT = s.r(16);   // from skin line 4359: r(16) in landscape
  const FREQ_W    = s.r(110);  // from skin line 4359: r(110) in landscape
  const UNIT_FONT = s.r(8);
  const MODE_FONT = s.r(11);
  const MODE_LS   = s.f(1.0);
  const SNR_W     = s.r(52);
  const PILL_PAD_H = s.r(5);
  const PILL_PAD_V = s.r(3);
  const MODE_PAD_H = s.r(7);
  const MODE_PAD_V = s.r(4);
  const PILL_GAP  = s.r(4);
  const ICON_SZ   = s.r(18);
  const HBURG_W   = s.r(14);
  const CLOCK_FONT = s.f(7);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: GAP }}>

      {/* VFO drum + clock */}
      <View style={{ flex: 1, minWidth: s.r(80), maxWidth: s.r(160) }}>
        <DrumWheel type="vfo" height={DRUM_H} onDelta={onVfoDelta} style={{ flex: 1 }} />
        <Text style={[lnd.clock, { color: t.clockColor, fontFamily: t.font, fontSize: CLOCK_FONT }]}>
          {clock}
        </Text>
        {isRecording && (
          <View style={lnd.recRow}>
            <View style={lnd.recDot} />
            <Text style={[lnd.recTime, { fontFamily: t.font, fontSize: CLOCK_FONT }]}>{recTime}</Text>
          </View>
        )}
      </View>

      {/* STEP + MENU column */}
      <View style={{ width: BTN_W, gap: GAP }}>
        <TouchableOpacity style={[lnd.lsBtn, { borderColor: t.btnBorder }]} onPress={onStep} activeOpacity={0.75}>
          <Text style={[lnd.lsTxt, { color: t.btnText, fontFamily: t.font, fontSize: s.f(11) }]}
                numberOfLines={2} adjustsFontSizeToFit>
            {stepLabel}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[lnd.lsBtn, { borderColor: isRecording ? 'rgba(220,40,40,0.90)' : t.btnBorder }]}
          onPress={onMenu} activeOpacity={0.75}
        >
          <Hamburger color={t.btnText} lineW={HBURG_W} />
        </TouchableOpacity>
      </View>

      {/* Signal bar + pill (flex:2) */}
      <View style={{ flex: 2, justifyContent: 'center' }}
            onLayout={e => setSigW(e.nativeEvent.layout.width)}>
        <View style={[lnd.sigFrame, { height: SIG_H }]}>
          <SignalCanvas width={sigW} height={SIG_H} signal={signal} peak={peak} />
          <FreqModePill
            freqStr={freqStr} unit={unit} modeLabel={modeLabel} snrText={snrText}
            connected={connected} signalActive={signalActive}
            onFreqTap={onFreqTap} onModeTap={onModeTap}
            freqFontSize={FREQ_FONT} freqWidth={FREQ_W} unitFontSize={UNIT_FONT}
            modeFontSize={MODE_FONT} modeLs={MODE_LS} snrWidth={SNR_W}
            pillPadH={PILL_PAD_H} pillPadV={PILL_PAD_V}
            modePadH={MODE_PAD_H} modePadV={MODE_PAD_V} gap={PILL_GAP}
          />
        </View>
      </View>

      {/* CHAT + SHARE column */}
      <View style={{ width: BTN_W, gap: GAP }}>
        <TouchableOpacity
          style={[lnd.lsBtn, { borderColor: chatUnread ? 'rgba(40,140,255,0.85)' : t.btnBorder }]}
          onPress={onChat} activeOpacity={0.75}
        >
          <Canvas style={{ width: ICON_SZ, height: ICON_SZ }}>
            <Path path={CHAT_PATH} color={t.btnText} strokeWidth={1.6} style="stroke" strokeCap="round" strokeJoin="round" />
          </Canvas>
        </TouchableOpacity>
        <TouchableOpacity style={[lnd.lsBtn, { borderColor: t.btnBorder }]} onPress={onShare} activeOpacity={0.75}>
          <ShareIcon size={ICON_SZ} color={t.btnText} />
        </TouchableOpacity>
      </View>

      {/* Zoom drum */}
      <View style={{ flex: 1, minWidth: s.r(80), maxWidth: s.r(160) }}>
        <DrumWheel type="zoom" height={DRUM_H} onDelta={onBwDelta} style={{ flex: 1 }} />
      </View>

    </View>
  );
}

const lnd = StyleSheet.create({
  sigFrame: { borderRadius: 7, overflow: 'hidden', backgroundColor: 'rgba(105,98,82,0.30)', justifyContent: 'center', alignSelf: 'stretch' },
  lsBtn:    { flex: 1, backgroundColor: 'rgba(20,10,0,0.75)', borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  lsTxt:    { letterSpacing: 0.5, textAlign: 'center', lineHeight: 14 },
  clock:    { letterSpacing: 1, marginTop: 3, textAlign: 'center' },
  recRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, marginTop: 1 },
  recDot:   { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#e05050' },
  recTime:  { letterSpacing: 1, color: '#e05050' },
});

// ── Root ──────────────────────────────────────────────────────────────────────

export default function ControlsBar({
  frequency, mode, step, connected, bottomInset,
  signalLevel, peakLevel, snrDb = 40, signalActive,
  onVfoDelta, onBwDelta, onMode, onStep,
  onMenu, onChat, onFreqTap, onModeTap,
  instanceHost = 'ubersdr',
  isRecording = false, recSeconds = 0, chatUnread = false,
}: ControlsBarProps) {
  const { theme: t } = useTheme();
  const s = useUiScale();

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
    await Share.share({ message: `VibeSDR — ${freqStr} ${unit} ${mode.toUpperCase()} — ${instanceHost}` });
  }, [freqStr, unit, mode, instanceHost]);

  const hh = Math.floor(recSeconds / 3600);
  const mm = Math.floor((recSeconds % 3600) / 60);
  const ss = recSeconds % 60;
  const recTime = `${hh}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;

  // Bar padding scales with screen
  const PAD_H   = s.r(12);
  const PAD_TOP = s.r(8);
  const RADIUS  = s.r(18);

  const shared = {
    freqStr, unit, modeLabel: mode.toUpperCase(), snrText,
    connected, signalActive,
    signal: signalLevel, peak: peakLevel,
    stepLabel, onFreqTap, onModeTap,
    onStep: cycleStep, onChat, onMenu, onShare: handleShare,
    onVfoDelta, onBwDelta,
    clock, isRecording, recTime, chatUnread,
  };

  return (
    <View style={[
      root.bar,
      {
        paddingTop: PAD_TOP,
        paddingHorizontal: PAD_H,
        paddingBottom: Math.max(bottomInset, s.r(10)),
        borderTopLeftRadius: RADIUS,
        borderTopRightRadius: RADIUS,
      },
    ]}>
      <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[root.border, { borderTopLeftRadius: RADIUS, borderTopRightRadius: RADIUS,
                                    borderColor: t.barBorder }]}
            pointerEvents="none" />
      {s.isLandscape
        ? <LandscapeBar {...shared} />
        : <PortraitBar  {...shared} />
      }
    </View>
  );
}

const root = StyleSheet.create({
  bar: {
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.85,
    shadowRadius: 12,
    elevation: 12,
  },
  border: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
});
