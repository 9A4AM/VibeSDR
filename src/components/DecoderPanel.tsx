/**
 * DecoderPanel — floating panel above the control bar.
 *
 * Appears when a decoder is active. Positioned dynamically:
 *   bottom = pillBottom + 8  (passed as prop from SDRScreen)
 *
 * Header row: status dot · decoder title · decoder type buttons (scrollable) · status text · ✕
 * Body: scrollable text output, character-drip style from decoder service.
 * Tap header to minimise/restore. ✕ to close.
 *
 * Matches VibeSDR_Mockup_SAVE.html #lsv-decoder-panel exactly.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import DecoderImageCanvas, { type DecoderImageHandle } from './DecoderImageCanvas';

// ── Types ──────────────────────────────────────────────────────────────────────

export type DecoderType = 'rtty' | 'navtex' | 'wefax' | 'sstv' | 'morse' | 'ft8' | null;
const IMAGE_DECODERS: DecoderType[] = ['wefax', 'sstv'];

export interface DecoderPanelProps {
  activeDecoder: DecoderType;
  decoderText:   string;
  decoderStatus: string;   // 'listening…' | 'decoding…' | custom
  decoding:      boolean;  // true = green dot
  bottomOffset:  number;   // distance from bottom of screen (pillTop - 8)
  onSwitch:      (type: DecoderType) => void;
  onClose:       () => void;
  /** Image canvas (WEFAX/SSTV) — SDRScreen drives lines via this ref. */
  imageRef?:      React.RefObject<DecoderImageHandle | null>;
  /** Canvas status messages ("done — tap SAVE") → SDRScreen decoderStatus. */
  onImageStatus?: (s: string) => void;
}

const DECODER_LABELS: Record<NonNullable<DecoderType>, string> = {
  rtty:   'RTTY',
  navtex: 'NAVTEX',
  wefax:  'WEFAX',
  sstv:   'SSTV',
  morse:  'CW/MORSE',
  ft8:    'FT8',
};

const BUTTONS: DecoderType[] = ['rtty', 'navtex', 'wefax', 'sstv', 'morse', 'ft8'];

const C = {
  bg:       'rgba(10,8,4,0.95)',
  border:   'rgba(255,160,0,0.28)',
  gold:     '#ffb833',
  goldDim:  'rgba(255,160,0,0.70)',
  muted:    'rgba(255,160,0,0.38)',
  hdrBdr:   'rgba(255,160,0,0.12)',
  btnBdr:   'rgba(255,160,0,0.28)',
  btnAct:   'rgba(255,160,0,0.12)',
  dotIdle:  'rgba(255,160,0,0.35)',
  dotOn:    '#55d98d',
  outputCl: '#ffe566',
  closeCl:  'rgba(255,100,100,0.70)',
};
const FONT = 'Nixie One';

// ── Component ──────────────────────────────────────────────────────────────────

