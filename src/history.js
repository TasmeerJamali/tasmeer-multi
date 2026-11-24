// Reads the chats that Claude Code and Codex already keep on this PC. Nothing is copied or stored:
// the list and the messages come straight from ~/.claude/projects and ~/.codex/sessions.
// Some files are gigabytes, so only small pieces are ever read (head for the title, tail for the view).
const fs = require('fs');
const path = require('path');
const { MAIN } = require('./engine');

const CLAUDE_DIR = path.join(MAIN.claude, 'projects');
const CODEX_DIR = path.join(MAIN.codex, 'sessions');
const HEAD = 512 * 1024;
const TAIL = 256 * 1024;

function readRange(file, start, end) {
  const fd = fs.openSync(file, 'r');
  try {
    const len = Math.max(0, end - start);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    return buf.toString('utf8');
  } finally { fs.closeSync(fd); }
}
// Whole JSON lines inside [start,end). A line cut at either edge is dropped.
function linesIn(file, start, end, size) {
  const text = readRange(file, start, end);
  const parts = text.split('\n');
  if (start > 0) parts.shift();
  if (end < size) parts.pop();
  const out = [];
  for (const p of parts) {
    if (!p || p.charCodeAt(0) !== 123) continue; // '{'
    try { out.push(JSON.parse(p)); } catch { /* partial or broken line */ }
  }
  return out;
}

// ---------- text helpers ----------
const isNoise = (t) => !t || /^\s*<[a-z_][\w-]*[ >]/i.test(t) && /<\/[a-z_][\w-]*>\s*$/i.test(String(t).trim()) || /^\s*<(command-|local-command|system-reminder|environment_context|user_instructions|permissions|recommended_plugins|INSTRUCTIONS|turn_aborted|user_shell_command)/i.test(t) || /^# AGENTS\.md/.test(t) || /^Caveat: The messages below/.test(t);
function claudeText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
}
function codexText(content) {
  if (!Array.isArray(content)) return typeof content === 'string' ? content : '';
  return content.map((c) => c.text || '').join('');
}
function clip(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '...' : s; }
function toolDetail(input) {
  if (input == null) return '';
  if (typeof input === 'string') { try { input = JSON.parse(input); } catch { return clip(input, 160); } }
  const v = input.command || input.cmd || input.file_path || input.path || input.pattern || input.url || input.query || input.description || input.prompt || '';
  return clip(Array.isArray(v) ? v.join(' ') : v, 160);
}

