// Tasmeer Multi: a window over the Claude Code and Codex chats already on this PC.
// The list and the messages are read straight from their history files (nothing copied, nothing remembered).
// The one new thing: pick which account answers next, and the same chat carries on.
const { app, BrowserWindow, ipcMain, dialog, shell, Notification, nativeTheme, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const http = require('http');
const engine = require('./engine');
const history = require('./history');
const voice = require('./voice');
const agy = require('./agy');

app.setName('Tasmeer Multi');
// Settings from when this app was called Claude Multi move over once.
(() => { try { const oldDir = path.join(app.getPath('appData'), 'Claude Multi'); const newDir = path.join(app.getPath('appData'), 'Tasmeer Multi'); if (!process.env.CLAUDE_MULTI_DATA && fs.existsSync(path.join(oldDir, 'prefs.json')) && !fs.existsSync(path.join(newDir, 'prefs.json'))) { fs.mkdirSync(newDir, { recursive: true }); fs.copyFileSync(path.join(oldDir, 'prefs.json'), path.join(newDir, 'prefs.json')); } } catch { /* first run */ } })();
if (process.env.CLAUDE_MULTI_DATA) app.setPath('userData', process.env.CLAUDE_MULTI_DATA);
if (!app.requestSingleInstanceLock()) app.quit();

const root = () => app.getPath('userData');
const prefsFile = () => path.join(root(), 'prefs.json');
const newId = () => crypto.randomBytes(6).toString('hex');

// Only settings live here: your accounts, which account each chat uses, window size.
let prefs = { accounts: [], chat: {}, lastAccount: { claude: 'main-claude', codex: 'main-codex' }, draft: null, bounds: null, collapsed: {},
  meta: {}, folders: [], pinOrder: [], theme: 'dark', readAloud: false, chrome: true, sideWidth: 300, sideHidden: false };
function loadPrefs() {
  try { prefs = { ...prefs, ...JSON.parse(fs.readFileSync(prefsFile(), 'utf8')) }; } catch { /* first run */ }
  for (const eng of ['codex', 'claude']) {
    if (!prefs.accounts.some((a) => a.main && a.engine === eng)) {
      prefs.accounts.unshift({ id: `main-${eng}`, engine: eng, name: eng === 'claude' ? 'Claude' : 'Codex', main: true });
    }
  }
  // Gemini through Antigravity: one account, the Google login inside the Antigravity app.
  if (agy.installed() && !prefs.accounts.some((a) => a.engine === 'antigravity')) prefs.accounts.push({ id: 'main-antigravity', engine: 'antigravity', name: 'Antigravity (Google)', main: true });
  if (!prefs.lastAccount.antigravity) prefs.lastAccount.antigravity = 'main-antigravity';
  if (!prefs.draft) prefs.draft = { accountId: 'main-claude', cwd: os.homedir(), mode: 'full', model: '' };
  if (!prefs.unreadFix1) { prefs.unread = {}; prefs.unreadFix1 = true; } // old marks came from file activity, not real replies
  if (!prefs.bypassDefaulted) { prefs.draft.mode = 'full'; prefs.bypassDefaulted = true; }
  nativeTheme.themeSource = prefs.theme || 'dark';
  // Accounts whose login folder exists but are missing from the saved list (e.g. the list failed to save): bring them back.
  for (const eng of ['claude', 'codex']) {
    const d = path.join(root(), 'accounts', eng);
    let ids = []; try { ids = fs.readdirSync(d); } catch { /* none */ }
    for (const id of ids) {
      if (prefs.accounts.some((x) => x.id === id)) continue;
      const acct = { id, engine: eng, name: eng === 'claude' ? 'Claude account' : 'Codex account' };
      if (engine.isSignedIn(root(), acct)) prefs.accounts.push(acct);
    }
  }
}
let saveTimer = null;
function savePrefs() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.mkdirSync(root(), { recursive: true }); fs.writeFileSync(prefsFile() + '.tmp', JSON.stringify(prefs, null, 1)); fs.renameSync(prefsFile() + '.tmp', prefsFile()); }
    catch (e) { try { fs.appendFileSync(path.join(root(), 'errors.log'), new Date().toISOString() + ' save failed: ' + (e && e.stack || e) + '\n'); } catch { /* nothing more to do */ } }
  }, 250);
}

let win = null;
let sessions = [];          // from history files
const runs = new Map();     // chat key -> { handle, live }
let view = null;            // the open chat: { key, engine, id, file, start, end }

const send = (ch, d) => { if (win && !win.isDestroyed()) win.webContents.send(ch, d); };
const getAcct = (id) => prefs.accounts.find((a) => a.id === id);
// Accounts are shown by the email their login really uses.
const label = (a) => (a && (engine.accountEmail(root(), a) || a.name)) || '';
let seenModels = [];
function refreshModels() { try { seenModels = history.claudeModelsSeen(); } catch { /* ignore */ } }
setInterval(() => { refreshModels(); pushAccounts(); }, 10 * 60 * 1000);
const accountsOut = () => prefs.accounts.map((a) => ({ ...a, email: engine.accountEmail(root(), a), label: label(a), signedIn: engine.isSignedIn(root(), a), usage: (prefs.usage || {})[a.id] || null, models: engine.accountModels(root(), a, seenModels) }));
function chatPrefs(key, eng) {
  if (key === 'new') return prefs.draft;
  const p = prefs.chat[key] || {};
  let acct = getAcct(p.accountId);
  if (!acct || acct.engine !== eng) acct = getAcct(prefs.lastAccount[eng]) || getAcct(`main-${eng}`);
  return { accountId: acct.id, mode: p.mode || 'full', model: p.model || '', effort: p.effort || '' };
}
// Two logins reporting the exact same limits at the same moment are almost certainly one account.
function pushAccounts() {
  const list = accountsOut();
  const sig = (u) => u && u.source === 'usage' ? u.windows.map((w) => w.label + w.used + '@' + w.resetsAt).join('|') : null;
  for (const a of list) { const s = sig(a.usage); if (!s) continue; const twin = list.find((b) => b !== a && b.engine === a.engine && sig(b.usage) === s && Math.abs(b.usage.at - a.usage.at) < 15 * 60000); if (twin) a.sameAs = twin.label; }
  send('accounts', { accounts: list });
}
function pushOrg() { send('org', { meta: prefs.meta, folders: prefs.folders, pinOrder: prefs.pinOrder, listOrder: prefs.listOrder || null, theme: prefs.theme, readAloud: !!prefs.readAloud, chrome: prefs.chrome !== false, sideWidth: prefs.sideWidth || 300, sideHidden: !!prefs.sideHidden }); }
let wasActive = new Set(); let lastPushed = '';
function markRead(key) { if (prefs.unread && prefs.unread[key]) { delete prefs.unread[key]; savePrefs(); pushSessions(); } }
function pushSessions() {
  // "Done" marker: a chat that was working and has now gone quiet, and that you have not opened since.
  if (!prefs.unread) prefs.unread = {};
  const nowActive = new Set(); let changed = false;
  const out = sessions.map((s) => {
    const recent = Date.now() - (s.mtime || s.updated) < 40000; // the file was written lately (cheap check first)
    // Gemini: Antigravity says itself whether a chat is running. Others: a real message in the last 40 s.
    const active = runs.has(s.key) || (s.engine === 'antigravity' ? !!s.agyRunning : (recent && Date.now() - history.lastTalk(s.engine, s.file, s.mtime || s.updated) < 40000));
    if (active) nowActive.add(s.key);
    const asking = !!(runs.get(s.key) && runs.get(s.key).live && runs.get(s.key).live.ask); // waiting for your answer
    return { key: s.key, engine: s.engine, title: s.title, cwd: s.cwd, updated: s.updated, running: runs.has(s.key), active, asking, done: !!prefs.unread[s.key], archivedFile: !!s.archivedFile };
  });
  wasActive = nowActive;
  if (changed) savePrefs();
  const sig = JSON.stringify(out.map((s) => [s.key, s.title, s.running, s.active, s.asking, s.done, s.updated]));
  if (sig !== lastPushed) { lastPushed = sig; send('sessions', out); }
  const n = out.filter((s) => s.done).length; const q = out.filter((s) => s.asking).length;
  if (win && !win.isDestroyed()) win.setTitle(q ? `Tasmeer Multi (${q} waiting for you)` : n ? `Tasmeer Multi (${n} done)` : 'Tasmeer Multi');
}
let agySessions = []; let agyBusy = false; let agyReady = !agy.installed();
// The chat list is YOUR order (Nov 24, 2026: a list sorted by recency kept moving under the pointer):
// activity never moves a chat, only dragging does.
// The first time, it starts from the newest-first order of that moment (once Gemini's list is in too).
// A chat that is not in it yet goes on top if it is new (talked to after the list was set up), or at the
// bottom if it is an old one that only just showed up.
function keepListOrder() {
  if (!prefs.listOrder) {
    if (!agyReady || !sessions.length) return false;
    prefs.listOrder = sessions.map((s) => s.key); prefs.listOrderAt = Date.now(); savePrefs(); return true;
  }
  if (!prefs.listOrderAt) prefs.listOrderAt = Date.now();
  const have = new Set(prefs.listOrder); const top = []; const bottom = [];
  for (const s of sessions) if (!have.has(s.key)) (s.updated > prefs.listOrderAt ? top : bottom).push(s.key);
  if (!top.length && !bottom.length) return false;
  prefs.listOrder = [...top, ...prefs.listOrder, ...bottom].slice(0, 5000); savePrefs(); return true;
}
function refreshSessions() {
  let base = [];
  try { base = history.list(); } catch (e) { console.error('list failed', e); }
  sessions = [...base, ...agySessions].sort((a, b) => b.updated - a.updated);
  if (keepListOrder()) pushOrg();
  pushSessions();
  if (!agyBusy && agy.installed()) {
    agyBusy = true;
    agy.list().then((l) => { if (!agySessions.length && l.length) usageLog('Gemini list: ' + l.length + ' chats'); agySessions = l; sessions = [...base, ...agySessions].sort((a, b) => b.updated - a.updated); agyReady = true; if (keepListOrder()) pushOrg(); pushSessions(); }).catch((e) => { usageLog('Gemini list FAILED: ' + (e && e.stack || e)); }).finally(() => { agyBusy = false; agyReady = true; });
  }
}
function pushPrefsFor(key, eng) { send('chat-prefs', { key, ...chatPrefs(key, eng) }); }
function pushLive(key) { const r = runs.get(key); send('live', { key, live: r ? r.live : null }); }
// Streamed words and thinking change many times a second: they reach the window at most every 80 ms.
const liveTimers = new Map();
function pushLiveSoon(entry) {
  if (liveTimers.has(entry)) return;
  liveTimers.set(entry, setTimeout(() => { liveTimers.delete(entry); if (!entry.done) pushLive(entry.key); }, 80));
}
// Messages waiting for a chat to be free (yours, typed while it worked, or another chat's): shown under
// the chat as "Queued" and sent, in order, the moment it is free.
function queueOf(key) { return (prefs.queue && prefs.queue[key]) || []; }
function pushQueue(key) { send('queue', { key, items: queueOf(key).map((i) => ({ id: i.id, text: i.prompt, by: i.by, from: i.from || null, at: i.at })) }); }

