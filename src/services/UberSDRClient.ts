// UberSDRClient.ts — native WebSocket client for UberSDR servers
//
// Audio WS is owned by native VibePowerModule (runs on background thread, survives JS suspension).
// JS only manages the spectrum WS for display.
//
// Binary SPEC frame format (from user_spectrum_websocket.go):
//   Header 22 bytes:
//     [0..3]  magic "SPEC"
//     [4]     version 0x01
//     [5]     flags: 0x01=full float32, 0x02=delta float32, 0x03=full uint8, 0x04=delta uint8
//     [6..13] timestamp uint64 LE (nanoseconds)
//     [14..21] frequency uint64 LE (Hz)
//   Body:
//     full:  binCount × float32 LE
//     delta: uint16 changeCount, then changeCount × {uint16 index, float32 value}
//   8-bit variants: same layout but values are uint8 (0..255 mapped to dBFS range)

import 'react-native-get-random-values'; // polyfill for crypto.getRandomValues
import { VibePowerModule } from '../components/AudioPlayer';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SDRMode = 'usb' | 'lsb' | 'am' | 'sam' | 'fm' | 'nfm' | 'cwu' | 'cwl';

export interface SDRStatus {
  frequency: number;    // Hz
  mode: SDRMode;
  bandwidthLow: number;  // Hz, negative = below carrier
  bandwidthHigh: number; // Hz, positive = above carrier
  binCount: number;
  binBandwidth: number;  // Hz per bin
  centerHz: number;      // center of spectrum display
  bwHz: number;          // total spectrum bandwidth
}

export interface SDRCallbacks {
  onSpectrum:   (bins: Float32Array, status: SDRStatus) => void;
  onStatus:     (status: SDRStatus) => void;
  onError:      (msg: string) => void;
  onConnect:    () => void;
  onDisconnect: () => void;
  onDbg?:       (msg: string) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SPEC_MAGIC    = 0x43455053; // "SPEC" in little-endian uint32
const FLAG_FULL_F32  = 0x01;
const FLAG_DELTA_F32 = 0x02;
const FLAG_FULL_U8   = 0x03;
const FLAG_DELTA_U8  = 0x04;

const U8_MIN_DBFS = -160;
const U8_MAX_DBFS = 0;

// ── Client class ──────────────────────────────────────────────────────────────

export class UberSDRClient {
  private baseUrl:   string;
  readonly uuid:     string; // shared with native audio WS
  private callbacks: SDRCallbacks;

  private spectrumWs:     WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  private bins: Float32Array = new Float32Array(1024);
  private status: SDRStatus = {
    frequency:     14_074_000,
    mode:          'usb',
    bandwidthLow:  -3000,
    bandwidthHigh:  3000,
    binCount:       1024,
    binBandwidth:   0,
    centerHz:       0,
    bwHz:           0,
  };