// Your words for a title: drop wrapper blocks that tools put in front of a message, keep pasted text.
const KEEP_INNER = /^(pasted_content|pasted|user_query|user_message|request)$/i;
// A message one chat sent another (send_message / start_chat) starts with the app's own header line.
const RELAY_HEAD = /^\[Tasmeer Multi: (?:message|reply) from the chat "[^"\n]*" \([^)\n]*\)[^\]\n]*\]\s*/;
function cleanTitle(t) {
  let s = String(t || '').replace(RELAY_HEAD, '').split(/\s+Attached files? \(open from these paths\):/)[0].trim();
  for (let i = 0; i < 8; i++) {
    const m = s.match(/^<([a-z_][\w-]*)(\s[^>]*)?>([\s\S]*?)<\/\1>\s*/i);
    if (!m) break;
    s = KEEP_INNER.test(m[1]) ? m[3].trim() + ' ' + s.slice(m[0].length) : s.slice(m[0].length);
    s = s.trim();
  }
  s = s.replace(/<\/?[a-z_][\w-]*(\s[^>]*)?>/gi, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

// ---------- one entry -> display items ----------
// A slash command is saved as Claude Code's markup (<command-name>/my-skill</command-name>
// <command-args>run this end to end</command-args>); read it back the way it was typed. Without this the
// message was thrown away as noise, so a chat run by a skill never showed what you asked (Nov 24, 2026).
function commandText(t) {
  const name = /<command-name>([^<]*)<\/command-name>/.exec(t || '');
  if (!name) return null;
  const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(t);
  return (name[1].trim() + ' ' + (args ? args[1].trim() : '')).trim() || null;
}
// Tools that read better as what they did: files shown to you (SendUserFile in the Claude app,
// send_user_file in Tasmeer Multi), a question Claude asked you, a plan it proposed.
function toolItem(c, ts) {
  const inp = c.input || {};
  if (/^(SendUserFile|mcp__tasmeer_multi__send_user_file)$/.test(c.name) && Array.isArray(inp.files)) return { role: 'files', files: inp.files.map(String).slice(0, 20), caption: String(inp.caption || '').slice(0, 300), ts };
  if (c.name === 'AskUserQuestion' && Array.isArray(inp.questions)) return { role: 'ask', questions: inp.questions.slice(0, 4).map((q) => ({ question: String(q.question || ''), header: String(q.header || ''), options: (q.options || []).map((o) => String(o.label || '')) })), ts };
  if (c.name === 'ExitPlanMode' && inp.plan) return { role: 'plan', text: String(inp.plan).slice(0, 20000), ts };
  // A message this chat sent another chat, or a chat it started (Tasmeer Multi's chat tools)
  if (/^mcp__tasmeer_multi__(send_message|start_chat)$/.test(c.name)) {
    const start = c.name.endsWith('start_chat');
    return { role: 'relay', kind: start ? 'start' : 'send', to: String((start ? inp.title : inp.to) || ''), text: String((start ? inp.prompt : inp.message) || '').slice(0, 4000), reportBack: start ? inp.report_back !== false : !!inp.report_back, ts, id: c.id || '' };
  }
  if (c.name === 'mcp__tasmeer_multi__list_chats') return { role: 'tool', name: 'List chats', detail: String(inp.query || ''), ts, id: c.id || '' };
  if (c.name === 'mcp__tasmeer_multi__read_chat') return { role: 'tool', name: 'Read chat', detail: String(inp.chat || ''), ts, id: c.id || '' };
  return { role: 'tool', name: c.name, detail: toolDetail(inp), ts, id: c.id || '' };
}
const resultText = (x) => (typeof x.content === 'string' ? x.content : Array.isArray(x.content) ? x.content.map((y) => y.text || '').join('') : '');
// Your answer to AskUserQuestion comes back as its tool result: "...answered: "Q"="A", "Q2"="B"..."
function answeredItem(content, ts) {
  if (!Array.isArray(content)) return null;
  for (const x of content) {
    if (x.type !== 'tool_result') continue;
    const t = resultText(x);
    if (/^(Your questions have been answered|User has answered your question)/.test(t)) {
      const pairs = []; const re = /"((?:[^"\\]|\\.)*)"="((?:[^"\\]|\\.)*)"/g; let m;
      while ((m = re.exec(t)) && pairs.length < 8) pairs.push([m[1], m[2]]);
      return { role: 'answered', pairs, ts };
    }
    if (x.is_error && /^The user skipped this question/.test(t)) return { role: 'answered', pairs: [], skipped: true, ts };
  }
  return null;
}
function normalize(engine, e) {
  const out = [];
  const ts = e.timestamp;
  if (engine === 'claude') {
    if (e.isSidechain || e.isMeta) return out;
    // A message you sent while a reply was running ("Send now" here, or typing while it works in the Claude
    // app) is saved as a queued_command note, not as a message; without this it never showed (Nov 25, 2026).
    if (e.type === 'attachment' && e.attachment && e.attachment.type === 'queued_command') {
      const p = e.attachment.prompt;
      const t = typeof p === 'string' ? p : Array.isArray(p) ? p.filter((x) => x && x.type === 'text').map((x) => x.text).join('\n') : '';
      if (t && t.trim()) out.push({ role: 'user', text: t, ts, via: '', midRun: true });
      return out;
    }
    if (e.type === 'user' && e.message && (e.isCompactSummary || e.isVisibleInTranscriptOnly)) { out.push({ role: 'note', text: 'Claude Code summarized the earlier conversation here (the chat got long)', ts }); return out; }
    if (e.type === 'user' && e.message && (e.promptSource === 'system' || e.turnOrigin === 'task_notification' || /^\s*<task-notification>/.test(claudeText(e.message.content)))) { out.push({ role: 'note', text: 'A background task finished and reported back', ts }); return out; }
    if (e.type === 'user' && e.message) {
      const c = e.message.content;
      const ans = answeredItem(c, ts); if (ans) { out.push(ans); return out; }
      const raw = claudeText(c); const cmd = commandText(raw); const t = cmd || raw;
      if (t && (cmd || !isNoise(t)) && !(Array.isArray(c) && c.some((x) => x.type === 'tool_result'))) out.push({ role: 'user', text: t, ts, via: VIA[e.entrypoint] || e.entrypoint || '' });
    } else if (e.type === 'assistant' && e.message) {
      for (const c of e.message.content || []) {
        if (c.type === 'text' && c.text && c.text.trim()) out.push({ role: 'assistant', text: c.text, ts, model: e.message.model });
        else if (c.type === 'thinking' && c.thinking && c.thinking.trim()) out.push({ role: 'thinking', text: c.thinking.slice(0, 20000), ts }); // shown folded, like the Claude app
        else if (c.type === 'tool_use') out.push(toolItem(c, ts));
      }
    }
  } else {
    const p = e.payload || {};
    if (e.type === 'turn_context' && p.model) { out.push({ role: 'model', model: p.model, effort: p.effort || p.reasoning_effort || '' }); return out; }
    if (e.type !== 'response_item') return out;
    if (p.type === 'message') {
      const t = codexText(p.content);
      if (p.role === 'user' && !isNoise(t)) out.push({ role: 'user', text: t, ts });
      else if (p.role === 'assistant' && t.trim()) out.push({ role: 'assistant', text: t, ts });
    } else if (p.type === 'function_call' || p.type === 'custom_tool_call' || p.type === 'local_shell_call') {
      out.push({ role: 'tool', name: p.name || 'shell', detail: toolDetail(p.arguments ?? p.input ?? p.action), ts });
    } else if (p.type === 'web_search_call') {
      out.push({ role: 'tool', name: 'web search', detail: clip(p.action?.query || '', 160), ts });
    } else if (p.type === 'reasoning') { // Codex keeps a summary of its reasoning
      const t = (Array.isArray(p.summary) ? p.summary : []).map((x) => x && x.text || '').join('\n\n').trim();
      if (t) out.push({ role: 'thinking', text: t.slice(0, 20000), ts });
    }
  }
  return out;
}

// ---------- the list ----------
let cache = new Map(); // file -> {size, mtime, info}
const INFO_VERSION = 3; // 2: `updated` is the last real message, not the file's modified time; 3: slash commands name chats
// When the last real message was written. The file's modified time is not it: the Claude desktop app
// appends bookkeeping lines (cost-state, artifact-comment-monitor, last-prompt) to many chats at once,
// which made old chats read "2m" and jump to the top of the list (seen Nov 24, 2026).
function talkTime(engine, lines) {
  let at = 0;
  for (const e of lines) {
    let t = 0;
    if (engine === 'claude' && (e.type === 'user' || e.type === 'assistant') && !e.isMeta) t = Date.parse(e.timestamp || '') || 0;
    else if (engine === 'codex' && (e.type === 'response_item' || e.type === 'event_msg')) t = Date.parse(e.timestamp || '') || 0;
    if (t > at) at = t;
  }
  return at;
}
function infoFor(engine, file, st) {
  const head = linesIn(file, 0, Math.min(st.size, HEAD), st.size);
  const tail = st.size > HEAD ? linesIn(file, Math.max(0, st.size - TAIL), st.size, st.size) : head;
  let id; let cwd = ''; let title = ''; let first = '';
  if (engine === 'claude') {
    id = path.basename(file, '.jsonl');
    for (const e of head) { if (!cwd && e.cwd) cwd = e.cwd; if (!first && e.type === 'user' && !e.isSidechain && !e.isMeta && !e.isCompactSummary && !e.isVisibleInTranscriptOnly && e.promptSource !== 'system') { const raw = claudeText(e.message?.content); const cmd = commandText(raw); const t = cmd || raw; if ((cmd || !isNoise(t)) && !(Array.isArray(e.message?.content) && e.message.content.some((x) => x.type === 'tool_result')) && cleanTitle(t)) first = cleanTitle(t); } }
    for (const e of [...head, ...tail]) {
      if (e.type === 'custom-title' && e.customTitle) title = e.customTitle;
      else if (e.type === 'agent-name' && e.agentName && !title) title = e.agentName;
      else if (e.type === 'summary' && e.summary && !title) title = e.summary;
    }
    if (!first && !title) return null;
  } else {
    const meta = head.find((e) => e.type === 'session_meta')?.payload;
    if (!meta) return null;
    if (meta.parent_thread_id && meta.parent_thread_id !== meta.id) return null; // a helper thread, not a chat
    id = meta.id; cwd = meta.cwd || '';
    for (const e of head) {
      if (e.type === 'response_item' && e.payload?.type === 'message' && e.payload.role === 'user') {
        const t = codexText(e.payload.content); if (!isNoise(t) && cleanTitle(t)) { first = cleanTitle(t); break; }
      }
    }
    for (const e of tail) if (e.type === 'event_msg' && /thread_name/.test(e.payload?.type || '') && e.payload.name) title = e.payload.name;
    if (!first && !title) return null;
  }
  // the last real message in the tail; the file's time only when the tail holds none (one line bigger
  // than the tail, which is a message being written right now)
  const updated = talkTime(engine, tail) || st.mtimeMs;
  return { key: `${engine}:${id}`, engine, id, file, cwd, title: clip(title || first, 90), updated: Math.min(updated, st.mtimeMs), mtime: st.mtimeMs, size: st.size, v: INFO_VERSION };
}

function walkCodex(dir, out) {
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const d of ents) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walkCodex(p, out); else if (d.name.endsWith('.jsonl')) out.push(p);
  }
}
function allFiles() {
  const files = [];
  try {
    for (const d of fs.readdirSync(CLAUDE_DIR, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const dir = path.join(CLAUDE_DIR, d.name);
      for (const f of fs.readdirSync(dir)) if (f.endsWith('.jsonl')) files.push(['claude', path.join(dir, f)]);
    }
  } catch { /* no claude history */ }
  const cx = []; walkCodex(CODEX_DIR, cx);
  for (const f of cx) files.push(['codex', f]);
  return files;
}
function list() {
  const out = []; const seen = new Set();
  for (const [engine, file] of allFiles()) {
    let st; try { st = fs.statSync(file); } catch { continue; }
    seen.add(file);
    const c = cache.get(file);
    if (c && c.size === st.size && c.mtime === st.mtimeMs && (!c.info || c.info.v === INFO_VERSION)) { if (c.info) out.push(c.info); continue; }
    let info = null; try { info = infoFor(engine, file, st); } catch { /* unreadable */ }
    cache.set(file, { size: st.size, mtime: st.mtimeMs, info });
    if (info) out.push(info);
  }
  for (const k of cache.keys()) if (!seen.has(k)) cache.delete(k);
  out.sort((a, b) => b.updated - a.updated);
  // Codex keeps the names you see in its app in session_index.jsonl (newest line per chat wins).
  const names = codexNames();
  const seenKey = new Set(); const final = [];
  for (const s of out) {
    if (seenKey.has(s.key)) continue; // one chat can have an older copy of its file; keep the newest
    seenKey.add(s.key);
    final.push(s.engine === 'codex' && names[s.id] ? { ...s, title: names[s.id] } : s);
  }
  // The Claude desktop app keeps its own list of chats (with the names you gave them). Use its names, and
  // bring in chats it still lists whose transcript was moved to ~/.claude/archived-sessions.
  const app = appChats();
  const have = new Map(final.map((s, i) => [s.key, i]));
  for (const r of app) {
    const key = 'claude:' + r.cliSessionId;
    if (have.has(key)) { if (r.title) final[have.get(key)] = { ...final[have.get(key)], title: r.title }; continue; }
    const f = archivedFile(r.cliSessionId); if (!f) continue;
    try {
      const st = fs.statSync(f); const info = infoFor('claude', f, st);
      final.push({ ...(info || { key, engine: 'claude', id: r.cliSessionId, file: f, size: st.size }), key, title: r.title || (info && info.title) || 'Untitled', cwd: r.cwd || (info && info.cwd) || '', updated: Math.max(info ? info.updated : 0, r.lastActivityAt || 0) || st.mtimeMs, mtime: st.mtimeMs, archivedFile: true });
    } catch { /* unreadable */ }
  }
  final.sort((a, b) => b.updated - a.updated);
  return final;
}
function loadCache(f) { try { cache = new Map(Object.entries(JSON.parse(fs.readFileSync(f, 'utf8')))); } catch { /* none */ } }
function saveCache(f) { try { fs.writeFileSync(f + '.tmp', JSON.stringify(Object.fromEntries(cache))); fs.renameSync(f + '.tmp', f); } catch { /* ignore */ } }

// ---------- reading a chat ----------
const CHUNK = 3 * 1024 * 1024;
// Items from the part of the file that ends at `end`. Reads back further until there is something to show.
function readBefore(engine, file, end) {
  const size = fs.statSync(file).size;
  if (end == null) end = size;
  let start = end; let items = [];
  while (start > 0 && items.filter((i) => i.role !== 'tool' && i.role !== 'thinking').length < 6) {
    start = Math.max(0, start - CHUNK);
    const entries = linesIn(file, start, end, size);
    items = entries.flatMap((e) => normalize(engine, e));
    if (end - start > 20 * CHUNK) break;
  }
  return { items, start, size };
}
// New items appended since `from` (for following a chat that is running anywhere).
function readAfter(engine, file, from) {
  const size = fs.statSync(file).size;
  if (size <= from) return { items: [], end: from, size };
  const text = readRange(file, from, size);
  const lastNl = text.lastIndexOf('\n');
  if (lastNl < 0) return { items: [], end: from, size };
  const items = [];
  for (const line of text.slice(0, lastNl).split('\n')) {
    if (!line || line.charCodeAt(0) !== 123) continue;
    try { items.push(...normalize(engine, JSON.parse(line))); } catch { /* skip */ }
  }
  return { items, end: from + Buffer.byteLength(text.slice(0, lastNl + 1), 'utf8'), size };
}
function findFile(engine, id) {
  for (const [eng, f] of allFiles()) if (eng === engine && path.basename(f).includes(id)) return f;
  return null;
}

// Exact Claude model ids that answered your recent chats (e.g. claude-opus-5-5), newest chats first.
function claudeModelsSeen(limit = 60) {
  const files = allFiles().filter(([e]) => e === 'claude').map(([, f]) => { try { return [f, fs.statSync(f)]; } catch { return null; } })
    .filter(Boolean).sort((a, b) => b[1].mtimeMs - a[1].mtimeMs).slice(0, limit);
  const seen = new Set();
  for (const [f, st] of files) {
    let text = '';
    try { text = readRange(f, Math.max(0, st.size - 300 * 1024), st.size); } catch { continue; }
    for (const m of text.matchAll(/"model":"(claude-[a-z]+-[0-9][0-9-]*)/g)) seen.add(m[1].replace(/-$/, ''));
  }
  return [...seen];
}

// Every display item of a chat, read line by line (safe for very large files).
async function readAll(engine, file) {
  const readline = require('readline');
  const items = [];
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line || line.charCodeAt(0) !== 123) continue;
    try { items.push(...normalize(engine, JSON.parse(line))); } catch { /* skip */ }
  }
  return items;
}

// ---------- Claude desktop app's chat records ----------
let appCache = { at: 0, list: [] };
function appChats() {
  if (Date.now() - appCache.at < 20000) return appCache.list;
  const out = [];
  try {
    const base = path.join(process.env.LOCALAPPDATA || '', 'Claude-Data');
    const walk = (d, depth) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (depth < 4) walk(p, depth + 1); }
        else if (/^local_.*\.json$/.test(e.name)) { try { const j = JSON.parse(fs.readFileSync(p, 'utf8')); if (j.cliSessionId && !j.isArchived) out.push({ cliSessionId: j.cliSessionId, title: j.title || '', cwd: j.cwd || '', lastActivityAt: j.lastActivityAt || 0 }); } catch { /* skip */ } }
      }
    };
    for (const e of fs.readdirSync(base, { withFileTypes: true })) { const s = path.join(base, e.name, 'claude-code-sessions'); if (e.isDirectory() && fs.existsSync(s)) walk(s, 0); }
  } catch { /* Claude app not installed */ }
  appCache = { at: Date.now(), list: out };
  return out;
}
const ARCHIVE_DIR = path.join(MAIN.claude, 'archived-sessions');
function archivedFile(id) {
  try { for (const d of fs.readdirSync(ARCHIVE_DIR)) { const f = path.join(ARCHIVE_DIR, d, id + '.jsonl'); if (fs.existsSync(f)) return f; } } catch { /* none */ }
  return null;
}

