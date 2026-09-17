#!/usr/bin/env node
// scripts/compat/legacy-10.3.1.mjs — the App Store app's (10.3.1, tree f8ae8fa1) exact VibeServer
// handshake, replayed against a server. BRIEF-v11-compatibility §8: a fixture per shipped client,
// captured from what that client sends — never edited to match today's code.
//
//   node scripts/compat/legacy-10.3.1.mjs http://host:port
//
// What 10.3.1 does (InstancePickerScreen.connectVibeServer → UberSDRClient.connect):
//   1. GET  /vibeserver.json                       (sdrTypes.ts:83)          — expects {"server":"vibeserver"}
//   2. GET  /vibeserver/auth                       (vibeAuth.ts:94)          — {"required":false} on an open server
//   3. POST /connection?user_session_id=<id>       (UberSDRClient.ts:810)    — body user_session_id=<id>
//   4. WS   /ws/user-spectrum?user_session_id=<id>&mode=binary8              — a SPEC frame within 5 s
//   5. WS   /ws/audio?user_session_id=<id>&codec=opus                        — an audio frame within 5 s
// It knows only host:port — NO /r/<id>/ prefix, ever (parseHostPort strips paths) — and no proto.
// Pass = every step answered as that client expects. A 503 at the door, or a 1006 upgrade, is the
// 2026-09-17 break (xavxx) and must never come back.
const base = (process.argv[2] || '').replace(/\/+$/, '');
if (!base) { console.error('usage: legacy-10.3.1.mjs http://host:port'); process.exit(2); }
const wsBase = base.replace(/^http/, 'ws');
const sid = 'legacy-' + Math.random().toString(16).slice(2, 10);
let fails = 0;
const ok = (c, m) => { console.log(`  [${c ? 'PASS' : 'FAIL'}] ${m}`); if (!c) fails++; };
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error(`${what}: no answer in ${ms} ms`)), ms))]);
async function step(name, fn) { try { await fn(); } catch (e) { ok(false, `${name}: ${e.message}`); } }

console.log(`legacy 10.3.1 fixture against ${base} (session ${sid})`);
await step('vibeserver.json', async () => {
  const r = await withTimeout(fetch(`${base}/vibeserver.json`), 5000, 'vibeserver.json');
  const j = await r.json();
  ok(r.status === 200 && j.server === 'vibeserver', `GET /vibeserver.json → ${r.status}, server=${j.server}, version=${j.version}`);
});
await step('auth', async () => {
  const r = await withTimeout(fetch(`${base}/vibeserver/auth`), 5000, 'auth');
  const j = await r.json().catch(() => ({}));
  ok(r.status === 200, `GET /vibeserver/auth → ${r.status}, required=${j.required}`);
  if (j.required) console.log('  note: PIN-protected — 10.3.1 cannot pass a front door with a PIN (nonce minted in the wrong process)');
});
await step('connection', async () => {
  const r = await withTimeout(fetch(`${base}/connection?user_session_id=${sid}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `user_session_id=${sid}` }), 5000, 'connection');
  const t = await r.text();
  ok(r.status === 200, `POST /connection → ${r.status} ${t.slice(0, 80).replace(/\s+/g, ' ')}`);
});
function wsFrames(url, what) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url); ws.binaryType = 'arraybuffer';
    let frames = 0, bytes = 0; const t0 = Date.now();
    const done = () => { try { ws.close(); } catch {} resolve({ frames, bytes, ms: Date.now() - t0 }); };
    ws.onmessage = (e) => { if (e.data instanceof ArrayBuffer) { frames++; bytes += e.data.byteLength; if (frames >= 3) done(); } };
    ws.onerror = () => reject(new Error(`${what}: socket error (a 503 at the door reaches a client as a bare 1006)`));
    ws.onclose = (e) => { if (!frames) reject(new Error(`${what}: closed ${e.code} before any frame`)); };
    setTimeout(done, 6000);
  });
}
await step('spectrum', async () => {
  const r = await wsFrames(`${wsBase}/ws/user-spectrum?user_session_id=${sid}&mode=binary8`, 'spectrum');
  ok(r.frames >= 1, `WS /ws/user-spectrum → ${r.frames} binary frames, ${r.bytes} bytes in ${r.ms} ms`);
});
await step('audio', async () => {
  const r = await wsFrames(`${wsBase}/ws/audio?user_session_id=${sid}&codec=opus`, 'audio');
  ok(r.frames >= 1, `WS /ws/audio → ${r.frames} frames, ${r.bytes} bytes in ${r.ms} ms`);
});
console.log(fails ? `\n${fails} FAILURE(S) — a 10.3.1 user cannot use this server` : '\nALL PASS — 10.3.1 gets the core experience here');
process.exit(fails ? 1 : 0);
