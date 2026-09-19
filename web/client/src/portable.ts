/**
 * ★★★ PORTABLE VIEW SETTINGS AND BOOKMARKS across every *.vibeserver.vibesdr.net server (Stuart, 2026-09-19:
 *     "every new server that comes online I have to set Sonar Green 40% spectrum 5 brightness 5 sharpness
 *     ... colour to orange").
 *
 * THREE LAYERS, highest first:
 *   1. OVERRIDE — this server's own storage (LS_PREFS in main.ts). A server's vanity address never changes,
 *      so its origin's storage is a stable per-server place, and display tweaks already save there.
 *   2. MASTER  — one store in the DIRECTORY's origin (vibeserver.vibesdr.net), reached through a hidden
 *      iframe (/store.html) by postMessage. A page cannot read another origin's storage directly; every
 *      *.vibeserver.vibesdr.net address is one SITE, so the browser's storage partitioning keeps that one
 *      store shared between them. "Save view settings for all" writes it.
 *   3. The built-in defaults.
 *
 * ★ Nothing here leaves the browser: no cookie, nothing sent with a request, nothing stored by us. Only VIEW
 *   settings travel — never gain, hardware, where you were tuned, or any credential.
 * ★ RESET lives on the directory page. It clears MASTER and stamps a reset time; a server page that loads
 *   with overrides older than that stamp drops them, so a reset reaches every server, not just the master.
 * ★ Only on *.vibeserver.vibesdr.net. A LAN, port-forwarded or raw tunnel address behaves exactly as before.
 */

/** The settings that travel — what the Display menu's Reset already groups, plus the VFO look and a few
 *  personal ones. Hardware, tuning, squelch, DAB block and the like stay with the radio. */
export const VIEW_KEYS = [
  'palette', 'autoContrast', 'minDb', 'maxDb', 'wfBrightness', 'wfContrast', 'wfSharpness', 'wfCoarse',
  'wfSpeed', 'wfScroll', 'smoothingFrames', 'spatialSmooth', 'peakHold', 'specFloor', 'specPeakScale',
  'specAlpha', 'specRatio', 'specShow', 'vfoColor', 'vfoIntensity', 'vfoFrost', 'freqUnit', 'volume',
] as const;

const DIRECTORY = 'https://vibeserver.vibesdr.net';
const EPOCH_KEY = 'vsPortableEpoch';          // this origin's copy of the last reset it has honoured

export interface Portable { view: Record<string, unknown>; bookmarks: unknown[] | null; resetAt: number }
let master: Portable = { view: {}, bookmarks: null, resetAt: 0 };
/** ★ Decided ONCE, when the store loads, before anything can write the epoch: was the directory reset since
 *  this origin last looked? Settings (honourReset) and bookmarks (search.ts) both act on this one answer —
 *  deciding it twice raced, and the second reader saw the epoch the first had already written. */
let resetPending = false;
let frame: HTMLIFrameElement | null = null;
let ready: Promise<boolean> | null = null;
let seq = 0;
const waiting = new Map<number, (v: any) => void>();

export function onVibeDomain(): boolean {
  const h = location.hostname;
  return h.endsWith('.vibeserver.vibesdr.net') && location.protocol === 'https:';
}

function ask(msg: Record<string, unknown>, timeoutMs = 1500): Promise<any> {
  return new Promise((resolve) => {
    if (!frame?.contentWindow) return resolve(null);
    const id = ++seq;
    const t = setTimeout(() => { waiting.delete(id); resolve(null); }, timeoutMs);
    waiting.set(id, (v) => { clearTimeout(t); resolve(v); });
    frame.contentWindow.postMessage({ ...msg, id }, DIRECTORY);
  });
}

/** Load MASTER once. Resolves false (and changes nothing) off the VibeSDR domain, or if the store does not
 *  answer in time — a blocked or slow store must never hold up the radio. */
export function portableReady(): Promise<boolean> {
  if (ready) return ready;
  ready = (async () => {
    if (!onVibeDomain()) return false;
    window.addEventListener('message', (e) => {
      if (e.origin !== DIRECTORY || !e.data || typeof e.data.id !== 'number') return;
      const cb = waiting.get(e.data.id); if (cb) { waiting.delete(e.data.id); cb(e.data); }
    });
    frame = document.createElement('iframe');
    frame.src = `${DIRECTORY}/store`;   // ★ the assets binding serves store.html here (a .html path 307s to it)
    frame.style.display = 'none';
    frame.setAttribute('aria-hidden', 'true');
    const loaded = new Promise<void>((r) => { frame!.onload = () => r(); });
    document.body.appendChild(frame);
    await Promise.race([loaded, new Promise((r) => setTimeout(r, 2000))]);
    const got = await ask({ op: 'get' });
    if (!got || !got.data) return false;
    master = { view: got.data.view || {}, bookmarks: got.data.bookmarks ?? null, resetAt: Number(got.data.resetAt) || 0 };
    let seen = 0;
    try { seen = Number(localStorage.getItem(EPOCH_KEY)) || 0; } catch { /* private mode */ }
    resetPending = master.resetAt > seen;
    if (resetPending) try { localStorage.setItem(EPOCH_KEY, String(master.resetAt)); } catch { /* private mode */ }
    return true;
  })();
  return ready;
}

/** MASTER's view settings, for prefs() to lay under this server's own. */
export function masterView(): Record<string, unknown> { return master.view; }
export function masterBookmarks(): unknown[] | null { return master.bookmarks; }

/** Drop this server's overrides if the directory was reset since this origin last looked. Returns true if
 *  anything was dropped. `local` is this origin's prefs object; the caller writes it back. */
export function honourReset(local: Record<string, unknown>): boolean {
  if (!resetPending) return false;
  let dropped = false;
  for (const k of VIEW_KEYS) if (k in local) { delete local[k]; dropped = true; }
  return dropped;
}
/** Whether the directory was reset since this server's page last looked — bookmarks honour it too. */
export function portableWasReset(): boolean { return resetPending; }

/** "Save view settings for all VibeSDR.net servers": the given values become MASTER. */
export async function saveViewForAll(values: Record<string, unknown>): Promise<boolean> {
  const view: Record<string, unknown> = {};
  for (const k of VIEW_KEYS) if (values[k] !== undefined) view[k] = values[k];
  const r = await ask({ op: 'setView', view });
  if (r?.ok) master.view = view;
  return !!r?.ok;
}

/** Keep the portable bookmark list in step with this page's own. */
export async function saveBookmarks(list: unknown[]): Promise<void> {
  if (!frame) return;
  const r = await ask({ op: 'setBookmarks', bookmarks: list });
  if (r?.ok) master.bookmarks = list;
}