// ---------- open / follow a chat ----------
function openChat(key) {
  if (key === 'new') {
    const a = getAcct(prefs.draft.accountId) || getAcct('main-claude');
    view = { key: 'new', engine: a.engine };
    send('view', { key: 'new', engine: a.engine, cwd: prefs.draft.cwd, title: 'New chat', items: [], more: false });
    pushPrefsFor('new', a.engine); pushLive('new'); pushQueue('new');
    return;
  }
  const s = sessions.find((x) => x.key === key);
  if (!s) return;
  if (s.engine === 'antigravity') {
    view = { key, engine: s.engine, id: s.id, file: s.file, count: 0 };
    pushPrefsFor(key, s.engine); pushLive(key); pushQueue(key);
    agy.items(s.file).then((r) => {
      if (view?.key !== key) return;
      view.count = r.items.length;
      send('view', { key, engine: s.engine, cwd: s.cwd, title: prefs.meta[key]?.title || s.title, items: r.items, more: false, error: r.error });
    });
    return;
  }
  let r;
  try { r = history.readBefore(s.engine, s.file); } catch (e) { send('view', { key, engine: s.engine, cwd: s.cwd, title: s.title, items: [], more: false, error: e.message }); return; }
  view = { key, engine: s.engine, id: s.id, file: s.file, start: r.start, end: r.size };
  send('view', { key, engine: s.engine, cwd: s.cwd, title: prefs.meta[key]?.title || s.title, items: r.items, more: r.start > 0 });
  pushPrefsFor(key, s.engine); pushLive(key); pushQueue(key);
}
// Follow the open file: anything written by this app, Orca, a terminal or the desktop app shows up here.
let agyFollow = false;
setInterval(() => {
  if (view && view.engine === 'antigravity' && view.file && !agyFollow) {
    const v = view; let mt = 0; try { mt = fs.statSync(v.file).mtimeMs; try { mt = Math.max(mt, fs.statSync(v.file + '-wal').mtimeMs); } catch { /* no wal */ } } catch { return; }
    if (v.mtime === mt) return;
    v.mtime = mt; agyFollow = true;
    agy.items(v.file).then((r) => { if (view === v && r.items.length > v.count) { send('append', { key: v.key, items: r.items.slice(v.count) }); v.count = r.items.length; } }).finally(() => { agyFollow = false; });
    return;
  }
  if (!view || !view.file || view.engine === 'antigravity') return;
  try {
    const r = history.readAfter(view.engine, view.file, view.end);
    if (r.end > view.end) { view.end = r.end; if (r.items.length) send('append', { key: view.key, items: r.items }); }
  } catch { /* file busy */ }
}, 800);
setInterval(refreshSessions, 3000);
if (agy.installed()) { agy.refreshModels().then(() => pushAccounts()).catch(() => {}); }

// Slash commands and skills, as Claude Code reports them. Cached, refreshed in the background.
let commands = [];
const commandsFile = () => path.join(root(), 'commands.json');
function refreshCommands() {
  const acct = getAcct('main-claude'); if (!acct) return;
  engine.probeCommands(root(), acct).then((p) => {
    const list = engine.commandList(p);
    if (list.length) { commands = list; try { fs.writeFileSync(commandsFile(), JSON.stringify(list)); } catch { /* ignore */ } send('commands', commands); }
  }).catch(() => {});
}
ipcMain.handle('commands', () => commands);
// ---------- usage per account ----------
function usageLog(line) {
  try {
    const f = path.join(root(), 'usage.log');
    try { if (fs.statSync(f).size > 200 * 1024) fs.renameSync(f, f + '.old'); } catch { /* new */ }
    fs.appendFileSync(f, new Date().toLocaleString() + '  ' + line + '\n');
  } catch { /* ignore */ }
}
function setUsage(id, u) { if (!u || !u.windows || !u.windows.length) return; if (!prefs.usage) prefs.usage = {}; prefs.usage[id] = u; savePrefs(); pushAccounts(); scheduleResetCheck(); }
// Usage keeps itself current, so the refresh button is never needed (Nov 24, 2026): a check every 3 minutes, when you come back to the window, right after a limit resets, after
// each reply, and live from the limits Claude Code reports while a run goes. A check cannot run every
// second: each one starts a whole Claude Code session (20-30 s on this PC while memory is short).
let usageBusy = false; let lastUsageRun = 0; let resetTimer = null;
function scheduleResetCheck() {
  clearTimeout(resetTimer); let soon = Infinity;
  for (const u of Object.values(prefs.usage || {})) for (const w of (u.windows || [])) if (w.resetsAt && w.resetsAt > Date.now()) soon = Math.min(soon, w.resetsAt);
  if (soon < Infinity) resetTimer = setTimeout(() => refreshUsage(true), Math.min(soon - Date.now() + 20000, 2 ** 31 - 1));
}
let lastLivePush = 0;
function mergeRunUsage(id, live) { // limits reported during a run: no check needed
  const u = prefs.usage && prefs.usage[id]; if (!u || !u.windows || !live || !live.windows) return;
  let changed = false;
  for (const w of live.windows) {
    const have = u.windows.find((x) => x.label === w.label);
    if (have && w.used != null && (have.used !== w.used || (w.resetsAt && have.resetsAt !== w.resetsAt))) { have.used = w.used; if (w.resetsAt) have.resetsAt = w.resetsAt; changed = true; }
  }
  u.at = Date.now(); delete u.failedAt;
  if (changed) { savePrefs(); scheduleResetCheck(); }
  if (changed || Date.now() - lastLivePush > 15000) { lastLivePush = Date.now(); pushAccounts(); }
}
// Gemini: Antigravity's own per-model quotas (5-hour windows), read from its local service in a few
// milliseconds, so they refresh every 30 s. Antigravity is never opened just for this: while it is closed
// the last numbers stay up ("last check: Antigravity is not running") and it looks again in 3 minutes.
let geminiBusy = false; let geminiNextAt = 0;
const usageSig = (u) => (u && u.windows ? u.windows.map((w) => w.label + ':' + w.used + '@' + w.resetsAt).join('|') : '');
async function refreshGemini(force = false) {
  const g = prefs.accounts.find((a) => a.engine === 'antigravity');
  if (!g || geminiBusy || !agy.installed() || (!force && Date.now() < geminiNextAt)) return;
  geminiBusy = true;
  try {
    const q = await agy.quota();
    const have = prefs.usage && prefs.usage[g.id];
    if (q && q.windows) {
      geminiNextAt = 0;
      if (have && usageSig(have) === usageSig(q)) { have.at = q.at; delete have.failedAt; pushAccounts(); } // same numbers: just fresher
      else { setUsage(g.id, q); usageLog(label(g) + ' (' + g.id + '): ' + q.windows.map((w) => w.label + ' ' + w.used + '% used').join('; ')); }
    } else {
      geminiNextAt = Date.now() + 3 * 60000;
      if (have) { have.failedAt = Date.now(); have.failReason = (q && q.error) || 'Antigravity did not answer'; pushAccounts(); }
    }
  } catch { geminiNextAt = Date.now() + 3 * 60000; } finally { geminiBusy = false; }
}
async function refreshUsage(force = false) {
  if (force) refreshGemini(true);
  if (usageBusy) return; usageBusy = true; lastUsageRun = Date.now();
  try {
    // One check at a time (each starts a full Claude Code process), and none while the PC is short of memory.
    for (const a of prefs.accounts.filter((x) => x.engine === 'claude')) {
      if (!force && prefs.usage && prefs.usage[a.id] && Date.now() - prefs.usage[a.id].at < 60000) continue; // just updated (a reply, a run)
      if (os.freemem() < 0.8 * 1024 ** 3) {
        const why = 'skipped, PC low on memory (' + (os.freemem() / 1024 ** 3).toFixed(1) + ' GB free)';
        usageLog('usage check ' + why);
        for (const b of prefs.accounts) if (b.engine === 'claude' && prefs.usage && prefs.usage[b.id]) { prefs.usage[b.id].failedAt = Date.now(); prefs.usage[b.id].failReason = why; }
        savePrefs(); pushAccounts(); break;
      }
      await (async () => {
      const t0 = Date.now();
      const u = await engine.probeUsage(root(), a);
      if (u && u.windows) { setUsage(a.id, u); usageLog(label(a) + ' (' + a.id + '): ' + u.windows.map((w) => w.label + ' ' + w.used + '% used, resets ' + (w.resetsText || '?')).join('; ') + ' [' + Math.round((Date.now() - t0) / 1000) + ' s]'); }
      else {
        usageLog(label(a) + ' (' + a.id + '): FAILED ' + (u && u.error ? u.error : 'no result'));
        if (prefs.usage && prefs.usage[a.id]) { prefs.usage[a.id].failedAt = Date.now(); prefs.usage[a.id].failReason = (u && u.error) || ''; savePrefs(); pushAccounts(); }
      }
      })();
    }
    // Codex: the newest Codex chat file holds the limits of the Codex login that ran last (only safe to show with one Codex account)
    const cx = prefs.accounts.filter((a) => a.engine === 'codex');
    if (cx.length === 1) { const newest = sessions.find((s) => s.engine === 'codex'); if (newest) setUsage(cx[0].id, engine.codexUsage(newest.file)); }
  } finally { usageBusy = false; send('usage-done', true); }
}
ipcMain.handle('refresh-usage', () => refreshUsage(true));
ipcMain.handle('init', () => {
  lastPushed = '';
  if (!commands.length) { try { commands = JSON.parse(fs.readFileSync(commandsFile(), 'utf8')); } catch { /* first run */ } }
  if (!global.__probed) { global.__probed = true; setTimeout(() => refreshUsage(true), 4000); setInterval(() => refreshUsage(), 3 * 60 * 1000); setInterval(() => refreshGemini(), 30 * 1000); refreshCommands(); setInterval(refreshCommands, 30 * 60 * 1000); scheduleResetCheck(); } refreshModels(); pushAccounts(); pushOrg(); refreshSessions(); send('collapsed', prefs.collapsed); if (updateReady) send('update', { ready: true, waiting: restartWhenIdle }); return true; });
