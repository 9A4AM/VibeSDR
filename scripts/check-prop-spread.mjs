#!/usr/bin/env node
// ★★★ A COMPONENT THAT DESTRUCTURES A PROP IT IS NEVER PASSED IS A DEAD FEATURE, AND IT IS SILENT.
//
// ControlsBar takes `sharedDial`, PortraitBar and LandscapeBar both destructure it, and nothing carried it
// across the `shared` object between them — so the shared-tuner banner could not draw on any phone, tablet or
// Mac from the day it was written (Stuart, 2026-09-20: "no shared dial notification above the frequency").
// Four more props were dead the same way: the bar's session clock, the lightning badge, read-only and admin.
// With `: any` on the parameter lists nothing complained, and in landscape it did not even fail quietly — it
// threw and bounced the app to the server list.
//
// This checks the shape those bugs share: a sub-component of a file destructures a name, uses it, and the
// object spread into it has no such key.
//
//   node scripts/check-prop-spread.mjs
import { readFileSync } from 'node:fs';

/** Files with a "build one object, spread it into several layout components" shape. */
const TARGETS = [
  { file: 'src/components/ControlsBar.tsx', spread: 'shared', parts: ['PortraitBar', 'LandscapeBar'] },
];

let bad = 0;
for (const t of TARGETS) {
  const src = readFileSync(t.file, 'utf8');
  const m = src.match(new RegExp('const ' + t.spread + ' = \\{([\\s\\S]*?)\\n  \\};'));
  if (!m) { console.error(`${t.file}: could not find the \`${t.spread}\` object — has it been renamed?`); bad = 1; continue; }
  const obj = m[1];
  // A key is `name,` or `name: value` — anywhere in the object, not only at the start of a line.
  const has = (n) => new RegExp('(^|[,{\\s])' + n + '\\s*[,:]').test(obj);
  for (const part of t.parts) {
    const i = src.indexOf('function ' + part + '(');
    if (i < 0) { console.error(`${t.file}: no component ${part}`); bad = 1; continue; }
    const headEnd = src.indexOf('}: any)', i);
    // ★ Comments first: a note INSIDE the parameter list (there is one) is prose, not a prop, and a checker
    //   that reports a word from its own documentation is a checker people learn to ignore.
    const head = src.slice(i, headEnd).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
    const next = src.indexOf('\nfunction ', headEnd);
    const body = src.slice(headEnd, next > 0 ? next : src.length);
    // Declared names, minus defaults (`fmStereo = false` declares fmStereo, not false).
    const declared = [...head.matchAll(/([a-zA-Z_]\w*)(?=\s*[,=}])/g)].map((x) => x[1])
      .filter((n) => /^[a-z]/.test(n) && !/^(any|false|true|null|undefined)$/.test(n));
    const defaults = new Set([...head.matchAll(/=\s*([a-zA-Z_]\w*)/g)].map((x) => x[1]));
    const missing = declared.filter((d) => !defaults.has(d) && !has(d)
      && new RegExp('[^\\w."\']' + d + '\\b').test(body));
    if (missing.length) {
      console.error(`${t.file}: ${part} uses props that ${t.spread} never passes — ${missing.join(', ')}`);
      bad = 1;
    } else {
      console.log(`${t.file}: ${part} — every prop it uses is passed`);
    }
  }
}
process.exit(bad);
