/**
 * The backend factory — one arm per server type, each its own codebase (2026-09-22).
 * ★ Moved out of UberSDRAdapter.ts, where it made the UberSDR file import every other backend.
 */
import type { SDRBackend, BackendCallbacks, BackendKind } from './SDRBackend';
import { UberSDRAdapter } from './UberSDRAdapter';
import { VibeServerAdapter } from './VibeServerAdapter';
import { OwrxAdapter } from './OwrxAdapter';
import { KiwiAdapter } from './KiwiAdapter';
import { FmdxAdapter } from './FmdxAdapter';

export function createBackend(
  kind: BackendKind,
  baseUrl: string,
  uuid: string,
  callbacks: BackendCallbacks,
  password?: string,
  local = false,
): SDRBackend {
  switch (kind) {
    case 'ubersdr': return new UberSDRAdapter(baseUrl, uuid, callbacks, password, local);
    /* ★★★ THE CASE THAT WAS NEVER HERE. 'vibeserver' has existed as a serverType in the directory
     *  layer for a year, but this switch had no arm for it — so it fell through to the default and
     *  threw, which is why the app shipped repairVibeserverFavourites() to DELETE the type as
     *  "corruption" rather than handle it. Five separate workarounds grew out of that one gap:
     *  the UberSDR logo on VibeServers, UberSDR admin links that 404, the watch's autoVibe detour,
     *  the favourites repair, and the link-ladder race. */
    case 'vibeserver': return new VibeServerAdapter(baseUrl, uuid, callbacks, password, local);
    case 'owrx':    return new OwrxAdapter(baseUrl, uuid, callbacks);
    // Same adapter for both Kiwi dialects — only the WebSocket path differs, and it self-corrects
    // if the guess was wrong (KiwiAdapter.tryOtherWsPrefix).
    case 'kiwi':    return new KiwiAdapter(baseUrl, uuid, callbacks, password, 'kiwi');
    case 'web888':  return new KiwiAdapter(baseUrl, uuid, callbacks, password, 'web888');
    case 'fmdx':    return new FmdxAdapter(baseUrl, uuid, callbacks);
    default: throw new Error(`backend '${kind}' not implemented`);
  }
}
