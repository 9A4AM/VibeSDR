// Dead-session release check (docs/PROTOCOL.md §Liveness) — NOT a fixture. Opens a proto=1
// spectrum socket that sends nothing and expects the server to close it in ~30–40 s; then one
// that pings every 10 s and expects it to survive 50 s. Usage: node liveness-check.mjs http://host:port
const base = process.argv[2]; if (!base) { console.error('usage: node liveness-check.mjs http://host:port'); process.exit(2); }
const ws = base.replace(/^http/, 'ws');
const sid = () => Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
function run(label, ping, secs) {
  return new Promise((res) => {
    const s = new WebSocket(`${ws}/ws/user-spectrum?user_session_id=${sid()}&mode=binary8&bins=128&proto=1&client=liveness-check`);
    const t0 = Date.now(); let timer;
    s.onopen = () => { if (ping) timer = setInterval(() => s.send(JSON.stringify({ type: 'ping' })), 10000); };
    s.onclose = () => { clearInterval(timer); res({ label, closedAfter: (Date.now() - t0) / 1000 }); };
    s.onerror = () => {};
    setTimeout(() => { clearInterval(timer); const alive = s.readyState === 1; s.close(); res({ label, closedAfter: alive ? null : (Date.now() - t0) / 1000 }); }, secs * 1000);
  });
}
const silent = await run('silent proto=1', false, 45);
console.log(silent.closedAfter === null ? `FAIL silent client survived 45 s` : `ok   silent client released after ${silent.closedAfter.toFixed(0)} s`);
const pinging = await run('pinging proto=1', true, 50);
console.log(pinging.closedAfter === null ? `ok   pinging client alive at 50 s` : `FAIL pinging client dropped after ${pinging.closedAfter.toFixed(0)} s`);
process.exit((silent.closedAfter !== null && silent.closedAfter <= 40 && pinging.closedAfter === null) ? 0 : 1);
