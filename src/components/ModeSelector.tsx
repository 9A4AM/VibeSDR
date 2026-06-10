import React from 'react';
import {
  Modal, Pressable, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Mode, MODES } from '../services/sdrTypes';
import { useTheme } from '../contexts/ThemeContext';

interface ModeSelectorProps {
  visible:  boolean;
  current:  Mode;
  onSelect: (mode: Mode) => void;
  onClose:  () => void;
}

export default function ModeSelector({ visible, current, onSelect, onClose }: ModeSelectorProps) {
  const { theme: t } = useTheme();
  const isWhite = t.name === 'white';
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} />
      <View style={[st.sheet, { borderTopColor: t.barBorder }]}>
        <Text style={[st.sheetLabel, { color: t.sectionColor, fontFamily: t.font }]}>
          DEMODULATOR
        </Text>
        <View style={st.grid}>
          {MODES.map(m => (
            <TouchableOpacity
              key={m}
              style={[
                st.btn,
                { borderColor: isWhite ? 'rgba(255,255,255,0.20)' : 'rgba(80,50,0,0.40)',
                  paddingVertical: isWhite ? 12 : 10 },
                m === current && { backgroundColor: t.btnActiveBg, borderColor: t.btnActiveBdr },
              ]}
              onPress={() => { onSelect(m); onClose(); }}
            >
              <Text style={[
                st.btnText,
                { fontFamily: t.font, fontSize: isWhite ? 15 : 14,
                  color: isWhite ? 'rgba(255,255,255,0.55)' : 'rgba(150,100,30,0.70)' },
                m === current && { color: t.btnActiveText },
              ]}>
                {m.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={[st.closeBtn, { borderColor: t.btnBorder }]}
          onPress={onClose}
        >
          <Text style={[st.closeBtnText, { fontFamily: t.font, color: t.btnText }]}>CLOSE</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.50)' },
  sheet: {
    backgroundColor: 'rgba(8,6,1,0.97)',
    borderTopWidth: 1, borderRadius: 14,
    padding: 16, paddingBottom: 40,
  },
  sheetLabel:   { textAlign: 'center', fontSize: 10, letterSpacing: 3, marginBottom: 14 },
  grid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  btn: {
    flex: 1, minWidth: '22%', backgroundColor: 'transparent',
    borderWidth: 1, borderRadius: 3, paddingHorizontal: 4, alignItems: 'center',
  },
  btnText:      { textAlign: 'center' },
  closeBtn: {
    marginTop: 14, alignSelf: 'center', borderWidth: 1,
    borderRadius: 3, paddingVertical: 7, paddingHorizontal: 24,
  },
  closeBtnText: { fontSize: 11 },
});
