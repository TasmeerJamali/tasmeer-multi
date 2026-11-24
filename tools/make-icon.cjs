// The app's icon: the brand mark (three fanned tokens: one window, many accounts) on a dark tile, written
// as build/icon.ico (256, 64, 48, 32, 24 and 16 px) and build/icon.png (256 px).
// usage: npx electron tools/make-icon.cjs
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'build');
// the colors of the dark theme (src/app.css): --side, --eng-gemini, --eng-codex, --eng-claude
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="256" height="256">
  <rect x="0.5" y="0.5" width="23" height="23" rx="5.4" fill="#111114"/>
  <g transform="translate(12 12.3) scale(0.8) translate(-12 -11.6)">
    <rect x="1.5" y="7" width="11" height="11" rx="3.2" transform="rotate(-10 7 12.5)" fill="#5aa9e6"/>
    <rect x="11.5" y="7" width="11" height="11" rx="3.2" transform="rotate(10 17 12.5)" fill="#a8a4f8"/>
    <rect x="6.5" y="5" width="11" height="11" rx="3.2" fill="#d97757" stroke="#111114" stroke-width="1.6"/>
  </g></svg>`;
const SIZES = [256, 64, 48, 32, 24, 16];

// An .ico holding PNG images (Windows Vista and later read these).
function ico(pngs) {
  const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length); let offset = 6 + dir.length;
  pngs.forEach(({ size, data }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o); dir.writeUInt8(size >= 256 ? 0 : size, o + 1); // 0 means 256
    dir.writeUInt8(0, o + 2); dir.writeUInt8(0, o + 3); dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(data.length, o + 8); dir.writeUInt32LE(offset, o + 12); offset += data.length;
  });
  return Buffer.concat([head, dir, ...pngs.map((p) => p.data)]);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 256, height: 256, transparent: true, frame: false, useContentSize: true,
    webPreferences: { offscreen: true } });
  const html = `<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden">${SVG}</body></html>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 400));
  const big = await win.webContents.capturePage({ x: 0, y: 0, width: 256, height: 256 });
  const base = big.getSize().width === 256 ? big : big.resize({ width: 256, height: 256, quality: 'best' });
  fs.mkdirSync(OUT, { recursive: true });
  const pngs = SIZES.map((size) => ({ size, data: (size === 256 ? base : base.resize({ width: size, height: size, quality: 'best' })).toPNG() }));
  fs.writeFileSync(path.join(OUT, 'icon.png'), pngs[0].data);
  fs.writeFileSync(path.join(OUT, 'icon.ico'), ico(pngs));
  const corner = base.toBitmap().readUInt32LE(0); // the corner pixel: transparent outside the rounded tile
  console.log(`icon.ico ${fs.statSync(path.join(OUT, 'icon.ico')).size} bytes, sizes ${SIZES.join('/')}, corner alpha ${(corner >>> 24) & 255}`);
  app.exit(0);
});
