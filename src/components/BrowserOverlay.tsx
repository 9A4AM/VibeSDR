/**
 * BrowserOverlay — full-screen in-app browser for the server's admin pages
 * (ADMIN / NOISE / CONDITIONS / LISTENERS — skin menu's Admin section).
 * Native "← SDR" bar on top; the pages are arbitrary server HTML, so unlike
 * MapOverlay no chrome is injected into the WebView itself.
 */

import React from 'react';
import {
  Modal, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';

export interface BrowserOverlayProps {
  url:     string | null;
  title?:  string;
  onClose: () => void;
}

export default function BrowserOverlay({ url, title, onClose }: BrowserOverlayProps) {
  if (!url) return null;
  return (
    <Modal
      visible
      animationType="slide"
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={onClose}
    >
      {/* SafeAreaView (native, measures the modal's own window) — the
          useSafeAreaInsets hook returns 0 inside an RN Modal, which clipped
          the bar under the Dynamic Island. */}
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.bar}>
          <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.7}>
            <Text style={styles.back}>← SDR</Text>
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>{title ?? url}</Text>
          {/* spacer balances the back button so the title centres */}
          <View style={styles.spacer} />
        </View>
        <WebView
          source={{ uri: url }}
          style={styles.web}
          allowsBackForwardNavigationGestures
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: '#000' },
  bar:   {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingTop: 6, paddingBottom: 8, backgroundColor: '#0a0a0a',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.18)',
  },
  back:  { color: '#ffe566', fontFamily: 'Atkinson Hyperlegible', fontSize: 16 },
  title: {
    flex: 1, textAlign: 'center', paddingHorizontal: 10,
    color: 'rgba(255,255,255,0.85)', fontFamily: 'Atkinson Hyperlegible', fontSize: 15,
  },
  spacer: { width: 52 },
  web:   { flex: 1, backgroundColor: '#000' },
});
