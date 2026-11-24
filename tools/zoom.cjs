// Enlarge one small region across a run of recorded frames, to read a tiny motion (a ring, a dot).
// usage: npx electron tools/zoom.cjs <frames dir> <first> <last> <x> <y> <w> <h> <scale> <out.png> [every]
const { app, BrowserWindow, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const args = process.argv.slice(2).filter((s) => !s.endsWith('zoom.cjs'));
  const [dirArg, a, b, x, y, w, h, scale, outArg, every = '1'] = args;
  const dir = path.resolve(process.cwd(), dirArg); const out = path.resolve(process.cwd(), outArg); // Electron resolves loadFile paths against the script's folder
  const cells = [];
  for (let i = Number(a); i <= Number(b); i += Number(every)) {
    const f = path.join(dir, String(i).padStart(4, '0') + '.jpg'); if (!fs.existsSync(f)) continue;
    const img = nativeImage.createFromPath(f).crop({ x: +x, y: +y, width: +w, height: +h }).resize({ width: +w * +scale, quality: 'best' });
    cells.push(`<div><img src="data:image/png;base64,${img.toPNG().toString('base64')}"><span>${i} (${Math.round(i * 1000 / 30)} ms)</span></div>`);
  }
  const cw = +w * +scale; const cols = Math.max(1, Math.min(cells.length, Math.floor(1500 / (cw + 6))));
  const html = `<!doctype html><style>body{margin:0;background:#202024;color:#c8c8d0;font:11px Consolas}.g{display:grid;grid-template-columns:repeat(${cols},${cw}px);gap:6px;padding:6px}img{display:block;image-rendering:pixelated}</style><div class="g">${cells.join('')}</div>`;
  const tmp = path.join(path.dirname(out), '_zoom.html'); fs.writeFileSync(tmp, html);
  const rows = Math.ceil(cells.length / cols);
  const win = new BrowserWindow({ show: false, width: cols * (cw + 6) + 6, height: rows * (+h * +scale + 20) + 12, webPreferences: { offscreen: true } });
  let frame = null; win.webContents.on('paint', (_e, _d, im) => { frame = im; });
  try {
    await win.loadFile(tmp); await new Promise((r) => setTimeout(r, 500));
    fs.writeFileSync(out, frame.toPNG());
    console.log('ZOOM ' + out + ' ' + cells.length + ' frames');
  } catch (e) { console.log('ZOOM FAILED ' + e.message); }
  fs.rmSync(tmp, { force: true });
  app.exit(0);
});
