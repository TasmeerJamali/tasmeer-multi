// Films the 'cycle' demo (a whole exchange: switch account, type, send, stream, a step, the reply
// landing, the ring sweeping, another chat finishing, the sidebar hiding and coming back) at 30 fps
// with offscreen rendering, then writes contact sheets around each moment worth reading, cropped to
// where the motion is. usage: npx electron tools/record.cjs [dark|light]
// results: tools/shots/motion/<theme>-<moment>.png, plus every frame in tools/shots/motion/frames-<theme>/
const { app, BrowserWindow, nativeTheme, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const W = 1280; const H = 800; const FPS = 30; const STEP = 1000 / FPS;
const OUT = path.join(__dirname, 'shots', 'motion');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.on('window-all-closed', () => {});

async function sheet(cells, cols, cellW, cellH, title, file) {
  const rows = Math.ceil(cells.length / cols);
  const pad = 6; const lab = 16; const head = 26;
  const sw = cols * (cellW + pad) + pad; const sh = head + rows * (cellH + lab + pad) + pad;
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#202024;color:#c8c8d0;font:12px Segoe UI}
    h1{font:600 13px Segoe UI;margin:0;padding:6px ${pad}px;height:${head - 12}px}
    .g{display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:${pad}px;padding:0 ${pad}px}
    .c{display:flex;flex-direction:column}.c img{width:${cellW}px;height:${cellH}px;display:block;outline:1px solid #3a3a42}
    .c span{height:${lab}px;line-height:${lab}px;font:11px Cascadia Mono,Consolas,monospace}</style>
    <h1>${title}</h1><div class="g">${cells.map((c) => `<div class="c"><img src="data:image/jpeg;base64,${c.img}"><span>${c.label}</span></div>`).join('')}</div>`;
  const tmp = path.join(OUT, '_sheet.html'); fs.writeFileSync(tmp, html);
  const win = new BrowserWindow({ show: false, width: sw, height: sh, webPreferences: { offscreen: true } });
  let frame = null; win.webContents.on('paint', (_e, _d, image) => { frame = image; });
  await win.loadFile(tmp); await sleep(500);
  fs.writeFileSync(file, (frame && !frame.isEmpty() ? frame : await win.webContents.capturePage()).toPNG());
  win.destroy(); fs.rmSync(tmp, { force: true });
}

app.whenReady().then(async () => {
  const theme = process.argv.slice(2).find((a) => a === 'light' || a === 'dark') || 'dark';
  fs.mkdirSync(OUT, { recursive: true });
  nativeTheme.themeSource = theme;
  const win = new BrowserWindow({ show: false, width: W, height: H, webPreferences: { offscreen: true, backgroundThrottling: false } });
  const frames = []; const marks = []; let t0 = 0; let recording = false;
  win.webContents.on('paint', (_e, _d, image) => { if (recording) frames.push({ t: performance.now() - t0, jpg: image.toJPEG(85) }); });
  win.webContents.on('console-message', (e, level, message) => { const m = String(e.message ?? message); if (recording && m.startsWith('MARK ')) marks.push({ name: m.slice(5), t: performance.now() - t0 }); });
  win.webContents.setFrameRate(FPS);
  recording = true; t0 = performance.now();
  await win.loadFile(path.join(__dirname, '..', 'src', 'app.html'), { query: { demo: 'cycle', theme } });
  await sleep(600);
  const rects = await win.webContents.executeJavaScript(`(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; }; return { bar: r('#composer .bar'), log: r('#log'), dock: r('#dock'), desk: r('.chat[data-key="claude:desk"]'), acct: r('#accounts'), dpr: devicePixelRatio }; })()`);
  for (let i = 0; i < 300; i += 1) { if (await win.webContents.executeJavaScript('!!window.__cycleDone').catch(() => false)) break; await sleep(100); }
  recording = false;
  win.destroy();
  console.log(`FRAMES ${frames.length} over ${Math.round(frames[frames.length - 1].t)} ms; marks: ${marks.map((m) => m.name + '@' + Math.round(m.t)).join(', ')}`);

  // resample onto a steady 30 fps clock: each tick shows the newest frame painted by then
  const ticks = []; let j = 0;
  for (let t = 0; t <= frames[frames.length - 1].t; t += STEP) { while (j + 1 < frames.length && frames[j + 1].t <= t) j += 1; ticks.push({ t, f: frames[j] }); }
  const dir = path.join(OUT, `frames-${theme}`); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  ticks.forEach((k, i) => fs.writeFileSync(path.join(dir, String(i).padStart(4, '0') + '.jpg'), k.f.jpg));
  const at = (name) => marks.find((m) => m.name === name)?.t;
  const crop = (f, r, w) => { const img = nativeImage.createFromBuffer(f.jpg); const s = img.getSize().width / W; const c = img.crop({ x: Math.round(r.x * s), y: Math.round(r.y * s), width: Math.round(r.w * s), height: Math.round(r.h * s) }); return c.resize({ width: w, quality: 'best' }).toJPEG(90).toString('base64'); };
  const moments = [
    { name: 'switch', from: -66, to: 800, every: 1, region: { x: rects.bar.x - 4, y: rects.bar.y - 6, w: 420, h: rects.bar.h + 12 }, cols: 4, cellW: 420, title: 'Switch account: the token springs in (0.40 s, bounce 0.12) and its ring sweeps' },
    { name: 'send', from: -66, to: 900, every: 1, region: { x: rects.log.x, y: rects.log.y + rects.log.h - 330, w: rects.log.w, h: 330 + rects.dock.h }, cols: 5, cellW: 300, title: 'Send: your message lands (0.50 s, bounce 0.18), the reply box enters' },
    { name: 'step', from: -100, to: 1100, every: 2, region: { x: rects.log.x, y: rects.log.y + rects.log.h - 330, w: rects.log.w, h: 330 }, cols: 5, cellW: 300, title: 'A step starts: streamed words stay up until the chat file has them' },
    { name: 'final', from: -100, to: 1000, every: 2, region: { x: rects.log.x, y: rects.log.y + rects.log.h - 330, w: rects.log.w, h: 330 }, cols: 5, cellW: 300, title: 'The reply lands: live box out, saved reply in' },
    { name: 'usage', from: -66, to: 700, every: 1, region: { x: rects.bar.x - 4, y: rects.bar.y - 6, w: 420, h: rects.bar.h + 12 }, cols: 4, cellW: 420, title: 'Usage comes back: the ring sweeps from 79% to 70% left (0.50 s, no bounce)' },
    { name: 'other-done', from: -66, to: 1900, every: 2, region: { x: rects.desk.x, y: rects.desk.y - 4, w: rects.desk.w, h: rects.desk.h + 8 }, cols: 5, cellW: 290, title: 'Another chat finishes: working bars become a green dot that pulses twice, then rests' },
    { name: 'hide', from: -33, to: 560, every: 1, region: { x: 0, y: 0, w: W, h: H }, cols: 5, cellW: 256, title: 'Ctrl+B hides the sidebar (0.35 s, no bounce)' },
    { name: 'show', from: -33, to: 560, every: 1, region: { x: 0, y: 0, w: W, h: H }, cols: 5, cellW: 256, title: 'Ctrl+B brings it back' },
  ];
  for (const m of moments) {
    const t = at(m.name); if (t == null) { console.log('NO MARK ' + m.name); continue; }
    const cells = []; let n = 0;
    for (const k of ticks) {
      if (k.t < t + m.from || k.t > t + m.to) continue;
      if (n++ % m.every) continue;
      cells.push({ img: crop(k.f, m.region, m.cellW), label: `${k.t - t >= 0 ? '+' : ''}${Math.round(k.t - t)} ms` });
    }
    const cellH = Math.round(m.region.h * (m.cellW / m.region.w));
    const file = path.join(OUT, `${theme}-${m.name}.png`);
    await sheet(cells, m.cols, m.cellW, cellH, `${m.title}  (${theme}, every ${m.every === 1 ? 'frame' : m.every + ' frames'} at 30 fps)`, file);
    console.log(`SHEET ${file} ${cells.length} frames`);
  }
  app.exit(0);
});
