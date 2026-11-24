// Tasmeer Multi, the window. Look and motion: DESIGN.md. Data and runs: main.js, through window.multi.
const $ = (s) => document.querySelector(s);
const M = window.multi;
const T = window.SeatToken;
const { icon, iconEl } = window;
window.paintIcons();
$('#brand-mark').innerHTML = T.brand(20);
$('#model').dataset.heading = 'Model';
$('#effort').dataset.heading = 'Effort';
$('#mode').dataset.heading = 'What it may do';

let accounts = [];
let sessions = []; let filter = 'all'; let query = ''; let collapsed = {};
let cur = null;          // { key, engine, cwd, title, items, more }
let prefs = null;        // { key, accountId, mode, model, effort }
const lives = {};        // key -> live overlay from a run started here
const ranHere = {};      // key -> last time this app was running it
const held = {};         // key -> { text, at }: streamed words kept on screen until their saved copy arrives
const liveTextAt = {};   // key -> when streamed words were last on screen

const ENGINE_NAME = { claude: 'Claude', codex: 'Codex', antigravity: 'Gemini' };
const acctById = (id) => accounts.find((a) => a.id === id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
function ago(ms) {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'now'; if (s < 3600) return `${Math.floor(s / 60)}m`; if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function project(cwd) {
  const c = String(cwd || '');
  const m = c.match(/^(.*?)[\\/]\.(claude|codex|orca)[\\/]worktrees[\\/]([^\\/]+)/i);
  const rootDir = m ? m[1] : c;
  return { root: rootDir, name: rootDir.split(/[\\/]/).filter(Boolean).pop() || rootDir || 'Other', tree: m ? m[3] : '' };
}
// A long path keeps its start and its end (the file name), cut in the middle.
const midClip = (s, max = 96) => { s = String(s || ''); return s.length <= max ? s : s.slice(0, Math.round(max * 0.4)) + '…' + s.slice(-Math.round(max * 0.55)); };

// ---------- motion helpers (DESIGN.md "Motion") ----------
// Loops that are rebuilt on every redraw (working bars, waiting dots, the busy arc) share one clock,
// so a redraw never restarts them mid-swing.
function inPhase(node, period, offset = 0) { if (node) node.style.animationDelay = `${offset - period - (performance.now() % period)}ms`; return node; }
// An entrance plays once per thing, even when that thing is redrawn while it plays.
const firstSeen = new Map();
function enterOnce(node, id, cls = 'enter', ms = 260) {
  const now = performance.now();
  if (!firstSeen.has(id)) { firstSeen.set(id, now); if (firstSeen.size > 400) firstSeen.delete(firstSeen.keys().next().value); }
  const age = now - firstSeen.get(id);
  if (age < ms) { node.classList.add(cls); node.style.animationDelay = `${-age}ms`; }
  return node;
}
// The done dot: springs in and pulses twice when a chat finishes while this window is open, then rests.
const freshDone = {}; // key -> when it finished
function doneDot(key) {
  const d = el('span', 'done-dot'); d.title = 'Finished while you were away. Open it to read it.';
  const age = freshDone[key] ? performance.now() - freshDone[key] : Infinity;
  if (age < 1700) { d.classList.add('fresh'); d.style.animationDelay = `${-age}ms, ${500 - age}ms`; }
  return d;
}
// Seat tokens that stay alive between redraws, so their rings sweep when the numbers change.
const tokens = { side: new Map(), seats: new Map() };
function tokenFor(map, a, size) { let t = map.get(a.id); if (!t) { t = T.make(a, size); map.set(a.id, t); } else T.update(t, a); return t; }

// ---------- sidebar ----------
let org = { meta: {}, folders: [], pinOrder: [], theme: 'dark' };
const metaOf = (k) => org.meta[k] || {};
const titleOf = (s) => metaOf(s.key).title || s.title;
let drag = null; // key being dragged
let sideDirty = false; // a list redraw that waited for a drag to end (redrawing mid-drag throws the drag away)
let flatLimit = 0;
// While a chat is dragged, drop targets show at the top of the list: Pin, and New folder.
// (the targets appear right after dragstart, once the browser has taken the drag picture of the row)
function startDrag(key, row) { drag = key; setTimeout(() => { if (drag) { row.classList.add('dragging'); $('#chats').classList.add('dnd'); } }, 0); }
// The main list: newest first, or your own order once you have dragged chats into place (new chats on top).
function orderFlat(arr) {
  if (!org.listOrder || !org.listOrder.length) return arr;
  const pos = new Map(org.listOrder.map((k, i) => [k, i]));
  return [...arr.filter((s) => !pos.has(s.key)), ...arr.filter((s) => pos.has(s.key)).sort((a, b) => pos.get(a.key) - pos.get(b.key))];
}
// The whole main list's new order after dropping chat k above or below `target` (all chats, so a filter
// or a search never loses the places of the chats it hides).
function placeInFlat(k, target, after) {
  const inGroups = new Set([...org.pinOrder, ...org.folders.flatMap((f) => f.order)]);
  const all = orderFlat(sessions.filter((s) => !inGroups.has(s.key))).map((s) => s.key).filter((x) => x !== k);
  let i = all.indexOf(target); if (i < 0) i = all.length; else if (after) i += 1;
  all.splice(i, 0, k); return all;
}
function endDrag() {
  if (!drag && !$('#chats').classList.contains('dnd')) return;
  drag = null; clearDrop(); $('#chats').classList.remove('dnd');
  document.querySelectorAll('.chat.dragging').forEach((x) => x.classList.remove('dragging'));
  if (sideDirty) { sideDirty = false; renderSide(); }
}
document.addEventListener('dragend', endDrag, true);
document.addEventListener('mousemove', (e) => { if (drag && !e.buttons) endDrag(); }); // a drag that ended without telling us

function chatRow(s, where) {
  const mt = metaOf(s.key);
  const working = !!(s.running || s.active);
  const done = !working && !!s.done;
  const b = el('button', 'chat' + (cur && s.key === cur.key ? ' on' : '') + (working ? ' working' : '') + (done ? ' done' : ''));
  b.type = 'button'; b.draggable = true; b.dataset.key = s.key; b.dataset.where = where;
  b.append(el('span', 'emark ' + s.engine), el('span', 'tt', titleOf(s)));
  const right = el('span', 'right');
  if (s.archivedFile) { const a = el('span', 'arch'); a.append(iconEl('archive', 13)); right.append(a); }
  if (mt.star) { const st = el('span', 'star'); st.append(iconEl('starFill', 12)); right.append(st); }
  if (s.asking) { const q = el('span', 'ask-dot', '?'); q.title = 'Waiting for your answer'; right.append(q); }
  else if (working) { const eq = el('span', 'eq'); for (const o of [-200, -500, -800]) eq.append(inPhase(el('i'), 900, o)); right.append(eq); }
  else { if (done) right.append(doneDot(s.key)); right.append(el('span', 'when', ago(s.updated))); }
  b.append(right);
  const p = project(s.cwd);
  b.title = [
    titleOf(s),
    `${ENGINE_NAME[s.engine] || s.engine} chat in ${p.name}${p.tree ? ' (worktree ' + p.tree + ')' : ''}`,
    s.cwd,
    working ? 'Working right now.' : done ? 'Finished while you were away.' : 'Last message ' + when(s.updated) + '.',
    s.archivedFile ? 'Its history file was moved to the archive folder.' : '',
    'Right-click: pin, star, rename, folders, delete. Drag to move.',
  ].filter(Boolean).join('\n');
  b.onclick = () => select(s.key);
  b.oncontextmenu = (e) => { e.preventDefault(); M.chatMenu(s.key); };
  b.ondragstart = (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', s.key); startDrag(s.key, b); };
  b.ondragend = endDrag;
  // Every row takes a drop, in the main list, Pinned and folders: a blue line above or below the row
  // (whichever half the pointer is over) shows exactly where the chat lands.
  b.ondragover = (e) => {
    if (!drag || drag === s.key) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const r = b.getBoundingClientRect(); const side = e.clientY > r.top + r.height / 2 ? 'drop-after' : 'drop-before';
    if (!b.classList.contains(side)) { clearDrop(); b.classList.add(side); }
  };
  b.ondragleave = (e) => { if (!b.contains(e.relatedTarget)) b.classList.remove('drop-before', 'drop-after'); };
  b.ondrop = (e) => {
    e.preventDefault(); const after = b.classList.contains('drop-after'); const k = drag; clearDrop(); if (!k || k === s.key) return;
    if (where === 'project') { M.organise({ kind: 'place', key: k, order: placeInFlat(k, s.key, after) }); return; }
    const order = where === 'pinned' ? org.pinOrder : (org.folders.find((f) => f.id === where)?.order || []);
    const others = order.filter((x) => x !== k); const i = others.indexOf(s.key);
    M.organise({ kind: 'move', key: k, to: where, index: i < 0 ? undefined : i + (after ? 1 : 0) });
  };
  return b;
}
function clearDrop() { document.querySelectorAll('.drop-before, .drop-after, .drop-into').forEach((x) => x.classList.remove('drop-before', 'drop-after', 'drop-into')); }
function groupHead(id, name, count, opts = {}) {
  const head = el('button', 'group' + (collapsed[id] ? ' shut' : ''));
  head.type = 'button';
  head.append(iconEl('chevronDown', 14, 'chev'));
  if (opts.icon) head.append(iconEl(opts.icon, 14));
  head.append(el('span', 'gname', name), el('span', 'count', String(count)));
  head.title = opts.title || name;
  head.onclick = () => { collapsed[id] = !collapsed[id]; M.setCollapsed(collapsed); renderSide(); };
  if (opts.menu) head.oncontextmenu = (e) => { e.preventDefault(); opts.menu(); };
  if (opts.dropTo) dropTarget(head, (k) => M.organise({ kind: 'move', key: k, to: opts.dropTo }));
  return head;
}
// A drop target for a dragged chat: highlights while a chat is over it, then runs `onDrop(key)`.
function dropTarget(node, onDrop) {
  node.ondragover = (e) => { if (!drag) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; clearDrop(); node.classList.add('drop-into'); };
  node.ondragleave = () => node.classList.remove('drop-into');
  node.ondrop = (e) => { e.preventDefault(); const k = drag; clearDrop(); if (k) onDrop(k); };
  return node;
}
function renderSide() {
  if (drag) { sideDirty = true; return; }
  const box = $('#chats'); const keep = box.scrollTop; box.textContent = '';
  // the drop targets a dragged chat needs, shown only while dragging (stays at the top as the list scrolls)
  const bar = el('div', 'dnd-bar');
  const pinT = el('div', 'dnd-target'); pinT.append(iconEl('pin', 14), el('span', null, 'Pin')); pinT.title = 'Drop a chat here to pin it';
  const folderT = el('div', 'dnd-target'); folderT.append(iconEl('folder', 14), el('span', null, 'New folder')); folderT.title = 'Drop a chat here to start a new folder with it';
  bar.append(dropTarget(pinT, (k) => M.organise({ kind: 'move', key: k, to: 'pinned' })), dropTarget(folderT, (k) => askFolder(k)));
  box.append(bar);
  const q = query.toLowerCase();
  const match = (s) => (filter === 'all' || filter === 'star' || filter === 'archived' || s.engine === filter)
    && (filter !== 'star' || metaOf(s.key).star)
    && (filter === 'archived' ? metaOf(s.key).archived : !metaOf(s.key).archived)
    && (!q || titleOf(s).toLowerCase().includes(q) || s.cwd.toLowerCase().includes(q));
  const list = sessions.filter(match);
  const byKey = new Map(list.map((s) => [s.key, s]));
  const placed = new Set();

  // Pinned (in your order)
  const pinned = org.pinOrder.map((k) => byKey.get(k)).filter(Boolean);
  if (pinned.length) {
    box.append(groupHead('__pinned', 'Pinned', pinned.length, { icon: 'pin', dropTo: 'pinned', title: 'Drag chats here to pin them' }));
    if (!collapsed.__pinned) for (const s of pinned) box.append(chatRow(s, 'pinned'));
    for (const s of pinned) placed.add(s.key);
  }
  // Your folders (in your order)
  for (const f of org.folders) {
    const items = f.order.map((k) => byKey.get(k)).filter(Boolean).filter((s) => !placed.has(s.key));
    box.append(groupHead('__f_' + f.id, f.name, items.length, { icon: 'folder', dropTo: f.id, menu: () => M.folderMenu(f.id), title: 'Your folder. Drag chats in; right-click to rename or delete.' }));
    if (!collapsed['__f_' + f.id]) for (const s of items) box.append(chatRow(s, f.id));
    for (const s of items) placed.add(s.key);
  }
  // Everything else: one flat list (no project groups), newest first or in your own order.
  const rest = orderFlat(list.filter((s) => !placed.has(s.key)));
  if ((pinned.length || org.folders.length || org.listOrder) && rest.length) {
    const lab = el('div', 'list-label'); lab.append(el('span', null, 'Chats'));
    if (org.listOrder) { const b = el('button', 'list-sort', 'Sort by newest'); b.type = 'button'; b.title = 'Put the chats in newest-first order once. After that they stay where they are: nothing moves unless you drag it.'; b.onclick = () => M.organise({ kind: 'sort', mode: 'recent' }); lab.append(b); }
    box.append(lab);
  }
  const limit = flatLimit || (q || filter === 'star' ? 1e9 : 80);
  for (const s of rest.slice(0, limit)) box.append(chatRow(s, 'project'));
  if (rest.length > limit) { const m = el('button', 'more-in', `Show ${rest.length - limit} more`); m.type = 'button'; m.onclick = () => { flatLimit = limit + 200; renderSide(); }; box.append(m); }
  if (!list.length) box.append(el('div', 'side-empty', sessions.length ? (filter === 'star' ? 'No starred chats yet. Right-click a chat to star it.' : filter === 'archived' ? 'Nothing archived.' : 'No chats match.') : 'Reading your chats...'));
  const nf = el('button', 'more-in newf'); nf.type = 'button'; nf.append(iconEl('plus', 14), document.createTextNode('New folder')); nf.onclick = () => askFolder(); box.append(dropTarget(nf, (k) => askFolder(k)));
  box.scrollTop = keep;
  renderAccounts();
}
// Accounts can be tucked away: the heading stays, with one small square per account in its colour.
function renderAccounts() {
  const tucked = !!collapsed.__accounts;
  $('#acct-toggle').classList.toggle('shut', tucked);
  $('#acct-count').textContent = accounts.length ? String(accounts.length) : '';
  const dots = $('#acct-dots'); dots.textContent = ''; dots.hidden = !tucked;
  if (tucked) for (const x of accounts) { const d = el('i', x.signedIn ? '' : 'off'); d.style.background = T.hueOf(x); d.title = x.label + (x.signedIn ? '' : ' (not signed in)'); dots.append(d); }
  const ab = $('#accounts'); ab.hidden = tucked; ab.textContent = '';
  for (const a of accounts) {
    const row = el('div', 'acct');
    // the engine name sits beside the email, so the usage rows get the full width for their reset times
    const nm = el('span', 'n'); const nl = el('span', 'nl');
    nl.append(el('span', 'nn', a.label), el('span', 's' + (a.signedIn ? '' : ' off'), a.signedIn ? (ENGINE_NAME[a.engine] || a.engine) : 'sign in'));
    nm.append(nl);
    const ub = usageBars(a.usage); if (ub) nm.append(ub);
    if (a.usage && a.usage.windows) {
      const fresh = !a.usage.failedAt || a.usage.failedAt < a.usage.at;
      const at = new Date(a.usage.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      nm.append(fresh ? freshness('ucheck', a.usage.at, 'checked ') : el('span', 'ucheck stale', 'numbers from ' + at + '; last check ' + (/skipped/.test(a.usage.failReason || '') ? a.usage.failReason : 'failed')));
    }
    if (a.sameAs) { const w = el('span', 'same-warn', 'Same limits as ' + a.sameAs + ': probably the same login. Sign this one in again.'); w.title = 'Both logins report identical usage at the same time, so one of them is really the other account. Right-click > Sign in again.'; nm.append(w); }
    row.append(tokenFor(tokens.side, a, 26), nm);
    row.title = `${a.label}  (${a.engine === 'codex' ? 'Codex' : a.engine === 'antigravity' ? 'Gemini (Antigravity)' : 'Claude Code'}${a.main ? ', your normal login' : ''})\nRight-click: sign in, remove`;
    row.oncontextmenu = (e) => { e.preventDefault(); M.accountMenu(a.id); };
    row.ondblclick = () => M.accountMenu(a.id);
    ab.append(row);
  }
}
function select(key) { M.open(key); }
$('#search').addEventListener('input', (e) => { query = e.target.value; renderSide(); });
$('#filter').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  filter = b.dataset.f; for (const x of $('#filter').children) x.classList.toggle('on', x === b); renderSide();
});
// chats can be dropped onto the plain list to leave Pinned or a folder
$('#chats').addEventListener('dragover', (e) => { if (drag) e.preventDefault(); });
$('#chats').addEventListener('drop', (e) => { if (!drag || e.defaultPrevented) return; e.preventDefault(); const k = drag; clearDrop(); M.organise({ kind: 'move', key: k, to: 'project' }); });

// ---------- new chat: pick who answers ----------
function renderSeats() {
  const box = $('#seats'); if ($('#welcome').hidden) return;
  box.textContent = '';
  for (const a of accounts) {
    const c = el('button', 'seat-card' + (prefs && prefs.accountId === a.id ? ' on' : '')); c.type = 'button';
    const l = T.left(a);
    const name = el('span', 'sc-name'); name.append(el('span', 'emark ' + a.engine), el('span', 'sc-nm', a.label));
    c.append(tokenFor(tokens.seats, a, 44), name);
    // the 5-hour and weekly windows: what is left and how long until each resets
    const ws = (a.usage && a.usage.windows) || [];
    const pick = [ws.find((w) => /^5-hour$/i.test(w.label)), ws.find((w) => /^weekly$/i.test(w.label))].filter(Boolean);
    const shown = pick.length ? pick : ws.slice(0, 2);
    if (!a.signedIn) c.append(el('span', 'sc-sub off', 'not signed in'));
    else if (!shown.length) c.append(el('span', 'sc-sub', ENGINE_NAME[a.engine] || a.engine));
    else {
      const g = el('span', 'sc-usage');
      for (const w of shown) { const left = leftOf(w); const r = el('span', 'sc-row' + levelOf(left)); r.append(el('span', 'sc-lab', w.short || w.label), el('span', 'sc-val', left == null ? '?' : left + '%'), resetCell(w, 'sc-reset')); g.append(r); }
      c.append(g);
    }
    c.title = `${a.label}, ${ENGINE_NAME[a.engine]}` + shown.map((w) => `\n${w.label}: ${leftOf(w) == null ? 'unknown' : leftOf(w) + '% left'}, resets ${resetWhen(w)}`).join('') + (l && l.stale ? '\n(the last check failed, so these numbers may be old)' : '');
    c.onclick = async () => { await M.setPrefs('new', { accountId: a.id }); $('#input').focus(); };
    box.append(c);
  }
}

// ---------- the chat ----------
const fmtDur = (ms) => { const s = Math.round(ms / 1000); if (s < 60) return s + 's'; const m = Math.round(s / 60); return m < 60 ? m + 'm' : `${Math.floor(m / 60)}h ${m % 60}m`; };
const tsOf = (it) => { const t = it && it.ts ? new Date(it.ts).getTime() : NaN; return Number.isFinite(t) ? t : null; };
function groupItems(items) {
  // user bubbles, and one assistant block for everything between two user messages
  const out = []; let block = null; let lastT = null;
  for (const it of items) {
    if (it.role === 'model') continue;
    const t = tsOf(it);
    if (it.role === 'note') { block = null; out.push({ kind: 'note', text: it.text, ts: it.ts, voice: !!it.voice }); }
    else if (it.role === 'user') { block = null; out.push({ kind: 'user', text: it.text, ts: it.ts, via: it.via, midRun: !!it.midRun }); }
    else {
      if (!block) { block = { kind: 'assistant', parts: [] }; out.push(block); }
      if (it.ts) block.ts = it.ts;
      const last = block.parts[block.parts.length - 1];
      if (it.role === 'tool' || it.role === 'thinking') { // thinking folds in with the steps around it
        const x = it.role === 'thinking' ? { thinking: true, text: it.text, ts: it.ts } : it;
        if (last && last.kind === 'tools') { last.list.push(x); if (t) last.end = t; }
        else block.parts.push({ kind: 'tools', list: [x], start: lastT, end: t || lastT });
      } else {
        if (last && last.kind === 'tools' && t) last.end = t; // whatever comes after the steps closes them
        if (it.role === 'relay') block.parts.push({ kind: 'relay', relay: it });
        else if (it.role === 'files') block.parts.push({ kind: 'files', files: it.files, caption: it.caption });
        else if (it.role === 'ask') block.parts.push({ kind: 'ask', questions: it.questions });
        else if (it.role === 'answered') { const q = [...block.parts].reverse().find((p) => p.kind === 'ask' && !p.answered); if (q) q.answered = it; else block.parts.push({ kind: 'ask', questions: [], answered: it }); }
        else if (it.role === 'plan') block.parts.push({ kind: 'plan', text: it.text });
        else block.parts.push({ kind: 'text', text: it.text });
      }
    }
    if (t) lastT = t;
  }
  return out;
}
// Tool names as people read them: the app's own chat tools by what they do, other MCP tools by name
// and server ("navigate (Chrome)"), Claude Code's own tools as they are (Bash, Read, Edit).
const TM_TOOL = { send_message: 'Message a chat', start_chat: 'Start a chat', list_chats: 'List chats', read_chat: 'Read a chat', send_user_file: 'Show files' };
function niceTool(name) {
  const n = String(name || 'step'); const parts = n.split('__');
  if (parts[0] !== 'mcp' || parts.length < 3) return n;
  const server = parts[1]; const tool = parts.slice(2).join('__');
  if (server === 'tasmeer_multi') return TM_TOOL[tool] || tool.replace(/_/g, ' ');
  return tool.replace(/_/g, ' ') + ' (' + (/chrome/i.test(server) ? 'Chrome' : server.replace(/[_-]+/g, ' ')) + ')';
}
// "Worked for 15m" (when the chat file has times), else "6 steps"; the list itself is built on first open.
// Thinking folds in with its steps; a stretch of only thinking reads "Thought for 8s".
function renderTools(p) {
  const list = p.list; const tools = list.filter((x) => !x.thinking);
  const d = el('details', 'steps'); const s = el('summary');
  s.append(iconEl('chevronRight', 14));
  const dur = p.start && p.end && p.end > p.start ? p.end - p.start : 0;
  if (!tools.length) {
    s.append(el('span', 'sum-text', dur >= 1000 ? 'Thought for ' + fmtDur(dur) : 'Thought'));
    s.title = 'What it thought before answering (click to read)';
  } else if (tools.length === 1) {
    s.append(el('span', 'sum-name', niceTool(tools[0].name)));
    if (tools[0].detail) s.append(el('span', 'sum-text sum-tool', midClip(tools[0].detail, 80)));
    s.title = `${niceTool(tools[0].name)} ${tools[0].detail || ''}`.trim();
  } else {
    s.append(el('span', 'sum-text', dur >= 1000 ? 'Worked for ' + fmtDur(dur) : `${tools.length} steps`));
    if (dur >= 1000) s.append(el('span', 'sum-count', `${tools.length} steps`));
    s.title = [...new Set(tools.map((x) => niceTool(x.name)))].join(', ');
  }
  d.append(s);
  d.addEventListener('toggle', () => {
    if (!d.open || d.querySelector('.tool-list')) return;
    const box = el('div', 'tool-list');
    for (const x of list) {
      if (x.thinking) { box.append(thoughtNode(x.text)); continue; }
      const r = el('div', 'tool'); const sp = el('span', null, midClip(x.detail)); sp.title = x.detail || ''; r.append(el('b', null, niceTool(x.name)), sp); box.append(r);
    }
    d.append(box);
  });
  return d;
}
// One stretch of thinking: plain words, muted; a long one shows its first lines until you ask for all.
function thoughtNode(text) {
  const t = String(text || '').trim(); const n = el('div', 'thought'); n.append(el('div', 'thought-text', t));
  if (t.length > 420 || (t.match(/\n/g) || []).length > 4) {
    n.classList.add('clamped');
    const more = el('button', 'thought-more', 'Show all'); more.type = 'button';
    more.onclick = () => { const c = n.classList.toggle('clamped'); more.textContent = c ? 'Show all' : 'Show less'; };
    n.append(more);
  }
  return n;
}
// ---------- chats talking to each other ----------
// A message from another chat starts with the app's header line; it reads as "From <that chat>".
const RELAY_RE = /^\[Tasmeer Multi: (message|reply) from the chat "([^"\n]*)" \(([^)\n]*)\)([^\]\n]*)\]\s*/;
function relayOf(text) { const m = RELAY_RE.exec(String(text || '')); return m ? { kind: m[1], title: m[2], key: m[3], body: String(text).slice(m[0].length) } : null; }
const chatByRef = (ref) => { const r = String(ref || '').trim(); if (!r) return null; const low = r.toLowerCase(); return sessions.find((s) => s.key === r) || sessions.find((s) => titleOf(s).toLowerCase() === low) || null; };
function relayFrom(rel) { // the label over a message another chat sent
  const b = el('button', 'relay-from'); b.type = 'button';
  b.append(iconEl('incoming', 13), el('span', null, (rel.kind === 'reply' ? 'Reply from ' : 'From ') + rel.title));
  const s = chatByRef(rel.key);
  if (s) { b.title = 'Open that chat'; b.onclick = () => M.open(s.key); } else { b.disabled = true; b.title = 'That chat is not in the list'; }
  return b;
}
function renderRelay(p) { // a message this chat sent another chat, or a chat it started
  const r = p.relay; const box = el('div', 'relay-out');
  const target = r.kind === 'send' ? chatByRef(r.to) : (r.to ? chatByRef(r.to) : null);
  const head = el(target ? 'button' : 'div', 'relay-head');
  if (target) { head.type = 'button'; head.title = 'Open that chat'; head.onclick = () => M.open(target.key); }
  head.append(iconEl('forward', 13), el('span', 'relay-label', r.kind === 'start' ? 'Started a new chat' + (r.to ? `: ${r.to}` : '') : 'Sent to ' + (target ? titleOf(target) : r.to || 'another chat')));
  if (r.reportBack) head.append(el('span', 'relay-meta', 'its reply comes back here'));
  box.append(head);
  if (r.text) box.append(el('div', 'relay-text', r.text));
  return box;
}
// ---------- files a run showed you, questions it asked, plans it proposed (from the chat file) ----------
const IMG = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
const fileUrl = (p) => 'file:///' + String(p).replace(/\\/g, '/').split('/').map((s, i) => (i === 0 && /^[A-Za-z]:$/.test(s) ? s : encodeURIComponent(s))).join('/');
function renderFiles(p) {
  const box = el('div', 'files');
  if (p.caption) box.append(el('div', 'files-cap', p.caption));
  const row = el('div', 'files-row');
  for (const f of p.files) {
    const name = f.split(/[\\/]/).pop(); const ext = (name.includes('.') ? name.split('.').pop() : '').toUpperCase().slice(0, 5) || 'FILE';
    const isImg = IMG.test(f); const card = el('div', 'fcard' + (isImg ? ' img' : '')); card.title = f;
    if (isImg) {
      const im = document.createElement('img'); im.className = 'fthumb'; im.alt = name; im.loading = 'lazy'; im.src = fileUrl(f);
      im.onerror = () => { card.classList.remove('img'); card.classList.add('missing'); im.replaceWith(el('span', 'file-ext', ext)); };
      im.onclick = () => M.openFile(f); card.append(im);
    } else card.append(el('span', 'file-ext', ext));
    const info = el('div', 'finfo'); info.append(el('span', 'file-name', name), el('span', 'file-meta', f.split(/[\\/]/).slice(0, -1).join('\\')));
    const acts = el('div', 'facts');
    const open = el('button', 'ghost-btn', 'Open'); open.type = 'button'; open.onclick = () => M.openFile(f);
    const show = el('button', 'ghost-btn', 'Show in folder'); show.type = 'button'; show.onclick = () => M.revealFile(f);
    acts.append(open, show); info.append(acts); card.append(info); row.append(card);
  }
  box.append(row); return box;
}
function renderAsked(p) { // what Claude asked you and what you chose
  const pending = cur && lives[cur.key] && lives[cur.key].ask;
  if (!p.answered && pending) return null; // it is on screen as a live card right now
  const pairs = new Map((p.answered && p.answered.pairs) || []);
  const qs = p.questions.length ? p.questions : [...pairs.keys()].map((q) => ({ question: q }));
  const box = el('div', 'asked');
  for (const q of qs) {
    const row = el('div', 'asked-row'); row.append(el('span', 'asked-mark', '?'));
    const qa = el('div', 'asked-qa'); qa.append(el('div', 'asked-q', q.question));
    const a = pairs.get(q.question);
    qa.append(el('div', 'asked-a' + (a ? '' : ' none'), a || (p.answered ? (p.answered.skipped ? 'You skipped this question' : 'Answered') : 'Not answered')));
    row.append(qa); box.append(row);
  }
  return box;
}
function renderPlan(p) {
  const d = el('details', 'steps'); const s = el('summary'); s.append(iconEl('chevronRight', 14), el('span', 'sum-text', 'Proposed a plan')); d.append(s);
  d.addEventListener('toggle', () => { if (!d.open || d.querySelector('.plan-body')) return; const b = el('div', 'body plan-body'); b.innerHTML = window.renderMarkdown(p.text); d.append(b); });
  return d;
}

// ---------- what a run asks you right now: a question, a permission, a plan ----------
// The card is kept between redraws (the live box redraws often), so a half-typed answer survives.
const askCards = new Map(); // ask id -> card
function askCard(key, live) {
  const a = live.ask; let card = askCards.get(a.id); if (card) return card;
  card = el('div', 'ask-card'); card.dataset.fit = '';
  const err = el('div', 'ask-err'); err.hidden = true;
  const reply = async (r, lock = true) => {
    if (lock) { card.classList.add('sent'); card.querySelectorAll('button, input').forEach((x) => { x.disabled = true; }); }
    const ok = await M.answer(key, a.id, r);
    if (!ok) { card.classList.remove('sent'); card.querySelectorAll('button, input').forEach((x) => { x.disabled = false; }); err.textContent = 'Could not send your answer: this run may have ended.'; err.hidden = false; }
  };
  if (a.kind === 'question') buildQuestions(card, a, reply);
  else if (a.kind === 'plan') buildChoice(card, a, reply, 'Plan ready for your OK', 'Keep planning', 'Approve plan');
  else buildChoice(card, a, reply, `Wants to use ${a.tool}`, 'Deny', 'Allow');
  card.append(err);
  askCards.set(a.id, card); if (askCards.size > 30) askCards.delete(askCards.keys().next().value);
  return card;
}
function buildQuestions(card, a, reply) {
  const qs = (a.input && a.input.questions) || [];
  const picks = qs.map(() => new Set()); const other = qs.map(() => '');
  const submit = el('button', 'primary', qs.length > 1 ? 'Send answers' : 'Send answer'); submit.type = 'button'; submit.disabled = true;
  const ready = () => qs.length > 0 && qs.every((q, i) => picks[i].size || other[i].trim());
  const send = () => {
    if (!ready()) return;
    const answers = {};
    qs.forEach((q, i) => { const chosen = [...picks[i]]; if (other[i].trim()) chosen.push(other[i].trim()); answers[q.question] = chosen.join(', '); });
    reply({ decision: 'allow', answers });
  };
  qs.forEach((q, i) => {
    const box = el('div', 'ask-q');
    if (q.header) box.append(el('div', 'ask-head', q.header));
    box.append(el('div', 'ask-text', q.question));
    const opts = el('div', 'ask-opts' + (q.multiSelect ? ' multi' : ''));
    const inp = el('input', 'ask-other'); inp.placeholder = q.multiSelect ? 'Add your own answer' : 'Or type your own answer'; inp.spellcheck = true;
    (q.options || []).forEach((o) => {
      const b = el('button', 'ask-opt'); b.type = 'button';
      b.append(el('span', 'ask-mark'), el('span', 'ask-label', o.label)); if (o.description) b.append(el('span', 'ask-desc', o.description));
      b.onclick = () => {
        if (q.multiSelect) { if (picks[i].has(o.label)) picks[i].delete(o.label); else picks[i].add(o.label); b.classList.toggle('on', picks[i].has(o.label)); }
        else {
          picks[i].clear(); picks[i].add(o.label); other[i] = ''; inp.value = '';
          opts.querySelectorAll('.ask-opt').forEach((x) => x.classList.toggle('on', x === b));
          if (qs.length === 1) { send(); return; } // one question, one choice: answered with one click
        }
        submit.disabled = !ready();
      };
      opts.append(b);
    });
    inp.oninput = () => { other[i] = inp.value; if (!q.multiSelect && inp.value.trim()) { picks[i].clear(); opts.querySelectorAll('.ask-opt').forEach((x) => x.classList.remove('on')); } submit.disabled = !ready(); };
    inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } };
    box.append(opts, inp); card.append(box);
  });
  const row = el('div', 'ask-actions');
  const skip = el('button', 'ghost-btn', 'Skip'); skip.type = 'button'; skip.title = 'Let it carry on without your answer';
  skip.onclick = () => reply({ decision: 'deny' });
  submit.onclick = send;
  row.append(skip, submit); card.append(row);
}
function buildChoice(card, a, reply, title, noLabel, yesLabel) { // a permission prompt or a plan approval
  const box = el('div', 'ask-q'); box.append(el('div', 'ask-text', title));
  if (a.kind === 'plan') { const b = el('div', 'body ask-plan'); b.innerHTML = window.renderMarkdown(String(a.input.plan || '')); box.append(b); }
  else if (a.detail || a.input) { const d = el('div', 'ask-detail', a.detail || JSON.stringify(a.input, null, 2).slice(0, 1500)); box.append(d); }
  const why = el('input', 'ask-other'); why.placeholder = a.kind === 'plan' ? 'What to change (optional)' : 'Why not, or what to do instead (optional)';
  const row = el('div', 'ask-actions');
  const no = el('button', 'ghost-btn', noLabel); no.type = 'button'; no.onclick = () => reply({ decision: 'deny', message: why.value });
  const yes = el('button', 'primary', yesLabel); yes.type = 'button'; yes.onclick = () => reply({ decision: 'allow' });
  row.append(no, yes); card.append(box, why, row);
}

