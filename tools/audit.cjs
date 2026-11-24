// Slop audit: counts the defaults in the UI sources so a redesign is measured, not felt.
// usage: node tools/audit.cjs            (prints one line per pattern, and the glyph icons with line numbers)
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'src');
const read = (f) => fs.readFileSync(path.join(src, f), 'utf8');
const css = read('app.css');
const count = (re) => (css.match(re) || []).length;
const rows = [
  ['glows (0 0 Npx shadows)', count(/box-shadow:\s*0 0 \d+px/g)],
  ['gradients', count(/(radial|linear)-gradient/g)],
  ['glass (backdrop-filter)', count(/backdrop-filter/g)],
  ['pill radii (999px / 50%)', count(/999px|border-radius:\s*50%/g)],
  ['one-sided stripes', count(/border-left:\s*\d+px solid|inset \d+px 0 0/g)],
  ['infinite animations', count(/infinite/g)],
  ['box-shadows', count(/box-shadow/g)],
  ['uppercase labels', count(/text-transform:\s*uppercase/g)],
  ['display serif', count(/Georgia|Times New Roman/g)],
  ['css lines', css.split('\n').length],
];
for (const [k, v] of rows) console.log(k.padEnd(28), v);
// glyphs standing in for icons (arrows, shapes, stars, emoji, middle dots) in the chrome
const glyph = /[←-⇿⌀-⏿①-➿⬀-⯿·•★☀☾◐▸▾]|[\u{1F000}-\u{1FAFF}]|\\u\{1F[0-9A-Fa-f]{3}\}|\\u2[0-9A-Fa-f]{3}|&#\d{4,6};/gu;
let n = 0;
for (const f of ['app.html', 'app.js', 'app.css']) {
  read(f).split('\n').forEach((l, i) => {
    const m = l.match(glyph);
    if (m) { n += m.length; console.log('  glyph', f + ':' + (i + 1), [...new Set(m)].join(' ')); }
  });
}
console.log('glyph icons'.padEnd(28), n);