  constructor(baseUrl: string, uuid: string, callbacks: SDRCallbacks) {
    this.baseUrl   = baseUrl.replace(/\/+$/, '');
    this.uuid      = uuid;
    this.callbacks = callbacks;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async connect(frequency = 14_074_000, mode: SDRMode = 'usb') {
    this.destroyed = false;
    this.status.frequency = frequency;
    this.status.mode = mode;

    try {
      await this._checkConnection();
      // Native VibePowerModule opens the audio WS — give it 1s to register the
      // session on the server before the spectrum WS subscribes.
      setTimeout(() => {
        if (!this.destroyed) this._openSpectrumWs();
      }, 1000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.callbacks.onError('Connection check failed: ' + msg);
    }
  }

  /** Tune to a new frequency (and optionally mode). Sends to native audio WS + spectrum WS. */
  tune(frequency: number, mode?: SDRMode) {
    if (frequency) this.status.frequency = frequency;
    if (mode)      this.status.mode = mode;
    VibePowerModule?.sendTuneCommand(frequency, mode ?? this.status.mode);
    // Re-centre spectrum on new frequency so waterfall follows the VFO
    if (this.spectrumWs?.readyState === WebSocket.OPEN) {
      this.spectrumWs.send(JSON.stringify({
        type:         'zoom',
        frequency,
        binBandwidth: this.status.binBandwidth || 100,
      }));
    }
  }

  /** Update internal state only — used when native already sent the tune (e.g. lock screen skip). */
  syncFrequency(frequency: number, mode?: SDRMode) {
    if (frequency) this.status.frequency = frequency;
    if (mode)      this.status.mode = mode;
  }

  setMode(mode: SDRMode) {
    this.status.mode = mode;
    VibePowerModule?.sendTuneCommand(this.status.frequency, mode);
  }

  setBandwidth(low: number, high: number) {
    this.status.bandwidthLow  = low;
    this.status.bandwidthHigh = high;
    VibePowerModule?.sendBandwidth(low, high);
  }

  zoom(frequency: number, binBandwidth: number) {
    if (!this.spectrumWs || this.spectrumWs.readyState !== WebSocket.OPEN) return;
    this.spectrumWs.send(JSON.stringify({ type: 'zoom', frequency, binBandwidth }));
  }

  pan(frequency: number) {
    if (!this.spectrumWs || this.spectrumWs.readyState !== WebSocket.OPEN) return;
    this.spectrumWs.send(JSON.stringify({ type: 'pan', frequency }));
  }

  resetView() {
    if (!this.spectrumWs || this.spectrumWs.readyState !== WebSocket.OPEN) return;
    this.spectrumWs.send(JSON.stringify({ type: 'reset' }));
  }

  getStatus(): SDRStatus { return { ...this.status }; }

  /** Stop spectrum display (app backgrounded). Native audio continues unaffected. */
  pauseSpectrum() {
    this.spectrumWs?.close();
    this.spectrumWs = null;
  }

  /** Resume spectrum display (app foregrounded). */
  resumeSpectrum() {
    if (!this.destroyed && !this.spectrumWs) {
      this._openSpectrumWs();
    }
  }

  destroy() {
    this.destroyed = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.spectrumWs?.close();
    this.spectrumWs = null;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private dbg(msg: string) {
    console.warn('[UberSDR]', msg);
    this.callbacks.onDbg?.(msg);
  }

  private async _checkConnection() {
    this.dbg('POST /connection uuid=' + this.uuid.slice(0, 8));
    const resp = await fetch(`${this.baseUrl}/connection`, {
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'User-Agent':     'VibeSDR/2.0 (iOS; React Native)',
        'X-Requested-With': 'VibeSDR',
      },
      body: JSON.stringify({ user_session_id: this.uuid }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status}: ${text.slice(0, 120)}`);
    }
    const json = await resp.json() as { allowed: boolean; reason?: string };
    this.dbg(`/connection → allowed=${json.allowed} reason=${json.reason ?? 'ok'}`);
    if (!json.allowed) throw new Error(json.reason ?? 'Server rejected connection');
  }

  private _wsUrl(path: string): string {
    const url = this.baseUrl.replace(/^http/, 'ws');
    return `${url}${path}`;
  }

  private _openSpectrumWs() {
    if (this.destroyed) return;

    const url = this._wsUrl(`/ws/user-spectrum?user_session_id=${this.uuid}&mode=binary8`);
    const ws  = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    this.spectrumWs = ws;

    let specMsgCount = 0;
    ws.onopen = () => {
      if (this.destroyed) { ws.close(); return; }
      this.dbg('Spectrum WS open');
      this.callbacks.onConnect();
      ws.send(JSON.stringify({
        type:         'zoom',
        frequency:    this.status.centerHz || this.status.frequency,
        binBandwidth: this.status.binBandwidth || 100,
      }));
    };

    ws.onmessage = (e) => {
      specMsgCount++;
      if (specMsgCount <= 3) {
        this.dbg(`SpecMsg#${specMsgCount} binary=${e.data instanceof ArrayBuffer} len=${e.data instanceof ArrayBuffer ? e.data.byteLength : (e.data as string).length}`);
      }
      if (e.data instanceof ArrayBuffer) {
        this._parseBinaryFrame(e.data);
      } else if (typeof e.data === 'string') {
        try {
          const msg = JSON.parse(e.data) as Record<string, unknown>;
          this._handleSpectrumMessage(msg);
        } catch {}
      }
    };

    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
      else clearInterval(ping);
    }, 30_000);

    ws.onclose = (e) => {
      clearInterval(ping);
      this.dbg('Spectrum WS closed code=' + e.code);
      if (!this.destroyed) {
        this.callbacks.onDisconnect();
        this._scheduleReconnect();
      }
    };

    ws.onerror = () => this.callbacks.onError('Spectrum WebSocket error');
  }