const CODEX_INDEX = path.join(MAIN.codex, 'session_index.jsonl');
let namesCache = { mtime: 0, map: {} };
function codexNames() {
  try {
    const st = fs.statSync(CODEX_INDEX);
    if (st.mtimeMs === namesCache.mtime) return namesCache.map;
    const map = {};
    for (const line of fs.readFileSync(CODEX_INDEX, 'utf8').split('\n')) { if (!line) continue; try { const j = JSON.parse(line); if (j.id && j.thread_name) map[j.id] = j.thread_name; } catch { /* skip */ } }
    namesCache = { mtime: st.mtimeMs, map };
    return map;
  } catch { return {}; }
}
// Rename the real chat, the same way each tool does it itself, so the new name shows everywhere.
function rename(engine, id, file, title) {
  if (engine === 'codex') fs.appendFileSync(CODEX_INDEX, JSON.stringify({ id, thread_name: title, updated_at: new Date().toISOString() }) + '\n');
  else if (engine === 'claude') {
    const fd = fs.openSync(file, 'a+');
    try {
      const size = fs.fstatSync(fd).size; let nl = '';
      if (size > 0) { const b = Buffer.alloc(1); fs.readSync(fd, b, 0, 1, size - 1); if (b[0] !== 10) nl = '\n'; }
      fs.writeSync(fd, nl + JSON.stringify({ type: 'custom-title', customTitle: title, sessionId: id }) + '\n');
    } finally { fs.closeSync(fd); }
  } else return false;
  return true;
}