let firstOpen = true;
ipcMain.handle('open', (_e, key) => {
  // after an update restart, the window's first "New chat" becomes the chat you were in
  if (firstOpen && key === 'new' && prefs.reopen) { const k = prefs.reopen; delete prefs.reopen; savePrefs(); if (sessions.find((s) => s.key === k)) key = k; }
  firstOpen = false;
  openChat(key); markRead(key);
});
ipcMain.handle('mark-all-read', () => { prefs.unread = {}; savePrefs(); pushSessions(); });
ipcMain.handle('more', () => {
  if (!view || !view.file || view.start <= 0 || view.engine === 'antigravity') return;
  const r = history.readBefore(view.engine, view.file, view.start);
  view.start = r.start;
  send('prepend', { key: view.key, items: r.items, more: r.start > 0 });
});
ipcMain.handle('set-prefs', (_e, key, patch) => {
  if (key === 'new') {
    if ('accountId' in patch && getAcct(patch.accountId)) { if (getAcct(prefs.draft.accountId)?.engine !== getAcct(patch.accountId).engine) { prefs.draft.model = ''; prefs.draft.effort = ''; } prefs.draft.accountId = patch.accountId; view = { key: 'new', engine: getAcct(patch.accountId).engine }; }
    for (const k of ['mode', 'model', 'cwd', 'effort']) if (k in patch) prefs.draft[k] = patch[k];
    savePrefs(); pushPrefsFor('new'); return true;
  }
  const s = sessions.find((x) => x.key === key); if (!s) return false;
  const cur = chatPrefs(key, s.engine);
  if ('accountId' in patch) {
    const a = getAcct(patch.accountId);
    if (!a || a.engine !== s.engine) { pushPrefsFor(key, s.engine); return false; }
    cur.accountId = a.id; prefs.lastAccount[a.engine] = a.id;
  }
  if ('mode' in patch) cur.mode = patch.mode;
  if ('effort' in patch) cur.effort = String(patch.effort || '').replace(/[^a-z]/g, '').slice(0, 12);
  if ('model' in patch) cur.model = String(patch.model || '').replace(/[^\w.:\-[\]]/g, '').slice(0, 60);
  prefs.chat[key] = cur; savePrefs(); pushPrefsFor(key, s.engine);
  return true;
});
ipcMain.handle('set-collapsed', (_e, c) => { prefs.collapsed = c || {}; savePrefs(); });