// The message list is built once per chat. New messages only redraw the last block, and the
// "is working" box redraws alone, so a long chat does not get rebuilt on every update.
function partNode(p) { // one piece of a reply: steps, files, a question, a plan, a message to a chat, or words
  if (p.kind === 'tools') return renderTools(p);
  if (p.kind === 'files') return renderFiles(p);
  if (p.kind === 'ask') return renderAsked(p);
  if (p.kind === 'plan') return renderPlan(p);
  if (p.kind === 'relay') return renderRelay(p);
  const d = el('div', 'body'); d.innerHTML = window.renderMarkdown(p.text); return d;
}
function blockNode(b) {
  if (b.kind === 'note') {
    if (b.voice) { // a line the Antigravity voice assistant spoke
      const n = el('div', 'voice-line blk'); n.append(iconEl('speaker', 15));
      const t = el('span', 'vl-text', String(b.text).replace(/^Voice replied:\s*"?/, '').replace(/"$/, ''));
      if (b.ts) t.append(el('span', 'vl-who', 'voice, ' + when(b.ts)));
      n.append(t); return n;
    }
    const n = el('div', 'note-row blk'); const s = el('span', 'note', b.text);
    if (b.ts) s.append(document.createTextNode(', ' + when(b.ts)));
    n.append(s); return n;
  }
  if (b.kind === 'user') {
    const rel = relayOf(b.text); const text = rel ? rel.body : b.text;
    const w = el('div', 'user-wrap blk' + (rel ? ' relay-in' : ''));
    if (rel) w.append(relayFrom(rel));
    const m = el('div', 'msg user', text.length > 6000 ? text.slice(0, 6000) + '\n...' : text); m.dataset.fit = '';
    w.append(m);
    const via = rel || b.midRun ? '' : b.via; // a message from another chat says so above it, not "sent from headless"
    if (b.ts || via || b.midRun) w.append(el('div', 'stamp', [b.ts ? when(b.ts) : '', b.midRun ? 'sent while it worked' : via ? 'sent from ' + via : ''].filter(Boolean).join(', ')));
    return w;
  }
  const box = el('div', 'msg assistant blk'); box.dataset.fit = '';
  for (const p of b.parts) { const n = partNode(p); if (n) box.append(n); }
  const texts = b.parts.filter((p) => p.kind === 'text' && p.text).map((p) => p.text);
  if (b.ts || texts.length) {
    const meta = el('div', 'reply-meta');
    if (b.ts) { const t = el('time', null, when(b.ts)); t.title = new Date(b.ts).toLocaleString(); meta.append(t); }
    if (texts.length) { const c = el('button', 'icon-btn reply-copy'); c.type = 'button'; c.title = 'Copy this reply'; c.append(iconEl('copy', 14)); c._text = texts.join('\n\n'); meta.append(c); }
    box.append(meta);
  }
  return box;
}
let landed = null; // the last message sent from here that already landed on screen
const pend = {}; // key -> { user, appended }: how much of the chat had arrived when your message was sent
const queues = {}; // key -> messages waiting for that chat to be free: [{ id, text, by, from, at }]
// ---------- the run going on in the open chat ----------
// A run is one unit at the bottom of the chat (Nov 24, 2026). Before, every step that reached the chat
// file was drawn above the "is working" line as if the reply were finished, while the line showed that
// same step again, or nothing once Claude had written a word, so the line sat between its own steps.
// Now everything the run did stays under its line,
// in order, and the last line always says what it is doing right now.
// Where the run's own items start in the chat: just after its message, or at its first newer item when
// its message is not in the file (yet). null when no run is going here.
function liveTurnStart(k) {
  const live = lives[k]; if (!live || live.done || live.error || !cur || cur.key !== k) return null;
  // one clock (this PC) for the run's start and the file's times; a queued message starts 0.3 s after the
  // last reply ended, so only a hair of slack, or that reply would jump into the new run's box
  const items = cur.items; const t0 = (live.startedAt || 0) - 250;
  let lastU = -1; for (let i = items.length - 1; i >= 0; i -= 1) if (items[i].role === 'user') { lastU = i; break; }
  // its time decides when it has one ("continue" sent twice must not match the older one); else its words
  if (lastU >= 0) { const u = items[lastU]; const t = tsOf(u); if (t ? t >= t0 : !!live.user && u.text.trim() === live.user.trim()) return lastU + 1; }
  for (let i = lastU + 1; i < items.length; i += 1) { const t = tsOf(items[i]); if (t && t >= t0) return i; }
  return null;
}
const histItems = () => { const s = cur ? liveTurnStart(cur.key) : null; return s == null ? cur.items : cur.items.slice(0, s); };
// The run's steps and words so far, kept between redraws (they only change when the chat file grows),
// with any fold you opened still open.
let turnCache = null; // { key, sig, node }
function turnNode(k, items, running) {
  const sig = k + '|' + items.length + '|' + running.join(',') + '|' + (items.length ? items[items.length - 1].ts || '' : '');
  if (turnCache && turnCache.key === k && turnCache.sig === sig) return turnCache.node;
  const open = turnCache && turnCache.key === k ? [...turnCache.node.querySelectorAll('details')].map((x) => x.open) : [];
  const node = el('div', 'turn'); const skip = new Set(running);
  const shown = items.filter((it) => !(it.role === 'tool' && it.id && skip.has(it.id))); // a step still running is the activity line
  for (const b of groupItems(shown)) {
    if (b.kind === 'assistant') for (const p of b.parts) { const n = partNode(p); if (n) node.append(n); }
    else if (b.kind === 'note') node.append(blockNode(b));
  }
  [...node.querySelectorAll('details')].forEach((x, i) => { if (open[i]) x.open = true; });
  turnCache = { key: k, sig, node };
  return node;
}
// "23s", "4m 05s", "1h 02m": a run's clock, ticking every second.
const runClock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); if (s < 60) return s + 's'; const m = Math.floor(s / 60); if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`; return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };
const runMeta = (live) => runClock(Date.now() - live.startedAt) + (live.steps ? `, ${live.steps} step${live.steps === 1 ? '' : 's'}` : '');
const lastWords = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? '…' + s.slice(-n) : s; };
// What it is doing right now, always shown while it works.
function activityNodes(live) {
  const a = el('div', 'activity'); const out = [a];
  const dots = el('span', 'typing'); for (const o of [0, 200, 400]) dots.append(inPhase(el('i'), 1200, o)); a.append(dots);
  const run = (live.running || []).filter(Boolean); const ph = live.phase || 'starting';
  if (ph === 'tool' && run.length) {
    const st = run[0];
    a.append(el('span', 'act-verb', 'Running'), el('span', 'act-name', niceTool(st.name)));
    if (st.detail) { const d = el('span', 'act-detail', midClip(st.detail, 90)); d.title = st.detail; a.append(d); }
    if (run.length > 1) a.append(el('span', 'act-more', `+${run.length - 1} more`));
    const tm = el('span', 'act-time'); tm.dataset.since = String(st.at || Date.now()); tm.textContent = Date.now() - st.at >= 3000 ? runClock(Date.now() - st.at) : ''; a.append(tm);
    if (live.sub && !live.sub.done) { // a helper agent's own step, under its Agent step
      const s = el('div', 'activity sub'); s.append(el('span', 'act-hook', '↳'), el('span', 'act-name', niceTool(live.sub.name)));
      if (live.sub.detail) { const d = el('span', 'act-detail', midClip(live.sub.detail, 80)); d.title = live.sub.detail; s.append(d); }
      if (live.subSteps > 1) s.append(el('span', 'act-more', `${live.subSteps} steps inside`));
      out.push(s);
    }
  } else if (ph === 'preparing') { a.append(el('span', 'act-verb', 'Writing a step')); if (live.prep) a.append(el('span', 'act-name', niceTool(live.prep))); }
  else if (ph === 'writing') a.append(el('span', 'act-verb', 'Writing'));
  else if (ph === 'thinking') { // its newest words: up to two lines, cut at the start, never at the end
    a.append(el('span', 'act-verb', 'Thinking'));
    if (live.thinking) { a.classList.add('think'); const t = el('span', 'act-think', lastWords(live.thinking, 180)); t.title = 'What it is thinking (the last words so far)'; a.append(t); }
  }
  else a.append(el('span', 'act-verb', 'Starting'));
  return out;
}
function queueNodes(k) { // your messages (and other chats') waiting for this chat to be free
  const out = [];
  for (const q of queues[k] || []) {
    const rel = relayOf(q.text);
    const w = el('div', 'user-wrap live-part queued');
    const row = el('div', 'q-label');
    row.append(el('span', null, q.by === 'you' ? 'Queued, goes when this reply finishes' : `Waiting, from ${(q.from && q.from.title) || 'another chat'}`));
    const x = el('button', 'icon-btn q-drop'); x.type = 'button'; x.append(iconEl('close', 12));
    x.title = q.by === 'you' ? 'Take it back: it goes back in the message box' : 'Remove it: that chat is not told';
    x.onclick = async () => { x.disabled = true; const t = await M.unqueue(k, q.id); if (t && cur && cur.key === k && !input.value.trim()) { input.value = t; grow(); saveDraft(); input.focus(); } };
    if (M.queueSendNow) { // or send it now, into the reply that is running
      const now = el('button', 'q-now', 'Send now'); now.type = 'button';
      now.title = cur && cur.engine === 'claude' ? 'Send it into the reply that is running: Claude reads it after the step it is on' : 'Stop this reply and send it now';
      now.onclick = async () => { now.disabled = true; x.disabled = true; await M.queueSendNow(k, q.id); };
      row.append(now);
    }
    row.append(x);
    const m = el('div', 'msg user pending', rel ? rel.body : q.text); m.dataset.fit = '';
    w.append(row, m);
    out.push(w);
  }
  return out;
}
// Messages sent into the running reply ("Send now"), shown until the chat file has them: first "sent",
// then "Claude has it" once Claude Code takes it (it echoes each message it takes).
function saidNodes(k) {
  const live = lives[k]; if (!live || live.done || live.error || !live.said || !live.said.length || !cur) return [];
  const landed = (m) => cur.items.some((it) => it.role === 'user' && it.text.trim() === m.text.trim() && (tsOf(it) || 0) >= m.at - 2000);
  return live.said.filter((m) => !landed(m)).map((m) => {
    const w = el('div', 'user-wrap live-part said');
    const b = el('div', 'msg user pending', m.text); b.dataset.fit = '';
    w.append(b, el('div', 'stamp', m.taken ? 'Claude has it' : 'Sent: Claude reads it after the step it is on'));
    enterOnce(w, 's:' + k + ':' + m.at, 'arrive', 500);
    return w;
  });
}
function liveNodes() {
  const k = cur && cur.key; const live = k ? lives[k] : null; const out = [];
  const h = k && held[k] && Date.now() - held[k].at < 6000 ? held[k] : null;
  if (!live) { // finished: keep its last words up until the chat file has them
    if (h) { const box = el('div', 'msg assistant live-part'); const d = el('div', 'body'); d.innerHTML = window.renderMarkdown(h.text); box.append(d); out.push(box); }
    return out;
  }
  const busy = !live.done && !live.error; // the run is still going
  const asking = busy && !!live.ask;       // ...and waiting for you
  const working = busy && !asking;
  const start = busy ? liveTurnStart(k) : null;
  if (live.user && busy) {
    // Your message shows as "just sent" only until the chat file has it (or anything newer than the run).
    const p = pend[k] && pend[k].user === live.user ? pend[k] : (pend[k] = { user: live.user, appended: cur.appended || 0 });
    const noTimes = !cur.items.some((i) => i.ts);
    const saved = start != null || (noTimes && (cur.appended || 0) > p.appended);
    if (!saved) {
      const rel = relayOf(live.user);
      const w = el('div', 'user-wrap live-part' + (rel ? ' relay-in' : ''));
      if (rel) w.append(relayFrom(rel));
      w.append(el('div', 'msg user pending', rel ? rel.body : live.user));
      enterOnce(w, 'u:' + k + ':' + live.user, 'arrive', 500); landed = live.user.trim();
      out.push(w);
    }
  }
  const box = el('div', 'msg assistant live live-part');
  const acc = accounts.find((x) => x.label === live.account) || { id: 'live:' + live.account, label: live.account || '?', engine: cur.engine };
  const who = el('div', 'who');
  const tok = T.make(acc, 16, { busy: working }); inPhase(tok.querySelector('.seat-busy'), 1100);
  who.append(tok, el('span', 'who-text' + (asking ? ' asking' : ''), asking ? `${live.account} ${live.ask.kind === 'question' ? 'is asking you' : 'needs your OK'}` : working ? `${live.account} is working` : live.account || ''));
  // how long it has been going and how many steps it took, so a long run reads as alive, not stuck
  if (busy && live.startedAt) {
    const m = el('span', 'who-meta', runMeta(live)); m.dataset.since = String(live.startedAt); m.dataset.steps = String(live.steps || 0);
    m.title = 'Running since ' + new Date(live.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    who.append(m);
  }
  box.append(who);
  if (start != null) {
    // from its own message, so the first fold times itself from it ("Worked for 5m", as it will read once done)
    const from = start > 0 && cur.items[start - 1].role === 'user' ? start - 1 : start;
    const n = turnNode(k, cur.items.slice(from), (live.running || []).map((x) => x.id).filter(Boolean)); if (n.childNodes.length) box.append(n);
  }
  const text = live.text || (h ? h.text : '');
  if (text) { const d = el('div', 'body'); d.innerHTML = window.renderMarkdown(text); box.append(d); liveTextAt[k] = Date.now(); }
  if (asking) box.append(askCard(k, live));
  else if (working) box.append(...activityNodes(live));
  if (live.error) { const er = el('div', 'error', live.error); if (live.errorDetail) er.title = live.errorDetail; box.append(er); }
  if (live.suggest) { // only switches the account; never sends anything by itself
    const s = el('div', 'suggest'); s.append(el('span', null, 'This account looks out of usage.'));
    const btn = el('button', 'primary', 'Switch to ' + live.suggest.name); btn.type = 'button';
    btn.onclick = async () => { const kk = cur.key; const ok = await M.setPrefs(kk, { accountId: live.suggest.accountId }); if (ok) { delete lives[kk]; renderLive(); input.placeholder = 'Switched account. Type your next message to carry on...'; input.focus(); } };
    s.append(btn); box.append(s);
  }
  enterOnce(box, 'a:' + k + ':' + (live.user || ''), 'enter', 260);
  out.push(box);
  return out;
}
const atBottom = (log) => log.scrollHeight - log.scrollTop - log.clientHeight < 160;
function finishLog(log, stick) {
  log.querySelectorAll(':scope > .live-part, :scope > .empty-note').forEach((n) => n.remove());
  const ln = cur ? [...liveNodes(), ...saidNodes(cur.key), ...queueNodes(cur.key)] : []; for (const n of ln) log.append(n);
  if (cur && !cur.items.length && !ln.length && cur.key !== 'new') log.append(el('div', 'empty-note', cur.error ? 'Could not read this chat: ' + cur.error : 'No messages to show in this chat.'));
  if (stick || (cur && cur.justOpened)) { log.scrollTop = log.scrollHeight; if (cur) cur.justOpened = false; }
}
let shownBlocks = 0; // blocks of this chat already on screen; only blocks after these animate in
function renderLog() { // full rebuild: opening a chat, loading earlier messages
  const log = $('#log'); const stick = atBottom(log);
  log.textContent = ''; shownBlocks = 0;
  if (!cur) return;
  if (cur.more) { const b = el('button', 'load-more', 'Load earlier messages'); b.type = 'button'; b.onclick = () => { b.disabled = true; b.textContent = 'Loading...'; M.more(); }; log.append(b); }
  const blocks = groupItems(histItems()); const frag = document.createDocumentFragment();
  for (const b of blocks) frag.append(blockNode(b));
  log.append(frag); shownBlocks = blocks.length;
  finishLog(log, stick);
}
function renderTail() { // new messages arrived: redraw only the last block and anything after it
  const log = $('#log'); if (!cur) return; const stick = atBottom(log);
  const blocks = groupItems(histItems());
  const nodes = [...log.querySelectorAll(':scope > .blk')];
  const keep = Math.max(0, Math.min(nodes.length, blocks.length) - 1);
  for (const n of nodes.slice(keep)) n.remove();
  log.querySelectorAll(':scope > .live-part, :scope > .empty-note').forEach((n) => n.remove());
  const quiet = Date.now() - (liveTextAt[cur.key] || 0) < 5000; // its words were already on screen while they streamed
  blocks.slice(keep).forEach((b, i) => {
    const n = blockNode(b);
    const mine = b.kind === 'user' && landed && b.text.trim() === landed; // your own message already landed
    if (keep + i >= shownBlocks && !quiet && !mine) n.classList.add('enter');
    log.append(n);
  });
  shownBlocks = blocks.length;
  finishLog(log, stick);
}
function renderLive() { const log = $('#log'); if (!cur) return; finishLog(log, atBottom(log)); }
// One redraw per frame, doing the most any update asked for (a new message in the file redraws the tail;
// a live update only the run's box). Before, a live update in the same frame cancelled a tail redraw.
const need = { tail: false, live: false }; let needFrame = 0;
function redraw(what) {
  need[what] = true;
  if (needFrame) return;
  needFrame = requestAnimationFrame(() => {
    needFrame = 0; const t = need.tail; const l = need.live; need.tail = false; need.live = false;
    renderHead(); if (t) renderTail(); else if (l) renderLive(); renderPicker();
  });
}
// The run's clock and each step's clock tick every second without redrawing anything else.
setInterval(() => {
  const now = Date.now();
  document.querySelectorAll('#log .who-meta[data-since]').forEach((m) => { const s = Number(m.dataset.since); const n = Number(m.dataset.steps || 0); m.textContent = runClock(now - s) + (n ? `, ${n} step${n === 1 ? '' : 's'}` : ''); });
  document.querySelectorAll('#log .act-time[data-since]').forEach((m) => { const s = Number(m.dataset.since); m.textContent = now - s >= 3000 ? runClock(now - s) : ''; });
}, 1000);
// Keep the newest message in view when the message box grows (attachments, a long draft, a notice).
let logStuck = true;
$('#log').addEventListener('scroll', () => { logStuck = atBottom($('#log')); }, { passive: true });
new ResizeObserver(() => { const log = $('#log'); if (logStuck) log.scrollTop = log.scrollHeight; }).observe($('#dock'));
// "Opus 5.5" from claude-opus-5-5; other ids shown as they are.
function niceModel(id) {
  const m = String(id || '').match(/^claude-([a-z]+)-([0-9][0-9-]*)/);
  if (m) return m[1][0].toUpperCase() + m[1].slice(1) + ' ' + m[2].replace(/-$/, '').split('-').join('.');
  return String(id || '').replace(/^gemini-/, 'Gemini ').replace(/^gpt-/, 'GPT-');
}
const isNewChat = () => !cur || cur.key === 'new';
function renderCrumbMark() {
  const eng = isNewChat() ? (acctById(prefs && prefs.accountId)?.engine || cur?.engine || 'claude') : cur.engine;
  const m = $('#crumb-mark'); m.className = 'emark ' + eng; m.title = (ENGINE_NAME[eng] || eng) + ' chat';
}
function renderHead() {
  // The model that really wrote the last reply, read from the chat file itself.
  const lastModel = cur ? [...cur.items].reverse().find((i) => i.model && i.model !== '<synthetic>') : null;
  const ran = $('#ran'); ran.hidden = !lastModel;
  if (lastModel) { ran.textContent = 'last reply: ' + niceModel(lastModel.model) + (lastModel.effort ? ', ' + lastModel.effort : ''); ran.title = 'Read from the chat file: ' + lastModel.model + (lastModel.effort ? ', effort ' + lastModel.effort : ''); }
  const isNew = isNewChat();
  const welcome = isNew && !lives.new;
  $('#welcome').hidden = !welcome;
  $('#log').hidden = welcome;
  const p = project(cur?.cwd);
  $('#crumb-proj').textContent = p.name; $('#crumb-proj').title = cur?.cwd || '';
  $('#title').textContent = cur ? cur.title : 'New chat'; $('#title').title = cur ? cur.title : '';
  renderCrumbMark();
  $('#folder-path').textContent = shortPath(cur?.cwd);
  $('#folder').title = isNew ? `New chat runs in ${cur?.cwd} (click to change)` : `Runs in ${cur?.cwd}`;
  $('#folder').disabled = !isNew;
  $('#reveal').hidden = isNew;
  if (welcome) renderSeats();
}
function shortPath(p) { if (!p) return 'folder'; const parts = p.split(/[\\/]/).filter(Boolean); return parts.length > 2 ? `...\\${parts.slice(-2).join('\\')}` : p; }

// ---------- composer ----------
let pickTok = null; // the seat token in the message box: springs when the account changes
function renderPicker() {
  const sel = $('#acct'); sel.textContent = '';
  const isNew = isNewChat();
  const engs = isNew ? ['claude', 'codex', 'antigravity'] : [cur.engine]; // an existing chat continues on accounts of its own kind
  for (const eng of engs) {
    const g = document.createElement('optgroup');
    g.label = { claude: 'Claude Code accounts', codex: 'Codex accounts', antigravity: 'Gemini (Antigravity)' }[eng];
    for (const a of accounts.filter((x) => x.engine === eng)) {
      const l = T.left(a); const pct = l ? Math.round(l.frac * 100) : null;
      const o = el('option', null, a.label); o.value = a.id; o.dataset.short = a.label; o.dataset.swatch = T.hueOf(a);
      o.dataset.meta = !a.signedIn ? 'not signed in' : pct == null ? '' : `${pct}% left`;
      o.dataset.level = !a.signedIn ? 'low' : pct == null ? '' : pct <= 10 ? 'crit' : pct <= 30 ? 'low' : '';
      g.append(o);
    }
    sel.append(g);
  }
  if (prefs) sel.value = prefs.accountId;
  const acct = acctById(sel.value);
  if (!pickTok) { pickTok = T.make(acct, 20); $('#acct-seat').append(pickTok); } else T.update(pickTok, acct);
  if (prefs) $('#mode').value = prefs.mode || 'full';
  renderModels(acct); renderEfforts(acct); applyChrome(); renderUsageLine(acct); renderCrumbMark();
  if (window.syncDropdowns) window.syncDropdowns();
  const slashOk = acct?.engine === 'claude' ? ', / for skills' : '';
  $('#input').dataset.idle = isNew ? `Ask ${ENGINE_NAME[acct?.engine] || 'Claude'} anything${slashOk}` : `Reply as ${acct?.label || ''}${slashOk}`;
  $('#input').placeholder = $('#input').dataset.idle;
  renderSend();
  // A chat that something else is writing to right now (Orca, a terminal, the desktop app).
  const s = cur && sessions.find((x) => x.key === cur.key);
  const busyElsewhere = s && !s.running && Date.now() - s.updated < 45000 && !(Date.now() - (ranHere[s.key] || 0) < 90000);
  const arch = s && s.archivedFile;
  $('#notice').hidden = !busyElsewhere && !arch;
  $('#notice').textContent = arch ? 'This chat\'s history file was moved to the archive folder, so you can read it here but a reply will fail until the file is restored.' : busyElsewhere ? 'This chat was written to in the last minute, maybe from another window. Sending here runs next to it.' : '';
  if (!$('#welcome').hidden) renderSeats();
}
// While a reply is being written, the button stops it; once you type, it queues your message instead
// (it goes the moment the reply finishes, like the Claude app's queue).
const isRunning = () => !!(cur && lives[cur.key] && !lives[cur.key].done && !lives[cur.key].error);
function renderSend() {
  const running = isRunning(); const typed = !!($('#input').value.trim() || attachments.length);
  const stop = running && !typed;
  const go = $('#go'); const want = stop ? 'stop' : 'send';
  go.classList.toggle('stop', stop);
  go.title = stop ? 'Stop' : running ? 'Queue: it goes when this reply finishes (Enter). Ctrl+Enter sends it now.' : 'Send (Enter)'; go.setAttribute('aria-label', stop ? 'Stop' : running ? 'Queue' : 'Send');
  // Send now, next to it while a reply runs: into that reply (Claude), or stop it and send (Codex, Gemini)
  const now = $('#go-now');
  if (now) {
    const claude = !!(cur && cur.engine === 'claude');
    now.hidden = !(running && typed && cur && cur.key !== 'new' && M.sendNow);
    now.textContent = claude ? 'Send now' : 'Stop and send';
    now.title = claude ? 'Claude reads it after the step it is on, without waiting for this reply to finish (Ctrl+Enter)' : 'Stops this reply and sends yours right away (Ctrl+Enter)';
  }
  if (go._icon !== want) { go._icon = want; go.innerHTML = icon(want, stop ? 14 : 16); }
  go.disabled = !running && !typed;
  const ph = running ? 'Working. Enter queues your message, Ctrl+Enter sends it now...' : input.dataset.idle;
  if (ph && input.placeholder !== ph && !/^Switched account/.test(input.placeholder)) input.placeholder = ph;
}
const key = () => (cur ? cur.key : 'new');
$('#acct').addEventListener('change', async (e) => { applyChrome(); await M.setPrefs(key(), { accountId: e.target.value }); $('#input').focus(); });
$('#mode').addEventListener('change', (e) => M.setPrefs(key(), { mode: e.target.value }));
$('#model').addEventListener('change', (e) => M.setPrefs(key(), { model: e.target.value }));
// The model list comes from the picked account itself, so it is always that login's current models.
function renderModels(acct) {
  const sel = $('#model'); sel.textContent = '';
  const info = acct?.models || { default: '', options: [] };
  const def = info.options.find((o) => o.value === info.default);
  const defName = info.defaultLabel || (def ? def.label : niceModel(info.default));
  const d = el('option', null, info.default ? `${defName} (default)` : 'Default model'); d.value = ''; d.dataset.short = info.default ? defName : 'Model'; sel.append(d);
  for (const o of info.options) { const x = el('option', null, o.label); x.value = o.value; x.title = o.desc || ''; sel.append(x); }
  const want = prefs?.model || '';
  if (want && !info.options.some((o) => o.value === want)) { const x = el('option', null, `${want} (not in this account's list)`); x.value = want; x.dataset.short = want; sel.append(x); }
  sel.value = want;
  sel.closest('label').title = (info.options.find((o) => o.value === want) || def || {}).desc || 'Model for this chat';
}
const input = $('#input');
function grow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, window.innerHeight * 0.4) + 'px'; renderSend(); }
input.addEventListener('input', grow);
input.addEventListener('input', () => saveDraft());
input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit({ now: e.ctrlKey || e.metaKey }); } });
$('#go-now').addEventListener('click', () => { submit({ now: true }); input.focus(); });
$('#composer').addEventListener('submit', (e) => {
  e.preventDefault();
  if (isRunning() && !input.value.trim() && !attachments.length) M.stop(cur.key); else submit();
});
function submit(opts = {}) { // opts.now: while a reply runs, send into it instead of queueing
  const text = input.value.trim(); if (!text && !attachments.length) return;
  const running = isRunning();
  if (running && key() === 'new') return; // a brand-new chat takes its next message once it has its name
  if (!running) delete lives[key()];
  input.value = ''; grow(); saveDraft();
  if (key() === 'new') sentFromNew = Date.now();
  if (!running) lastSent[key()] = text; // to give it back if the send is refused before it starts
  const files = attachments.map((x) => x.path);
  attachments = []; renderAttach();
  const k = key();
  const go = running && opts.now && M.sendNow ? M.sendNow : M.send;
  go(k, text, files).then((r) => { if (r === 'refused' && cur && cur.key === k && !input.value.trim()) { input.value = text; grow(); saveDraft(); } });
}

