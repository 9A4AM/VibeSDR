import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, DeviceEventEmitter, NativeModules, Platform, StatusBar, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';

const VibeStream = Platform.OS === 'android' ? NativeModules.VibeStreamModule : null;
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebViewMessageEvent } from 'react-native-webview';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useKeepAwake } from 'expo-keep-awake';
import { RootStackParamList } from '../../App';
import AsyncStorage from '@react-native-async-storage/async-storage';
import WaterfallWebView, { WaterfallWebViewHandle, loadAppPrefs, saveAppPref } from '../components/WaterfallWebView';
import {
  clearDefaultInstance,
  getDefaultInstance,
  setDefaultInstance,
} from '../services/defaultInstance';
import { ViewMode, setViewMode } from '../services/viewMode';

type Props = NativeStackScreenProps<RootStackParamList, 'SDR'>;

// Step-tune JS — reads current Hz and steps by frequencyScrollStep
const STEP_UP_JS = `try{
  var _si=document.getElementById('frequency');
  var _hz=0;
  if(_si){var _dv=_si.getAttribute('data-hz-value');if(_dv)_hz=parseInt(_dv,10);}
  var _step=window.frequencyScrollStep||1000;
  if(_hz>0&&typeof window.setFrequency==='function')window.setFrequency(_hz+_step);
}catch(e){}`;
const STEP_DOWN_JS = `try{
  var _si=document.getElementById('frequency');
  var _hz=0;
  if(_si){var _dv=_si.getAttribute('data-hz-value');if(_dv)_hz=parseInt(_dv,10);}
  var _step=window.frequencyScrollStep||1000;
  if(_hz>0&&typeof window.setFrequency==='function')window.setFrequency(_hz-_step);
}catch(e){}`;

function formatHz(hz: number): string {
  if (!hz) return 'VibeSDR';
  if (hz >= 1000000) return (hz / 1_000_000).toFixed(3) + ' MHz';
  return (hz / 1000).toFixed(3) + ' kHz';
}

