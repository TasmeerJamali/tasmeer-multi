// Load one demo state in a hidden window and print what some expressions evaluate to.
// usage: npx electron tools/probe.cjs <state> <theme> "<js expression>" ["<js expression>" ...]
const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const args = process.argv.slice(2).filter((a) => !a.endsWith('.cjs'));
  const [state, theme, ...exprs] = args;
  await session.defaultSession.clearStorageData({ storages: ['localstorage'] }); // start clean (drafts are kept in localStorage)
  // offscreen, so the page's clock runs (a plain hidden window never runs animation frames)
  const win = new BrowserWindow({ show: false, width: Number(process.env.PROBE_WIDTH) || 1280, height: 860, // PROBE_WIDTH=720 for the narrow window
    webPreferences: { offscreen: true, contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  win.webContents.setFrameRate(30);
  win.webContents.on('console-message', (e, level, message) => console.log('CONSOLE ' + (e.message ?? message)));
  await win.loadFile(path.join(__dirname, '..', 'src', 'app.html'), { query: { demo: state, theme } });
  for (let i = 0; i < 100; i += 1) { if (await win.webContents.executeJavaScript('!!window.__demoReady').catch(() => false)) break; await sleep(100); }
  await sleep(800);
  for (const x of exprs) {
    // an expression may return a promise: it is awaited
    const v = await win.webContents.executeJavaScript(`(async () => { try { return JSON.stringify(await (${x})); } catch (e) { return 'THREW ' + e.message; } })()`).catch((e) => 'FAILED ' + e.message);
    console.log('PROBE ' + x + '\n  = ' + v);
  }
  app.exit(0);
});