// ---------- header / misc ----------
$('#folder').addEventListener('click', () => { if (isNewChat()) M.pickFolder(); });
$('#reveal').addEventListener('click', () => cur && M.reveal(cur.key));
$('#new').addEventListener('click', () => M.open('new'));
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); M.open('new'); }
  if (e.ctrlKey && (e.key === 'k' || e.key === 'K' || e.key === 'f' || e.key === 'F')) { e.preventDefault(); $('#search').focus(); $('#search').select(); }
  if (e.key === 'Escape' && !$('#modal').hidden) closeAsk();
});
$('#log').addEventListener('click', (e) => {
  const a = e.target.closest('a[data-ext]'); if (a) { e.preventDefault(); M.openExternal(a.getAttribute('href')); return; }
  const c = e.target.closest('.copy');
  if (c) { const code = c.closest('.code').querySelector('code').textContent; navigator.clipboard.writeText(code).then(() => { c.textContent = 'Copied'; setTimeout(() => { c.textContent = 'Copy'; }, 1200); }).catch(() => {}); return; }
  const r = e.target.closest('.reply-copy');
  if (r) navigator.clipboard.writeText(r._text || '').then(() => { r.innerHTML = icon('check', 14); r.title = 'Copied'; setTimeout(() => { r.innerHTML = icon('copy', 14); r.title = 'Copy this reply'; }, 1200); }).catch(() => {});
});

