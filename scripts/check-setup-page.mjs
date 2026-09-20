#!/usr/bin/env node
// ★★★ EVERY id THE SETUP PAGE'S SCRIPT TOUCHES MUST EXIST IN ITS HTML.
//
// The progress bar shipped with its script complete and its markup missing: $("benchBarWrap") was null, the
// helper returned quietly, and the page ran a two-minute measurement showing nothing. Nothing failed, nothing
// logged — the "written and never read" shape from AGENTS.md, in a page no compiler checks.
//
//   node scripts/check-setup-page.mjs
import { readFileSync } from 'node:fs';

const src = readFileSync('android/app/src/main/cpp/vibe_setup_page.h', 'utf8');
const html = src.split('R"HTML(')[1].split(')HTML"')[0];
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
// ★ Comments first: a note that MENTIONS $("mode") is not a use of it, and the point of this check is to be
//   believed — one false alarm and the next real one gets waved through.
const code = html.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
// Ids the page creates at runtime (innerHTML) are found the same way, so they count as present.
const wanted = new Map();
for (const m of code.matchAll(/\$\("([^"]+)"\)|getElementById\("([^"]+)"\)/g)) {
  const id = m[1] || m[2];
  if (!wanted.has(id)) wanted.set(id, (code.slice(0, m.index).match(/\n/g) || []).length + 1);
}
/* ★ An element the page CHECKS FOR is optional by design — `if ($("gain"))` is a radio that may not have that
 *  control. Only an unguarded use is a promise that the markup exists. */
const guarded = new Set([...code.matchAll(/(?:if\s*\(\s*|&&\s*|\|\|\s*|\?\s*)\$\("([^"]+)"\)|\$\("([^"]+)"\)\s*(?:\?\.|&&|\?)/g)]
  .map(m => m[1] || m[2]));
const missing = [...wanted].filter(([id]) => !ids.has(id) && !guarded.has(id));
if (!missing.length) {
  console.log(`setup page: ${wanted.size} ids referenced, all present in the markup`);
  process.exit(0);
}
console.error('setup page: the script touches ids that do not exist in the HTML:');
for (const [id, line] of missing) console.error(`  #${id}  (first used about line ${line} of the page)`);
process.exit(1);