// Where a message was sent from (Claude Code writes this on every message).
const VIA = { 'claude-desktop': 'Claude app', cli: 'terminal', 'sdk-cli': 'headless (Tasmeer Multi or a script)', 'claude-vscode': 'VS Code', 'sdk-ts': 'a script', 'sdk-py': 'a script' };

// When was the last real message (not a bookkeeping line) written? Used for the "working" marker.
const talkCache = new Map();
function lastTalk(engine, file, mtime) {
  const c = talkCache.get(file); if (c && c.mtime === mtime) return c.at;
  let at = 0;
  try {
    const size = fs.statSync(file).size;
    for (const e of linesIn(file, Math.max(0, size - 128 * 1024), size, size)) {
      let t = 0;
      if (engine === 'claude' && (e.type === 'user' || e.type === 'assistant') && !e.isMeta) t = Date.parse(e.timestamp || '') || 0;
      if (engine === 'codex' && (e.type === 'response_item' || e.type === 'event_msg')) t = Date.parse(e.timestamp || '') || 0;
      if (t > at) at = t;
    }
  } catch { /* busy */ }
  talkCache.set(file, { mtime, at });
  return at;
}

module.exports = { lastTalk, rename, readAll, claudeModelsSeen, list, readBefore, readAfter, findFile, loadCache, saveCache };
