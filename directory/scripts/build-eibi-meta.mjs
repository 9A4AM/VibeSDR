// build-eibi-meta.mjs — turn EiBi's README (transmitter sites, country codes, target areas) into
// public/eibi-meta.json for the directory's "what's on" search and receiver ranking.
//   node scripts/build-eibi-meta.mjs [path/to/README.TXT]
// The README is ISO-8859-1. Sites: "ITU: code-Name lat-lon" lines in section IV, coordinates as
// 55N03-131W34 or 26S07'40"-28E12'20". A line with no code before the name is the country's
// default (major) site. Countries without a listed site fall back to a centroid from
// public/country-shapes.json via the README's country name → ISO code (Intl.DisplayNames).
import fs from 'node:fs';
const src = process.argv[2] || new URL('./eibi-readme.txt', import.meta.url).pathname;
const txt = fs.readFileSync(src, 'latin1').split(/\r?\n/);
const sec = (title) => txt.findLastIndex((l) => l.trim().startsWith(title));   // the LAST match — the table of contents lists the same titles first
const coord = (s) => {
  const m = s.match(/(\d{2})([NS])(\d{2})(?:'(\d{2})")?-(\d{2,3})([EW])(\d{2})(?:'(\d{2})")?/);   // longitude is written with 2 or 3 digits
  if (!m) return null;
  const lat = (+m[1] + (+m[3]) / 60 + (m[4] ? +m[4] / 3600 : 0)) * (m[2] === 'S' ? -1 : 1);
  const lon = (+m[5] + (+m[7]) / 60 + (m[8] ? +m[8] / 3600 : 0)) * (m[6] === 'W' ? -1 : 1);
  return [+lat.toFixed(3), +lon.toFixed(3)];
};
// ── IV) transmitter sites ──
const sites = {}; let itu = null;
for (let i = sec('IV) Transmitter site codes'); i < txt.length; i++) {
  const l = txt[i]; if (!l.trim()) continue;
  const head = l.match(/^\s{3}([A-Z]{1,3}):\s*(.*)$/);
  let body = l.trim();
  if (head) { itu = head[1]; sites[itu] = sites[itu] || {}; body = head[2].trim(); }
  else if (!itu || !/^\s{6,}/.test(l)) continue;
  const c = coord(body); if (!c) continue;
  const m = body.match(/^([A-Za-z0-9]{1,3})-(.+?)\s+\d{2}[NS]/);
  const code = m ? m[1] : '';
  const name = (m ? m[2] : body.replace(/\s*\d{2}[NS].*$/, '').replace(/\s*except:?$/, '')).replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  sites[itu][code] = [c[0], c[1], name];   // code '' = the country's major site, written without a code ("AFS: Meyerton … except:")
}
// ── II) countries → ISO → centroid ──
const shapes = JSON.parse(fs.readFileSync(new URL('../public/country-shapes.json', import.meta.url), 'utf8'));
const centroid = (iso) => { const polys = shapes[iso]; if (!polys) return null; let n = 0, la = 0, lo = 0;
  for (const p of polys) for (const [x, y] of p) { lo += x; la += y; n++; } return n ? [+(la / n).toFixed(2), +(lo / n).toFixed(2)] : null; };
const dn = new Intl.DisplayNames(['en'], { type: 'region' });
const isoByName = new Map();
for (const iso of Object.keys(shapes)) { try { isoByName.set(dn.of(iso).toLowerCase(), iso); } catch {} }
const alias = { 'united kingdom of great britain and northern ireland': 'GB', 'the netherlands': 'NL', 'brasil': 'BR', 'bangla desh': 'BD', 'bosnia-herzegovina': 'BA', 'brunei darussalam': 'BN', 'cape verde islands': 'CV', 'canary islands': 'ES', 'democratic republic of congo': 'CD', 'republic of congo': 'CG', 'federated states of micronesia': 'FM', 'comores': 'KM', 'cook island': 'CK', 'faroe islands': 'FO', 'alaska': 'US', 'hawaii': 'US', 'azores': 'PT', 'madeira': 'PT', 'balearic islands': 'ES', 'ceuta': 'ES', 'cabinda': 'AO', 'kosovo': 'XK', 'sao tome & principe': 'ST', 'saint kitts & nevis': 'KN', 'saint lucia': 'LC', 'saint vincent & the grenadines': 'VC', 'trinidad & tobago': 'TT', 'antigua and barbuda': 'AG', 'united arab emirates': 'AE', 'the gambia': 'GM', 'gambia': 'GM', 'kyrgyzstan': 'KG', 'kirghizia': 'KG', 'slovak republic': 'SK', 'slovakia': 'SK', 'south sudan': 'SS', 'sudan': 'SD', 'ireland': 'IE', 'malta': 'MT', 'cyprus': 'CY', 'philippines': 'PH', 'the philippines': 'PH', 'sri lanka': 'LK', 'papua new guinea': 'PG', 'solomon islands': 'SB', 'new zealand': 'NZ', 'united kingdom': 'GB', 'kazakstan / kazakhstan': 'KZ', 'tchad': 'TD', 'french guyana': 'GF', 'la réunion': 'RE', 'la reunion': 'RE', 'macao': 'MO', 'trinidad and tobago': 'TT', 'st kitts and nevis': 'KN', 'saint vincent and the grenadines': 'VC', 'kaliningrad': 'RU', 'saint helena': 'SH', 'saint pierre et miquelon': 'PM', 'usa': 'US', 'united states of america': 'US', 'russia': 'RU', 'russian federation': 'RU', 'south korea': 'KR', 'north korea': 'KP', 'korea, south': 'KR', 'korea, north': 'KP', 'czech republic': 'CZ', 'czechia': 'CZ', 'netherlands': 'NL', 'holland': 'NL', 'iran': 'IR', 'syria': 'SY', 'vietnam': 'VN', 'laos': 'LA', 'moldova': 'MD', 'macedonia': 'MK', 'north macedonia': 'MK', 'bolivia': 'BO', 'venezuela': 'VE', 'tanzania': 'TZ', 'dr congo': 'CD', 'congo (dem. rep.)': 'CD', 'congo': 'CG', 'ivory coast': 'CI', "cote d'ivoire": 'CI', 'taiwan': 'TW', 'brunei': 'BN', 'vatican': 'VA', 'vatican state': 'VA', 'palestine': 'PS', 'east timor': 'TL', 'swaziland': 'SZ', 'eswatini': 'SZ', 'burma': 'MM', 'myanmar': 'MM', 'cape verde': 'CV', 'micronesia': 'FM', 'turkey': 'TR', 'türkiye': 'TR' };
const countries = {}; const ituName = {};
for (let i = sec('II) Country codes') + 1; i < sec('III) Target-area codes'); i++) {
  const m = txt[i].match(/^\s{3}([A-Z]{1,3})\*?\s{2,}(.+?)\s*$/); if (!m) continue;
  const code = m[1], name = m[2]; ituName[code] = name;
  const key = name.toLowerCase().replace(/\s*\(.*?\)/g, '').replace(/\s*\*$/, '').trim();
  const iso = alias[key] || isoByName.get(key) || isoByName.get(key.split(',')[0]) || null;
  const c = iso ? centroid(iso) : null;
  if (iso) countries[code] = { iso, name, c };
  else countries[code] = { name };
}
// ── III) target areas: code → description ──
const targets = {};
for (let i = sec('III) Target-area codes') + 1; i < sec('IV) Transmitter site codes'); i++) {
  const m = txt[i].match(/^\s{3}(\S+)\s+-\s+(.+?)\s*$/); if (m) targets[m[1]] = m[2];
}
const out = { generated: new Date().toISOString().slice(0, 10), sites, countries, targets };
fs.writeFileSync(new URL('../public/eibi-meta.json', import.meta.url), JSON.stringify(out));
const nSites = Object.values(sites).reduce((a, s) => a + Object.keys(s).filter((k) => k).length, 0);
const withIso = Object.values(countries).filter((c) => c.iso).length, withC = Object.values(countries).filter((c) => c.c).length;
console.log(`sites: ${Object.keys(sites).length} countries, ${nSites} named sites · countries: ${Object.keys(countries).length} (${withIso} mapped to ISO, ${withC} with a centroid) · targets: ${Object.keys(targets).length}`);
fs.writeFileSync(new URL('./eibi-unmapped.txt', import.meta.url), Object.entries(countries).filter(([, c]) => !c.iso).map(([k, c]) => `${k}=${c.name}`).join('\n') + '\n');
console.log('unmapped list written to scripts/eibi-unmapped.txt');