export default function SDRScreen({ route, navigation }: Props) {
  const { baseUrl, instanceName, viewMode = 'default', serverLongitude } = route.params;
  useKeepAwake();

  const insets      = useSafeAreaInsets();
  const wvRef       = useRef<WaterfallWebViewHandle>(null);
  const lastMuted   = useRef<boolean | null>(null);
  const [isDefault, setIsDefault] = useState(false);
  const [appPrefs, setAppPrefs]   = useState<Record<string, unknown>>({});

  useEffect(() => {
    loadAppPrefs().then(setAppPrefs);
  }, []);

  // ── Android stream service cleanup on unmount ───────────────────────────────
  useEffect(() => {
    return () => { VibeStream?.stop(); };
  }, []);

  // ── Android: media notification button events → WebView ────────────────────
  useEffect(() => {
    if (!VibeStream) return;
    const sub = DeviceEventEmitter.addListener('vibeMediaControl', (action: string) => {
      switch (action) {
        case 'next':  wvRef.current?.inject(STEP_UP_JS);   break;
        case 'prev':  wvRef.current?.inject(STEP_DOWN_JS); break;
        case 'play':  wvRef.current?.inject(`try{if(window.isMuted&&typeof window.toggleMute==='function')window.toggleMute();}catch(e){}`);  break;
        case 'pause': wvRef.current?.inject(`try{if(!window.isMuted&&typeof window.toggleMute==='function')window.toggleMute();}catch(e){}`); break;
      }
    });
    return () => sub.remove();
  }, []);

  // ── Default instance ────────────────────────────────────────────────────────

  const refreshDefault = useCallback(async () => {
    const d = await getDefaultInstance();
    const def = d?.url === baseUrl;
    setIsDefault(def);
    wvRef.current?.inject(
      `if(typeof window.vibeSetDefaultLabel==='function')` +
      `window.vibeSetDefaultLabel('${def ? '★ REMOVE DEFAULT' : '☆ SET AS DEFAULT'}');`
    );
  }, [baseUrl]);

  useEffect(() => { refreshDefault(); }, [refreshDefault]);

  // ── Background / foreground ─────────────────────────────────────────────────

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        wvRef.current?.inject(
          `try { if (typeof window._lsvExitAudioOnly === 'function') window._lsvExitAudioOnly(); } catch(e) {}`
        );
      } else if (Platform.OS !== 'android') {
        wvRef.current?.inject(
          `try { if (typeof window._lsvEnterAudioOnly === 'function') window._lsvEnterAudioOnly(); } catch(e) {}`
        );
      }
    });
    return () => sub.remove();
  }, []);

  // ── Navigation ──────────────────────────────────────────────────────────────

  const goBack = useCallback(() => {
    // Kill the waterfall RAF loop before unmounting to prevent CPU spike
    wvRef.current?.inject(
      `try{if(typeof window.__vibeWFKill==='function')window.__vibeWFKill();}catch(e){}`
    );
    setTimeout(() => navigation.goBack(), 150);
  }, [navigation]);

  const toggleDefault = useCallback(async () => {
    if (isDefault) {
      Alert.alert(
        'Remove Default',
        `Stop auto-connecting to "${instanceName ?? baseUrl}" on startup?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => { await clearDefaultInstance(); refreshDefault(); },
          },
        ],
      );
    } else {
      Alert.alert(
        'Set as Default',
        `Auto-connect to "${instanceName ?? baseUrl}" on every startup?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Set Default',
            onPress: async () => {
              await setDefaultInstance({ name: instanceName ?? baseUrl, url: baseUrl });
              refreshDefault();
            },
          },
        ],
      );
    }
  }, [isDefault, baseUrl, instanceName, refreshDefault]);

  // ── Reset all VibeSDR app data ──────────────────────────────────────────────

  const resetInstanceData = useCallback(() => {
    // Clear only this server's vsdr instance prefs from localStorage, then reload
    wvRef.current?.inject(
      `try{
        var host = location.hostname;
        Object.keys(localStorage).filter(function(k){
          return k.startsWith('vsdr_wf_inst_') || k === 'vsdr_rate' || k === 'vsdr_rate_idle_off';
        }).forEach(function(k){localStorage.removeItem(k);});
        location.reload();
      }catch(e){}`
    );
  }, []);

  const resetAppData = useCallback(async (clearFavourites: boolean) => {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const toDelete = allKeys.filter(k =>
        k.startsWith('vsdr_') && (clearFavourites || k !== 'vsdr_favourites')
      );
      for (const k of toDelete) await AsyncStorage.removeItem(k);
      await AsyncStorage.removeItem('@vibesdr/app_prefs');
      setAppPrefs({});
    } catch {}
    // Clear localStorage on current origin then go back to instance picker
    wvRef.current?.inject(
      `try{Object.keys(localStorage).filter(function(k){return k.startsWith('vsdr_');}).forEach(function(k){localStorage.removeItem(k);});}catch(e){}`
    );
    navigation.navigate('InstancePicker');
  }, [navigation]);

  // ── Message handler ─────────────────────────────────────────────────────────

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);

      if (msg.type === 'pref-set' && msg.key) {
        saveAppPref(msg.key as string, msg.value).catch(() => {});
        setAppPrefs(prev => ({ ...prev, [msg.key as string]: msg.value }));
      }

      if (msg.type === 'haptic') {
        const style = msg.style === 'light' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Rigid;
        Haptics.impactAsync(style).catch(() => {});
      }
      if (msg.type === 'back')           goBack();
      if (msg.type === 'toggle-default') toggleDefault();
      if (msg.type === 'set-view-mode' && (msg.mode === 'default' || msg.mode === 'accessibility')) {
        setViewMode(msg.mode as ViewMode).catch(() => {});
      }
      if (msg.type === 'open-url' && msg.url) {
        navigation.navigate('WebViewer', { url: msg.url, title: msg.title });
      }

      if (msg.type === 'reset-instance') {
        resetInstanceData();
      }

      if (msg.type === 'reset-app') {
        Alert.alert(
          'Reset All App Data',
          'Clear all VibeSDR settings, global defaults, and per-server preferences?\n\nThis will reload the current page.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Keep Favourites',
              onPress: async () => {
                await resetAppData(false);
              },
            },
            {
              text: 'Clear Everything',
              style: 'destructive',
              onPress: async () => {
                await resetAppData(true);
              },
            },
          ]
        );
      }

      // ── Android: hand stream URL to native MediaPlayer service ────────────
      if (msg.type === 'stream-url' && msg.url && VibeStream) {
        VibeStream.startStream(
          msg.url as string,
          formatHz(0),
          instanceName || 'SDR Receiver'
        );
        // Mute WebView audio elements only — do NOT suspend audioContext as
        // UberSDR uses it to keep the session alive server-side
        wvRef.current?.inject(
          `try{document.querySelectorAll('audio').forEach(function(a){a.volume=0;a.muted=true;});}catch(e){}`
        );
      }

      if (msg.type === 'state' && VibeStream) {
        if (msg.hz) {
          VibeStream.updateMetadata(
            formatHz(msg.hz as number),
            (msg.station as string) || instanceName || 'SDR Receiver'
          );
        }
        // Detect unmute transition: WebView unmuted while native service is paused
        if (typeof msg.muted === 'boolean') {
          const wasMuted = lastMuted.current;
          lastMuted.current = msg.muted;
          if (wasMuted === true && msg.muted === false) {
            VibeStream.resume();
          }
        }
      }
    } catch { /* ignore */ }
  }, [goBack, toggleDefault, navigation, instanceName]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <WaterfallWebView
        ref={wvRef}
        url={baseUrl + '/'}
        viewMode={viewMode}
        appPrefs={appPrefs}
        serverLongitude={serverLongitude}
        onMessage={onMessage}
        onLoad={refreshDefault}
        onError={() =>
          Alert.alert('Connection Lost', 'Lost connection to SDR server', [
            { text: 'Back', onPress: goBack },
          ])
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
});