// ---------- dialog ----------
let onOk = null;
function ask({ title, help, value = '', placeholder = '', ok = 'OK', engine = false }, fn) {
  $('#m-title').textContent = title; $('#m-help').textContent = help || ''; $('#m-help').hidden = !help; $('#m-engine').hidden = !engine;
  $('#m-input').value = value; $('#m-input').placeholder = placeholder; $('#m-ok').textContent = ok;
  onOk = fn; $('#modal').hidden = false; setTimeout(() => $('#m-input').focus(), 30);
}
function closeAsk() { $('#modal').hidden = true; onOk = null; }
$('#m-form').addEventListener('submit', async (e) => { e.preventDefault(); const eng = document.querySelector('input[name=eng]:checked').value; if (onOk) await onOk($('#m-input').value, eng); closeAsk(); });
$('#m-cancel').addEventListener('click', closeAsk);
$('#add-acct').addEventListener('click', () => ask({
  title: 'Add an account',
  help: 'A window opens where you sign in to that account (your browser handles the password). It shares the same chats as all your other accounts.',
  placeholder: 'A name for now; it shows the email once signed in', ok: 'Add and sign in', engine: true,
}, (name, eng) => M.addAccount({ engine: eng, name })));
function askFolder(k) { ask({ title: 'New folder', placeholder: 'Folder name', ok: 'Create' }, (v) => M.organise({ kind: 'new-folder', name: v, key: k })); }
M.onAsk(({ kind, id, name, key: k }) => {
  if (kind === 'rename') ask({ title: 'Rename account', value: name, ok: 'Save' }, (v) => M.renameAccount(id, v));
  if (kind === 'rename-chat') ask({ title: 'Rename chat', help: 'Only changes the name shown here. The chat itself is untouched.', value: name, ok: 'Save' }, (v) => M.organise({ kind: 'rename', key: k, title: v }));
  if (kind === 'new-folder') askFolder(k);
  if (kind === 'rename-folder') ask({ title: 'Rename folder', value: name, ok: 'Save' }, (v) => M.organise({ kind: 'rename-folder', id, name: v }));
});
M.onOrg((o) => {
  org = o; applyTheme(); applySide(); applyChrome(); applySpeaker();
  if (document.documentElement.classList.contains('still')) requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('still')));
  if (cur && cur.key !== 'new') { const s = sessions.find((x) => x.key === cur.key); if (s && titleOf(s) !== cur.title) { cur.title = titleOf(s); renderHead(); } }
  renderSide();
});
// ---------- theme ----------
const THEMES = ['dark', 'light', 'system'];
function applyTheme() {
  const t = org.theme || 'dark';
  document.documentElement.dataset.theme = t;
  const b = $('#theme'); if (!b) return;
  b.innerHTML = icon(t === 'dark' ? 'moon' : t === 'light' ? 'sun' : 'system', 15);
  b.title = `Theme: ${t} (click to change)`;
}
$('#theme').addEventListener('click', () => { const t = THEMES[(THEMES.indexOf(org.theme || 'dark') + 1) % THEMES.length]; org.theme = t; applyTheme(); M.organise({ kind: 'theme', theme: t }); });

