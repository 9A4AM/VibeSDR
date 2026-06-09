// Colour map utilities — converts packed hex strings and stop arrays
// into Uint8Array LUTs (256 × RGBA) for use in Skia shaders.

import { COLORMAPS_256, COLORMAPS_STOPS } from './colormaps';

// ── Build 256-entry RGBA LUT from packed 6-char hex string ──────────────────
function lut256(packed: string): Uint8Array {
  const lut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const h = packed.slice(i * 6, i * 6 + 6);
    lut[i * 4 + 0] = parseInt(h.slice(0, 2), 16);
    lut[i * 4 + 1] = parseInt(h.slice(2, 4), 16);
    lut[i * 4 + 2] = parseInt(h.slice(4, 6), 16);
    lut[i * 4 + 3] = 255;
  }
  return lut;
}

// ── Build 256-entry RGBA LUT from an array of CSS hex colour stops ──────────
function lutStops(stops: string[]): Uint8Array {
  const lut = new Uint8Array(256 * 4);
  const n = stops.length - 1;

  const parseHex = (hex: string): [number, number, number] => {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };

  for (let i = 0; i < 256; i++) {
    const t   = i / 255;
    const seg = Math.min(Math.floor(t * n), n - 1);
    const f   = t * n - seg;
    const [r0, g0, b0] = parseHex(stops[seg]);
    const [r1, g1, b1] = parseHex(stops[seg + 1]);
    lut[i * 4 + 0] = Math.round(r0 + (r1 - r0) * f);
    lut[i * 4 + 1] = Math.round(g0 + (g1 - g0) * f);
    lut[i * 4 + 2] = Math.round(b0 + (b1 - b0) * f);
    lut[i * 4 + 3] = 255;
  }
  return lut;
}

// ── Cache ────────────────────────────────────────────────────────────────────
const _cache = new Map<string, Uint8Array>();

export function getColorLUT(name: string): Uint8Array {
  if (_cache.has(name)) return _cache.get(name)!;

  let lut: Uint8Array;
  if (name in COLORMAPS_256) {
    lut = lut256(COLORMAPS_256[name]);
  } else if (name in COLORMAPS_STOPS) {
    lut = lutStops(COLORMAPS_STOPS[name]);
  } else {
    // Default to gqrx
    lut = lut256(COLORMAPS_256['gqrx']);
  }

  _cache.set(name, lut);
  return lut;
}

export const COLORMAP_NAMES = [
  'gqrx', 'inferno', 'turbo', 'plasma', 'viridis', 'magma',
  'Classic', 'Classic Green', 'Electric', 'Greyscale',
  'Night Vision', 'Sonar', 'Sonar Orange',
];

// Map dBFS value to LUT index (0-255)
export function dbToLut(db: number, dbMin: number, dbMax: number): number {
  const t = (db - dbMin) / (dbMax - dbMin);
  return Math.max(0, Math.min(255, Math.round(t * 255)));
}
