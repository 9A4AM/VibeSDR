/**
 * MenuSheet — slide-up panel matching VibeSDR_Mockup_SAVE.html exactly.
 *
 * Sections (in order):
 *   Nearby Station · Spectrum/Waterfall · Audio · Server Maps
 *   Client Decoders · Server Extensions · Controls · Instance
 *   Reconnect · Reset Interface Settings
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Slider from '@react-native-community/slider';
import { COLORMAP_NAMES } from '../assets/colormapUtils';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MenuSheetProps {
  visible:     boolean;
  serverName:  string;
  serverUrl:   string;

  colormap:    string;
  dbMin:       number;
  dbMax:       number;
  onColormap:  (n: string) => void;
  onDbMin:     (v: number) => void;
  onDbMax:     (v: number) => void;

  filterLow:   number;
  filterHigh:  number;
  agc:         boolean;
  onFilterLow:  (v: number) => void;
  onFilterHigh: (v: number) => void;
  onAgc:        (on: boolean) => void;
  nr?:          boolean;
  onNr?:        (on: boolean) => void;
  nb?:          boolean;
  onNb?:        (on: boolean) => void;
  recording?:   boolean;
  onRec?:       () => void;
  recSeconds?:  number;

  signalMode?:     'snr' | 'smeter' | 'dbfs';
  onSignalMode?:   (m: 'snr' | 'smeter' | 'dbfs') => void;
  displayStyle?:   'amber' | 'white';
  onDisplayStyle?: (s: 'amber' | 'white') => void;
  drumMode?:       'normal' | 'precise';
  onDrumMode?:     (m: 'normal' | 'precise') => void;
  hapticsEnabled?: boolean;
  onHaptics?:      (on: boolean) => void;

  vtsName?:    string;
  vtsFreq?:    number;
  onVtsNext?:  () => void;
  onVtsPrev?:  () => void;

  onClose:          () => void;
  onBack?:          () => void;
  onReconnect?:     () => void;
  onResetSettings?: () => void;
  onDisplaySettings?: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const C = {
  bg:           '#0c0b09',
  border:       'rgba(255,160,0,0.35)',
  gold:         '#FFB833',
  goldDim:      '#c8893a',
  muted:        'rgba(255,184,51,0.40)',
  btnBg:        'rgba(20,10,0,0.80)',
  active:       'rgba(255,140,0,0.22)',
  danger:       'rgba(160,30,30,0.80)',
  dangerBorder: 'rgba(220,60,60,0.60)',
  text:         '#FFB833',
  sectionC:     'rgba(255,160,0,0.50)',
};

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_H = Math.min(SCREEN_H * 0.88, 700);

type DecoderKey = 'rtty' | 'navtex' | 'wefax' | 'sstv' | 'morse' | 'digspots' | 'cwspots' | 'whisper' | null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtHz(hz: number) {
  return hz >= 1000 ? (hz / 1000).toFixed(1) + ' kHz' : hz + ' Hz';
}

function fmtRecTime(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function StepSlider({
  value, min, max, step, format, onChange,
}: {
  value: number; min: number; max: number; step: number;
  format: (v: number) => string; onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <View style={styles.stepSlider}>
      <TouchableOpacity style={styles.stepSliderBtn} hitSlop={8}
        onPress={() => onChange(clamp(value - step))}>
        <Text style={styles.stepSliderBtnTxt}>−</Text>
      </TouchableOpacity>
      <Text style={styles.stepSliderVal}>{format(value)}</Text>
      <TouchableOpacity style={styles.stepSliderBtn} hitSlop={8}
        onPress={() => onChange(clamp(value + step))}>
        <Text style={styles.stepSliderBtnTxt}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionLabel({ label, first }: { label: string; first?: boolean }) {
  return (
    <View style={[styles.sectionBar, first && styles.sectionBarFirst]}>
      <Text style={styles.sectionLabel}>{label}</Text>
    </View>
  );
}

function BtnRow({ children, col }: { children: React.ReactNode; col?: boolean }) {
  return <View style={[styles.btnRow, col && styles.btnRowCol]}>{children}</View>;
}

function Btn({ label, active, danger, onPress, full }: {
  label: string; active?: boolean; danger?: boolean;
  onPress?: () => void; full?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.btn, active && styles.btnActive, danger && styles.btnDanger, full && styles.btnFull]}
      onPress={onPress} hitSlop={4} activeOpacity={0.7}
    >
      <Text style={[styles.btnText, active && styles.btnTextActive, danger && styles.btnTextDanger]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SubLabel({ label, small }: { label: string; small?: boolean }) {
  return <Text style={[styles.subLabel, small && styles.subLabelSmall]}>{label}</Text>;
}

function OptRow({ children }: { children: React.ReactNode }) {
  return <View style={[styles.btnRow, styles.optRow]}>{children}</View>;
}

function SegBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.btn, active && styles.btnActive]} onPress={onPress} hitSlop={4} activeOpacity={0.7}>
      <Text style={[styles.btnText, active && styles.btnTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Decoder panels ────────────────────────────────────────────────────────────

function RTTYPanel() {
  const [preset, setPreset] = useState('HAM');
  const [shift,  setShift]  = useState('170');
  const [baud,   setBaud]   = useState('45.45');
  const [frame,  setFrame]  = useState('5N1.5');
  const [enc,    setEnc]    = useState('ITA2');
  const [inv,    setInv]    = useState(false);
  const seg = (opts: string[], cur: string, set: (v: string) => void) => (
    <OptRow>{opts.map(o => <SegBtn key={o} label={o} active={cur===o} onPress={() => set(o)} />)}</OptRow>
  );
  return (
    <>
      <SubLabel label="Preset" />
      {seg(['HAM','WX','NAVTEX','SITOR-B'], preset, setPreset)}
      <SubLabel label="Shift (Hz)" />
      {seg(['170','200','425','450','850'], shift, setShift)}
      <SubLabel label="Baud Rate" />
      {seg(['45.45','50','75','100','300'], baud, setBaud)}
      <SubLabel label="Framing" />
      {seg(['5N1','5N1.5','5N2','7N1','8N1','4/7'], frame, setFrame)}
      <SubLabel label="Encoding" />
      {seg(['ITA2','ASCII','CCIR476'], enc, setEnc)}
      <OptRow><Btn label={inv ? 'INVERT: ON' : 'INVERT: OFF'} active={inv} onPress={() => setInv(p => !p)} /></OptRow>
    </>
  );
}

function NAVTEXPanel() {
  const [qt,     setQt]     = useState('518 kHz');
  const [shift,  setShift]  = useState('170');
  const [baud,   setBaud]   = useState('100');
  const [center, setCenter] = useState(500);
  const [inv,    setInv]    = useState(false);
  return (
    <>
      <SubLabel label="Quick Tune" />
      <OptRow>{['518 kHz','490 kHz','4.210 MHz'].map(o => <SegBtn key={o} label={o} active={qt===o} onPress={() => setQt(o)} />)}</OptRow>
      <SubLabel label="Center (Hz)" />
      <View style={styles.sliderWrap}>
        <Slider style={{flex:1}} minimumValue={100} maximumValue={3000} step={10} value={center}
          onValueChange={setCenter} minimumTrackTintColor={C.gold} maximumTrackTintColor={C.muted} thumbTintColor={C.gold} />
        <Text style={styles.sliderVal}>{center} Hz</Text>
      </View>
      <SubLabel label="Shift (Hz)" />
      <OptRow>{['170','200','425'].map(o => <SegBtn key={o} label={o} active={shift===o} onPress={() => setShift(o)} />)}</OptRow>
      <SubLabel label="Baud" />
      <OptRow>{['100','50'].map(o => <SegBtn key={o} label={o} active={baud===o} onPress={() => setBaud(o)} />)}</OptRow>
      <OptRow><Btn label={inv ? 'INVERT: ON' : 'INVERT: OFF'} active={inv} onPress={() => setInv(p => !p)} /></OptRow>
    </>
  );
}

function WEFAXPanel() {
  const [qt,        setQt]        = useState<string|null>(null);
  const [lpm,       setLpm]       = useState('120');
  const [bw,        setBw]        = useState('MIDDLE');
  const [phasing,   setPhasing]   = useState(true);
  const [autoStop,  setAutoStop]  = useState(true);
  const [autoStart, setAutoStart] = useState(true);
  return (
    <>
      <SubLabel label="Quick Tune" />
      <OptRow>{['DDH47 DE','GYA UK','NMG US','JMH JP'].map(o => <SegBtn key={o} label={o} active={qt===o} onPress={() => setQt(o)} />)}</OptRow>
      <SubLabel label="LPM" />
      <OptRow>{['60','90','120','240'].map(o => <SegBtn key={o} label={o} active={lpm===o} onPress={() => setLpm(o)} />)}</OptRow>
      <SubLabel label="Bandwidth" />
      <OptRow>{['NARROW','MIDDLE','WIDE'].map(o => <SegBtn key={o} label={o} active={bw===o} onPress={() => setBw(o)} />)}</OptRow>
      <OptRow>
        <Btn label="USE PHASING" active={phasing}   onPress={() => setPhasing(p => !p)} />
        <Btn label="AUTO-STOP"   active={autoStop}  onPress={() => setAutoStop(p => !p)} />
        <Btn label="AUTO-START"  active={autoStart} onPress={() => setAutoStart(p => !p)} />
      </OptRow>
    </>
  );
}

function SSTVPanel() {
  const QT = ['14.230 MHz','14.233 MHz','21.340 MHz','28.680 MHz'];
  const [qt,       setQt]       = useState<string|null>(null);
  const [autoSave, setAutoSave] = useState(false);
  return (
    <>
      <SubLabel label="Quick Tune" />
      <OptRow>{QT.map(o => <SegBtn key={o} label={o} active={qt===o} onPress={() => setQt(o)} />)}</OptRow>
      <OptRow><Btn label="AUTO-SAVE" active={autoSave} onPress={() => setAutoSave(p => !p)} /></OptRow>
      <SubLabel label="Mode auto-detected from VIS code · 47 modes supported" small />
    </>
  );
}

function MORSEPanel() {
  const [qual,  setQual]  = useState('ALL');
  const [pitch, setPitch] = useState(0);
  return (
    <>
      <SubLabel label="Min Quality" />
      <OptRow>{['ALL','LOW+','MED+','HIGH'].map(o => <SegBtn key={o} label={o} active={qual===o} onPress={() => setQual(o)} />)}</OptRow>
      <SubLabel label="Pitch Lock (Hz)" />
      <View style={styles.sliderWrap}>
        <Slider style={{flex:1}} minimumValue={0} maximumValue={2000} step={10} value={pitch}
          onValueChange={setPitch} minimumTrackTintColor={C.gold} maximumTrackTintColor={C.muted} thumbTintColor={C.gold} />
        <Text style={styles.sliderVal}>{pitch === 0 ? 'AUTO' : pitch + ' Hz'}</Text>
      </View>
      <SubLabel label="Speed auto-detected · shown live in decoder panel" small />
    </>
  );
}

function WhisperPanel() {
  const [lang,  setLang]  = useState('AUTO');
  const [lines, setLines] = useState('50');
  const [ts,    setTs]    = useState(false);
  return (
    <>
      <SubLabel label="Language" />
      <OptRow>{['AUTO','EN','DE','FR','ES','IT'].map(o => <SegBtn key={o} label={o} active={lang===o} onPress={() => setLang(o)} />)}</OptRow>
      <SubLabel label="Line Limit" />
      <OptRow>{['10','20','50','100','∞'].map(o => <SegBtn key={o} label={o} active={lines===o} onPress={() => setLines(o)} />)}</OptRow>
      <OptRow><Btn label="TIMESTAMPS" active={ts} onPress={() => setTs(p => !p)} /></OptRow>
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function MenuSheet({
  visible, serverName, serverUrl,
  colormap, dbMin, dbMax, onColormap, onDbMin, onDbMax,
  filterLow, filterHigh, agc, onFilterLow, onFilterHigh, onAgc,
  nr = false, onNr, nb = false, onNb, recording = false, onRec, recSeconds = 0,
  signalMode = 'snr', onSignalMode,
  displayStyle = 'amber', onDisplayStyle,
  drumMode = 'normal', onDrumMode,
  hapticsEnabled = false, onHaptics,
  vtsName = '', vtsFreq,
  onVtsNext, onVtsPrev,
  onClose, onBack, onReconnect, onResetSettings, onDisplaySettings,
}: MenuSheetProps) {

  const translateY = useRef(new Animated.Value(SHEET_H)).current;
  const backdropOp = useRef(new Animated.Value(0)).current;
  const [dispSettingsOpen, setDispSettingsOpen] = useState(false);
  const [activeDecoder,    setActiveDecoder]    = useState<DecoderKey>(null);

  const filterBw   = filterHigh - filterLow;
  const setFilterBw = useCallback((bw: number) => {
    const half = bw / 2;
    onFilterLow(-half);
    onFilterHigh(half);
  }, [onFilterLow, onFilterHigh]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(backdropOp, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, damping: 22, stiffness: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropOp, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: SHEET_H, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, backdropOp, translateY]);

  if (!visible) return null;

  const toggleDecoder = (key: DecoderKey) =>
    setActiveDecoder(prev => prev === key ? null : key);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOp }]} />
        </TouchableWithoutFeedback>

        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.handle} />

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}>

            {/* ── NEARBY STATION ─────────────────────────────────── */}
            <SectionLabel label="NEARBY STATION" first />
            <View style={styles.vtsRow}>
              <TouchableOpacity style={styles.vtsArrow} onPress={onVtsPrev} hitSlop={8}>
                <Text style={styles.vtsArrowText}>◂</Text>
              </TouchableOpacity>
              <View style={styles.vtsInfo}>
                <Text style={styles.vtsName} numberOfLines={1}>{vtsName || '—'}</Text>
                {vtsFreq != null && (
                  <Text style={styles.vtsFreq}>{(vtsFreq / 1_000_000).toFixed(3)} MHz</Text>
                )}
              </View>
              <TouchableOpacity style={styles.vtsArrow} onPress={onVtsNext} hitSlop={8}>
                <Text style={styles.vtsArrowText}>▸</Text>
              </TouchableOpacity>
            </View>

            {/* ── SPECTRUM / WATERFALL ───────────────────────────── */}
            <SectionLabel label="SPECTRUM / WATERFALL" />
            <BtnRow>
              <Btn label="− ZOOM" onPress={() => {}} />
              <Btn label="+ ZOOM" onPress={() => {}} />
              <Btn label="MIN"    onPress={() => {}} />
              <Btn label="MAX"    onPress={() => {}} />
            </BtnRow>
            <BtnRow>
              <Btn label="☀ DISPLAY SETTINGS" full active={dispSettingsOpen}
                onPress={() => onDisplaySettings ? onDisplaySettings() : setDispSettingsOpen(p => !p)} />
            </BtnRow>
            {dispSettingsOpen && (
              <View style={styles.subPanel}>
                <SubLabel label="Colormap" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.cmapStrip}>
                  {COLORMAP_NAMES.map(name => (
                    <TouchableOpacity key={name}
                      style={[styles.cmapPill, name === colormap && styles.cmapPillActive]}
                      onPress={() => onColormap(name)} hitSlop={4}>
                      <Text style={[styles.cmapPillText, name === colormap && styles.cmapPillTextActive]}>
                        {name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <SubLabel label="dB Floor" />
                <View style={styles.sliderWrap}>
                  <Slider style={{flex:1}} minimumValue={-200} maximumValue={dbMax-10} step={5} value={dbMin}
                    onValueChange={onDbMin} minimumTrackTintColor={C.gold} maximumTrackTintColor={C.muted} thumbTintColor={C.gold} />
                  <Text style={styles.sliderVal}>{dbMin} dB</Text>
                </View>
                <SubLabel label="dB Ceiling" />
                <View style={styles.sliderWrap}>
                  <Slider style={{flex:1}} minimumValue={dbMin+10} maximumValue={0} step={5} value={dbMax}
                    onValueChange={onDbMax} minimumTrackTintColor={C.gold} maximumTrackTintColor={C.muted} thumbTintColor={C.gold} />
                  <Text style={styles.sliderVal}>{dbMax} dB</Text>
                </View>
              </View>
            )}

            {/* ── AUDIO ──────────────────────────────────────────── */}
            <SectionLabel label="AUDIO" />
            <View style={styles.bwRow}>
              <Text style={styles.bwLabel}>LSB</Text>
              <Slider style={styles.bwSlider}
                minimumValue={0} maximumValue={15_000} step={50}
                value={Math.abs(filterLow)}
                onValueChange={v => onFilterLow(-v)}
                minimumTrackTintColor={C.gold} maximumTrackTintColor={C.muted}
                thumbTintColor={C.gold} />
              <Text style={styles.bwVal}>−{fmtHz(Math.abs(filterLow))}</Text>
            </View>
            <View style={styles.bwRow}>
              <Text style={styles.bwLabel}>USB</Text>
              <Slider style={styles.bwSlider}
                minimumValue={0} maximumValue={15_000} step={50}
                value={filterHigh}
                onValueChange={onFilterHigh}
                minimumTrackTintColor={C.gold} maximumTrackTintColor={C.muted}
                thumbTintColor={C.gold} />
              <Text style={styles.bwVal}>+{fmtHz(filterHigh)}</Text>
            </View>
            <BtnRow>
              <Btn label="NR"      active={nr}        onPress={() => onNr?.(!nr)} />
              <Btn label="NB"      active={nb}        onPress={() => onNb?.(!nb)} />
              <Btn label="⏺ REC"  active={recording} onPress={onRec} />
            </BtnRow>
            {recording && (
              <View style={styles.recTimer}>
                <View style={styles.recDot} />
                <Text style={styles.recTime}>{fmtRecTime(recSeconds)}</Text>
              </View>
            )}

            {/* ── SERVER MAPS ────────────────────────────────────── */}
            <SectionLabel label="SERVER MAPS" />
            <BtnRow>
              <Btn label="✈ HFDL"     onPress={() => {}} />
              <Btn label="📡 DIGITAL"  onPress={() => {}} />
              <Btn label="⊟ CW"       onPress={() => {}} />
            </BtnRow>

            {/* ── CLIENT DECODERS ────────────────────────────────── */}
            <SectionLabel label="CLIENT DECODERS" />
            <BtnRow>
              {(['rtty','navtex','wefax','sstv','morse'] as const).map(k => (
                <Btn key={k} label={k.toUpperCase()} active={activeDecoder === k}
                  onPress={() => toggleDecoder(k)} />
              ))}
            </BtnRow>
            {activeDecoder === 'rtty'   && <View style={styles.subPanel}><RTTYPanel /></View>}
            {activeDecoder === 'navtex' && <View style={styles.subPanel}><NAVTEXPanel /></View>}
            {activeDecoder === 'wefax'  && <View style={styles.subPanel}><WEFAXPanel /></View>}
            {activeDecoder === 'sstv'   && <View style={styles.subPanel}><SSTVPanel /></View>}
            {activeDecoder === 'morse'  && <View style={styles.subPanel}><MORSEPanel /></View>}

            {/* ── SERVER EXTENSIONS ──────────────────────────────── */}
            <SectionLabel label="SERVER EXTENSIONS" />
            <BtnRow>
              {(['digspots','cwspots','whisper'] as const).map(k => (
                <Btn key={k}
                  label={k==='digspots' ? 'DIGITAL SPOTS' : k==='cwspots' ? 'CW SPOTS' : 'STT'}
                  active={activeDecoder === k} onPress={() => toggleDecoder(k)} />
              ))}
            </BtnRow>
            {(activeDecoder === 'digspots' || activeDecoder === 'cwspots') && (
              <View style={styles.subPanel}>
                <SubLabel label="Filters in decoder panel header · swipe to scroll" small />
              </View>
            )}
            {activeDecoder === 'whisper' && <View style={styles.subPanel}><WhisperPanel /></View>}

            {/* ── CONTROLS ───────────────────────────────────────── */}
            <SectionLabel label="CONTROLS" />
            <View style={styles.ctrlRow}>
              <Text style={styles.ctrlLabel}>SIGNAL</Text>
              <BtnRow>
                {(['snr','smeter','dbfs'] as const).map(m => (
                  <Btn key={m} label={m==='smeter' ? 'S-METER' : m.toUpperCase()}
                    active={signalMode===m} onPress={() => onSignalMode?.(m)} />
                ))}
              </BtnRow>
            </View>
            <View style={styles.ctrlRow}>
              <Text style={styles.ctrlLabel}>DISPLAY STYLE</Text>
              <BtnRow>
                <Btn label="AMBER" active={displayStyle==='amber'} onPress={() => onDisplayStyle?.('amber')} />
                <Btn label="WHITE" active={displayStyle==='white'} onPress={() => onDisplayStyle?.('white')} />
              </BtnRow>
            </View>
            <View style={styles.ctrlRow}>
              <Text style={styles.ctrlLabel}>DRUMS</Text>
              <BtnRow>
                <Btn label="NORMAL"    active={drumMode==='normal'}  onPress={() => onDrumMode?.('normal')} />
                <Btn label="PRECISE"   active={drumMode==='precise'} onPress={() => onDrumMode?.('precise')} />
                <Btn label="✦ HAPTICS" active={hapticsEnabled}       onPress={() => onHaptics?.(!hapticsEnabled)} />
              </BtnRow>
            </View>

            {/* ── INSTANCE ───────────────────────────────────────── */}
            <SectionLabel label="INSTANCE" />
            <Text style={styles.instanceUrl} numberOfLines={1}>{serverName || serverUrl}</Text>
            <BtnRow>
              <Btn label="☆ SET DEFAULT" onPress={() => {}} />
              <Btn label="← BACK"        onPress={onBack ?? onClose} />
            </BtnRow>
            <BtnRow col>
              <Btn label="⟳ RECONNECT"                full onPress={onReconnect ?? onClose} />
              <Btn label="↺ RESET INTERFACE SETTINGS" full danger onPress={onResetSettings} />
            </BtnRow>

            <View style={{ height: 24 }} />
          </ScrollView>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={8}>
            <Text style={styles.closeBtnText}>CLOSE  ✕</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: SHEET_H,
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    overflow: 'hidden', borderTopWidth: 1, borderColor: C.border,
  },
  handle: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: C.border, marginTop: 10, marginBottom: 2,
  },
  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: 14, paddingTop: 4 },

  sectionBar: {
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,160,0,0.18)',
    paddingTop: 10, paddingBottom: 4, marginTop: 6,
  },
  sectionBarFirst: { borderTopWidth: 0, marginTop: 2 },
  sectionLabel: {
    color: C.sectionC, fontFamily: 'Courier', fontSize: 11,
    fontWeight: 'bold', letterSpacing: 2,
  },

  btnRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingVertical: 4 },
  btnRowCol: { flexDirection: 'column', gap: 6 },
  optRow:    { paddingTop: 2, paddingBottom: 0 },

  btn: {
    backgroundColor: C.btnBg, borderWidth: 1, borderColor: C.border,
    borderRadius: 4, paddingHorizontal: 10, paddingVertical: 7,
    alignItems: 'center', justifyContent: 'center',
  },
  btnActive:     { backgroundColor: C.active, borderColor: C.gold },
  btnDanger:     { backgroundColor: C.danger, borderColor: C.dangerBorder },
  btnFull:       { flex: 1, alignSelf: 'stretch' },
  btnText:       { color: C.muted, fontFamily: 'Courier', fontSize: 11, fontWeight: 'bold', letterSpacing: 0.5 },
  btnTextActive: { color: C.gold },
  btnTextDanger: { color: '#ff6666' },

  vtsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  vtsArrow: {
    backgroundColor: C.btnBg, borderWidth: 1, borderColor: C.border,
    borderRadius: 4, paddingHorizontal: 14, paddingVertical: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  vtsArrowText: { color: C.gold, fontSize: 18 },
  vtsInfo:  { flex: 1, alignItems: 'center', gap: 3 },
  vtsName:  { color: C.text, fontFamily: 'Courier', fontSize: 14, letterSpacing: 1 },
  vtsFreq:  { color: C.sectionC, fontFamily: 'Courier', fontSize: 11, letterSpacing: 1 },

  sliderRow:   { paddingVertical: 4, gap: 4 },
  sliderLabel: { color: C.sectionC, fontFamily: 'Courier', fontSize: 11, letterSpacing: 1 },
  bwRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  bwLabel:  { color: C.sectionC, fontFamily: 'Courier', fontSize: 11, letterSpacing: 1, width: 32 },
  bwSlider: { flex: 1, height: 32 },
  bwVal:    { color: C.gold, fontFamily: 'Courier', fontSize: 11, minWidth: 68, textAlign: 'right' },
  sliderWrap:  { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  sliderVal:   { color: C.gold, fontFamily: 'Courier', fontSize: 11, minWidth: 72, textAlign: 'right' },

  stepSlider: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  stepSliderBtn: {
    backgroundColor: C.btnBg, borderWidth: 1, borderColor: C.border,
    borderRadius: 4, width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
  },
  stepSliderBtnTxt: { color: C.gold, fontSize: 18, fontWeight: 'bold', lineHeight: 22 },
  stepSliderVal: { color: C.gold, fontFamily: 'Courier', fontSize: 12, flex: 1, textAlign: 'center' },

  subPanel: {
    backgroundColor: 'rgba(255,160,0,0.05)', borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,160,0,0.15)',
    padding: 8, marginBottom: 4,
  },
  subLabel:      { color: C.sectionC, fontFamily: 'Courier', fontSize: 11, letterSpacing: 1, paddingTop: 6, paddingBottom: 2 },
  subLabelSmall: { fontSize: 9, opacity: 0.5 },

  recTimer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  recDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: '#cc2222' },
  recTime:  { color: C.gold, fontFamily: 'Courier', fontSize: 13 },

  ctrlRow:   { paddingVertical: 4, gap: 4 },
  ctrlLabel: { color: C.sectionC, fontFamily: 'Courier', fontSize: 10, letterSpacing: 1.5 },

  cmapStrip:          { gap: 6, flexDirection: 'row', paddingBottom: 4 },
  cmapPill:           { backgroundColor: C.btnBg, borderWidth: 1, borderColor: C.border, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  cmapPillActive:     { backgroundColor: C.active, borderColor: C.gold },
  cmapPillText:       { color: C.muted, fontFamily: 'Courier', fontSize: 11 },
  cmapPillTextActive: { color: C.gold },

  instanceUrl: { color: 'rgba(255,184,51,0.30)', fontFamily: 'Courier', fontSize: 10, paddingBottom: 4 },

  closeBtn: {
    margin: 12, alignSelf: 'center', backgroundColor: C.btnBg,
    borderWidth: 1, borderColor: C.border, borderRadius: 6,
    paddingHorizontal: 24, paddingVertical: 8,
  },
  closeBtnText: { color: C.goldDim, fontFamily: 'Courier', fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },
});