  private _parseBinaryFrame(buf: ArrayBuffer) {
    const view  = new DataView(buf);
    const bytes = new Uint8Array(buf);

    if (buf.byteLength < 22) { this.dbg('frame too short: ' + buf.byteLength); return; }

    const magic = view.getUint32(0, true);
    if (magic !== SPEC_MAGIC) {
      this.dbg('bad magic: 0x' + magic.toString(16) + ' expected 0x' + SPEC_MAGIC.toString(16) +
        ' bytes=' + Array.from(bytes.slice(0,4)).map(b=>b.toString(16)).join(','));
      return;
    }

    const flags     = bytes[5];
    const freqLo    = view.getUint32(14, true);
    const freqHi    = view.getUint32(18, true);
    const frequency = freqLo + freqHi * 0x100000000;

    const body = buf.slice(22);

    if (flags === FLAG_FULL_F32)  { this._applyFull(new Float32Array(body), frequency); }
    else if (flags === FLAG_DELTA_F32) { this._applyDeltaF32(body, frequency); }
    else if (flags === FLAG_FULL_U8)   { this._applyFullU8(new Uint8Array(body), frequency); }
    else if (flags === FLAG_DELTA_U8)  { this._applyDeltaU8(body, frequency); }
  }

  private _applyFull(floats: Float32Array, frequency: number) {
    if (floats.length !== this.bins.length) {
      this.bins = new Float32Array(floats.length);
      this.status.binCount = floats.length;
    }
    this.bins.set(floats);
    this._emitSpectrum(frequency);
  }

  private _applyDeltaF32(body: ArrayBuffer, frequency: number) {
    const view = new DataView(body);
    if (body.byteLength < 2) return;
    const changeCount = view.getUint16(0, true);
    let offset = 2;
    for (let i = 0; i < changeCount; i++) {
      if (offset + 6 > body.byteLength) break;
      const idx = view.getUint16(offset, true);
      const val = view.getFloat32(offset + 2, true);
      offset += 6;
      if (idx < this.bins.length) this.bins[idx] = val;
    }
    this._emitSpectrum(frequency);
  }

  private _applyFullU8(u8: Uint8Array, frequency: number) {
    if (u8.length !== this.bins.length) {
      this.bins = new Float32Array(u8.length);
      this.status.binCount = u8.length;
    }
    const scale = (U8_MAX_DBFS - U8_MIN_DBFS) / 255;
    for (let i = 0; i < u8.length; i++) {
      this.bins[i] = U8_MIN_DBFS + u8[i] * scale;
    }
    this._emitSpectrum(frequency);
  }

  private _applyDeltaU8(body: ArrayBuffer, frequency: number) {
    const view  = new DataView(body);
    if (body.byteLength < 2) return;
    const changeCount = view.getUint16(0, true);
    const scale = (U8_MAX_DBFS - U8_MIN_DBFS) / 255;
    let offset = 2;
    for (let i = 0; i < changeCount; i++) {
      if (offset + 3 > body.byteLength) break;
      const idx = view.getUint16(offset, true);
      const val = view.getUint8(offset + 2);
      offset += 3;
      if (idx < this.bins.length) this.bins[idx] = U8_MIN_DBFS + val * scale;
    }
    this._emitSpectrum(frequency);
  }

  private _emitSpectrum(frequency: number) {
    const s = this.status;
    s.centerHz = frequency;
    s.bwHz     = s.binBandwidth * s.binCount;
    this.callbacks.onSpectrum(this.bins, { ...s });
  }

  private _handleSpectrumMessage(msg: Record<string, unknown>) {
    if (msg.type === 'status') {
      if (typeof msg.frequency    === 'number') this.status.centerHz     = msg.frequency;
      if (typeof msg.binBandwidth === 'number') this.status.binBandwidth = msg.binBandwidth;
      if (typeof msg.binCount     === 'number') {
        this.status.binCount = msg.binCount;
        if (this.bins.length !== msg.binCount) this.bins = new Float32Array(msg.binCount);
      }
      this.status.bwHz = this.status.binBandwidth * this.status.binCount;
      this.callbacks.onStatus({ ...this.status });
    }
  }

  private _scheduleReconnect() {
    if (this.destroyed) return;
    this.reconnectTimer = setTimeout(() => {
      if (!this.destroyed) this._openSpectrumWs();
    }, 3000);
  }
}
