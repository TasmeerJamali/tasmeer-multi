// The state gallery: photographs every demo state (src/demo/mock.js) in dark and light, runs the fit
// check (tools/fitcheck.js) in each, and collects console errors. One hidden window at a time.
// usage: npx electron tools/shoot.cjs [state ...]      results: tools/shots/<state>-<theme>.png, fit.json
const { app, BrowserWindow, nativeTheme, session } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'shots');
const STATES = [ // [state, width, height]
  ['chat-long', 1280, 860], ['chat-working', 1280, 860], ['new', 1280, 860], ['slash', 1280, 860],
  ['menu', 1280, 860], ['modal', 1280, 860], ['empty', 1280, 860], ['narrow', 720, 860], ['voice', 1280, 860],
  ['error', 1280, 860], ['attach', 1280, 860], ['hidden', 1280, 860], ['tucked', 1280, 860], ['fold', 1280, 860],
  ['accounts', 1280, 860], ['dnd', 1280, 860], ['ask', 1280, 860], ['perm', 1280, 860], ['plan', 1280, 860], ['files', 1280, 860],
  ['run-think', 1280, 860], ['run-agent', 1280, 860], ['relay', 1280, 860], ['now', 720, 860],
];
const THEMES = ['dark', 'light'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(win, expr, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await win.webContents.executeJavaScript(`!!(${expr})`).catch(() => false)) return true; await sleep(100); }
  return false;
}

app.on('window-all-closed', () => {}); // one window at a time: closing one must not quit
app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await session.defaultSession.clearStorageData({ storages: ['localstorage'] }); // drafts from an earlier test must not show up in the photos
  const fitSrc = fs.readFileSync(path.join(__dirname, 'fitcheck.js'), 'utf8');
  const only = process.argv.slice(2).filter((a) => !a.startsWith('-') && !a.endsWith('.cjs'));
  const results = [];
  for (const [state, w, h] of STATES.filter(([s]) => !only.length || only.includes(s))) {
    for (const theme of THEMES) {
      const errors = [];
      // every state starts clean: a draft typed by one state (slash, attach) must not show in the next one
      await session.defaultSession.clearStorageData({ storages: ['localstorage'] });
      nativeTheme.themeSource = theme; // as the app does before its window opens
      // Offscreen rendering keeps the page's clock running (a plain hidden window freezes transitions
      // and entrances at their first frame), and every paint hands over the whole frame.
      const win = new BrowserWindow({ show: false, width: w, height: h, backgroundColor: theme === 'dark' ? '#070709' : '#fcfcfb', webPreferences: { offscreen: true, contextIsolation: true, sandbox: true, backgroundThrottling: false } });
      let frame = null; win.webContents.on('paint', (_e, _dirty, image) => { frame = image; });
      win.webContents.setFrameRate(30);
      win.webContents.on('console-message', (e, level, message) => { const lv = e.level ?? level; const msg = e.message ?? message; if (lv === 3 || lv === 'error' || lv === 2 || lv === 'warning') errors.push(String(msg).slice(0, 300)); });
      await win.loadFile(path.join(ROOT, 'src', 'app.html'), { query: { demo: state, theme } });
      const ready = await waitFor(win, 'window.__demoReady === true', 10000);
      await sleep(1100); // let entrances, springs and the done pulses settle
      const fit = JSON.parse(await win.webContents.executeJavaScript(`${fitSrc}\n;JSON.stringify(window.fitCheck(document.body))`));
      await sleep(120);
      const img = frame && !frame.isEmpty() ? frame : await win.webContents.capturePage();
      const file = path.join(OUT, `${state}-${theme}.png`);
      fs.writeFileSync(file, img.toPNG());
      results.push({ state, theme, ready, frames: fit.frames, issues: fit.issues, trimmed: fit.trimmed, errors });
      console.log(`SHOT ${state}-${theme} ready=${ready} frames=${fit.frames} issues=${fit.issues.length} trimmed=${fit.trimmed.length} errors=${errors.length}`);
      for (const i of fit.issues) console.log('  ISSUE ' + JSON.stringify(i));
      for (const er of errors) console.log('  ERROR ' + er);
      win.destroy();
      await sleep(150);
    }
  }
  fs.writeFileSync(path.join(OUT, 'fit.json'), JSON.stringify(results, null, 2));
  const bad = results.filter((r) => r.issues.length || r.errors.length || !r.ready);
  console.log(`DONE ${results.length} shots, ${bad.length} with problems`);
  app.exit(bad.length ? 1 : 0);
});