// ---------- wire up ----------
M.onAccounts((d) => { accounts = d.accounts; renderSide(); renderPicker(); });
let lastSessions = ''; let seenSessions = false; let wasDone = new Set();
M.onSessions((list) => {
  const doneNow = new Set(list.filter((s) => s.done && !(s.running || s.active)).map((s) => s.key));
  if (seenSessions) for (const k of doneNow) if (!wasDone.has(k)) freshDone[k] = performance.now();
  wasDone = doneNow; seenSessions = true;
  const sig = JSON.stringify(list.map((s) => [s.key, s.title, s.running, s.active, s.done, Math.floor((Date.now() - s.updated) / 60000)]));
  if (sig === lastSessions) { sessions = list; return; }
  lastSessions = sig; sessions = list;
  if (cur && cur.key !== 'new') { const s = list.find((x) => x.key === cur.key); if (s && titleOf(s) !== cur.title) { cur.title = titleOf(s); renderHead(); } }
  renderSide(); renderPicker();
});
M.onCollapsed((c) => { collapsed = c || {}; renderSide(); });
// Drafts are kept per chat, and survive a restart: switching chats never loses what you typed.
const draftKey = (k) => 'tm-draft:' + k;
function saveDraft() { try { if (input.value) localStorage.setItem(draftKey(key()), input.value); else localStorage.removeItem(draftKey(key())); } catch { /* storage off */ } }
let sentFromNew = 0; // a new chat just sent: its follow-up draft moves with it when it gets its own key
M.onView((v) => {
  const carry = cur && cur.key === 'new' && v.key !== 'new' && Date.now() - sentFromNew < 120000 ? input.value : '';
  cur = { ...v, justOpened: true }; prefs = null;
  try { if (carry) { localStorage.setItem(draftKey(v.key), carry); localStorage.removeItem(draftKey('new')); } input.value = localStorage.getItem(draftKey(v.key)) || ''; } catch { input.value = carry; }
  grow(); renderHead(); renderLog(); renderSide(); renderPicker(); input.focus();
});
M.onAppend((d) => { if (!cur || d.key !== cur.key) return; delete held[d.key]; cur.items.push(...d.items); cur.appended = (cur.appended || 0) + d.items.length; redraw('tail'); });
M.onPrepend((d) => {
  if (!cur || d.key !== cur.key) return;
  const log = $('#log'); const fromBottom = log.scrollHeight - log.scrollTop;
  cur.items = [...d.items, ...cur.items]; cur.more = d.more; renderLog();
  log.scrollTop = log.scrollHeight - fromBottom;
});
// Streamed words that the run just let go of (a step started, or the reply finished) stay up until
// the chat file has them, so they never blink out and back in.
function savedAlready(k, text) {
  if (!cur || cur.key !== k) return false;
  const want = text.trim().slice(0, 160);
  for (let i = cur.items.length - 1; i >= 0; i -= 1) { const it = cur.items[i]; if (it.role === 'user') break; if (it.role === 'assistant' && it.text && it.text.trim().slice(0, 160) === want) return true; }
  return false;
}
// A send refused before it started (Codex: the chat is open in the Codex app) gives your message back.
const lastSent = {};
function giveBack(k) {
  const text = lastSent[k]; delete lastSent[k]; if (!text) return;
  if (cur && cur.key === k) { if (!input.value.trim()) { input.value = text; grow(); saveDraft(); input.focus(); } }
  else { try { if (!localStorage.getItem(draftKey(k))) localStorage.setItem(draftKey(k), text); } catch { /* storage off */ } }
}
M.onLive((d) => {
  ranHere[d.key] = Date.now();
  if (d.live && d.live.error && /nothing was sent/.test(d.live.error)) giveBack(d.key);
  const before = lives[d.key];
  const going = (l) => !!(l && !l.done && !l.error);
  if (before && before.text && !(d.live && d.live.text) && !savedAlready(d.key, before.text)) { held[d.key] = { text: before.text, at: Date.now() }; setTimeout(() => { if (cur && cur.key === d.key) renderLive(); }, 6100); }
  if (d.live) lives[d.key] = d.live; else delete lives[d.key];
  if (d.live && d.live.text) delete held[d.key];
  if (cur && (d.key === cur.key || (cur.key === 'new' && d.key === 'new'))) {
    // a run starting or ending moves its steps between its own box and the chat: redraw the tail, quietly
    if (going(before) !== going(d.live)) { liveTextAt[d.key] = Date.now(); redraw('tail'); } else redraw('live');
  }
  renderSide();
});
// Messages waiting for a chat to be free, as main.js keeps them.
M.onQueue((d) => {
  if (d.items && d.items.length) queues[d.key] = d.items; else delete queues[d.key];
  if (cur && cur.key === d.key) { redraw('live'); renderSend(); }
});
M.onPrefs((p) => { if ((cur ? cur.key : 'new') === p.key) { prefs = p; renderPicker(); } });
// An update to the app landed: offer a restart that waits until no chat is running.
if (M.onUpdate) M.onUpdate((u) => {
  let row = $('#update'); if (!row) { row = el('div', 'update-row'); row.id = 'update'; $('.side-top').after(row); }
  row.textContent = '';
  row.append(iconEl('refresh', 14), el('span', 'grow', u.waiting ? 'Restarts when running chats finish' : 'Update ready'));
  const b = el('button', 'ghost-btn', u.waiting ? 'Now' : 'Restart'); b.type = 'button';
  b.title = u.waiting ? 'Restart right away: running chats stop' : 'Restart to load the update (waits for running chats to finish)';
  b.onclick = () => M.restart(!u.waiting);
  row.append(b);
});
M.onSelect((k) => M.open(k));