export default function DecoderPanel({
  activeDecoder, decoderText, decoderStatus, decoding,
  bottomOffset, onSwitch, onClose,
  imageRef, onImageStatus,
}: DecoderPanelProps) {
  const isImageMode = IMAGE_DECODERS.includes(activeDecoder);
  // Canvas header state — fed by DecoderImageCanvas callbacks (skin parity)
  const [imageInfo,   setImageInfo]   = useState('');
  const [hasPrev,     setHasPrev]     = useState(false);
  const [viewingPrev, setViewingPrev] = useState(false);
  const onTogglePrev = () => {
    if (viewingPrev) imageRef?.current?.showLive();
    else             imageRef?.current?.showPrev();
  };
  const onSave = () => { imageRef?.current?.save(); };
  const { theme: t } = useTheme();
  const isWhite = t.name === 'white';
  const [minimised, setMinimised] = useState(false);
  const opacity  = useRef(new Animated.Value(0)).current;
  const slideY   = useRef(new Animated.Value(20)).current;
  const outputRef = useRef<ScrollView>(null);

  const dc = {
    border:  isWhite ? 'rgba(255,255,255,0.25)' : C.border,
    hdrBdr:  isWhite ? 'rgba(255,255,255,0.10)' : C.hdrBdr,
    title:   isWhite ? 'rgba(255,255,255,0.65)' : C.goldDim,
    status:  isWhite ? 'rgba(255,255,255,0.38)' : C.muted,
    btnBdr:  isWhite ? 'rgba(255,255,255,0.25)' : C.btnBdr,
    btnAct:  isWhite ? 'rgba(255,255,255,0.12)' : C.btnAct,
    btnTxt:  isWhite ? 'rgba(255,255,255,0.55)' : C.muted,
    btnActT: isWhite ? '#ffffff' : C.gold,
    output:  isWhite ? '#ffffff' : C.outputCl,
    close:   isWhite ? 'rgba(255,180,180,0.70)' : C.closeCl,
  };

  // Appear / disappear
  useEffect(() => {
    if (activeDecoder) {
      setMinimised(false);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(slideY, { toValue: 0, damping: 22, stiffness: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }).start();
    }
  }, [activeDecoder, opacity, slideY]);

  // Scroll to bottom when text grows
  useEffect(() => {
    if (!minimised) {
      setTimeout(() => outputRef.current?.scrollToEnd({ animated: false }), 40);
    }
  }, [decoderText, minimised]);

  if (!activeDecoder) return null;

  const title = DECODER_LABELS[activeDecoder] ?? activeDecoder.toUpperCase();

  return (
    <Animated.View
      style={[dp.wrap, { bottom: bottomOffset, opacity, transform: [{ translateY: slideY }] }]}
    >
      <View style={[dp.inner, { borderColor: dc.border }]}>

        {/* Header */}
        <TouchableOpacity
          style={[dp.header, { borderBottomColor: dc.hdrBdr }]}
          onPress={() => setMinimised((p: boolean) => !p)}
          activeOpacity={0.85}
        >
          {/* Status dot */}
          <View style={[dp.dot, decoding && dp.dotOn]} />

          {/* Title */}
          <Text style={[dp.title, { color: dc.title, fontFamily: t.font }, minimised && dp.titleMin]}>
            {title}
          </Text>

          {/* Decoder type switch buttons — horizontal scroll */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={dp.btnScroll}
            contentContainerStyle={dp.btnScrollContent}
          >
            {BUTTONS.map(b => (
              <TouchableOpacity
                key={b}
                style={[dp.hbtn, { borderColor: dc.btnBdr },
                  activeDecoder === b && { backgroundColor: dc.btnAct, borderColor: dc.btnActT }]}
                onPress={(e: any) => { e?.stopPropagation(); onSwitch(b); }}
                hitSlop={4}
              >
                <Text style={[dp.hbtnTxt, { color: dc.btnTxt, fontFamily: t.font },
                  activeDecoder === b && { color: dc.btnActT }]}>
                  {DECODER_LABELS[b!]}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* PREV/LIVE + SAVE — image decoders (skin _prevB/_saveB) */}
          {isImageMode && hasPrev && (
            <TouchableOpacity hitSlop={6}
              style={[dp.hbtn, { borderColor: dc.btnBdr }]}
              onPress={(e: any) => { e?.stopPropagation(); onTogglePrev?.(); }}>
              <Text style={[dp.hbtnTxt, { color: dc.btnTxt, fontFamily: t.font }]}>
                {viewingPrev ? 'LIVE' : 'PREV'}
              </Text>
            </TouchableOpacity>
          )}
          {isImageMode && (
            <TouchableOpacity hitSlop={6}
              style={[dp.hbtn, { borderColor: dc.btnBdr }]}
              onPress={(e: any) => { e?.stopPropagation(); onSave?.(); }}>
              <Text style={[dp.hbtnTxt, { color: dc.btnActT, fontFamily: t.font }]}>SAVE</Text>
            </TouchableOpacity>
          )}
          {isImageMode && !!imageInfo && (
            <Text style={[dp.status, { color: dc.status, fontFamily: t.font }]} numberOfLines={1}>
              {imageInfo}
            </Text>
          )}

          {/* Status text */}
          <Text style={[dp.status, { color: dc.status, fontFamily: t.font }]} numberOfLines={1}>
            {decoderStatus}
          </Text>

          {/* Close */}
          <TouchableOpacity
            hitSlop={8}
            onPress={(e: any) => { e?.stopPropagation(); onClose(); }}
          >
            <Text style={[dp.closeBtn, { color: dc.close }]}>✕</Text>
          </TouchableOpacity>
        </TouchableOpacity>

        {/* Body — hidden when minimised; image canvas for WEFAX/SSTV */}
        {!minimised && isImageMode && imageRef && (
          <View style={dp.bodyContent}>
            <DecoderImageCanvas
              ref={imageRef}
              maxHeight={200}
              decoderName={activeDecoder ?? 'image'}
              onInfo={setImageInfo}
              onStatus={(s: string) => onImageStatus?.(s)}
              onPrevState={(hp: boolean, vp: boolean) => { setHasPrev(hp); setViewingPrev(vp); }}
            />
          </View>
        )}
        {!minimised && !isImageMode && (
          <ScrollView
            ref={outputRef}
            style={dp.body}
            contentContainerStyle={dp.bodyContent}
            showsVerticalScrollIndicator
          >
            <Text style={[dp.output, { color: dc.output, fontFamily: t.font }]} selectable>
              {decoderText}
            </Text>
          </ScrollView>
        )}

      </View>
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const dp = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 8, right: 8,
    zIndex: 200,
  },
  inner: {
    backgroundColor: C.bg,
    borderWidth: 1, borderColor: C.border,
    borderRadius: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.80, shadowRadius: 14, elevation: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.hdrBdr,
  },
  dot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: C.dotIdle, flexShrink: 0 },
  dotOn:     { backgroundColor: C.dotOn, shadowColor: '#55d98d', shadowOpacity: 0.60, shadowRadius: 4, shadowOffset: { width:0, height:0 } },
  title:     { fontSize: 10, letterSpacing: 2, color: C.goldDim, fontFamily: FONT, flexShrink: 0 },
  titleMin:  { color: 'rgba(255,160,0,0.40)' },
  btnScroll: { flexShrink: 1 },
  btnScrollContent: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  hbtn: {
    borderWidth: 1, borderColor: C.btnBdr, borderRadius: 4,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  hbtnActive:    { backgroundColor: C.btnAct, borderColor: 'rgba(255,160,0,0.55)' },
  hbtnTxt:       { fontFamily: FONT, fontSize: 11, color: 'rgba(255,160,0,0.60)' },
  hbtnTxtActive: { color: C.gold },
  status:   { fontSize: 9, letterSpacing: 1, color: C.muted, flexShrink: 1, overflow: 'hidden' },
  closeBtn: { color: C.closeCl, fontSize: 16, paddingHorizontal: 2, flexShrink: 0 },
  body:        { maxHeight: 200 },
  bodyContent: { padding: 12 },
  output: {
    fontSize: 12, letterSpacing: 0.8, lineHeight: 20,
    color: C.outputCl, fontFamily: FONT,
    textShadowColor: 'rgba(255,220,100,0.35)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
});