// ---------- sidebar organising (all kept in prefs; history files are never changed) ----------
const metaOf = (key) => (prefs.meta[key] = prefs.meta[key] || {});
function cleanMeta(key) { const x = prefs.meta[key]; if (x && !Object.values(x).some((v) => v)) delete prefs.meta[key]; }
function setPin(key, on, index) {
  prefs.pinOrder = prefs.pinOrder.filter((k) => k !== key);
  if (on) { prefs.pinOrder.splice(index == null ? prefs.pinOrder.length : Math.max(0, index), 0, key); metaOf(key).folder = null; }
  metaOf(key).pin = !!on; cleanMeta(key);
}
function setFolder(key, folderId, index) {
  for (const f of prefs.folders) f.order = f.order.filter((k) => k !== key);
  const f = prefs.folders.find((x) => x.id === folderId);
  if (f) { f.order.splice(index == null ? f.order.length : Math.max(0, index), 0, key); setPin(key, false); }
  metaOf(key).folder = f ? f.id : null; cleanMeta(key);
}
// One place for every sidebar change, from the right-click menu or from drag and drop.
function organise(op) {
  const { key } = op;
  if (op.kind === 'pin') setPin(key, op.on, op.index);
  else if (op.kind === 'star') { metaOf(key).star = !!op.on; cleanMeta(key); }
  else if (op.kind === 'archive') { metaOf(key).archived = !!op.on; if (op.on) { setPin(key, false); setFolder(key, null); } cleanMeta(key); }
  else if (op.kind === 'rename') {
    const title = String(op.title || '').trim().slice(0, 120);
    const s = sessions.find((x) => x.key === key);
    let synced = false;
    if (title && s) { try { synced = s.engine === 'antigravity' ? agy.rename(s.id, title) : history.rename(s.engine, s.id, s.file, title); } catch (e) { console.error('rename failed', e); } }
    metaOf(key).title = synced ? null : (title || null); cleanMeta(key); // Gemini chats keep the name in this app only
    if (synced) refreshSessions();
  }
  else if (op.kind === 'move') { // drop target: 'pinned', a folder id, or 'project' (back to its folder group)
    if (op.to === 'pinned') setPin(key, true, op.index);
    else if (op.to === 'project') { setPin(key, false); setFolder(key, null); }
    else setFolder(key, op.to, op.index);
  } else if (op.kind === 'place') { // dropped between two chats of the main list: your own order from now on
    setPin(key, false); setFolder(key, null);
    const seen = new Set(); prefs.listOrder = (Array.isArray(op.order) ? op.order : []).map(String).filter((k) => !seen.has(k) && seen.add(k)).slice(0, 5000);
  } else if (op.kind === 'sort') { // a one-time tidy: newest first now, then it stays put again
    if (op.mode === 'recent') { prefs.listOrder = sessions.map((s) => s.key); prefs.listOrderAt = Date.now(); }
  } else if (op.kind === 'new-folder') {
    const f = { id: newId(), name: String(op.name || 'New folder').trim().slice(0, 60) || 'New folder', order: [] };
    prefs.folders.push(f); if (key) setFolder(key, f.id);
  } else if (op.kind === 'rename-folder') { const f = prefs.folders.find((x) => x.id === op.id); if (f && String(op.name).trim()) f.name = String(op.name).trim().slice(0, 60); }
  else if (op.kind === 'delete-folder') {
    const f = prefs.folders.find((x) => x.id === op.id);
    if (f) { for (const k of f.order) { metaOf(k).folder = null; cleanMeta(k); } prefs.folders = prefs.folders.filter((x) => x !== f); }
  } else if (op.kind === 'move-folder') {
    const i = prefs.folders.findIndex((x) => x.id === op.id); const j = i + op.dir;
    if (i >= 0 && j >= 0 && j < prefs.folders.length) [prefs.folders[i], prefs.folders[j]] = [prefs.folders[j], prefs.folders[i]];
  } else if (op.kind === 'read-aloud') { prefs.readAloud = !!op.on; if (!op.on) voice.stopSpeaking();
  } else if (op.kind === 'chrome') { prefs.chrome = !!op.on;
  } else if (op.kind === 'side') { if (op.width) prefs.sideWidth = Math.max(200, Math.min(640, Math.round(op.width))); if ('hidden' in op) prefs.sideHidden = !!op.hidden;
  } else if (op.kind === 'theme') { prefs.theme = ['dark', 'light', 'system'].includes(op.theme) ? op.theme : 'dark'; nativeTheme.themeSource = prefs.theme; }
  savePrefs(); pushOrg();
  if (op.kind === 'rename' && view?.key === key) openChat(key);
}
ipcMain.handle('organise', (_e, op) => organise(op || {}));
ipcMain.handle('chat-menu', (_e, key) => {
  const s = sessions.find((x) => x.key === key); if (!s) return;
  const mt = prefs.meta[key] || {};
  const folderItems = prefs.folders.map((f) => ({ label: f.name, type: 'radio', checked: mt.folder === f.id, click: () => organise({ kind: 'move', key, to: f.id }) }));
  Menu.buildFromTemplate([
    { label: 'Open', click: () => { openChat(key); send('select', key); } },
    { type: 'separator' },
    { label: mt.pin ? 'Unpin' : 'Pin to top', click: () => organise({ kind: 'pin', key, on: !mt.pin }) },
    { label: mt.star ? 'Remove star' : 'Star', click: () => organise({ kind: 'star', key, on: !mt.star }) },
    { label: 'Rename...', click: () => send('ask', { kind: 'rename-chat', key, name: mt.title || s.title }) },
    { label: 'Move to folder', submenu: [
      ...folderItems, ...(folderItems.length ? [{ type: 'separator' }] : []),
      { label: 'New folder...', click: () => send('ask', { kind: 'new-folder', key }) },
      { label: 'Back to its project', enabled: !!(mt.folder || mt.pin), click: () => organise({ kind: 'move', key, to: 'project' }) },
    ] },
    { label: mt.archived ? 'Unarchive' : 'Archive (hide)', click: () => organise({ kind: 'archive', key, on: !mt.archived }) },
    { type: 'separator' },
    { label: 'Export as Markdown...', click: () => exportChat(key) },
    { label: 'Copy chat id', click: () => require('electron').clipboard.writeText(s.id) },
    { label: 'Show history file', click: () => shell.showItemInFolder(s.file) },
    { label: 'Open folder it runs in', enabled: !!s.cwd && fs.existsSync(s.cwd), click: () => shell.openPath(s.cwd) },
    { type: 'separator' },
    { label: 'Delete permanently...', click: () => deleteChat(key) },
  ]).popup({ window: win });
});
// Deletes the chat's history file (and its side folder) from this PC. Asks first, every time.
async function deleteChat(key) {
  const s = sessions.find((x) => x.key === key); if (!s) return;
  const name = prefs.meta[key]?.title || s.title;
  if (runs.has(key)) { dialog.showMessageBox(win, { type: 'info', message: 'This chat is running right now.', detail: 'Stop it first, then delete it.' }); return; }
  const recent = Date.now() - (s.mtime || s.updated) < 2 * 60 * 1000; // any write, even bookkeeping, means it may be open elsewhere
  const side = s.engine === 'claude' ? path.join(path.dirname(s.file), s.id) : null;
  const r = process.env.CLAUDE_MULTI_TEST_CONFIRM ? { response: 1 } : await dialog.showMessageBox(win, { // test runs only
    type: 'warning', buttons: ['Cancel', 'Delete permanently'], defaultId: 0, cancelId: 0, noLink: true,
    message: `Delete "${name}" permanently?`,
    detail: (recent ? 'Careful: this chat was written to in the last 2 minutes, so it may be open in another window (Orca, a terminal, the Claude app).\n\n' : '')
      + `This erases its history from your PC. It cannot be undone, and it disappears from Orca, the terminal and the Claude app too.\n\nFile: ${s.file}`,
  });
  if (r.response !== 1) return;
  try {
    // deleted in the background: a multi-GB chat file must not freeze the window
    await fs.promises.rm(s.file, { force: true });
    if (s.engine === 'antigravity') for (const x of ['-wal', '-shm']) await fs.promises.rm(s.file + x, { force: true });
    if (side && fs.existsSync(side) && !fs.lstatSync(side).isSymbolicLink()) await fs.promises.rm(side, { recursive: true, force: true });
  } catch (e) { dialog.showMessageBox(win, { type: 'error', message: 'Could not delete it.', detail: e.message }); return; }
  delete prefs.meta[key]; delete prefs.chat[key];
  prefs.pinOrder = prefs.pinOrder.filter((k) => k !== key);
  for (const f of prefs.folders) f.order = f.order.filter((k) => k !== key);
  savePrefs(); pushOrg(); refreshSessions();
  if (view?.key === key) { openChat('new'); send('select', 'new'); }
}
ipcMain.handle('delete-chat', (_e, key) => deleteChat(key));
ipcMain.handle('export-chat', (_e, key) => exportChat(key));
async function exportChat(key) {
  const s = sessions.find((x) => x.key === key); if (!s) return;
  const name = prefs.meta[key]?.title || s.title;
  const safe = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').slice(0, 80).trim() || 'chat';
  const r = process.env.CLAUDE_MULTI_TEST_CONFIRM ? { filePath: path.join(root(), 'export-test.md') } : await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), safe + '.md'), filters: [{ name: 'Markdown', extensions: ['md'] }] });
  if (r.canceled || !r.filePath) return;
  const items = s.engine === 'antigravity' ? (await agy.items(s.file)).items : await history.readAll(s.engine, s.file);
  const lines = [`# ${name}`, '', `${s.engine === 'codex' ? 'Codex' : 'Claude Code'} chat in ${s.cwd}`, ''];
  for (const it of items) {
    if (it.role === 'user') lines.push('## You', '', it.text, '');
    else if (it.role === 'assistant') lines.push(it.text, '');
    else if (it.role === 'tool') lines.push(`> ${it.name}: ${it.detail || ''}`, '');
  }
  fs.writeFileSync(r.filePath, lines.join('\n'));
  shell.showItemInFolder(r.filePath);
}
ipcMain.handle('folder-menu', (_e, id) => {
  const f = prefs.folders.find((x) => x.id === id); if (!f) return;
  Menu.buildFromTemplate([
    { label: 'Rename folder...', click: () => send('ask', { kind: 'rename-folder', id, name: f.name }) },
    { label: 'Move up', click: () => organise({ kind: 'move-folder', id, dir: -1 }) },
    { label: 'Move down', click: () => organise({ kind: 'move-folder', id, dir: 1 }) },
    { type: 'separator' },
    { label: 'Delete folder (chats go back to their projects)', click: () => organise({ kind: 'delete-folder', id }) },
  ]).popup({ window: win });
});
ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], defaultPath: prefs.draft.cwd });
  if (!r.canceled && r.filePaths[0]) { prefs.draft.cwd = r.filePaths[0]; savePrefs(); if (view?.key === 'new') openChat('new'); }
});
ipcMain.handle('reveal', (_e, key) => { const s = sessions.find((x) => x.key === key); if (s) shell.showItemInFolder(s.file); });

// ---------- sending ----------
// Pasted or dropped files: saved under the app's attachments folder; the agent is told their paths.
ipcMain.handle('save-attachment', (_e, name, bytes) => {
  const dirA = path.join(root(), 'attachments'); fs.mkdirSync(dirA, { recursive: true });
  const safe = String(name || 'pasted.png').replace(/[^\w.\- ]/g, '_').slice(-60);
  const p = path.join(dirA, Date.now() + '-' + newId() + '-' + safe);
  fs.writeFileSync(p, Buffer.from(bytes));
  return p;
});
const procs = new Map(); // chat key -> the last process started for it (may outlive its reply)
// You typed a message: it goes now, or, while the chat is still working, it waits its turn (the Claude
// app's queue) and goes the moment the chat is free.
ipcMain.handle('send', (_e, key, text, files) => {
  const paths = (Array.isArray(files) ? files : []).filter((f) => typeof f === 'string' && fs.existsSync(f)).slice(0, 20);
  let prompt = String(text || '').trim();
  if (paths.length) prompt = (prompt || 'Look at the attached file' + (paths.length > 1 ? 's' : '') + '.') + '\n\nAttached file' + (paths.length > 1 ? 's' : '') + ' (open from these paths):\n' + paths.map((f) => '- ' + f).join('\n');
  if (!prompt) return;
  if (runs.has(key) || queueOf(key).length) {
    if (key === 'new') return;
    const q = enqueue(key, { prompt, by: 'you', hop: 0 });
    return q.error ? 'refused' : 'queued';
  }
  startRun(key, prompt);
  return 'sent';
});
ipcMain.handle('unqueue', (_e, key, id) => { // take back a message that is still waiting
  const q = queueOf(key); const i = q.findIndex((x) => x.id === id); if (i < 0) return null;
  const [it] = q.splice(i, 1); if (!q.length && prefs.queue) delete prefs.queue[key];
  savePrefs(); pushQueue(key); return it.by === 'you' ? it.prompt : '';
});
ipcMain.handle('stop', (_e, key) => runs.get(key)?.handle?.stop());

