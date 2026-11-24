// Antigravity (Google's Gemini agent) through its own agentapi.
// It talks to the Antigravity app's local service, so Antigravity has to be open (we open it if it is not).
// Chats are Antigravity's own: ~/.gemini/antigravity/conversations/<id>.db. They show up in Antigravity too.
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');

const HOME = os.homedir();
const CONV_DIR = path.join(HOME, '.gemini', 'antigravity', 'conversations');
const APP_EXE = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Antigravity', 'Antigravity.exe');
const READER = path.join(__dirname, 'agy-read.cjs');

const installed = () => fs.existsSync(CONV_DIR) || fs.existsSync(APP_EXE);

// ---------- reading (system Node has the SQLite reader; Electron's Node does not) ----------
function nodeExe() { return process.env.TM_NODE || 'node'; }
function reader(args) {
  return new Promise((resolve) => {
    execFile(nodeExe(), [READER, ...args], { windowsHide: true, maxBuffer: 256 * 1024 * 1024 }, (err, out) => {
      if (err && !out) return resolve({ error: `Could not read Antigravity chats (needs Node.js on this PC): ${err.message}` });
      try { resolve(JSON.parse(out)); } catch { resolve({ error: 'Could not read Antigravity chats.' }); }
    });
  });
}
let cache = new Map(); // file -> {size, mtime, info}
async function list() {
  if (!fs.existsSync(CONV_DIR)) return [];
  const files = fs.readdirSync(CONV_DIR).filter((f) => f.endsWith('.db')).map((f) => path.join(CONV_DIR, f));
  const stat = (f) => { try { const s = fs.statSync(f); let m = s.mtimeMs; try { m = Math.max(m, fs.statSync(f + '-wal').mtimeMs); } catch { /* no wal */ } return { size: s.size, mtime: m }; } catch { return null; } };
  const todo = []; const out = [];
  const sumsFirst = await summaries(); // Antigravity's own names: no need to open a chat file just to name it
  for (const f of files) {
    const st = stat(f); if (!st) continue;
    const id = path.basename(f, '.db'); const sm = sumsFirst[id];
    if (sm && (sm.parent || sm.depth > 0)) continue;
    if (annotationTitle(id) || (sm && (sm.title || sm.preview))) { out.push({ key: `antigravity:${id}`, engine: 'antigravity', id, file: f, cwd: 'Antigravity', firstText: '', updated: st.mtime, size: st.size }); continue; }
    const c = cache.get(f);
    if (c && c.size === st.size && c.mtime === st.mtime) { if (c.info) out.push(c.info); continue; }
    todo.push([f, st]);
  }
  if (todo.length) {
    const res = await reader(['titles', ...todo.map(([f]) => f)]);
    const byFile = new Map((Array.isArray(res) ? res : []).map((r) => [r.file, r]));
    for (const [f, st] of todo) {
      const r = byFile.get(f);
      const id = path.basename(f, '.db');
      // 'Task id "..."' chats are helper tasks Antigravity starts for itself, not your chats.
      const info = r && !r.error && !/^Task id "/.test(r.title || '') ? { key: `antigravity:${id}`, engine: 'antigravity', id, file: f, cwd: 'Antigravity', firstText: r.title || '', updated: st.mtime, size: st.size } : null;
      cache.set(f, { ...st, info });
      if (info) out.push(info);
    }
  }
  // Overlay Antigravity's own list: its names (and your renames there), running state, folder; hide sub-chats.
  const sums = await summaries(); const final = [];
  for (const info of out) {
    const s = sums[info.id];
    if (s && (s.parent || s.depth > 0)) continue;
    const title = annotationTitle(info.id) || (s && (s.title || s.preview)) || info.firstText;
    if (!title) continue;
    // The time is Antigravity's own last_modified_time: its chat files get touched in batches (several
    // read Nov 23 16:48 while their last use was Nov 20), so the file's time is not when you last talked.
    final.push({ ...info, title, cwd: wsToPath(s && s.ws) || 'Antigravity', updated: (s && s.modified) || info.updated, mtime: info.updated, agyRunning: !!(s && (s.status === 'CASCADE_RUN_STATUS_RUNNING' || s.notIdle) && !s.killed) });
  }
  // Older chats are kept in an encrypted .pb file only Antigravity can open: list them by name anyway.
  const have = new Set(final.map((x) => x.id));
  for (const [id, s] of Object.entries(sums)) {
    if (have.has(id) || s.parent || s.depth > 0) continue;
    const pb = path.join(CONV_DIR, id + '.pb'); let st; try { st = fs.statSync(pb); } catch { continue; }
    const title = annotationTitle(id) || s.title || s.preview; if (!title) continue;
    final.push({ key: `antigravity:${id}`, engine: 'antigravity', id, file: pb, legacyPb: true, cwd: wsToPath(s.ws) || 'Antigravity', title, updated: s.modified || st.mtimeMs, size: st.size, agyRunning: false });
  }
  return final;
}
const AGY_DIR = path.join(HOME, '.gemini', 'antigravity');
const SUM_DB = path.join(AGY_DIR, 'conversation_summaries.db');
const ANN_DIR = path.join(AGY_DIR, 'annotations');
let sumCache = { mtime: -1, map: {} };
async function summaries() {
  let mt = 0; try { mt = fs.statSync(SUM_DB).mtimeMs; try { mt = Math.max(mt, fs.statSync(SUM_DB + '-wal').mtimeMs); } catch { /* no wal */ } } catch { return {}; }
  if (mt === sumCache.mtime) return sumCache.map;
  const r = await reader(['summaries', SUM_DB]);
  if (r && !r.error) sumCache = { mtime: mt, map: r };
  return sumCache.map;
}
function wsToPath(ws) {
  try { const u = JSON.parse(ws || '[]')[0]; if (!u) return ''; return decodeURIComponent(u.replace(/^file:\/\/\//, '')).replace(/\//g, '\\').replace(/^([a-z]):/, (m, d) => d.toUpperCase() + ':'); } catch { return ''; }
}
// A name you give a chat in Antigravity is kept in annotations/<id>.pbtxt as title:"..."
function annotationTitle(id) {
  try { const t = fs.readFileSync(path.join(ANN_DIR, id + '.pbtxt'), 'utf8'); const m = t.match(/title:"((?:[^"\\]|\\.)*)"/); return m ? m[1].replace(/\\(["\\])/g, '$1') : ''; } catch { return ''; }
}
function rename(id, title) {
  const f = path.join(ANN_DIR, id + '.pbtxt');
  let rest = ''; try { rest = fs.readFileSync(f, 'utf8').replace(/title:"(?:[^"\\]|\\.)*"\s*/, '').trim(); } catch { /* new */ }
  const esc = String(title).replace(/[\\"]/g, (c) => '\\' + c).replace(/[\r\n]+/g, ' ');
  fs.mkdirSync(ANN_DIR, { recursive: true });
  fs.writeFileSync(f, ('title:"' + esc + '"' + (rest ? ' ' + rest : '')).trim());
  sumCache.mtime = -1;
  return true;
}
async function items(file) {
  if (file.endsWith('.pb')) return { items: [{ role: 'note', text: 'This is an older Antigravity chat. Antigravity stores it in a format only Antigravity can open, so read and continue it in Antigravity.' }], legacy: true };
  const r = await reader(['items', file]); return r.error ? { items: [], error: r.error } : r;
}

// ---------- the Antigravity service ----------
let svc = null; // { pid, address, csrf }
function ps(script) {
  return new Promise((resolve) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (e, out) => resolve(String(out || ''))));
}
function healthz(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/healthz', timeout: 1500 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false)); req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}
// The service's port and its one-time local CSRF token come from its own start-up line. The token stays in memory.
async function findService() {
  const out = await ps("Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'language_server*' -and $_.CommandLine -like '*antigravity*' } | Select-Object -First 1 | ForEach-Object { $_.ProcessId; $_.ExecutablePath; $_.CommandLine }");
  const [pidLine, exe, ...rest] = out.split(/\r?\n/); const pid = Number(pidLine); const cmd = rest.join(' ');
  if (!pid) return null;
  if (svc && svc.pid === pid && await healthz(svc.port)) return svc;
  const parts = cmd.split(/\s+/); let csrf = '';
  for (let i = 0; i < parts.length; i++) { if (parts[i] === '--csrf_token') csrf = parts[i + 1]; else if (parts[i].startsWith('--csrf_token=')) csrf = parts[i].slice(13); }
  const ports = await listenPorts(pid);
  for (const port of ports) if (await healthz(port)) { svc = { pid, exe: exe.trim(), port, ports, address: `localhost:${port}`, csrf }; return svc; }
  return null;
}
async function listenPorts(pid) {
  return (await ps(`(Get-NetTCPConnection -OwningProcess ${pid} -State Listen -ErrorAction SilentlyContinue).LocalPort | Sort-Object -Unique`)).split(/\s+/).map(Number).filter(Boolean);
}

// ---------- the account's model quotas ----------
// Antigravity shows a 5-hour quota per model. Its language server reports them through GetUserStatus,
// the same read-only call Antigravity's own window makes: per model, a remaining fraction and a reset time.
// The call stays on this PC (127.0.0.1, the server's own self-signed certificate) and carries the one-time
// local token from the server's start-up line, kept in memory like for agentapi. Only the quotas and the
// plan name are kept; the reply's name, email and picture are not. Once the port is known no process is
// started, so it is cheap enough to run every 30 s (Nov 24, 2026: Gemini usage next to the other accounts).
let statusAt = null; // { pid, port, proto, csrf } of the server that answered last
function lsCall(at, method) { // one read-only call to the language server; the parsed reply, or null
  return new Promise((resolve) => {
    const data = JSON.stringify({ metadata: { ideName: 'antigravity', extensionName: 'antigravity', locale: 'en' } });
    const req = (at.proto === 'https' ? https : http).request({ host: '127.0.0.1', port: at.port, path: '/exa.language_server_pb.LanguageServerService/' + method, method: 'POST', rejectUnauthorized: false, timeout: 5000,
      headers: { 'Content-Type': 'application/json', 'Connect-Protocol-Version': '1', 'X-Codeium-Csrf-Token': at.csrf, 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let b = ''; res.setEncoding('utf8');
      res.on('data', (d) => { b += d; if (b.length > 8e6) req.destroy(); });
      res.on('end', () => { if (res.statusCode !== 200) return resolve(null); try { resolve(JSON.parse(b)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null)); req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end(data);
  });
}
async function endpoint(fresh = false) { // where the language server answers (found once, then reused)
  if (statusAt && !fresh) return statusAt;
  statusAt = null;
  const s = await findService(); if (!s) return null;
  for (const port of s.ports || await listenPorts(s.pid)) for (const proto of ['https', 'http']) {
    const at = { pid: s.pid, port, proto, csrf: s.csrf }; const j = await lsCall(at, 'GetUserStatus');
    if (j && j.userStatus) { statusAt = at; return at; }
  }
  return null;
}
async function call(method) { // retries once on a freshly found server (Antigravity restarts change port and token)
  let at = await endpoint(); if (!at) return null;
  let j = await lsCall(at, method); if (j) return j;
  at = await endpoint(true); return at ? lsCall(at, method) : null;
}
// Antigravity's own quota view (Nov 24, 2026: it has weekly limits too). Models share limits in
// groups ("Gemini models", "Claude and GPT models"), and each group has a 5-hour and a weekly limit. The
// per-model numbers in GetUserStatus lag behind it (they read 100% while the group had 8% used).
async function quota() {
  const sum = await call('RetrieveUserQuotaSummary');
  const groups = sum && sum.response && sum.response.groups;
  if (Array.isArray(groups) && groups.length) {
    const windows = [];
    for (const g of groups) {
      const group = String(g.displayName || 'Models').replace(/\bModels\b/, 'models');
      const order = (b) => (b.window === '5h' ? 0 : b.window === 'weekly' ? 1 : 2);
      for (const b of (g.buckets || []).slice().sort((a, c) => order(a) - order(c))) {
        if (b.remainingFraction == null) continue;
        windows.push({ group, label: b.window === '5h' ? '5-hour' : b.window === 'weekly' ? 'Weekly' : String(b.displayName || b.window || 'Limit'), used: Math.max(0, Math.min(100, Math.round((1 - Number(b.remainingFraction)) * 100))), resetsAt: Date.parse(b.resetTime || '') || null, status: '' });
      }
    }
    if (windows.length) return { at: Date.now(), windows, status: '', extra: 'Antigravity: the models in a group share a 5-hour and a weekly limit', source: 'antigravity' };
  }
  // Older Antigravity without the summary: one quota per model from GetUserStatus.
  const st = await call('GetUserStatus'); const u = st && st.userStatus;
  if (!u) return { error: 'Antigravity is not running, so its quotas cannot be read' };
  const fam = new Map(); // one quota per model: its effort variants (Low, Medium, High...) share it
  for (const c of (u.cascadeModelConfigData && u.cascadeModelConfigData.clientModelConfigs) || []) {
    const q = c.quotaInfo; if (!q || q.remainingFraction == null) continue;
    const name = String(c.label || '').replace(/\s*\((?:minimal|low|medium|high|xhigh|max|thinking)\)\s*$/i, '').trim(); if (!name) continue;
    const at = Date.parse(q.resetTime || '') || null; const f = fam.get(name);
    if (!f) fam.set(name, { rem: Number(q.remainingFraction), at });
    else { f.rem = Math.min(f.rem, Number(q.remainingFraction)); if (at && (!f.at || at < f.at)) f.at = at; }
  }
  if (!fam.size) return { error: 'Antigravity reported no model quotas' };
  let windows = [...fam].map(([name, f]) => ({ label: name, short: name.replace(/^(Gemini|Claude)\s+/i, ''), used: Math.max(0, Math.min(100, Math.round((1 - f.rem) * 100))), resetsAt: f.at, status: '' }));
  windows.sort((a, b) => b.used - a.used || a.label.localeCompare(b.label)); // the most used first
  const same = windows.every((w) => w.used === windows[0].used && Math.abs((w.resetsAt || 0) - (windows[0].resetsAt || 0)) < 60000);
  if (same) windows = [{ label: `All ${windows.length} models`, short: 'All models', used: windows[0].used, resetsAt: windows[0].resetsAt, status: '' }];
  else windows = windows.slice(0, 4);
  const plan = u.planStatus && u.planStatus.planInfo && u.planStatus.planInfo.planName;
  return { at: Date.now(), windows, status: '', extra: plan ? `Antigravity ${plan} plan, quotas per model` : '', source: 'antigravity' };
}
async function ensureService(onWait) {
  let s = await findService(); if (s) return s;
  if (!fs.existsSync(APP_EXE)) throw new Error('Antigravity is not installed on this PC.');
  onWait && onWait('Opening Antigravity (it has to be running for Gemini)...');
  spawn('explorer.exe', [APP_EXE], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 30; i++) { await new Promise((r) => setTimeout(r, 2000)); s = await findService(); if (s) return s; }
  throw new Error('Antigravity did not start. Open it, sign in, then try again.');
}
function agentapi(s, args) {
  return new Promise((resolve) => {
    const env = { ...process.env, ANTIGRAVITY_LS_ADDRESS: s.address, ANTIGRAVITY_CSRF_TOKEN: s.csrf };
    // Called without a shell, so the message text is passed exactly as typed.
    execFile(s.exe, ['agentapi', ...args], { env, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, out) => {
      try { resolve(JSON.parse(out)); } catch { resolve({ error: (err && err.message) || String(out).slice(0, 300) }); }
    });
  });
}

// ---------- a turn ----------
const MODELS = [
  { value: 'pro', label: 'Gemini Pro', desc: 'Most capable Gemini model in Antigravity' },
  { value: 'flash', label: 'Gemini Flash', desc: 'Fast' },
  { value: 'flash_lite', label: 'Gemini Flash Lite', desc: 'Fastest, lightest' },
];
function run({ chat, prompt }, on) {
  let stopped = false; let done = false;
  const finish = (e) => { if (done) return; done = true; on({ kind: 'done', ...e }); };
  (async () => {
    try {
      const s = await ensureService((msg) => on({ kind: 'text', text: msg, partial: true }));
      if (stopped) return;
      let id = chat.sessionId;
      let before = 0;
      if (id) {
        const f = path.join(CONV_DIR, id + '.db');
        before = fs.existsSync(f) ? (await items(f)).items.length : 0;
        const r = await agentapi(s, ['send-message', id, prompt]);
        if (r.error) return finish({ error: r.error });
      } else {
        const args = ['new-conversation'];
        if (chat.model) args.push(`--model=${chat.model}`);
        args.push(`--title=${prompt.replace(/\s+/g, ' ').slice(0, 60)}`, prompt);
        const r = await agentapi(s, args);
        if (r.error || !r.response?.newConversation?.conversationId) return finish({ error: r.error || 'Antigravity did not start a conversation.' });
        id = r.response.newConversation.conversationId;
        on({ kind: 'session', id });
      }
      // Antigravity answers in the background; follow its conversation file until the reply settles.
      const file = path.join(CONV_DIR, id + '.db');
      let lastSteps = -1; let still = 0; let shown = 0; const started = Date.now();
      while (!stopped && Date.now() - started < 30 * 60 * 1000) {
        await new Promise((r) => setTimeout(r, 1500));
        if (!fs.existsSync(file)) continue;
        const r = await items(file);
        const fresh = r.items.slice(before);
        for (const it of fresh.slice(shown)) {
          if (it.role === 'tool') on({ kind: 'tool', name: it.name, detail: it.detail });
          else if (it.role === 'assistant') on({ kind: 'text', text: it.text });
        }
        shown = fresh.length;
        const answered = fresh.some((i) => i.role === 'assistant');
        if (r.steps === lastSteps) still += 1; else still = 0;
        lastSteps = r.steps;
        if (answered && r.lastType === 15 && (r.lastStatus === 3 || r.lastStatus === 5) && still >= 2) return finish({});
      }
      finish({ error: stopped ? 'Stopped.' : 'Antigravity is still working on this. Open the chat in Antigravity to see the rest.' });
    } catch (e) { finish({ error: e.message || String(e) }); }
  })();
  return { stop() { stopped = true; finish({ error: 'Stopped. (Antigravity may keep working in the background; check it in Antigravity.)' }); } };
}

let seen = [];
const pretty = (id) => id.replace(/^gemini-/, 'Gemini ').replace(/-/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
async function refreshModels() {
  if (!fs.existsSync(CONV_DIR)) return;
  const files = fs.readdirSync(CONV_DIR).filter((f) => f.endsWith('.db')).map((f) => path.join(CONV_DIR, f));
  const count = await reader(['models', ...files]);
  if (!count || count.error) return;
  const ids = Object.keys(count).filter((id) => count[id] >= 15);
  // drop ids that are another id plus a few stray letters picked up from the file
  seen = ids.filter((id) => !ids.some((o) => o !== id && id.startsWith(o + '-') && id.length - o.length <= 3)).sort((a, b) => count[b] - count[a]);
}
function models() {
  return [
    { value: 'pro', label: 'Gemini Pro (newest your plan allows)', desc: 'Antigravity picks the newest Pro model on your plan' },
    { value: 'flash', label: 'Gemini Flash (newest)', desc: 'Antigravity picks the newest Flash model' },
    { value: 'flash_lite', label: 'Gemini Flash Lite (newest)', desc: 'Fastest, lightest' },
    ...seen.map((id) => ({ value: id, label: pretty(id), desc: id + ' (answered in your Antigravity chats)' })),
  ];
}

module.exports = { installed, list, items, run, rename, MODELS, models, refreshModels, quota, CONV_DIR, APP_EXE };
