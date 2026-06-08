import React, { useCallback, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Animated, Image, ActivityIndicator, LogBox, Modal, Text, View } from 'react-native';
LogBox.ignoreAllLogs();

import ViewPickerScreen    from './src/screens/ViewPickerScreen';
import InstancePickerScreen from './src/screens/InstancePickerScreen';
import SDRScreen            from './src/screens/SDRScreen';
import WebViewerScreen      from './src/screens/WebViewerScreen';
import { ViewMode } from './src/services/viewMode';

export type RootStackParamList = {
  ViewPicker:     undefined;
  InstancePicker: undefined;
  SDR:        { baseUrl: string; password?: string; instanceName?: string; viewMode: ViewMode; serverLongitude?: number | null };
  WebViewer:  { url: string; title?: string };
};

// Stable object — properties are mutated from inside the App component so
// imported references always see the current function (works with CommonJS/Metro).
export const splashBridge = {
  dismiss:     (_target?: string) => {},
  updateLabel: (_label: string)   => {},
};
export const dismissAppSplash = splashBridge;

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [splashDone, setSplashDone]   = useState(false);
  const [splashLabel, setSplashLabel] = useState('CONNECTING TO UBERSDR INSTANCE LIST');
  const splashOpacity = useRef(new Animated.Value(1)).current;

  splashBridge.dismiss = useCallback((target?: string) => {
    if (target) setSplashLabel(`CONNECTING TO UBERSDR INSTANCE:\n${target.toUpperCase()}`);
    Animated.timing(splashOpacity, { toValue: 0, duration: 450, useNativeDriver: true })
      .start(() => setSplashDone(true));
  }, [splashOpacity]);
  splashBridge.updateLabel = (label: string) => {
    setSplashLabel(`CONNECTING TO UBERSDR INSTANCE:\n${label.toUpperCase()}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A12' }}>
      <NavigationContainer>
        <StatusBar style="light" />
        <Stack.Navigator
          initialRouteName="InstancePicker"
          screenOptions={{
            headerStyle:      { backgroundColor: '#0A0A12' },
            headerTintColor:  '#FFB833',
            headerTitleStyle: { fontFamily: 'Courier' },
            contentStyle:     { backgroundColor: '#0A0A12' },
            animation:        'fade',
          }}
        >
          <Stack.Screen name="ViewPicker"     component={ViewPickerScreen}     options={{ headerShown: false }} />
          <Stack.Screen name="InstancePicker" component={InstancePickerScreen} options={{ headerShown: false }} />
          <Stack.Screen name="SDR"            component={SDRScreen}            options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="WebViewer"      component={WebViewerScreen}      options={{ headerShown: false, gestureEnabled: true }} />
        </Stack.Navigator>
      </NavigationContainer>

      {!splashDone && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: '#0A0A12', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <Text style={{ color: '#FFB833', fontSize: 22, fontFamily: 'Courier', fontWeight: 'bold' }}>VibeSDR</Text>
          <Text style={{ color: 'rgba(255,184,51,0.6)', fontSize: 11, fontFamily: 'Courier', marginTop: 12 }}>{splashLabel}</Text>
          <ActivityIndicator color="#FFB833" style={{ marginTop: 28 }} />
        </View>
      )}
    </View>
  );
}
