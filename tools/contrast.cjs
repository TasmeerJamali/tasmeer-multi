// WCAG contrast ratios for the colour tokens, so every pairing in DESIGN.md has a measured number.
// usage: node tools/contrast.cjs
const hex = (h) => h.replace('#', '').match(/../g).map((x) => parseInt(x, 16) / 255);
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const L = (h) => { const [r, g, b] = hex(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const themes = {
  dark: {
    bg: '#070709', side: '#111114', raise: '#15151a', bubble: '#131317', sel: '#1f1f24',
    fg: '#ececf1', fg2: '#a1a1ab', fg3: '#84848f', done: '#3fb950', warn: '#d29922', err: '#f0605a',
    claude: '#d97757', codex: '#a8a4f8', gemini: '#5aa9e6', ink: '#0b0b0d', invert: '#ffffff', invertFg: '#070709',
  },
  light: {
    bg: '#fcfcfb', side: '#f5f5f3', raise: '#ffffff', bubble: '#f1f1ef', sel: '#e8e8e5',
    fg: '#1a1a1e', fg2: '#55555f', fg3: '#6b6b75', done: '#1a7f37', warn: '#8f5f00', err: '#cf222e',
    claude: '#b8502f', codex: '#5b54d6', gemini: '#1f6fb2', ink: '#ffffff', invert: '#1a1a1e', invertFg: '#ffffff',
  },
};
const pairs = [
  ['fg', 'bg'], ['fg', 'side'], ['fg', 'raise'], ['fg', 'bubble'], ['fg', 'sel'],
  ['fg2', 'bg'], ['fg2', 'side'], ['fg2', 'raise'], ['fg2', 'sel'],
  ['fg3', 'bg'], ['fg3', 'side'], ['fg3', 'raise'],
  ['done', 'side'], ['warn', 'side'], ['err', 'bg'], ['err', 'raise'],
  ['claude', 'side'], ['codex', 'side'], ['gemini', 'side'],
  ['ink', 'claude'], ['ink', 'codex'], ['ink', 'gemini'], ['invertFg', 'invert'],
];
for (const [name, t] of Object.entries(themes)) {
  console.log(`== ${name}`);
  for (const [a, b] of pairs) {
    const r = ratio(t[a], t[b]);
    console.log(`  ${a.padEnd(8)} on ${b.padEnd(7)} ${t[a]} / ${t[b]}  ${r.toFixed(2)}:1 ${r >= 4.5 ? 'AA' : r >= 3 ? 'large/UI only' : 'FAIL'}`);
  }
}
