import { useEffect, useRef } from 'react';
import { NativeModules, Platform } from 'react-native';
import { v4 as uuidv4 } from 'uuid';

const VibeStreamModule = NativeModules.VibeStreamModule as
  | { startStream: (url: string) => void; stopStream: () => void }
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
      if (baseUrl) VibeStreamModule?.startStream(baseUrl);
      else         VibeStreamModule?.stopStream();
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
      else                       VibeStreamModule?.stopStream();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl]);

  // Sync tune command when frequency or mode changes
  useEffect(() => {
    if (!activeUrl.current || Platform.OS !== 'ios') return;
    if (frequency === activeFreq.current && mode === activeMode.current) return;
    activeFreq.current = frequency;
    activeMode.current = mode;
    VibePowerModule?.sendTuneCommand(frequency, mode);
  }, [frequency, mode]);

  // Sync step to native for media control skip buttons
  useEffect(() => {
    if (Platform.OS !== 'ios' || step == null) return;
    VibePowerModule?.setStep(step);
  }, [step]);

  // Sync instance name
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    VibePowerModule?.setInstanceName(instanceName ?? '');
  }, [instanceName]);

  return null;
}
