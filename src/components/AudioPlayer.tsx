import { useEffect, useRef } from 'react';
import { NativeModules, Platform } from 'react-native';
import { v4 as uuidv4 } from 'uuid';

const VibeStreamModule = NativeModules.VibeStreamModule as
  | {
      startStream:    (url: string, title: string, artist: string) => void;
      stop:           () => void;
      updateMetadata: (title: string, artist: string) => void;
      resume:         () => void;
    }
  | undefined;

export const VibePowerModule = NativeModules.VibePowerModule as
  | {
      startAudioEngine:  (baseUrl: string, frequency: number, mode: string, uuid: string) => void;
      stopAudioEngine:   () => void;
      sendTuneCommand:   (frequency: number, mode: string) => void;
      sendBandwidth:     (low: number, high: number) => void;
      setStep:           (hz: number) => void;
      setInstanceName:   (name: string) => void;
      setMuted:          (muted: boolean) => void;
      setVolume:         (v: number) => void;
      getDebugInfoSync:  () => string;
      addListener:       (name: string) => void;
      removeListeners:   (count: number) => void;
    }
  | undefined;

export interface AudioPlayerProps {
  baseUrl:       string | null;
  frequency:     number;
  mode:          string;
  step?:         number;
  instanceName?: string;
  uuid?:         string;
}

function nowPlayingTitle(frequency: number, mode: string): string {
  return `${(frequency / 1_000_000).toFixed(3)} MHz ${mode.toUpperCase()}`;
}

export default function AudioPlayer({ baseUrl, frequency, mode, step, instanceName, uuid: propUuid }: AudioPlayerProps) {
  const activeUrl  = useRef<string | null>(null);
  const activeFreq = useRef<number>(0);
  const activeMode = useRef<string>('');
  const uuid       = useRef<string>(propUuid ?? uuidv4());

  // Start/stop when baseUrl changes
  useEffect(() => {
    if (baseUrl === activeUrl.current) return;
    activeUrl.current = baseUrl;

    if (Platform.OS === 'android') {
      if (baseUrl) {
        const streamUrl = `${baseUrl}/audio/stream?user_session_id=${uuid.current}`;
        VibeStreamModule?.startStream(
          streamUrl,
          nowPlayingTitle(frequency, mode),
          instanceName ?? baseUrl,
        );
        activeFreq.current = frequency;
        activeMode.current = mode;
      } else {
        VibeStreamModule?.stop();
      }
      return;
    }

    if (!VibePowerModule) {
      console.error('[AudioPlayer] VibePowerModule not found in NativeModules');
    }

    if (baseUrl) {
      uuid.current = propUuid ?? uuidv4();
      VibePowerModule?.startAudioEngine(baseUrl, frequency, mode, uuid.current);
      VibePowerModule?.setInstanceName(instanceName ?? '');
      activeFreq.current = frequency;
      activeMode.current = mode;
    } else {
      VibePowerModule?.stopAudioEngine();
    }

    return () => {
      if (Platform.OS === 'ios') VibePowerModule?.stopAudioEngine();
      else                       VibeStreamModule?.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl]);

  // Sync tune / metadata when frequency or mode changes
  useEffect(() => {
    if (!activeUrl.current) return;
    if (frequency === activeFreq.current && mode === activeMode.current) return;
    activeFreq.current = frequency;
    activeMode.current = mode;

    if (Platform.OS === 'android') {
      VibeStreamModule?.updateMetadata(
        nowPlayingTitle(frequency, mode),
        instanceName ?? activeUrl.current ?? '',
      );
    } else {
      VibePowerModule?.sendTuneCommand(frequency, mode);
    }
  }, [frequency, mode]);

  // iOS: sync step to native for lock screen skip buttons
  useEffect(() => {
    if (Platform.OS !== 'ios' || step == null) return;
    VibePowerModule?.setStep(step);
  }, [step]);

  // iOS: sync instance name
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    VibePowerModule?.setInstanceName(instanceName ?? '');
  }, [instanceName]);

  return null;
}
