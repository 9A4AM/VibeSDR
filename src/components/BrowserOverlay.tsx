/**
 * BrowserOverlay — full-screen in-app browser for the server's admin pages
 * (ADMIN / NOISE / CONDITIONS / LISTENERS — skin menu's Admin section).
 * Native "← SDR" bar with browser ‹ › history arrows (the admin pages are
 * multi-level); iOS also keeps edge-swipe back/forward inside the page, and
 * the Android back gesture navigates page history before closing the modal.
 * The pages are arbitrary server HTML, so unlike MapOverlay no chrome is
 * injected into the WebView itself.
 */

import React, { useRef, useState } from 'react';
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
  const webRef = useRef<WebView>(null);
  const [canBack, setCanBack] = useState(false);
  const [canFwd,  setCanFwd]  = useState(false);
  if (!url) return null;
  return (
    <Modal
      visible
      animationType="slide"
      supportedOrientations={['portrait', 'landscape']}
      // Android back gesture/button: walk page history first, close last
      onRequestClose={() => {
        if (canBack) webRef.current?.goBack();
        else onClose();
      }}
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
          {/* Browser history arrows — multi-level admin pages */}
          <TouchableOpacity
            onPress={() => webRef.current?.goBack()}
            hitSlop={10} activeOpacity={0.7} disabled={!canBack}
          >
            <Text style={[styles.navArrow, !canBack && styles.navArrowDim]}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => webRef.current?.goForward()}
            hitSlop={10} activeOpacity={0.7} disabled={!canFwd}
          >
            <Text style={[styles.navArrow, !canFwd && styles.navArrowDim]}>›</Text>
          </TouchableOpacity>
        </View>
        <WebView
          ref={webRef}
          source={{ uri: url }}
          style={styles.web}
          allowsBackForwardNavigationGestures
          onNavigationStateChange={(nav: { canGoBack: boolean; canGoForward: boolean }) => {
            setCanBack(nav.canGoBack);
            setCanFwd(nav.canGoForward);
          }}
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
    gap: 6,
  },
  back:  { color: '#ffe566', fontFamily: 'Atkinson Hyperlegible', fontSize: 16 },
  title: {
    flex: 1, textAlign: 'center', paddingHorizontal: 8,
    color: 'rgba(255,255,255,0.85)', fontFamily: 'Atkinson Hyperlegible', fontSize: 15,
  },
  navArrow: {
    color: '#ffe566', fontSize: 26, lineHeight: 28,
    paddingHorizontal: 8, fontFamily: 'Atkinson Hyperlegible',
  },
  navArrowDim: { color: 'rgba(255,255,255,0.22)' },
  web:   { flex: 1, backgroundColor: '#000' },
});
