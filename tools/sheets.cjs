// Builds the sheets to show: before and after side by side, and the state gallery in each theme.
// usage: npx electron tools/sheets.cjs     results: tools/shots/before-after.png, gallery-dark.png, gallery-light.png
const { app, BrowserWindow, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const SHOTS = path.join(__dirname, 'shots');
app.on('window-all-closed', () => {});
const b64 = (file, w) => nativeImage.createFromPath(file).resize({ width: w, quality: 'best' }).toJPEG(88).toString('base64');

async function render(html, w, h, out) {
  const tmp = path.join(SHOTS, '_sheet.html'); fs.writeFileSync(tmp, html);
  const win = new BrowserWindow({ show: false, width: w, height: h, webPreferences: { offscreen: true } });
  let frame = null; win.webContents.on('paint', (_e, _d, im) => { frame = im; });
  await win.loadFile(tmp); await new Promise((r) => setTimeout(r, 600));
  fs.writeFileSync(out, frame.toPNG()); win.destroy(); fs.rmSync(tmp, { force: true });
  console.log('SHEET ' + out);
}
const page = (body) => `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:14px;background:#18181b;color:#d4d4dc;font:13px Segoe UI}
  h1{font:600 15px Segoe UI;margin:0 0 10px}.g{display:grid;gap:12px}figure{margin:0}img{display:block;width:100%;border:1px solid #33333a;border-radius:6px}
  figcaption{font:12px Segoe UI;color:#a1a1ab;margin-top:5px}</style>${body}`;

app.whenReady().then(async () => {
  const before = path.join(SHOTS, 'before-chat-dark.png');
  const after = path.join(SHOTS, 'after-live-dark.png');
  if (fs.existsSync(before) && fs.existsSync(after)) {
    await render(page(`<h1>Tasmeer Multi: before and after (your real chats, dark)</h1><div class="g" style="grid-template-columns:1fr 1fr">
      <figure><img src="data:image/jpeg;base64,${b64(before, 900)}"><figcaption>Before</figcaption></figure>
      <figure><img src="data:image/jpeg;base64,${b64(after, 900)}"><figcaption>After</figcaption></figure></div>`), 1860, 700, path.join(SHOTS, 'before-after.png'));
  }
  const states = ['chat-long', 'chat-working', 'new', 'slash', 'menu', 'modal', 'empty', 'voice', 'error', 'attach', 'hidden', 'tucked', 'fold', 'accounts', 'narrow'];
  for (const theme of ['dark', 'light']) {
    const cells = states.map((s) => path.join(SHOTS, `${s}-${theme}.png`)).filter((f) => fs.existsSync(f))
      .map((f) => `<figure><img src="data:image/jpeg;base64,${b64(f, 560)}"><figcaption>${path.basename(f, '.png')}</figcaption></figure>`);
    await render(page(`<h1>Every state, ${theme} (made-up hard content; fit check: 0 escapes)</h1><div class="g" style="grid-template-columns:repeat(5,1fr)">${cells.join('')}</div>`), 1900, 1050, path.join(SHOTS, `gallery-${theme}.png`));
  }
  app.exit(0);
});
