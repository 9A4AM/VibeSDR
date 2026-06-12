/**
 * VTSBar — accessibility-skin popup notification bar (lsv-a11y-notif parity).
 * Pops up above the controls pill for 8s when:
 *   - the tuned frequency lands on / near a bookmark (station name + offset)
 *   - a band-plan boundary is crossed (band info, ham conditions colouring)
 * The skin's "TAP ◄ ► TO JUMP" tuning-guide hint is intentionally NOT ported
 * (it was erratic on the popup bar).
 * Overflowing text slides across once, like the skin's a11y-scrolling.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, Text } from 'react-native';

export interface VtsNotifData {
  key:        number;   // bump to re-trigger even with identical text
  name:       string;
  secondary?: string;   // overlap band names (band notifs only)
  offset?:    string;   // "-1.2kHz" distance to the station
  tuneDir?:   'left' | 'right';  // which way to tune to reach it
  kind:       'station-on' | 'station-off' | 'band';
  color?:     string;   // band-condition override for the primary text
}

const NOTIF_MS = 8000;

const COL = {
  onTune:  'rgba(80,220,100,0.95)',
  offTune: 'rgba(255,200,80,0.95)',
  band:    '#ffe566',
  dim:     'rgba(255,255,255,0.35)',
  sub:     'rgba(255,255,255,0.55)',
};

export default function VTSBar({ notif, bottom }: { notif: VtsNotifData | null; bottom: number }) {
  const [shown, setShown] = useState<VtsNotifData | null>(null);
  const fade    = useRef(new Animated.Value(0)).current;
  const slide   = useRef(new Animated.Value(0)).current;
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [areaW, setAreaW] = useState(0);
  const [textW, setTextW] = useState(0);

  useEffect(() => {
    if (!notif) return;
    setShown(notif);
    setTextW(0);
    slide.setValue(0);
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    if (hideRef.current) clearTimeout(hideRef.current);
    hideRef.current = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 300, useNativeDriver: true })
        .start(() => setShown(null));
    }, NOTIF_MS);
    return () => { if (hideRef.current) clearTimeout(hideRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notif?.key]);

  // One-shot slide for overflowing text (skin a11y-scrolling)
  useEffect(() => {
    if (!shown || !areaW || !textW || textW <= areaW) return;
    slide.setValue(0);
    Animated.timing(slide, {
      toValue: -(textW - areaW),
      duration: NOTIF_MS - 2500,
      delay: 900,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown?.key, areaW, textW]);

  if (!shown) return null;

  const onTune  = shown.kind === 'station-on';
  const isBand  = shown.kind === 'band';
  const nameCol = shown.color ?? (isBand ? COL.band : onTune ? COL.onTune : COL.offTune);
  // Arrows: green pair when on tune; otherwise the side you need to tune
  // toward lights amber, the other dims (skin vts-arrow-active/dim)
  const leftCol  = onTune ? COL.onTune : shown.tuneDir === 'left' ? COL.offTune : COL.dim;
  const rightCol = onTune ? COL.onTune : shown.tuneDir === 'right' ? COL.offTune : COL.dim;
  const tuneLeft = shown.tuneDir === 'left';
  const overflow = textW > areaW && areaW > 0;

  return (
    <Animated.View style={[styles.wrap, { bottom, opacity: fade }]} pointerEvents="none">
      <Text style={[styles.arrow, { color: leftCol }]}>◄</Text>
      {!!shown.offset && tuneLeft && <Text style={styles.offset}>{shown.offset}</Text>}
      {/* Horizontal ScrollView = unconstrained content width, so the text
          measures at its TRUE size (a plain View clamps Text to the parent
          width and the overflow slide never triggers). scrollEnabled off —
          the slide is driven by the Animated translateX. */}
      <ScrollView
        horizontal
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={styles.nameArea}
        contentContainerStyle={!overflow ? styles.nameCentre : undefined}
        onLayout={(e: { nativeEvent: { layout: { width: number } } }) => setAreaW(e.nativeEvent.layout.width)}
        onContentSizeChange={(w: number) => setTextW(w)}
      >
        <Animated.View style={overflow ? { transform: [{ translateX: slide }] } : undefined}>
          <Text style={[styles.name, { color: nameCol }]} numberOfLines={1}>
            {shown.name}
            {shown.secondary ? <Text style={styles.secondary}>{'  │  ' + shown.secondary}</Text> : null}
          </Text>
        </Animated.View>
      </ScrollView>
      {!!shown.offset && shown.tuneDir === 'right' && <Text style={styles.offset}>{shown.offset}</Text>}
      <Text style={[styles.arrow, { color: rightCol }]}>►</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(8,10,14,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    zIndex: 60,
  },
  arrow: {
    fontFamily: 'Atkinson Hyperlegible',
    fontSize: 15,
    paddingHorizontal: 4,
  },
  offset: {
    color: 'rgba(255,200,80,0.85)',
    fontFamily: 'Atkinson Hyperlegible',
    fontSize: 13,
    paddingHorizontal: 2,
  },
  nameArea: {
    flex: 1,
    marginHorizontal: 6,
  },
  nameCentre: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  name: {
    fontFamily: 'Atkinson Hyperlegible',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  secondary: {
    color: COL.sub,
    fontSize: 14,
  },
});
