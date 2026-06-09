/**
 * SDRScreen — main receiver screen for VibeSDR v2.
 *
 * Hierarchy:
 *   SDRScreen
 *   ├── WaterfallView         (GPU Skia waterfall + spectrum, fills free space)
 *   ├── ControlsBar           (drums, mode strip, freq display, step, menu)
 *   ├── MenuSheet             (slide-up panel: colormap, dB range, filter, AGC)
 *   └── AudioPlayer           (renderless; plays Opus stream natively)
 *
 * UberSDRClient owns the WebSocket lifecycle. The screen owns UI state.
 * On unmount, client.destroy() fires — no lingering sockets.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Dimensions,
  NativeEventEmitter,
  NativeModules,
  Platform,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';

import { UberSDRClient, type SDRStatus, type SDRMode } from '../services/UberSDRClient';
import { MIN_HZ, MAX_HZ, STEPS } from '../services/sdrTypes';
import { v4 as uuidv4 } from 'uuid';

import WaterfallView   from '../components/WaterfallView';
import ControlsBar     from '../components/ControlsBar';
import MenuSheet       from '../components/MenuSheet';
import AudioPlayer from '../components/AudioPlayer';
import FreqModal       from '../components/FreqModal';
import ModeSelector    from '../components/ModeSelector';

// ── Constants ──────────────────────────────────────────────────────────────────

const LSV_PX_STEP = 22;   // pixels per tuning step on the VFO drum

// ── Types ──────────────────────────────────────────────────────────────────────

type Props = NativeStackScreenProps<RootStackParamList, 'SDR'>;

// ── Component ──────────────────────────────────────────────────────────────────

export default function SDRScreen({ route, navigation }: Props) {
  const { baseUrl, instanceName, password } = route.params;
  useKeepAwake();

  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = Dimensions.get('window');

  // ── Client ref ────────────────────────────────────────────────────────────

  const client    = useRef<UberSDRClient | null>(null);
  const destroyed = useRef(false);
  // Stable UUID shared between native audio WS and spectrum WS for this session
  const sessionUuid = useMemo(() => uuidv4(), [baseUrl]);

  // ── SDR state ─────────────────────────────────────────────────────────────

  const [connected,  setConnected]  = useState(false);
  const [status,     setStatus]     = useState<SDRStatus>({
    frequency:     14_074_000,
    mode:          'usb',
    bandwidthLow:  -3000,
    bandwidthHigh:  3000,
    binCount:       1024,
    binBandwidth:   0,
    centerHz:       0,
    bwHz:           0,
  });
  const [bins, setBins] = useState<Float32Array | null>(null);

  // ── Step ──────────────────────────────────────────────────────────────────

  const [step, setStep] = useState(1000);
  const stepRef = useRef(step);
  useEffect(() => { stepRef.current = step; }, [step]);

  // ── Display settings ──────────────────────────────────────────────────────

  const [dbMin,          setDbMin]          = useState(-120);
  const [dbMax,          setDbMax]          = useState(-20);
  const [colormap,       setColormap]       = useState('gqrx');
  const [agc,            setAgc]            = useState(true);
  const [menuOpen,       setMenuOpen]       = useState(false);
  const [freqModalOpen,  setFreqModalOpen]  = useState(false);
  const [modeSelOpen,    setModeSelOpen]    = useState(false);

  // ── Media control tune events (from lock screen skip buttons) ─────────────
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const emitter = new NativeEventEmitter(NativeModules.VibePowerModule);
    const sub = emitter.addListener('VibeTuned', (e: { frequency: number; mode: string }) => {
      setStatus(prev => ({
        ...prev,
        frequency: e.frequency,
        mode: (e.mode as SDRMode) ?? prev.mode,
      }));
    });
    return () => sub.remove();
  }, []);

  // ── Connect ───────────────────────────────────────────────────────────────

  useEffect(() => {
    destroyed.current = false;

    const c = new UberSDRClient(baseUrl, sessionUuid, {
      onConnect: () => {
        if (destroyed.current) return;
        setConnected(true);
      },
      onDisconnect: () => {
        if (destroyed.current) return;
        setConnected(false);
      },
      onStatus: (s) => {
        if (destroyed.current) return;
        setStatus(s);
      },
      onSpectrum: (newBins, s) => {
        if (destroyed.current) return;
        // Copy bins so we're not sharing the client's buffer
        setBins(new Float32Array(newBins));
        setStatus(s);
      },
      onError: (msg) => {
        if (destroyed.current) return;
        Alert.alert('Connection Error', msg, [
          { text: 'Back', onPress: () => navigation.goBack() },
        ]);
      },
    });

    client.current = c;
    c.connect(status.frequency, status.mode);

    return () => {
      destroyed.current = true;
      c.destroy();
      client.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl]);

  // ── App state: pause spectrum when backgrounded (audio keeps playing) ─────

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        client.current?.pauseSpectrum();
      } else {
        client.current?.resumeSpectrum();
      }
    });
    return () => sub.remove();
  }, []);

  // ── VFO drum → tune ───────────────────────────────────────────────────────

  const onVfoDelta = useCallback((pxDelta: number) => {
    const c = client.current;
    if (!c) return;
    const dHz   = Math.round((pxDelta * stepRef.current) / LSV_PX_STEP);
    if (!dHz) return;
    const s     = c.getStatus();
    const newHz = Math.max(MIN_HZ, Math.min(MAX_HZ, s.frequency + dHz));
    c.tune(newHz);
    setStatus(prev => ({ ...prev, frequency: newHz }));
  }, []);

  // ── BW drum → zoom spectrum view ──────────────────────────────────────────

  const onBwDelta = useCallback((pxDelta: number) => {
    const c = client.current;
    if (!c) return;
    const s = c.getStatus();
    if (!s.binBandwidth || !s.centerHz || !s.binCount) return;
    const factor = Math.pow(0.85, Math.round(pxDelta / 25));
    c.zoom(s.centerHz, Math.max(1, s.binBandwidth * factor));
  }, []);

  // ── Waterfall pan → pan spectrum view ────────────────────────────────────

  const onWfPanDelta = useCallback((dxPx: number) => {
    const c = client.current;
    if (!c) return;
    const s = c.getStatus();
    if (!s.binBandwidth || !s.centerHz) return;
    const dHz   = Math.round(dxPx * s.binBandwidth);
    const newCx = s.centerHz - dHz; // pan: drag right → freq decreases
    c.pan(newCx);
  }, []);

  // ── Waterfall zoom → zoom spectrum view ──────────────────────────────────

  const onWfZoomDelta = useCallback((dyPx: number) => {
    const c = client.current;
    if (!c) return;
    const s = c.getStatus();
    if (!s.binBandwidth || !s.centerHz || !s.binCount) return;
    const factor = Math.pow(0.9, Math.round(dyPx / 20));
    c.zoom(s.centerHz, Math.max(1, s.binBandwidth * factor));
  }, []);

  // ── Mode change ───────────────────────────────────────────────────────────

  const onMode = useCallback((m: SDRMode) => {
    client.current?.setMode(m);
    setStatus(prev => ({ ...prev, mode: m }));
  }, []);

  // ── AGC toggle ────────────────────────────────────────────────────────────

  const onAgc = useCallback((on: boolean) => {
    setAgc(on);
    // TODO: send AGC command when UberSDR protocol supports it
  }, []);

  // ── Filter bandwidth (passband) ───────────────────────────────────────────

  const onFilterLow  = useCallback((v: number) => {
    client.current?.setBandwidth(v, status.bandwidthHigh);
    setStatus(prev => ({ ...prev, bandwidthLow: v }));
  }, [status.bandwidthHigh]);

  const onFilterHigh = useCallback((v: number) => {
    client.current?.setBandwidth(status.bandwidthLow, v);
    setStatus(prev => ({ ...prev, bandwidthHigh: v }));
  }, [status.bandwidthLow]);

  // ── Direct tune (from FreqModal) ──────────────────────────────────────────

  const onTuneHz = useCallback((hz: number) => {
    const c = client.current;
    if (!c) return;
    const clamped = Math.max(MIN_HZ, Math.min(MAX_HZ, hz));
    c.tune(clamped);
    setStatus(prev => ({ ...prev, frequency: clamped }));
  }, []);

  // ── Back — destroy client then navigate back ──────────────────────────────

  const onBack = useCallback(() => {
    destroyed.current = true;
    client.current?.destroy();
    client.current = null;
    navigation.goBack();
  }, [navigation]);

  const topInset    = insets.top;
  const bottomInset = insets.bottom;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />

      {/* ── Waterfall — fills full screen ────────────────────────────── */}
      <WaterfallView
        bins={bins}
        binCount={status.binCount}
        centerHz={status.centerHz}
        bwHz={status.bwHz}
        tuneHz={status.frequency}
        dbMin={dbMin}
        dbMax={dbMax}
        colormap={colormap}
        width={screenW}
        height={screenH}
        onPanDelta={onWfPanDelta}
        onZoomDelta={onWfZoomDelta}
      />

      {/* ── Controls pill — absolute overlay at bottom ───────────────── */}
      <View style={[styles.pillWrap, { bottom: bottomInset + 8 }]}>
        <ControlsBar
          frequency={status.frequency}
          mode={status.mode}
          step={step}
          connected={connected}
          bottomInset={0}
          instanceHost={instanceName ?? baseUrl}
          onVfoDelta={onVfoDelta}
          onBwDelta={onBwDelta}
          onMode={onMode}
          onStep={setStep}
          onMenu={() => setMenuOpen(true)}
          onFreqTap={() => setFreqModalOpen(true)}
          onModeTap={() => setModeSelOpen(true)}
        />
      </View>

      {/* ── Menu sheet ───────────────────────────────────────────────── */}
      <MenuSheet
        visible={menuOpen}
        colormap={colormap}
        dbMin={dbMin}
        dbMax={dbMax}
        filterLow={status.bandwidthLow}
        filterHigh={status.bandwidthHigh}
        agc={agc}
        serverName={instanceName ?? ''}
        serverUrl={baseUrl}
        onClose={() => setMenuOpen(false)}
        onColormap={setColormap}
        onDbMin={setDbMin}
        onDbMax={setDbMax}
        onFilterLow={onFilterLow}
        onFilterHigh={onFilterHigh}
        onAgc={onAgc}
      />

      {/* ── Frequency entry modal ────────────────────────────────────── */}
      <FreqModal
        visible={freqModalOpen}
        currentHz={status.frequency}
        onConfirm={onTuneHz}
        onClose={() => setFreqModalOpen(false)}
      />

      {/* ── Mode selector ────────────────────────────────────────────── */}
      <ModeSelector
        visible={modeSelOpen}
        current={status.mode}
        onSelect={onMode}
        onClose={() => setModeSelOpen(false)}
      />

      {/* ── Audio player (renderless) ────────────────────────────────── */}
      <AudioPlayer
        baseUrl={baseUrl}
        frequency={status.frequency}
        mode={status.mode}
        step={step}
        instanceName={instanceName}
        uuid={sessionUuid}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: '#000',
  },
  pillWrap: {
    position: 'absolute',
    left:     8,
    right:    8,
  },
});