// ---------- runs ----------
// One run = one message answered in one chat: one you typed, one from the queue, or one another chat
// sent (send_message / start_chat). Returns { entry } or { error }.
const renamed = new Map(); // a new chat's temporary key -> its real key, once Claude Code / Codex named it
function startRun(key, prompt, opts = {}) {
  prompt = String(prompt || '').trim();
  if (!prompt) return { error: 'Nothing to send.' };
  if (runs.has(key)) return { error: 'busy' };
  let s = null; let p;
  const fresh = key === 'new' || key.startsWith('new:');
  if (key === 'new') p = { ...prefs.draft };
  else if (fresh) p = { ...(opts.newChat || {}) };
  else { s = sessions.find((x) => x.key === key); if (!s) return { error: 'That chat is not in the list any more.' }; p = chatPrefs(key, s.engine); }
  const acct = getAcct(p.accountId); if (!acct) return { error: 'No account is set for this chat.' };
  // phase / step / running / steps let the window say what a long run is doing right now
  // ("Running Bash: node ...", "Thinking", 31m, 112 steps), and `from` who sent it when it was another chat.
  const live = { user: prompt, text: '', thinking: '', phase: 'starting', prep: '', account: label(acct), error: null, suggest: null, startedAt: Date.now(), step: null, running: [], sub: null, steps: 0, subSteps: 0, from: opts.from ? { key: opts.from.key, title: opts.from.title } : null };
  const fail = (msg) => { live.error = msg; runs.set(key, { live, handle: null, key }); pushLive(key); runs.delete(key); return { error: msg }; };
  if (s && s.legacyPb) return fail('This older Antigravity chat can only be continued in Antigravity itself.');
  if (!engine.isSignedIn(root(), acct)) return fail(`${label(acct)} is not signed in yet. Right-click it under Accounts and choose "Sign in".`);
  const chat = fresh ? { cwd: p.cwd, mode: p.mode, model: p.model, sessionId: null } : { cwd: s.cwd, mode: p.mode, model: p.model, sessionId: s.id };
  chat.chrome = prefs.chrome !== false; chat.effort = p.effort || '';
  const entry = { live, handle: null, key, acct, p, cwd: chat.cwd, from: opts.from || null, reportBack: !!opts.reportBack, hop: opts.hop || 0, message: opts.message || '', reply: '', waiters: [], done: false };
  if (acct.engine === 'claude' && bridge.port) { // this run may use the chat tools: its own key to the app's bridge
    entry.token = crypto.randomBytes(18).toString('hex');
    entry.mcpFile = path.join(root(), 'runs', 'mcp-' + entry.token.slice(0, 12) + '.json');
    chat.bridge = { port: bridge.port, token: entry.token, file: entry.mcpFile };
    runTokens.set(entry.token, entry);
  }
  runs.set(key, entry); pushLive(key); pushSessions();
  const prev = procs.get(key);
  if (prev && prev.alive && prev.alive()) { try { prev.stop(); } catch { /* gone */ } }
  try { entry.handle = engine.run(root(), { acct, chat, prompt }, (ev) => onRunEvent(entry, ev)); }
  catch (e) { finishRun(entry, { error: 'Could not start: ' + (e && e.message || e) }); return { error: String(e && e.message || e) }; }
  return { entry };
}
function onRunEvent(entry, ev) {
  if (entry.done && ev.kind !== 'session') return;
  const live = entry.live; const acct = entry.acct;
  if (ev.kind === 'session') {
    procs.set(acct.engine + ':' + ev.id, entry.handle);
    if (entry.key === 'new' || entry.key.startsWith('new:')) adoptNewChat(entry, ev.id);
    return;
  }
  if (ev.kind === 'usage') { mergeRunUsage(acct.id, ev.usage); return; } // the limits this run reports, folded in live
  if (ev.kind === 'ask') { // Claude Code asks you something (a question, a permission, a plan): show it, ping you if you are elsewhere
    live.ask = { id: ev.id, tool: ev.tool, input: ev.input, detail: ev.detail, kind: ev.tool === 'AskUserQuestion' ? 'question' : ev.tool === 'ExitPlanMode' ? 'plan' : 'permission' };
    pushLive(entry.key); pushSessions(); askNotify(entry.key, live); return;
  }
  if (ev.kind === 'ask-cancel') { if (live.ask && live.ask.id === ev.id) { live.ask = null; pushLive(entry.key); pushSessions(); } return; }
  if (ev.kind === 'done') { finishRun(entry, ev); return; }
  if (ev.kind === 'thinking') { live.phase = 'thinking'; live.thinking = String(ev.text || ''); pushLiveSoon(entry); return; }
  if (ev.kind === 'text') {
    if (ev.partial) { live.text = ev.text; live.phase = 'writing'; pushLiveSoon(entry); return; }
    live.text = ''; live.thinking = ''; live.phase = live.running.length ? 'tool' : 'thinking';
    entry.reply = entry.reply ? entry.reply + '\n\n' + ev.text : String(ev.text || ''); // what it said after its last step: its report
  } else if (ev.kind === 'tool-start') { // writing a step (a long file edit streams for a while before it runs)
    live.text = ''; live.thinking = ''; if (!live.running.length) { live.phase = 'preparing'; live.prep = ev.name || ''; }
  } else if (ev.kind === 'tool') {
    const step = { name: ev.name || 'step', detail: String(ev.detail || '').slice(0, 200), id: ev.id || '', at: Date.now() };
    live.text = ''; live.thinking = '';
    if (ev.sub) { live.sub = step; live.subSteps += 1; } // a helper agent's step, shown under its Agent step
    else {
      live.step = step; live.steps += 1; entry.reply = '';
      if (!ev.done) { live.running = [...live.running.filter((x) => !step.id || x.id !== step.id), step].slice(-8); live.phase = 'tool'; }
    }
  } else if (ev.kind === 'tool-done') {
    if (ev.sub) { if (live.sub && live.sub.id === ev.id) live.sub = { ...live.sub, done: true }; }
    else { live.running = live.running.filter((x) => x.id !== ev.id); if (!live.running.length) { live.phase = 'thinking'; live.sub = null; } }
  }
  pushLive(entry.key);
}
// A new chat got its id: find its history file, then show it like any other chat.
function adoptNewChat(entry, id) {
  const eng = entry.acct.engine; const temp = entry.key; const want = `${eng}:${id}`; const p = entry.p;
  prefs.chat[want] = { accountId: entry.acct.id, mode: p.mode, model: p.model, effort: p.effort || '' };
  if (temp === 'new') prefs.lastAccount[eng] = entry.acct.id;
  if (p.title) { metaOf(want).title = String(p.title).slice(0, 120); pushOrg(); }
  savePrefs();
  let tries = 0;
  const find = setInterval(() => {
    tries += 1;
    refreshSessions();
    const found = sessions.find((x) => x.key === want);
    if (!found && tries <= 40) return;
    clearInterval(find);
    if (!found) { for (const w of entry.waiters.splice(0)) w(null); return; }
    renamed.set(temp, found.key);
    if (runs.get(temp) === entry) runs.delete(temp);
    entry.key = found.key;
    if (!entry.done) runs.set(found.key, entry);
    send('live', { key: temp, live: null });
    if (view?.key === temp) openChat(found.key);
    if (!entry.done) pushLive(found.key);
    pushSessions();
    for (const w of entry.waiters.splice(0)) w(found.key);
  }, 500);
}
function finishRun(entry, ev) {
  if (entry.done) return;
  entry.done = true;
  const live = entry.live; const acct = entry.acct; const key = entry.key;
  live.ask = null;
  if (runs.get(key) === entry) runs.delete(key);
  if (entry.token) { runTokens.delete(entry.token); try { fs.unlinkSync(entry.mcpFile); } catch { /* gone */ } }
  lastRunEnd.set(key, Date.now());
  if (restartWhenIdle && !runs.size) setTimeout(() => { if (!runs.size) restartApp(); }, 3000); // the update you asked for
  if (acct.engine === 'codex') { const cs = sessions.find((x) => x.key === key); if (cs) setUsage(acct.id, engine.codexUsage(cs.file)); }
  if (acct.engine === 'antigravity') setTimeout(() => refreshGemini(true), 1500); // what that reply cost
  if (ev.error && ev.error !== 'Stopped.') {
    live.error = ev.error; live.errorDetail = ev.detail && ev.detail !== ev.error ? String(ev.detail).slice(0, 2000) : '';
    if (engine.looksLikeLimit(ev.error)) {
      const next = prefs.accounts.find((a) => a.engine === acct.engine && a.id !== acct.id && engine.isSignedIn(root(), a));
      if (next) live.suggest = { accountId: next.id, name: label(next) };
    }
    send('live', { key, live: { ...live, user: null, text: '', thinking: '', running: [], done: true } });
  } else send('live', { key, live: null });
  refreshSessions();
  if (!live.error && prefs.readAloud) readLastReply(key);
  const looking = win && win.isFocused() && view?.key === key;
  // "done" mark: only for a run started here (by you or by another chat), and only if you were not looking at it
  if (!looking) { if (!prefs.unread) prefs.unread = {}; prefs.unread[key] = Date.now(); savePrefs(); pushSessions(); }
  if (acct.engine === 'claude') setTimeout(() => engine.probeUsage(root(), acct).then((u) => { if (u && u.windows) { setUsage(acct.id, u); usageLog(label(acct) + ' after a reply: ' + u.windows.map((w) => w.label + ' ' + w.used + '%').join('; ')); } }), 1500);
  if (!looking && Notification.isSupported()) {
    const title = titleFor(key);
    const n = new Notification({ title, body: live.error ? `${label(acct)}: ${live.error.slice(0, 120)}` : entry.from ? `${label(acct)} finished what "${entry.from.title}" asked.` : `${label(acct)} finished.` });
    n.on('click', () => { win.show(); win.focus(); openChat(entry.key); send('select', entry.key); });
    n.show();
    if (win && !win.isFocused()) win.flashFrame(true);
  }
  afterRun(entry, ev);
}