// ---------- sidebar width (drag the edge) and hiding it (Ctrl+B): a spring, 0.35 s, no bounce ----------
const rootStyle = document.documentElement.style;
let sideMotion = null;
const sideTarget = () => (org.sideHidden ? 0 : (org.sideWidth || 300));
function applySide(animate = false) {
  rootStyle.setProperty('--side-w', (org.sideWidth || 300) + 'px');
  const shell = $('#shell'); const target = sideTarget();
  if (!sideMotion) {
    sideMotion = new window.Motion({ col: target }, (v) => {
      rootStyle.setProperty('--side-col', Math.max(0, v.col).toFixed(2) + 'px');
      if (org.sideHidden && v.col <= 0.5) shell.classList.add('noside');
    });
    sideMotion.eps = { col: 0.5 };
    sideMotion.set({ col: target });
  }
  if (!org.sideHidden) shell.classList.remove('noside');
  if (animate) sideMotion.to({ col: target }, { duration: 0.35, bounce: 0 });
  else if (sideMotion.springs.col.target !== target) sideMotion.set({ col: target }); // never cut a slide short
}
(() => {
  const rz = $('#resizer'); let startX = 0; let startW = 0;
  rz.addEventListener('mousedown', (e) => {
    e.preventDefault(); startX = e.clientX; startW = $('#side').getBoundingClientRect().width;
    document.body.classList.add('resizing'); rz.classList.add('on');
    const move = (ev) => { const w = Math.max(200, Math.min(640, startW + ev.clientX - startX)); org.sideWidth = w; rootStyle.setProperty('--side-w', w + 'px'); sideMotion.set({ col: w }); };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); document.body.classList.remove('resizing'); rz.classList.remove('on'); M.organise({ kind: 'side', width: org.sideWidth }); };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  });
  rz.addEventListener('dblclick', () => { org.sideWidth = 300; applySide(); M.organise({ kind: 'side', width: 300 }); });
})();
function toggleSide() { org.sideHidden = !org.sideHidden; applySide(true); M.organise({ kind: 'side', hidden: org.sideHidden }); }
$('#side-toggle').addEventListener('click', toggleSide);
$('#side-close').addEventListener('click', toggleSide);
document.addEventListener('keydown', (e) => { if (e.ctrlKey && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); toggleSide(); } });
// ---------- Claude in Chrome switch ----------
function applyChrome() {
  const b = $('#chrome'); const on = org.chrome !== false;
  b.classList.toggle('on', on);
  b.title = on ? 'Claude in Chrome is ON: Claude can use your Chrome through the extension. Click to turn off.' : 'Claude in Chrome is OFF. Click to turn on.';
  const eng = acctById($('#acct').value)?.engine;
  b.hidden = eng !== 'claude'; // only Claude Code links to the Claude in Chrome extension
  const modeBox = $('#mode').closest('label'); if (modeBox) modeBox.hidden = eng === 'antigravity'; // Antigravity uses its own permission settings
}
$('#chrome').addEventListener('click', () => { org.chrome = !(org.chrome !== false); applyChrome(); M.organise({ kind: 'chrome', on: org.chrome }); });

