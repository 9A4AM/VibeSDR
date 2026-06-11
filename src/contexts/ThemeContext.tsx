/**
 * ThemeContext — AMBER (Nixie One) vs WHITE (Atkinson Hyperlegible)
 *
 * Matches the mockup's data-theme="amber" | "white" toggle.
 * AMBER is default (instrument aesthetic).
 * WHITE is accessibility mode (high legibility).
 *
 * Usage:
 *   const { theme, themeName, setTheme } = useTheme();
 *   // themeName: 'amber' | 'white'
 *   // theme.font, theme.freqColor, etc.
 *
 * Menu wires setTheme('amber') / setTheme('white') to the AMBER/WHITE buttons.
 */

import React, {
  createContext, useContext, useState, type ReactNode,
} from 'react';

// ── Token shapes ──────────────────────────────────────────────────────────────

export type ThemeName = 'amber' | 'white';

export interface ThemeTokens {
  name:            ThemeName;
  // Fonts
  font:            string;   // primary UI font family
  fontBold:        string;
  // Bar / panel
  barBg:           string;
  barBorder:       string;
  barInnerGlow:    string;
  // Buttons
  btnBg:           string;
  pillBg:          string;
  btnBorder:       string;
  btnText:         string;
  btnActiveBg:     string;
  btnActiveBdr:    string;
  btnActiveText:   string;
  // Frequency
  freqColor:       string;
  freqGlowColor:   string;
  unitColor:       string;
  freqSize:        number;
  freqWidth:       number;
  // Mode / SNR
  modeColor:       string;
  modeSize:        number;
  modeLs:          number;
  snrColor:        string;
  // Buttons
  btnSize:         number;
  // Clock
  clockColor:      string;
  // Notification
  notifTxtColor:   string;
  notifBorder:     string;
  // Section labels
  sectionColor:    string;
}

// ── Amber theme — from [data-theme="amber"] in mockup ─────────────────────────
const AMBER: ThemeTokens = {
  name:           'amber',
  font:           'Nixie One',
  fontBold:       'Nixie One',   // Nixie One has no separate bold file; weight handled by fontWeight
  barBg:          'rgba(10,8,4,0.84)',
  barBorder:      'rgba(255,160,0,0.22)',
  barInnerGlow:   'rgba(255,160,0,0.07)',
  btnBg:          'rgba(20,10,0,0.75)',
  pillBg:         'rgb(20,10,0)',
  btnBorder:      'rgba(255,160,0,0.35)',
  btnText:        '#ffb833',
  btnActiveBg:    'rgba(255,200,0,0.10)',
  btnActiveBdr:   'rgba(255,229,102,0.55)',
  btnActiveText:  '#ffe566',
  freqColor:      '#ffb833',
  freqGlowColor:  '#ffaa00',
  unitColor:      '#886600',
  freqSize:       26,
  freqWidth:      148,
  modeColor:      '#ffb833',
  modeSize:       14,
  modeLs:         1.5,
  snrColor:       'rgba(255,160,0,0.50)',
  btnSize:        13,
  clockColor:     'rgba(255,160,0,0.25)',
  notifTxtColor:  '#ffb833',
  notifBorder:    'rgba(255,160,0,0.45)',
  sectionColor:   'rgba(255,160,0,0.50)',
};

// ── White theme — from [data-theme="white"] in mockup ─────────────────────────
const WHITE: ThemeTokens = {
  name:           'white',
  font:           'Atkinson Hyperlegible',
  fontBold:       'Atkinson Hyperlegible', // no Bold ttf bundled — weight via fontWeight
  barBg:          'rgba(10,8,4,0.84)',     // same dark background
  barBorder:      'rgba(255,255,255,0.30)',
  barInnerGlow:   'rgba(255,255,255,0.08)',
  btnBg:          'rgba(20,10,0,0.75)',
  pillBg:         'rgb(20,10,0)',
  btnBorder:      'rgba(255,255,255,0.35)',
  btnText:        '#ffffff',
  btnActiveBg:    'rgba(255,200,0,0.12)',
  btnActiveBdr:   'rgba(255,229,102,0.70)',
  btnActiveText:  '#ffe566',
  freqColor:      '#ffffff',
  freqGlowColor:  'rgba(255,255,255,0.50)',
  unitColor:      '#b0b8c8',
  freqSize:       28,       // --freq-size: 28px in white theme
  freqWidth:      168,      // --freq-width: 168px in white theme
  modeColor:      '#ffffff',
  modeSize:       16,       // --mode-size: 16px
  modeLs:         2,        // --mode-ls: 2px
  snrColor:       '#b0b8c8',
  btnSize:        15,       // --btn-size: 15px
  clockColor:     'rgba(255,255,255,0.30)',
  notifTxtColor:  '#ffffff',
  notifBorder:    'rgba(255,255,255,0.40)',
  sectionColor:   'rgba(180,190,210,0.80)',
};

export const THEMES: Record<ThemeName, ThemeTokens> = { amber: AMBER, white: WHITE };

// ── Context ───────────────────────────────────────────────────────────────────

interface ThemeContextValue {
  theme:     ThemeTokens;
  themeName: ThemeName;
  setTheme:  (name: ThemeName) => void;
}

// WHITE (accessibility skin, Atkinson Hyperlegible) is THE style — amber/Nixie
// dropped 2026-06-11 for readability on all screens. The AMBER tokens above
// are kept only as a historical reference; no UI switches to them anymore.
const ThemeContext = createContext<ThemeContextValue>({
  theme:    WHITE,
  themeName:'white',
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>('white');
  const setTheme = (name: ThemeName) => setThemeName(name);
  return (
    <ThemeContext.Provider value={{ theme: THEMES[themeName as ThemeName], themeName, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