// ---------- chats talking to each other ----------
// What the Claude app gives its sessions (SendMessage, start_session, a report when a session it
// started finishes), done here for every chat in this window (Nov 24, 2026). A Claude run reaches it through
// its MCP tools (src/mcp/tm-tools.cjs) and this local bridge: 127.0.0.1 only, and each run has its own
// key, which stops working the moment the run ends.
const bridge = { port: 0 };
const runTokens = new Map(); // a run's key -> its entry
const MAX_HOPS = 6;          // chats messaging each other in a row before it is treated as a loop
const relays = [];           // when chat-to-chat messages went out (at most 40 in 10 minutes)
const ENGINE_LABEL = { claude: 'Claude', codex: 'Codex', antigravity: 'Gemini' };
function startBridge() {
  try { // keys of runs from before a restart are dead: remove their files
    const d = path.join(root(), 'runs');
    for (const f of fs.readdirSync(d)) if (/^mcp-[0-9a-f]{12}\.json$/.test(f)) { try { fs.unlinkSync(path.join(d, f)); } catch { /* in use */ } }
  } catch { /* none yet */ }
  const srv = http.createServer((req, res) => {
    const reply = (code, obj) => { if (res.headersSent) return; res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.method !== 'POST' || req.url !== '/tool') { reply(404, { error: 'not found' }); return; }
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 512 * 1024) { reply(413, { error: 'too big' }); req.destroy(); } });
    req.on('end', async () => {
      let m; try { m = JSON.parse(body); } catch { reply(400, { error: 'bad request' }); return; }
      const entry = runTokens.get(String(m.token || ''));
      if (!entry || entry.done) { reply(403, { error: 'This run is no longer running in Tasmeer Multi.' }); return; }
      try { reply(200, await bridgeTool(entry, String(m.tool || ''), m.args || {})); }
      catch (e) { reply(200, { error: String(e && e.message || e) }); }
    });
  });
  srv.on('error', (e) => usageLog('chat bridge failed: ' + e.message));
  srv.listen(0, '127.0.0.1', () => { bridge.port = srv.address().port; });
}
async function bridgeTool(entry, tool, args) {
  if (tool === 'list_chats') return { text: listChatsText(entry, args) };
  if (tool === 'read_chat') return { text: await readChatText(args) };
  if (tool === 'send_message') return sendMessageTool(entry, args);
  if (tool === 'start_chat') return startChatTool(entry, args);
  return { error: 'Unknown tool: ' + tool };
}
const titleFor = (key) => { const real = renamed.get(key) || key; const s = sessions.find((x) => x.key === real); return (prefs.meta[real] && prefs.meta[real].title) || (s && s.title) || (real.startsWith('new') ? 'a new chat' : real); };
const headTitle = (t) => String(t || '').replace(/["\]\n\r]/g, "'").replace(/\s+/g, ' ').trim().slice(0, 120); // safe inside the header line
const clipText = (t, n) => { t = String(t || '').trim(); return t.length > n ? t.slice(0, n) + '\n[... cut, ' + (t.length - n) + ' more characters]' : t; };
const usDate = (ms) => (ms ? new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'unknown');
const lastRunEnd = new Map(); // chat key -> when a run of ours there ended (its own last writes are not "someone else")
function busyElsewhere(s) { // written to lately by something other than this app (the Claude app, a terminal, Antigravity)
  if (!s || runs.has(s.key)) return false;
  if (s.engine === 'antigravity') return !!s.agyRunning;
  let mt = s.mtime || s.updated; try { mt = fs.statSync(s.file).mtimeMs; } catch { /* gone */ }
  const ours = lastRunEnd.get(s.key); if (ours && mt <= ours + 5000) return false;
  return Date.now() - mt < 40000 && Date.now() - history.lastTalk(s.engine, s.file, mt) < 40000;
}
function chatState(s) {
  const r = runs.get(s.key);
  if (r) return r.live && r.live.ask ? 'waiting for the user to answer it' : 'working (in Tasmeer Multi)';
  if (busyElsewhere(s)) return 'working (in another app)';
  return 'idle';
}
function resolveChat(ref) {
  const r = String(ref || '').trim();
  if (!r) return { error: 'Say which chat: its key (like claude:1b2c...) or its title. list_chats shows both.' };
  const real = renamed.get(r) || r;
  const byKey = sessions.find((x) => x.key === real) || sessions.find((x) => x.id === real);
  if (byKey) return { s: byKey };
  const low = r.toLowerCase().replace(/^"|"$/g, '');
  const exact = sessions.filter((x) => titleFor(x.key).toLowerCase() === low);
  const some = exact.length ? exact : sessions.filter((x) => titleFor(x.key).toLowerCase().includes(low));
  if (some.length === 1) return { s: some[0] };
  if (!some.length) return { error: `No chat matches "${r}". Use list_chats to see the chats and their keys.` };
  return { error: `${some.length} chats match "${r}": ${some.slice(0, 6).map((x) => `${x.key} "${titleFor(x.key)}"`).join('; ')}. Pass the key of the one you mean.` };
}
function listChatsText(entry, args) {
  const q = String(args.query || '').toLowerCase().trim();
  const limit = Math.max(1, Math.min(100, Number(args.limit) || 25));
  let list = sessions.filter((s) => !s.archivedFile);
  if (q) list = list.filter((s) => (titleFor(s.key) + ' ' + s.cwd + ' ' + s.key).toLowerCase().includes(q));
  const me = renamed.get(entry.key) || entry.key;
  const lines = list.slice(0, limit).map((s) => `- "${titleFor(s.key)}" | key ${s.key} | ${ENGINE_LABEL[s.engine] || s.engine} | ${chatState(s)}${queueOf(s.key).length ? ` (${queueOf(s.key).length} waiting)` : ''} | last message ${usDate(s.updated)} | folder ${s.cwd || 'unknown'}${s.key === me ? ' | THIS CHAT' : ''}`);
  return `${list.length} chat${list.length === 1 ? '' : 's'}${q ? ` matching "${q}"` : ''} in Tasmeer Multi, newest first${list.length > limit ? ` (first ${limit})` : ''}:\n` + (lines.join('\n') || '(none)');
}
async function readChatText(args) {
  const r = resolveChat(args.chat); if (r.error) throw new Error(r.error);
  const s = r.s; const n = Math.max(1, Math.min(60, Number(args.last) || 12));
  const items = s.engine === 'antigravity' ? (await agy.items(s.file)).items : history.readBefore(s.engine, s.file).items;
  const blocks = []; let steps = [];
  const flush = () => { if (steps.length) { blocks.push({ text: `[${steps.length} step${steps.length === 1 ? '' : 's'}: ${[...new Set(steps)].slice(0, 8).join(', ')}]` }); steps = []; } };
  for (const it of items) {
    if (it.role === 'tool') { steps.push(it.name); continue; }
    if (it.role === 'user') { flush(); blocks.push({ msg: true, text: `USER (${usDate(Date.parse(it.ts || '') || 0)}): ${clipText(it.text, 4000)}` }); }
    else if (it.role === 'assistant') { flush(); blocks.push({ msg: true, text: `${(ENGINE_LABEL[s.engine] || 'AI').toUpperCase()}: ${clipText(it.text, 4000)}` }); }
    else if (it.role === 'files') { flush(); blocks.push({ text: `[showed files: ${it.files.join(', ')}]` }); }
    else if (it.role === 'note') { flush(); blocks.push({ text: `[${it.text}]` }); }
  }
  flush();
  let count = 0; let from = blocks.length;
  while (from > 0 && count < n) { from -= 1; if (blocks[from].msg) count += 1; }
  const out = clipText(blocks.slice(from).map((b) => b.text).join('\n\n'), 24000);
  return `Chat "${titleFor(s.key)}" (key ${s.key}), ${ENGINE_LABEL[s.engine] || s.engine}, folder ${s.cwd || 'unknown'}, ${chatState(s)}. Its last ${count} messages, oldest first:\n\n${out || '(no messages)'}`;
}
function relayCheck(entry) {
  if ((entry.p && entry.p.mode) === 'ask') return 'This chat is in "Ask only" mode, so it may not set other chats to work. Tell the user what you wanted to send instead.';
  if (entry.hop >= MAX_HOPS) return `Stopped: ${MAX_HOPS} chats in a row have messaged each other, which looks like a loop. Tell the user what you wanted to send instead.`;
  while (relays.length && Date.now() - relays[0] > 10 * 60000) relays.shift();
  if (relays.length >= 40) return 'Too many chat-to-chat messages in the last 10 minutes. Wait, or tell the user what you wanted to send.';
  return '';
}
function sendMessageTool(entry, args) {
  const msg = String(args.message || '').trim(); if (!msg) return { error: 'The message is empty.' };
  const r = resolveChat(args.to); if (r.error) return { error: r.error };
  const s = r.s; const me = renamed.get(entry.key) || entry.key;
  if (s.key === me) return { error: 'That is this chat itself.' };
  const why = relayCheck(entry); if (why) return { error: why };
  const reportBack = !!args.report_back; const fromTitle = titleFor(me); const t = titleFor(s.key);
  const head = `[Tasmeer Multi: message from the chat "${headTitle(fromTitle)}" (${me}). ${reportBack ? 'Your final reply goes back to it automatically when you finish.' : `To answer it, use send_message to "${me}".`}]`;
  const item = { prompt: head + '\n\n' + msg, by: 'chat', from: { key: me, title: fromTitle }, hop: entry.hop + 1, reportBack, message: msg.slice(0, 300) };
  relays.push(Date.now());
  if (!runs.has(s.key) && !queueOf(s.key).length && !busyElsewhere(s)) {
    const st = startRun(s.key, item.prompt, item);
    if (st.error) return { error: `Could not start it in "${t}": ${st.error}` };
    return { text: `Sent. "${t}" (${s.key}) is working on it now in Tasmeer Multi.${reportBack ? ' Its final reply comes back to this chat as a new message after it finishes (after this turn ends).' : ''}` };
  }
  const q = enqueue(s.key, item); if (q.error) return { error: q.error };
  return { text: `Queued. "${t}" (${s.key}) is ${chatState(s)}; it gets your message as soon as it is free (${q.queued} waiting).${reportBack ? ' Its final reply comes back to this chat when it finishes.' : ''}` };
}
function findAccount(ref) {
  const r = String(ref || '').trim().toLowerCase(); if (!r) return null;
  const byEngine = { claude: 'claude', codex: 'codex', gemini: 'antigravity', antigravity: 'antigravity' }[r];
  if (byEngine) return getAcct(prefs.lastAccount[byEngine]) || prefs.accounts.find((a) => a.engine === byEngine) || null;
  return prefs.accounts.find((a) => a.id.toLowerCase() === r || label(a).toLowerCase() === r || String(a.name || '').toLowerCase() === r) || null;
}
async function startChatTool(entry, args) {
  const prompt = String(args.prompt || '').trim(); if (!prompt) return { error: 'Say what the new chat should do (prompt).' };
  const why = relayCheck(entry); if (why) return { error: why };
  let acct = entry.acct;
  if (args.account) { acct = findAccount(args.account); if (!acct) return { error: `No account "${args.account}". The accounts are: ${prefs.accounts.map((a) => `${label(a)} (${ENGINE_LABEL[a.engine] || a.engine})`).join(', ')}; or say claude, codex or gemini.` }; }
  if (!engine.isSignedIn(root(), acct)) return { error: `${label(acct)} is not signed in.` };
  const cwd = String(args.folder || entry.cwd || os.homedir());
  if (!fs.existsSync(cwd)) return { error: 'That folder does not exist: ' + cwd };
  const same = acct.engine === entry.acct.engine;
  const me = renamed.get(entry.key) || entry.key; const fromTitle = titleFor(me);
  const reportBack = args.report_back !== false;
  const newChat = { accountId: acct.id, cwd, mode: (entry.p && entry.p.mode) || 'edit', model: same ? (entry.p && entry.p.model) || '' : '', effort: same ? (entry.p && entry.p.effort) || '' : '', title: String(args.title || '').trim() };
  const head = `[Tasmeer Multi: message from the chat "${headTitle(fromTitle)}" (${me}), which started this chat for this task.${reportBack ? ' Your final reply goes back to it automatically when you finish.' : ''}]`;
  relays.push(Date.now());
  const st = startRun('new:' + newId(), head + '\n\n' + prompt, { newChat, from: { key: me, title: fromTitle }, hop: entry.hop + 1, reportBack, message: prompt.slice(0, 300) });
  if (st.error) return { error: st.error };
  const key = await new Promise((res) => { st.entry.waiters.push(res); setTimeout(() => res(null), 25000); });
  const name = newChat.title || 'a new chat';
  return { text: `Started ${key ? `"${name}" (${key})` : name} in ${cwd}, answered by ${label(acct)}. It is working now${reportBack ? '; its final reply comes back to this chat as a new message after it finishes (after this turn ends)' : ''}.` };
}
// A message that waits for its chat. prefs.queue keeps them through a restart.
function enqueue(key, item) {
  if (!prefs.queue) prefs.queue = {};
  const q = prefs.queue[key] || (prefs.queue[key] = []);
  if (q.length >= 20) return { error: 'That chat already has 20 messages waiting.' };
  const it = { id: newId(), at: Date.now(), by: item.by || 'chat', prompt: item.prompt, from: item.from || null, hop: item.hop || 0, reportBack: !!item.reportBack, message: item.message || '' };
  q.push(it); savePrefs(); pushQueue(key); pushSessions(); setTimeout(pumpQueue, 50);
  return { queued: q.length, item: it };
}
function pumpQueue() {
  if (!prefs.queue || !sessions.length) return; // the chat list must be in before anything is judged gone
  for (const key of Object.keys(prefs.queue)) {
    const q = prefs.queue[key];
    if (!q || !q.length) { delete prefs.queue[key]; continue; }
    const real = renamed.get(key);
    if (real && real !== key) { prefs.queue[real] = [...queueOf(real), ...q]; delete prefs.queue[key]; savePrefs(); continue; }
    if (key.startsWith('new')) { if (Date.now() - q[0].at > 10 * 60000) { delete prefs.queue[key]; savePrefs(); } continue; } // waits for its chat to get its key
    if (runs.has(key)) continue;
    const s = sessions.find((x) => x.key === key);
    if (!s) { // its chat vanished (deleted): tell whoever sent it, then drop it
      if (Date.now() - q[0].at > 5 * 60000) { const it = q.shift(); savePrefs(); undelivered(it, key, 'the chat is gone'); pushQueue(key); }
      continue;
    }
    if (busyElsewhere(s)) continue; // the Claude app or a terminal is writing to it: wait until it is quiet
    const it = q.shift(); if (!q.length) delete prefs.queue[key];
    savePrefs(); pushQueue(key);
    const st = startRun(key, it.prompt, it);
    if (st.error === 'busy') { (prefs.queue[key] = prefs.queue[key] || []).unshift(it); savePrefs(); pushQueue(key); continue; }
    if (st.error) undelivered(it, key, st.error);
  }
}
setInterval(pumpQueue, 3000);
function undelivered(it, key, why) {
  usageLog(`queued message for ${key} not delivered: ${why}`);
  if (!it || it.by !== 'chat' || !it.from || !it.reportBack) return;
  enqueue(it.from.key, { prompt: `[Tasmeer Multi: reply from the chat "${headTitle(titleFor(key))}" (${key}) to your message "${headTitle(it.message.slice(0, 100))}"]\n\nIt could not be delivered: ${why}.`, by: 'chat', from: { key, title: titleFor(key) }, hop: it.hop + 1, reportBack: false });
}
// When a run another chat asked for finishes, its final reply goes back to that chat (the Claude app's
// "a note reaches you when it ends a turn"), then the next message waiting for this chat goes out.
function afterRun(entry, ev) {
  if (entry.from && entry.reportBack) {
    const to = renamed.get(entry.from.key) || entry.from.key; const t = titleFor(entry.key);
    const reply = ev.error === 'Stopped.' ? 'It was stopped before it finished.' : ev.error ? 'It stopped with an error: ' + ev.error : entry.reply.trim() || '(It finished without writing a reply.)';
    const head = `[Tasmeer Multi: reply from the chat "${headTitle(t)}" (${entry.key}) to your message "${headTitle(entry.message.slice(0, 100))}"]`;
    enqueue(to, { prompt: head + '\n\n' + clipText(reply, 6000), by: 'chat', from: { key: entry.key, title: t }, hop: entry.hop + 1, reportBack: false, message: '' });
  }
  setTimeout(pumpQueue, 300);
}
// ---------- the app updating itself ----------
// When a fix lands in the app's own files, the window offers a restart that waits until no chat is
// running, so nobody has to close the app from outside in the middle of a run (Nov 24, 2026).
const SRC_DIRS = [__dirname, path.join(__dirname, 'ui'), path.join(__dirname, 'mcp')];
function srcStamp() {
  let m = 0;
  for (const d of SRC_DIRS) { let names = []; try { names = fs.readdirSync(d); } catch { continue; } for (const f of names) if (/\.(js|cjs|css|html|txt)$/.test(f)) { try { m = Math.max(m, fs.statSync(path.join(d, f)).mtimeMs); } catch { /* gone */ } } }
  return m;
}
const bootStamp = srcStamp(); let updateReady = false; let restartWhenIdle = false;
setInterval(() => { if (!updateReady && srcStamp() > bootStamp + 1000) { updateReady = true; send('update', { ready: true }); } }, 20000);
function restartApp() {
  try { if (view && view.key && view.key !== 'new') { prefs.reopen = view.key; savePrefs(); } } catch { /* best effort */ } // come back to the same chat
  try { history.saveCache(path.join(root(), 'index-cache.json')); } catch { /* best effort */ }
  app.relaunch(); app.exit(0);
}
ipcMain.handle('restart', (_e, whenIdle) => {
  if (runs.size && whenIdle !== false) { restartWhenIdle = true; send('update', { ready: true, waiting: true }); return 'waiting'; }
  for (const r of runs.values()) r.handle?.stop();
  restartApp(); return 'now';
});
// Your answer to what a run asked. The reply sent to Claude Code is built here from the stored request,
// so the window only says what you chose: { decision: 'allow' | 'deny', answers?, message? }.
ipcMain.handle('answer', (_e, key, id, reply = {}) => {
  let k = key; let r = runs.get(key);
  if (!r || !r.live.ask || r.live.ask.id !== id) for (const [kk, rr] of runs) if (rr.live && rr.live.ask && rr.live.ask.id === id) { k = kk; r = rr; }
  if (!r || !r.live.ask || r.live.ask.id !== id || !r.handle || !r.handle.answer) return false;
  const a = r.live.ask; const why = String(reply.message || '').trim().slice(0, 2000); let response;
  if (reply.decision === 'allow') {
    if (a.kind === 'question') {
      const answers = {}; for (const [q, v] of Object.entries(reply.answers || {})) answers[String(q)] = String(v).slice(0, 2000);
      response = { behavior: 'allow', updatedInput: { ...a.input, answers } };
    } else response = { behavior: 'allow', updatedInput: a.input };
  } else {
    response = { behavior: 'deny', message: a.kind === 'question' ? 'The user skipped this question' + (why ? ': ' + why : '. Go on with your best judgment and say what you assumed.') : a.kind === 'plan' ? 'The user wants to keep planning' + (why ? ': ' + why : '.') : 'The user said no to this' + (why ? ': ' + why : '.') };
  }
  const ok = r.handle.answer(id, response);
  if (ok) { r.live.ask = null; pushLive(k); pushSessions(); }
  return !!ok;
});
function askNotify(key, live) {
  if (win && win.isFocused() && view?.key === key) return;
  const a = live.ask; const q = a.kind === 'question' ? (a.input.questions?.[0]?.question || 'A question for you') : a.kind === 'plan' ? 'A plan is waiting for your OK' : `${a.tool} is waiting for your OK`;
  if (Notification.isSupported()) {
    const n = new Notification({ title: sessions.find((x) => x.key === key)?.title || 'Chat', body: `${live.account} asks: ${q}`.slice(0, 220) });
    n.on('click', () => { win.show(); win.focus(); openChat(key); send('select', key); }); n.show();
  }
  if (win && !win.isFocused()) win.flashFrame(true);
}
// Files a run showed you (send_user_file): open with their app, or show in their folder. Programs and
// scripts never open from here, only show in their folder.
const RISKY = /\.(exe|bat|cmd|com|msi|msix|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|scr|lnk|reg|hta|cpl|jar|appx|appref-ms|url)$/i;
ipcMain.handle('open-file', (_e, p) => { if (typeof p !== 'string' || !path.isAbsolute(p) || !fs.existsSync(p)) return 'not found'; if (RISKY.test(p)) { shell.showItemInFolder(p); return 'shown'; } return shell.openPath(p); });
ipcMain.handle('reveal-file', (_e, p) => { if (typeof p === 'string' && path.isAbsolute(p) && fs.existsSync(p)) shell.showItemInFolder(p); });

// ---------- voice ----------
ipcMain.handle('voice-type', () => { if (win) { win.show(); win.focus(); } setTimeout(() => voice.startVoiceTyping(), 120); });
ipcMain.handle('speak-last', (_e, key) => { if (voice.isSpeaking()) { voice.stopSpeaking(); return false; } readLastReply(key); return true; });
ipcMain.handle('stop-speaking', () => voice.stopSpeaking());
function readLastReply(key) {
  const s = sessions.find((x) => x.key === key); if (!s) return;
  try {
    const items = history.readBefore(s.engine, s.file).items;
    const lastUser = items.map((i) => i.role).lastIndexOf('user');
    const text = items.slice(lastUser + 1).filter((i) => i.role === 'assistant').map((i) => i.text).join('\n\n');
    if (text) voice.speak(text);
  } catch { /* file busy */ }
}

// ---------- accounts ----------
ipcMain.handle('add-account', (_e, { engine: eng, name }) => {
  const a = { id: newId(), engine: eng === 'codex' ? 'codex' : 'claude', name: String(name || '').trim().slice(0, 40) || 'Account' };
  prefs.accounts.push(a); savePrefs();
  engine.openSignIn(root(), a); watchSignIn(a); pushAccounts();
  return a.id;
});
function watchSignIn(a) {
  let n = 0;
  const t = setInterval(() => { n += 1; if (engine.isSignedIn(root(), a) || n > 600 || !getAcct(a.id)) { clearInterval(t); pushAccounts(); } }, 2000);
}
ipcMain.handle('account-menu', (_e, id) => {
  const a = getAcct(id); if (!a) return;
  Menu.buildFromTemplate([
    { label: label(a), enabled: false },
    { type: 'separator' },
    { label: a.main ? 'Sign in again (your normal login)' : 'Sign in...', click: () => { engine.openSignIn(root(), a); watchSignIn(a); } },
    { label: 'Open its folder', enabled: !a.main, click: () => shell.openPath(engine.accountDir(root(), a)) },
    { type: 'separator' },
    { label: 'Remove...', enabled: !a.main, click: () => removeAccount(a) },
  ]).popup({ window: win });
});
ipcMain.handle('rename-account', (_e, id, name) => { const a = getAcct(id); if (a && String(name).trim()) { a.name = String(name).trim().slice(0, 40); savePrefs(); pushAccounts(); } });
async function removeAccount(a) {
  const r = await dialog.showMessageBox(win, {
    type: 'warning', buttons: ['Cancel', 'Remove'], defaultId: 0, cancelId: 0, message: `Remove "${label(a)}"?`,
    detail: 'This deletes its sign-in from this PC. Your chats are not touched.',
  });
  if (r.response !== 1) return;
  const dir = engine.accountDir(root(), a);
  try {
    // Unlink the shared-history links first, so deleting the folder can never reach the history behind them.
    for (const n of fs.readdirSync(dir)) { const p = path.join(dir, n); if (fs.lstatSync(p).isSymbolicLink()) fs.unlinkSync(p); }
    for (const n of fs.readdirSync(dir)) if (fs.lstatSync(path.join(dir, n)).isSymbolicLink()) throw new Error('link still present');
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) { console.error('remove failed', e); }
  prefs.accounts = prefs.accounts.filter((x) => x.id !== a.id);
  if (prefs.draft.accountId === a.id) prefs.draft.accountId = `main-${a.engine}`;
  savePrefs(); pushAccounts(); if (view) pushPrefsFor(view.key, view.engine);
}
ipcMain.handle('open-external', (_e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });

// ---------- window ----------
function createWindow() {
  win = new BrowserWindow({
    ...(prefs.bounds || { width: 1320, height: 880 }), show: !process.env.CLAUDE_MULTI_SHOT, minWidth: 760, minHeight: 480, title: 'Tasmeer Multi',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#070709' : '#fcfcfb', autoHideMenuBar: true, // DESIGN.md --bg
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, spellcheck: true },
  });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, 'app.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault()); // a file dropped where nothing takes it must never replace the app
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.webContents.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && i.key === 'F12') { win.webContents.toggleDevTools(); e.preventDefault(); } });
  win.webContents.on('context-menu', (_e, p) => {
    const items = [];
    if (p.misspelledWord) p.dictionarySuggestions.slice(0, 5).forEach((s) => items.push({ label: s, click: () => win.webContents.replaceMisspelling(s) }));
    if (items.length) items.push({ type: 'separator' });
    if (p.isEditable) items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' });
    else if (p.selectionText) items.push({ role: 'copy' });
    if (items.length) Menu.buildFromTemplate(items).popup();
  });
  const remember = () => { if (!win.isMaximized() && !win.isMinimized()) { prefs.bounds = win.getBounds(); savePrefs(); } };
  win.on('resize', remember); win.on('move', remember);
  win.on('focus', () => { win.flashFrame(false); if (view) markRead(view.key); if (Date.now() - lastUsageRun > 90000) refreshUsage(); refreshGemini(true); }); // back at the window: fresh numbers
  win.on('close', () => { voice.stopSpeaking(); for (const r of runs.values()) r.handle?.stop(); history.saveCache(path.join(root(), 'index-cache.json')); });

  if (process.env.CLAUDE_MULTI_SHOT) { // test hook: run page steps, then screenshot and quit
    const [out, wait] = process.env.CLAUDE_MULTI_SHOT.split('|');
    win.webContents.on('console-message', (e, level, message) => { const lv = e.level ?? level; if (lv === 3 || lv === 'error') console.log('RENDERER-ERROR', e.message ?? message); });
    win.webContents.once('did-finish-load', () => {
      (process.env.CLAUDE_MULTI_STEPS || '').split('||').filter(Boolean)
        .forEach((js, i) => setTimeout(() => win.webContents.executeJavaScript(js).then((v) => { if (v !== undefined) console.log('STEP', i, JSON.stringify(v)); }).catch((e) => console.error('step', e.message)), 2000 + i * 2500));
      setTimeout(async () => { fs.writeFileSync(out, (await win.webContents.capturePage()).toPNG()); app.exit(0); }, Number(wait || 5000));
    });
  }
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  loadPrefs();
  history.loadCache(path.join(root(), 'index-cache.json'));
  for (const a of prefs.accounts) if (!a.main) { try { engine.prepare(root(), a); } catch (e) { console.error(e); } }
  startBridge();
  createWindow();
});
app.on('window-all-closed', () => app.quit());