// Delete key on a chat in the list (or the open chat when the list has focus) deletes it, after the confirm box.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Delete') return;
  const row = document.activeElement?.closest?.('.chat');
  const k = row ? row.dataset.key : (document.activeElement === document.body && cur && cur.key !== 'new' ? cur.key : null);
  if (k) { e.preventDefault(); M.deleteChat(k); }
});

// ---------- voice ----------
// Double-click the message box (or press Talk): Windows voice typing types what you say into it.
let hintTimer = null;
function talk() {
  input.focus();
  M.voiceType();
  $('#voice-hint').hidden = false; input.classList.add('listening');
  clearTimeout(hintTimer); hintTimer = setTimeout(endTalk, 60000);
}
function endTalk() { $('#voice-hint').hidden = true; input.classList.remove('listening'); }
input.addEventListener('dblclick', (e) => { e.preventDefault(); talk(); });
$('#mic').addEventListener('click', talk);
input.addEventListener('blur', () => setTimeout(endTalk, 400));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') endTalk(); });
// Speaker: on = read every finished reply aloud. Right-click reads the last reply now (or stops the voice).
function applySpeaker() {
  const b = $('#speaker'); b.classList.toggle('on', !!org.readAloud);
  b.innerHTML = icon(org.readAloud ? 'speaker' : 'speakerOff', 16);
  b.title = org.readAloud ? 'Reading replies aloud (click to turn off). Right-click: read the last reply now.' : 'Read replies aloud is off (click to turn on). Right-click: read the last reply now.';
}
$('#speaker').addEventListener('click', () => { org.readAloud = !org.readAloud; applySpeaker(); M.organise({ kind: 'read-aloud', on: org.readAloud }); });
$('#speaker').addEventListener('contextmenu', (e) => { e.preventDefault(); if (cur && cur.key !== 'new') M.speakLast(cur.key); });

// ---------- attach, paste and drop files ----------
let attachments = []; // { path, name, ext, size, thumb, dims }
const fmtSize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' B');
function renderAttach() {
  const box = $('#attach'); box.textContent = ''; box.hidden = !attachments.length;
  attachments.forEach((f, i) => {
    const chip = el('span', 'file-chip'); chip.title = f.path;
    if (f.thumb) { const im = document.createElement('img'); im.src = f.thumb; im.alt = ''; chip.append(im); }
    else chip.append(el('span', 'file-ext', f.ext || 'FILE'));
    const info = el('span', 'file-info'); info.append(el('span', 'file-name', f.name), el('span', 'file-meta', [f.ext, f.dims, f.size != null ? fmtSize(f.size) : ''].filter(Boolean).join(', ')));
    chip.append(info);
    const x = el('button', 'icon-btn'); x.type = 'button'; x.title = 'Remove'; x.setAttribute('aria-label', 'Remove ' + f.name); x.innerHTML = icon('close', 12);
    x.onclick = () => { attachments.splice(i, 1); renderAttach(); renderSend(); };
    chip.append(x); box.append(chip);
  });
}
// A small preview (max 96 px) so the chip shows which picture it is, without keeping the full image in memory.
function thumbOf(file) {
  return new Promise((resolve) => {
    if (!/^image\//.test(file.type)) return resolve(null);
    const url = URL.createObjectURL(file); const im = new Image();
    im.onload = () => {
      const k = Math.min(1, 96 / Math.max(im.width, im.height)); const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      resolve({ thumb: c.toDataURL('image/jpeg', 0.8), dims: im.width + '×' + im.height });
    };
    im.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    im.src = url;
  });
}
async function addFiles(fileList) {
  for (const f of fileList) {
    let p = M.pathOf(f);
    if (!p) { // pasted image or screenshot: no file on disk yet, so save it
      const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
      p = await M.saveAttachment(f.name && f.name !== 'image.png' ? f.name : 'pasted.' + ext, await f.arrayBuffer());
    }
    if (p && !attachments.some((x) => x.path === p)) {
      const name = p.split(/[\\/]/).pop().replace(/^\d+-[0-9a-f]+-/, '');
      const t = await thumbOf(f);
      attachments.push({ path: p, name, ext: (name.includes('.') ? name.split('.').pop() : (f.type.split('/')[1] || '')).toUpperCase().slice(0, 5), size: f.size, thumb: t && t.thumb, dims: t && t.dims });
    }
  }
  renderAttach(); renderSend(); input.focus();
}
$('#attach-btn').addEventListener('click', () => $('#file-pick').click());
$('#file-pick').addEventListener('change', (e) => { const files = [...e.target.files]; e.target.value = ''; if (files.length) addFiles(files); });
input.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) { e.preventDefault(); addFiles(files); }
});
// Files dropped ANYWHERE in the window attach to the message. (Only the chat area used to take them; a
// file let go over the sidebar went to Electron, which opens it in place of the app.)
const dropZone = $('#main');
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
document.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; dropZone.classList.add('dropping'); });
document.addEventListener('dragleave', (e) => { if (hasFiles(e) && !e.relatedTarget) dropZone.classList.remove('dropping'); });
document.addEventListener('drop', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dropZone.classList.remove('dropping'); addFiles([...e.dataTransfer.files]); });

