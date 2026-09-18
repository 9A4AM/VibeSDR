/**
 * VibeServer Lite — the MAIN app's VibeServer setup + status screen, VERBATIM.
 *
 * Stuart, 2026-09-18: "when opened it literally shows the VibeServer setup screen from the current
 * android app verbatim with a start button, and when running the same status screen." So this file
 * renders ../../src/screens/ServerModeScreen.tsx itself — not a copy — and supplies the one thing
 * it expects from the app around it: a `navigation` object.
 *
 * ★ Lite HAS no other screens, so each navigation call lands somewhere honest:
 *   goBack()                     — "Stop & back" / "Cancel": back to a fresh setup form (remount).
 *   navigate('InstancePicker')   — "keep serving and browse": there is no client here, so the app
 *                                   steps into the background and the server carries on.
 *   replace('RtlTcpServer')      — rtl_tcp serving is not in Lite yet; say so rather than do nothing.
 */
import React, { useMemo, useState } from 'react';
import { AppRegistry, Alert, BackHandler, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ServerModeScreen from '../../src/screens/ServerModeScreen';

function Lite() {
  const [mount, setMount] = useState(0);
  const navigation = useMemo(() => ({
    goBack: () => setMount((n) => n + 1),
    navigate: () => BackHandler.exitApp(),
    replace: () => Alert.alert('Not in VibeServer Lite yet',
      'Serving raw rtl_tcp is not part of this build. Choose VibeServer to share this radio.'),
    addListener: () => () => {},
    setOptions: () => {},
    isFocused: () => true,
  }), []);
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <ServerModeScreen key={mount} navigation={navigation} route={{ key: 'ServerMode', name: 'ServerMode', params: undefined }} />
    </SafeAreaProvider>
  );
}
AppRegistry.registerComponent('VibeServerLite', () => Lite);