$('#acct-toggle').addEventListener('click', () => { collapsed.__accounts = !collapsed.__accounts; M.setCollapsed(collapsed); renderSide(); });

// ---------- effort ----------
function renderEfforts(acct) {
  const sel = $('#effort'); const box = sel.closest('label');
  const info = acct?.models || {};
  let e = info.efforts;
  if (acct?.engine === 'codex') { const m = (info.options || []).find((o) => o.value === (prefs?.model || info.default)); if (m && m.efforts && m.efforts.length) e = { default: info.efforts?.default || '', options: m.efforts }; }
  box.hidden = !e || !e.options?.length;
  sel.textContent = '';
  if (box.hidden) return;
  const defLabel = (e.options.find((o) => o.value === e.default) || {}).label || e.default;
  const d = el('option', null, e.default ? `${defLabel} (default)` : 'Default'); d.value = ''; d.dataset.short = e.default ? defLabel : 'Effort'; sel.append(d);
  for (const o of e.options) { const x = el('option', null, o.label); x.value = o.value; x.title = o.desc || ''; sel.append(x); }
  const want = prefs?.effort || '';
  sel.value = e.options.some((o) => o.value === want) ? want : '';
}
$('#effort').addEventListener('change', (e) => M.setPrefs(key(), { effort: e.target.value }));

// ---------- slash commands ----------
let commands = []; let slashItems = []; let slashIdx = 0;
M.onCommands((c) => { commands = c || []; });
M.commands().then((c) => { commands = c || []; });
function slashQuery() {
  const eng = acctById($('#acct').value)?.engine;
  const m = input.value.match(/^\/([\w:.-]*)$/);
  return eng === 'claude' && m ? m[1].toLowerCase() : null;
}
function renderSlash() {
  const box = $('#slash'); const q = slashQuery();
  if (q === null) { box.hidden = true; slashItems = []; return; }
  const score = (c) => { const n = c.name.toLowerCase(); const tail = n.split(':').pop(); return tail.startsWith(q) ? 0 : n.startsWith(q) ? 1 : n.includes(q) ? 2 : (c.desc || '').toLowerCase().includes(q) && q.length > 2 ? 3 : 9; };
  slashItems = commands.map((c) => [score(c), c]).filter(([s]) => s < 9).sort((x, y) => x[0] - y[0] || (x[1].kind === y[1].kind ? x[1].name.localeCompare(y[1].name) : x[1].kind === 'skill' ? -1 : 1)).map(([, c]) => c).slice(0, 60);
  box.textContent = ''; box.hidden = false;
  if (!commands.length) { box.append(el('div', 'slash-empty', 'Loading your skills and commands from Claude Code...')); return; }
  if (!slashItems.length) { box.append(el('div', 'slash-empty', 'No skill or command matches.')); return; }
  slashIdx = Math.min(slashIdx, slashItems.length - 1);
  slashItems.forEach((c, i) => {
    const row = el('button', 'slash-item' + (i === slashIdx ? ' on' : '')); row.type = 'button';
    const top = el('span', 'slash-top'); top.append(el('span', 'slash-name', '/' + c.name), el('span', 'slash-kind ' + c.kind, c.kind));
    row.append(top); if (c.desc) row.append(el('span', 'slash-desc', c.desc));
    row.onmousedown = (e) => { e.preventDefault(); pickSlash(i); };
    box.append(row);
  });
  box.querySelector('.slash-item.on')?.scrollIntoView({ block: 'nearest' });
}
function pickSlash(i) { const c = slashItems[i]; if (!c) return; input.value = '/' + c.name + ' '; slashItems = []; $('#slash').hidden = true; grow(); input.focus(); }
input.addEventListener('input', () => { slashIdx = 0; renderSlash(); });
input.addEventListener('blur', () => setTimeout(() => { $('#slash').hidden = true; }, 150));
input.addEventListener('keydown', (e) => {
  if ($('#slash').hidden || !slashItems.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); slashIdx = (slashIdx + (e.key === 'ArrowDown' ? 1 : slashItems.length - 1)) % slashItems.length; renderSlash(); }
  else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); pickSlash(slashIdx); }
  else if (e.key === 'Escape') { e.stopImmediatePropagation(); $('#slash').hidden = true; slashItems = []; }
}, true);

// ---------- usage ----------
function resetText(ms, txt) {
  if (!ms) return txt ? 'resets ' + txt : '';
  const d = new Date(ms); const mins = Math.round((ms - Date.now()) / 60000);
  if (mins <= 0) return 'resets now';
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (mins < 60) return `resets in ${mins} min (${time})`;
  if (mins < 24 * 60) return `resets in ${Math.floor(mins / 60)}h ${mins % 60}m (${time})`;
  return `resets ${d.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
}
const usageAge = (u) => { const m = Math.round((Date.now() - u.at) / 60000); return m < 2 ? 'just now' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; };
// How long until a window resets: "4m 32s", "3h 10m", "2d 20h" (seconds in the last hour, ticking).
// The exact date and time are in the tooltip.
function untilText(w) {
  if (!w.resetsAt) return String(w.resetsText || '').replace(/:00(?=\s*[ap]\.?m)/i, ''); // only a weekday and time came back: "Mon 9 AM"
  const s = Math.floor((w.resetsAt - Date.now()) / 1000);
  if (s <= 0) return 'now';
  if (s < 3600) return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  const m = Math.floor(s / 60);
  if (m < 1440) { const h = Math.floor(m / 60); const r = m % 60; return r ? `${h}h ${r}m` : `${h}h`; }
  const d = Math.floor(m / 1440); const h = Math.floor((m % 1440) / 60); return h ? `${d}d ${h}h` : `${d}d`;
}
const resetWhen = (w) => (w.resetsAt ? new Date(w.resetsAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : (w.resetsText || 'at an unknown time'));
function resetCell(w, cls = 'ureset') {
  const c = el('span', cls); const t = untilText(w); if (!t) return c;
  c.append(iconEl('refresh', 10), el('span', null, t)); c.title = `${w.group ? w.group + ', ' : ''}${w.label} resets ${resetWhen(w)}`;
  if (w.resetsAt) c.dataset.resetAt = String(w.resetsAt); // ticks every second (tickUsage)
  return c;
}
// "just now", "12s ago", "4m ago", "2h ago": how fresh the numbers are, ticking
const agoShort = (at) => { const s = Math.max(0, Math.floor((Date.now() - at) / 1000)); return s < 5 ? 'just now' : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`; };
function freshness(cls, at, prefix) { const n = el('span', cls, prefix + agoShort(at)); n.dataset.checkedAt = String(at); n.dataset.prefix = prefix; n.title = 'Checked ' + new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }) + '. It checks again on its own every 3 minutes.'; return n; }
// Every second: move the countdowns and the "checked ... ago" times in place (no redraw).
function tickUsage() {
  for (const n of document.querySelectorAll('[data-reset-at]')) { const s = n.querySelector('span'); const t = untilText({ resetsAt: Number(n.dataset.resetAt) }); if (s && s.textContent !== t) s.textContent = t; }
  for (const n of document.querySelectorAll('[data-checked-at]')) { const t = n.dataset.prefix + agoShort(Number(n.dataset.checkedAt)); if (n.textContent !== t) n.textContent = t; }
}
setInterval(tickUsage, 1000);
const leftOf = (w) => (w.used == null ? null : Math.max(0, 100 - w.used));
const levelOf = (left) => (left == null ? '' : left <= 10 ? ' low' : left <= 30 ? ' mid' : '');
function usageBars(u) {
  if (!u || !u.windows || !u.windows.length) return null;
  const box = el('span', 'ubars'); let group = null;
  for (const w of u.windows) {
    // Gemini: models share limits in groups ("Gemini models", "Claude and GPT models"): a small heading per group
    if (w.group && w.group !== group) { group = w.group; box.append(el('span', 'ugroup', group)); }
    const left = leftOf(w);
    const r = el('span', 'ubar' + levelOf(left));
    const lab = el('span', 'ulabel', w.short || w.label); lab.title = w.label; r.append(lab); // Gemini: short model names
    const track = el('span', 'utrack'); const fill = el('span', 'ufill');
    fill.style.width = (left == null ? 0 : left) + '%'; // the bar shows what is LEFT
    track.append(fill); r.append(track);
    r.append(el('span', 'uleft', left == null ? '' : left + '% left'), resetCell(w));
    r.title = `${w.group ? w.group + ', ' : ''}${w.label}: ${w.used == null ? 'usage unknown' : w.used + '% used, ' + left + '% left'}. Resets ${resetWhen(w)}. Checked ${usageAge(u)}.${u.extra ? ' (' + u.extra + ')' : ''}`;
    box.append(r);
  }
  return box;
}
function renderUsageLine(acct) {
  const line = $('#usage-line'); const u = acct && acct.usage;
  line.hidden = !u || !u.windows || !u.windows.length; line.textContent = '';
  if (line.hidden) return;
  for (const w of u.windows) {
    const left = leftOf(w);
    const it = el('span', 'uitem' + levelOf(left));
    it.append(el('b', null, (w.group ? w.group + ' ' : '') + w.label), document.createTextNode(` ${left == null ? '' : left + '% left, '}${resetText(w.resetsAt, w.resetsText)}`));
    line.append(it);
  }
  line.append(freshness('uage', u.at, 'checked '));
  line.title = `Usage for ${acct.label}${u.failedAt && u.failedAt > u.at ? '. The last check failed, so these numbers may be old.' : ''}`;
}
// the countdowns move every minute even when nothing else redraws
setInterval(() => { renderAccounts(); renderSeats(); const a = acctById($('#acct').value); if (a) renderUsageLine(a); }, 60000);
$('#usage-refresh').addEventListener('click', () => { const b = $('#usage-refresh'); b.classList.add('spinning'); b.disabled = true; M.refreshUsage(); });
M.onUsageDone(() => { const b = $('#usage-refresh'); b.classList.remove('spinning'); b.disabled = false; });

// "Today 1:16 AM", "Yesterday 9:02 PM", "Nov 20, 3:40 PM"
function when(ts) {
  const d = new Date(ts); if (isNaN(d)) return '';
  const t = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const today = new Date(); const y = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Today ' + t;
  if (d.toDateString() === y.toDateString()) return 'Yesterday ' + t;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + t;
}

applyTheme(); applySpeaker(); applySide();
M.init().then(() => M.open('new'));
