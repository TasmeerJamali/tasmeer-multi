// Runs Claude Code and Codex for one chat, under whichever account is picked.
// The idea (same as Orca): every account has its own login folder, but all accounts share
// ONE chat history folder. So a chat started on account A can be resumed on account B.
//   Claude Code: CLAUDE_CONFIG_DIR=<account dir>; <account dir>/projects -> ~/.claude/projects
//   Codex:       CODEX_HOME=<account dir>;        <account dir>/sessions -> ~/.codex/sessions
// The "Main" account of each engine is your normal login (~/.claude, ~/.codex), untouched.
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const MAIN = { claude: path.join(HOME, '.claude'), codex: path.join(HOME, '.codex') };

// Folders shared from the main login into every extra account (history, skills, plugins...).
const SHARED_DIRS = {
  claude: ['projects', 'skills', 'agents', 'commands', 'plugins', 'todos', 'file-history', 'shell-snapshots', 'session-env', 'hooks', 'output-styles'],
  codex: ['sessions', 'archived_sessions', 'skills', 'prompts', 'memories', 'rules'],
};
// Files kept in step with the main login (hard links, re-made before each run if an editor replaced them).
const SHARED_FILES = {
  claude: ['settings.json', 'CLAUDE.md', 'keybindings.json'],
  codex: ['config.toml', 'AGENTS.md'],
};
// The login itself. Never shared, never copied.
const LOGIN_FILE = { claude: '.credentials.json', codex: 'auth.json' };

function accountDir(root, acct) {
  return acct.main ? MAIN[acct.engine] : path.join(root, 'accounts', acct.engine, acct.id);
}

function prepare(root, acct) {
  if (acct.engine === 'antigravity') return; // Antigravity keeps its own login inside the Antigravity app
  if (acct.main) return;
  const dir = accountDir(root, acct);
  fs.mkdirSync(dir, { recursive: true });
  const main = MAIN[acct.engine];
  for (const d of SHARED_DIRS[acct.engine]) {
    const src = path.join(main, d);
    const dst = path.join(dir, d);
    if (!fs.existsSync(src)) fs.mkdirSync(src, { recursive: true });
    let ok = false;
    try { ok = fs.realpathSync(dst) === fs.realpathSync(src); } catch { /* missing */ }
    if (!ok) {
      try { fs.rmSync(dst, { recursive: false, force: true }); } catch { /* ignore */ }
      try { fs.symlinkSync(src, dst, 'junction'); } catch (e) { console.error('junction failed', dst, e.message); }
    }
  }
  for (const f of SHARED_FILES[acct.engine]) {
    const src = path.join(main, f);
    const dst = path.join(dir, f);
    if (!fs.existsSync(src)) continue;
    try {
      const a = fs.statSync(src); const b = fs.existsSync(dst) ? fs.statSync(dst) : null;
      if (!b || a.ino !== b.ino) { try { fs.unlinkSync(dst); } catch { /* none */ } fs.linkSync(src, dst); }
    } catch { try { fs.copyFileSync(src, dst); } catch { /* ignore */ } }
  }
  if (acct.engine === 'claude') syncClaudeJson(dir);
}

// ~/.claude.json holds your MCP servers. Give each extra account the same servers, keep its own sign-in data.
function syncClaudeJson(dir) {
  const mainFile = path.join(HOME, '.claude.json');
  const acctFile = path.join(dir, '.claude.json');
  let main = {}; let mine = {};
  try { main = JSON.parse(fs.readFileSync(mainFile, 'utf8')); } catch { return; }
  try { mine = JSON.parse(fs.readFileSync(acctFile, 'utf8')); } catch { /* new */ }
  const next = { ...mine, mcpServers: main.mcpServers || {}, hasCompletedOnboarding: true };
  if (JSON.stringify(next) === JSON.stringify(mine)) return;
  fs.writeFileSync(acctFile + '.tmp', JSON.stringify(next, null, 2));
  fs.renameSync(acctFile + '.tmp', acctFile);
}

function isSignedIn(root, acct) {
  if (acct.engine === 'antigravity') return require('./agy').installed();
  if (acct.main) return true;
  return fs.existsSync(path.join(accountDir(root, acct), LOGIN_FILE[acct.engine]));
}

function envFor(root, acct) {
  const env = { ...process.env };
  // Start every run clean: drop anything inherited from whatever launched this app (another Claude Code,
  // the Claude desktop app, Orca). Those carry ITS account, proxy URL and session markers, which would
  // override the account picked here (wrong billing, 'not logged in', Chrome account mismatch).
  for (const k of Object.keys(env)) if (/^(CLAUDE|ANTHROPIC|ORCA_)/i.test(k) || k === 'CODEX_HOME') delete env[k];
  if (acct.engine === 'claude') {
    if (acct.main) delete env.CLAUDE_CONFIG_DIR; else env.CLAUDE_CONFIG_DIR = accountDir(root, acct);
  } else if (acct.main) { delete env.CODEX_HOME; } else { env.CODEX_HOME = accountDir(root, acct); }
  return env;
}

// Opens a normal console window where you sign this account in. Your password never passes through the app.
function openSignIn(root, acct) {
  prepare(root, acct);
  const dir = accountDir(root, acct);
  const varName = acct.engine === 'claude' ? 'CLAUDE_CONFIG_DIR' : 'CODEX_HOME';
  const cmd = acct.engine === 'claude' ? 'claude auth login' : 'codex login';
  const title = `Sign in: ${acct.name}`;
  const line = `title ${title} && set "${varName}=${dir}" && echo Sign in to the account you want for "${acct.name}". Close this window when you are done. && ${cmd}`;
  spawn('cmd.exe', ['/c', 'start', '""', 'cmd.exe', '/k', line], { detached: true, stdio: 'ignore', windowsHide: false, env: envFor(root, acct) }).unref();
}

// Claude "Ask only" = default mode: in -p anything needing approval (edits, commands) is refused.
// Not plan mode: plan mode swaps in its own model and ignores the one you picked.
const MODES = {
  claude: { ask: ['--permission-mode', 'default'], edit: ['--permission-mode', 'acceptEdits'], full: ['--permission-mode', 'bypassPermissions'] },
  // -c sandbox_mode works for both a new run and "exec resume" (resume does not take -s).
  codex: { ask: ['-c', 'sandbox_mode="read-only"'], edit: ['-c', 'sandbox_mode="workspace-write"'], full: ['--dangerously-bypass-approvals-and-sandbox'] },
};

// ---------- the two-way channel (Claude Code) ----------
// A Claude run keeps stdin open as a stream of JSON messages (--input-format stream-json) and lets this
// app answer Claude Code's own prompts (--permission-prompt-tool stdio). AskUserQuestion, permission
// prompts in the Edit and Ask modes, and plan approvals arrive as control requests and go back as
// control responses. Without it Claude could not ask anything here: AskUserQuestion was not even in
// the run's tool list (tested Nov 24, 2026, Claude Code 2.1.331: plain -p fell back to text; this
// channel asked "Which color do you prefer?", took "Blue" back and went on with it).
const MCP_SCRIPT = path.join(__dirname, 'mcp', 'tm-tools.cjs');
const RUN_NOTE = path.join(__dirname, 'mcp', 'run-note.txt'); // tells Claude what differs from the Claude app
// The app's own tools (send_user_file, and the chat-to-chat tools), started by Claude Code as an MCP
// server. A run that may talk to other chats gets its own config file with the address of the app's
// local bridge and a key that only this run knows; main.js deletes the file when the run ends.
function mcpConfigFile(bridge) {
  const env = { ELECTRON_RUN_AS_NODE: '1' };
  if (bridge && bridge.port && bridge.token) { env.TM_BRIDGE_PORT = String(bridge.port); env.TM_BRIDGE_TOKEN = String(bridge.token); }
  const f = bridge && bridge.file ? bridge.file : path.join(__dirname, 'mcp', 'tm-mcp.json');
  const want = JSON.stringify({ mcpServers: { tasmeer_multi: { type: 'stdio', command: process.execPath, args: [MCP_SCRIPT], env } } }, null, 2);
  let have = ''; try { have = fs.readFileSync(f, 'utf8'); } catch { /* first run */ }
  if (have !== want) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, want); }
  return f;
}
const quoted = (p) => `"${String(p).replace(/"/g, '')}"`; // the run goes through cmd.exe: paths with spaces need quotes
let thinkingDisplayOk = true; // an older Claude Code that does not know --thinking-display: dropped after its first refusal

// Starts one turn. Calls on(event) with: {kind:'session', id} | {kind:'text', text, partial} |
// {kind:'thinking', text} | {kind:'tool-start', name, id} | {kind:'tool', name, detail, id, sub} |
// {kind:'tool-done', id, sub} | {kind:'ask', id, tool, input, detail} | {kind:'ask-cancel', id} |
// {kind:'done', error?, cost?} . Returns {stop(), answer(id, response)}.
// `sub` is the step of a helper agent (Agent tool) working inside the run, not the run's own step.
function run(root, { acct, chat, prompt }, on) {
  if (acct.engine === 'antigravity') return require('./agy').run({ chat, prompt }, on);
  prepare(root, acct);
  const env = envFor(root, acct);
  const cwd = chat.cwd && fs.existsSync(chat.cwd) ? chat.cwd : HOME;
  let args; let exe;
  if (acct.engine === 'claude') {
    exe = 'claude';
    args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--input-format', 'stream-json', '--permission-prompt-tool', 'stdio', ...MODES.claude[chat.mode || 'edit']];
    const model = chat.model || defaultClaudeModel(root, acct);
    if (model) args.push('--model', model);
    const effort = chat.effort || defaultClaudeEffort(root, acct);
    if (effort) args.push('--effort', effort);
    // Claude in Chrome: without --chrome, a headless Claude Code run does not load the browser tools.
    args.push(chat.chrome === false ? '--no-chrome' : '--chrome');
    // Thinking in words, as the Claude app shows it: a headless run gets its thinking with no words unless
    // it asks for summaries (tested Nov 24, 2026, Claude Code 2.1.331: 0 characters without, 229 with).
    if (thinkingDisplayOk) args.push('--thinking-display', 'summarized');
    args.push('--mcp-config', quoted(mcpConfigFile(chat.bridge)), '--append-system-prompt-file', quoted(RUN_NOTE));
    // A chat in a worktree may write next to it (sibling worktrees, the repo): the Claude app lets it, so
    // allow the repo here too (a run's screenshots were refused as "outside allowed roots").
    const wt = String(cwd).match(/^(.*?)[\\/]\.(claude|codex|orca)[\\/]worktrees[\\/]/i);
    if (wt && fs.existsSync(wt[1])) args.push('--add-dir', quoted(wt[1]));
    if (chat.sessionId) args.push('--resume', chat.sessionId);
    if (chat.ephemeral) args.push('--no-session-persistence'); // tests only: leaves no chat behind
    env.CLAUDE_CODE_ENABLE_ASK_USER_QUESTION_TOOL = '1'; // the switch the Claude app sets for its own sessions
  } else {
    exe = 'codex';
    args = ['exec'];
    if (chat.sessionId) args.push('resume', chat.sessionId);
    args.push('--json', '--skip-git-repo-check', ...MODES.codex[chat.mode || 'edit']);
    if (chat.model) args.push('-m', chat.model);
    if (chat.effort) args.push('-c', `model_reasoning_effort="${String(chat.effort).replace(/[^a-z]/g, '')}"`);
    args.push('-'); // prompt from stdin
  }
  const child = spawn(exe, args, { cwd, env, shell: true, windowsHide: true });
  const twoWay = acct.engine === 'claude';
  const write = (m) => { try { if (child.stdin.writable) { child.stdin.write(JSON.stringify(m) + '\n'); return true; } } catch { /* closed */ } return false; };
  const endInput = () => { try { child.stdin.end(); } catch { /* closed */ } };
  if (twoWay) write({ type: 'user', session_id: '', message: { role: 'user', content: prompt }, parent_tool_use_id: null });
  else child.stdin.end(prompt);

  let buf = ''; let errText = ''; let finished = false; let partial = ''; let thinking = '';
  const finish = (e) => {
    if (finished) return; finished = true;
    if (e && e.error && /unknown option.*thinking-display/i.test(e.error + errText)) { thinkingDisplayOk = false; e.error = `This Claude Code is older than Tasmeer Multi expects (it does not know --thinking-display), so ${NOT_SENT}. Send again: the next run goes without thinking words.`; }
    if (e && e.error) { e.detail = e.detail || e.error; e.error = friendlyError(e.error); }
    on({ kind: 'done', ...e });
  };

  // What the window shows while a run works comes from here, so every gap is covered: thinking (its
  // words as they stream), a step being written (a long file edit streams for a while before it runs),
  // a step running, a step finished (it is thinking about the result). Before Nov 24, 2026 only the
  // start of a step was reported, so "is working" kept showing a finished step, or nothing at all.
  const handleClaude = (m) => {
    if (m.type === 'system' && m.subtype === 'init') on({ kind: 'session', id: m.session_id });
    else if (m.type === 'stream_event') {
      if (m.parent_tool_use_id) return; // a helper agent's own words never stand in for the reply
      const ev = m.event || {};
      const block = ev.content_block || {};
      if (ev.type === 'message_start') { partial = ''; thinking = ''; }
      else if (ev.type === 'content_block_start' && block.type === 'thinking') { thinking = ''; on({ kind: 'thinking', text: '' }); }
      else if (ev.type === 'content_block_start' && block.type === 'tool_use') on({ kind: 'tool-start', name: block.name, id: block.id });
      else if (ev.type === 'content_block_delta' && ev.delta?.type === 'thinking_delta') { thinking += ev.delta.thinking || ''; on({ kind: 'thinking', text: thinking.slice(-1200) }); }
      else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') { partial += ev.delta.text; on({ kind: 'text', text: partial, partial: true }); }
    } else if (m.type === 'assistant') {
      const sub = m.parent_tool_use_id || null;
      for (const c of m.message?.content || []) {
        if (c.type === 'thinking' && c.thinking && !sub && !thinking) on({ kind: 'thinking', text: c.thinking.slice(-1200) }); // words that came only with the finished block
        if (c.type === 'text' && c.text && !sub) { on({ kind: 'text', text: c.text }); partial = ''; }
        if (c.type === 'tool_use') on({ kind: 'tool', name: c.name, detail: toolDetail(c.input), id: c.id || '', sub });
      }
    } else if (m.type === 'user') { // results coming back: a step finished
      const sub = m.parent_tool_use_id || null; const content = m.message?.content;
      if (Array.isArray(content)) for (const c of content) if (c && c.type === 'tool_result') on({ kind: 'tool-done', id: c.tool_use_id || '', sub });
    } else if (m.type === 'rate_limit_event' && m.rate_limit_info) {
      on({ kind: 'usage', usage: claudeUsage(m.rate_limit_info) });
    } else if (m.type === 'control_request') { // Claude Code asks this app something
      const r = m.request || {};
      if (r.subtype === 'can_use_tool') on({ kind: 'ask', id: m.request_id, tool: r.tool_name, input: r.input || {}, detail: toolDetail(r.input || {}) });
      else write({ type: 'control_response', response: { subtype: 'error', request_id: m.request_id, error: `Tasmeer Multi does not handle "${r.subtype}" requests.` } });
    } else if (m.type === 'control_cancel_request') {
      on({ kind: 'ask-cancel', id: m.request_id });
    } else if (m.type === 'result') {
      finish({ error: m.is_error ? (m.result || m.subtype) : null, cost: m.total_cost_usd });
      endInput(); // the turn is over: closing input lets Claude Code exit
    }
  };
  const handleCodex = (m) => {
    if (m.type === 'thread.started') on({ kind: 'session', id: m.thread_id });
    else if (m.type === 'item.completed' || m.type === 'item.started') {
      const it = m.item || {};
      if (m.type === 'item.completed' && it.type === 'agent_message') on({ kind: 'text', text: it.text });
      else if (m.type === 'item.completed' && it.type === 'reasoning' && it.text) on({ kind: 'thinking', text: String(it.text).slice(-1200) });
      else if (m.type === 'item.started' && it.type === 'command_execution') on({ kind: 'tool', name: 'Shell', detail: String(it.command || '').slice(0, 200), id: it.id || '' });
      else if (m.type === 'item.completed' && it.type === 'command_execution') on({ kind: 'tool-done', id: it.id || '' });
      else if (m.type === 'item.completed' && it.type === 'file_change') on({ kind: 'tool', name: 'Edit', detail: (it.changes || []).map((c) => c.path).join(', ').slice(0, 200), id: it.id || '', done: true });
      else if (m.type === 'item.started' && it.type === 'web_search') on({ kind: 'tool', name: 'Web search', detail: it.query || '', id: it.id || '' });
      else if (m.type === 'item.completed' && it.type === 'web_search') on({ kind: 'tool-done', id: it.id || '' });
    } else if (m.type === 'turn.failed') finish({ error: cleanErr(m.error?.message) });
    else if (m.type === 'error') errText = cleanErr(m.message);
    else if (m.type === 'turn.completed') finish({});
  };

  child.stdout.on('data', (d) => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('{')) continue;
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (acct.engine === 'claude') handleClaude(m); else handleCodex(m);
    }
  });
  child.stderr.on('data', (d) => { errText += d.toString('utf8'); if (errText.length > 4000) errText = errText.slice(-4000); });
  child.on('error', (e) => finish({ error: `Could not start ${exe}: ${e.message}` }));
  child.on('close', (code) => finish(code ? { error: lastLines(errText) || `${exe} stopped (code ${code}).` } : {}));

  return {
    pid: child.pid,
    alive: () => child.exitCode === null && child.signalCode === null,
    // Your answer to a question, a permission prompt or a plan: { behavior: 'allow', updatedInput } or
    // { behavior: 'deny', message }.
    answer: (id, response) => twoWay && write({ type: 'control_response', response: { subtype: 'success', request_id: id, response } }),
    stop() {
      // Claude: ask it to stop the turn (it records the interruption), then close input; force only if it lingers.
      if (twoWay && child.exitCode === null && write({ type: 'control_request', request_id: 'stop-' + Date.now(), request: { subtype: 'interrupt' } })) {
        endInput();
        setTimeout(() => { if (child.exitCode === null) execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => {}); }, 4000);
      } else if (child.exitCode === null) execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => {});
      finish({ error: 'Stopped.' });
    },
  };
}

function toolDetail(input = {}) {
  const v = input.command || input.file_path || input.path || input.pattern || input.url || input.query || input.description || '';
  return String(v).slice(0, 200);
}
// Errors the app knows, in plain words (the raw text stays in `detail`, shown on hover).
// Codex lets one program write to a chat at a time; when the Codex app has the chat open, a send from
// here is refused before it starts ("thread-store conflict ... already has an active writer", Nov 24, 2026).
const NOT_SENT = 'nothing was sent';
function friendlyError(s) {
  const t = String(s || '');
  if (/already has an active writer|thread-store conflict/i.test(t)) return `Codex is using this chat somewhere else right now, most likely in the Codex app, and it lets only one program write to a chat at a time, so ${NOT_SENT}. Let it finish there or close the chat there, then send again: your message is back in the box.`;
  return t;
}
function cleanErr(s) {
  try { const j = JSON.parse(s); return j.error?.message || s; } catch { return s || ''; }
}
function lastLines(s) {
  return s.split(/\r?\n/).filter((l) => l.trim() && !/^Reading additional input/.test(l)).slice(-4).join('\n');
}
function looksLikeLimit(msg) {
  return /usage limit|rate limit|limit reached|out of (credits|usage)|quota|too many requests|429|hit your limit/i.test(msg || '');
}

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
// Where each login keeps its account file: the main Claude login uses ~/.claude.json, extra ones their own folder.
const claudeJsonFor = (root, acct) => (acct.main ? path.join(HOME, '.claude.json') : path.join(accountDir(root, acct), '.claude.json'));

// The email the login actually uses. Read from the login's own files; nothing is sent anywhere.
function accountEmail(root, acct) {
  if (acct.engine === 'antigravity') return '';
  try {
    if (acct.engine === 'claude') return readJson(claudeJsonFor(root, acct))?.oauthAccount?.emailAddress || '';
    const auth = readJson(path.join(accountDir(root, acct), 'auth.json'));
    const tok = auth?.tokens?.id_token;
    if (!tok) return '';
    return JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString('utf8')).email || '';
  } catch { return ''; }
}

// The models this login can use right now, and its default.
// Claude: the built-in Opus / Sonnet / Haiku plus any extra ones Claude Code cached for this account (e.g. Fable).
// Codex: the list Codex cached for this account's plan (models_cache.json), and the default in config.toml.
function accountModels(root, acct, seenModels = []) {
  if (acct.engine === 'antigravity') return { default: '', defaultLabel: 'Antigravity default', options: require('./agy').models() };
  if (acct.engine === 'claude') {
    const cj = readJson(claudeJsonFor(root, acct)) || {};
    const settings = readJson(path.join(acct.main ? MAIN.claude : accountDir(root, acct), 'settings.json')) || {};
    // Exact versions: the ones your chats were really answered by, plus extras Claude Code cached for this login.
    const ids = new Set(seenModels);
    for (const o of cj.additionalModelOptionsCache || []) if (o?.value) ids.add(o.value);
    const FAM = ['opus', 'sonnet', 'haiku', 'fable'];
    const parse = (id) => { const m = String(id).match(/^claude-([a-z]+)-([0-9][0-9-]*)(\[1m\])?$/); return m ? { fam: m[1], ver: m[2].split('-').map(Number), big: !!m[3] } : null; };
    const nice = (id) => { const p = parse(id); if (!p) return id; return `${p.fam[0].toUpperCase() + p.fam.slice(1)} ${p.ver.join('.')}${p.big ? ' (1M context)' : ''}`; };
    const cmp = (a, b) => { const x = parse(a); const y = parse(b); const fa = FAM.indexOf(x.fam); const fb = FAM.indexOf(y.fam);
      if (x.fam !== y.fam) return (fa < 0 ? 9 : fa) - (fb < 0 ? 9 : fb);
      for (let i = 0; i < Math.max(x.ver.length, y.ver.length); i++) { const d = (y.ver[i] || 0) - (x.ver[i] || 0); if (d) return d; }
      return Number(x.big) - Number(y.big); };
    const list = [...ids].filter(parse).sort(cmp);
    // Newest version in each family = what the short names (opus, sonnet, haiku) run today.
    const newest = {};
    for (const id of list) { const p = parse(id); if (!p.big && !newest[p.fam]) newest[p.fam] = id; }
    const extra = Object.fromEntries((cj.additionalModelOptionsCache || []).map((o) => [o.value, o.description || '']));
    const options = list.map((id) => ({ value: id, label: nice(id) + (newest[parse(id).fam] === id ? '' : parse(id).big ? '' : '  (older)'), desc: extra[id] || id }));
    if (!options.length) for (const f of ['opus', 'sonnet', 'haiku']) options.push({ value: f, label: f[0].toUpperCase() + f.slice(1) + ' (latest)', desc: f });
    const d = settings.model || '';
    const dId = newest[d] || d;
    const eff = settings.effortLevel || '';
    return { default: d, defaultLabel: d ? nice(dId) : '', options, efforts: { default: eff, options: ['low', 'medium', 'high', 'xhigh', 'max'].map((v) => ({ value: v, label: v === 'xhigh' ? 'Extra high' : v[0].toUpperCase() + v.slice(1) })) } };
  }
  const home = accountDir(root, acct);
  const cache = readJson(path.join(home, 'models_cache.json')) || readJson(path.join(MAIN.codex, 'models_cache.json'));
  const list = cache ? (cache.models || cache.data || cache) : [];
  const options = (Array.isArray(list) ? list : Object.values(list))
    .filter((m) => m && m.slug && m.visibility !== 'hide')
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
    .map((m) => ({ value: m.slug, label: m.display_name || m.slug, desc: m.description || '', efforts: (m.supported_reasoning_levels || []).map((e) => ({ value: e.effort, label: e.effort === 'xhigh' ? 'Extra high' : e.effort[0].toUpperCase() + e.effort.slice(1), desc: e.description || '' })) }));
  let def = '';
  try { def = (fs.readFileSync(path.join(home, 'config.toml'), 'utf8').match(/^\s*model\s*=\s*"([^"]+)"/m) || [])[1] || ''; } catch { /* none */ }
  let defEff = '';
  try { defEff = (fs.readFileSync(path.join(home, 'config.toml'), 'utf8').match(/^\s*model_reasoning_effort\s*=\s*"([^"]+)"/m) || [])[1] || ''; } catch { /* none */ }
  const base = (options.find((o) => o.value === def) || options[0] || {}).efforts || ['low', 'medium', 'high'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }));
  return { default: def, options, efforts: { default: defEff, options: base } };
}

const claudeSettings = (root, acct) => readJson(path.join(acct.main ? MAIN.claude : accountDir(root, acct), 'settings.json')) || {};
const defaultClaudeModel = (root, acct) => claudeSettings(root, acct).model || 'opus';
const defaultClaudeEffort = (root, acct) => claudeSettings(root, acct).effortLevel || '';

// ---------- slash commands ----------
// Claude Code itself reports its commands and skills when a run starts. Start a tiny Haiku run, read that
// list, and stop the run straight away.
function probeCommands(root, acct) {
  return new Promise((resolve) => {
    prepare(root, acct);
    const child = spawn('claude', ['-p', '--no-session-persistence', '--output-format', 'stream-json', '--verbose', '--model', 'haiku'], { cwd: HOME, env: envFor(root, acct), shell: true, windowsHide: true });
    let buf = ''; let done = false;
    const finish = (v) => { if (done) return; done = true; if (child.exitCode === null) execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => {}); resolve(v); };
    child.stdout.on('data', (d) => {
      buf += d.toString('utf8'); let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line.includes('"subtype":"init"')) continue;
        try { const j = JSON.parse(line); finish({ commands: j.slash_commands || [], skills: j.skills || [], plugins: j.plugins || [] }); } catch { /* keep reading */ }
      }
    });
    child.on('error', () => finish(null)); child.on('close', () => finish(null));
    setTimeout(() => finish(null), 90000);
    // Claude Code only reports its list once a message arrives; the run is stopped as soon as the list is read.
    child.stdin.end('hi');
  });
}
// Built-ins that only make sense in a terminal (menus, settings screens).
const TERMINAL_ONLY = new Set(['clear', 'color', 'config', 'output-style', 'context', 'effort', 'fast', 'focus', 'heapdump', 'mcp', 'import', 'model', '__remote-workflow', 'workflow-launch-exec', 'reload-plugins', 'reload-skills', 'rename', 'usage-credits', 'extra-usage', 'usage', 'agents', 'auto-mode-setup', 'autocompact', 'advisor', 'doctor', 'design-consent', 'design-revoke', 'list-agents', 'hud', 'team-onboarding', 'skill-doctor', 'insights', 'recap']);
function describeFile(f) {
  try {
    const head = fs.readFileSync(f, 'utf8').slice(0, 4000);
    const m = head.match(/^description:\s*(.*)$/m); if (!m) return '';
    let d = m[1].trim();
    if (/^[>|][+-]?$/.test(d) || !d) d = (head.slice(head.indexOf(m[0]) + m[0].length).match(/^\s+(\S.*)$/m) || [])[1] || '';
    return d.replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').slice(0, 160);
  } catch { return ''; }
}
function commandList(probe) {
  if (!probe) return [];
  const skills = new Set(probe.skills);
  const pluginPath = Object.fromEntries((probe.plugins || []).map((p) => [p.name, p.path]));
  const out = [];
  for (const name of probe.commands) {
    if (TERMINAL_ONLY.has(name)) continue;
    const [a, b] = name.includes(':') ? name.split(':') : [null, name];
    const places = a && pluginPath[a]
      ? [path.join(pluginPath[a], 'skills', b, 'SKILL.md'), path.join(pluginPath[a], 'commands', b + '.md')]
      : [path.join(MAIN.claude, 'skills', b, 'SKILL.md'), path.join(MAIN.claude, 'commands', b + '.md')];
    // skills synced from your Claude account live under skills/synced/<id>/<name>
    try { const syn = path.join(MAIN.claude, 'skills', 'synced'); for (const d of fs.readdirSync(syn)) places.push(path.join(syn, d, b, 'SKILL.md')); } catch { /* none */ }
    let desc = ''; for (const f of places) { if (fs.existsSync(f)) { desc = describeFile(f); break; } }
    out.push({ name, desc, kind: skills.has(name) ? 'skill' : 'command' });
  }
  return out;
}

// ---------- usage (read from what Claude Code and Codex report themselves; login tokens are never touched) ----------
function claudeUsage(info) {
  const w = info.unifiedWindows || {}; const windows = [];
  const add = (k, label) => { if (w[k]) windows.push({ label, used: Math.round((w[k].utilization || 0) * 100), resetsAt: (w[k].resetsAt || 0) * 1000, status: w[k].status || '' }); };
  add('five_hour', '5-hour'); add('seven_day', 'Weekly'); add('seven_day_opus', 'Weekly Opus'); add('seven_day_sonnet', 'Weekly Sonnet');
  if (!windows.length && info.resetsAt) windows.push({ label: info.rateLimitType === 'seven_day' ? 'Weekly' : '5-hour', used: null, resetsAt: info.resetsAt * 1000, status: info.status || '' });
  return { at: Date.now(), windows, status: info.status || '', extra: info.isUsingOverage ? 'using extra usage' : '' };
}
// One tiny Haiku message (not saved as a chat) just to get this account's current usage numbers.
// Claude Code's /usage text, e.g. "Current session: 21% used · resets Nov 24, 5:30am (Europe/London)".
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function parseResets(s) {
  const m = String(s).match(/([A-Z][a-z]{2})\s+(\d{1,2})(?:,\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm))?/i); if (!m) return 0;
  const now = new Date(); let h = m[3] ? Number(m[3]) % 12 + (/pm/i.test(m[5]) ? 12 : 0) : 0;
  const d = new Date(now.getFullYear(), MONTHS[m[1].toLowerCase()] ?? now.getMonth(), Number(m[2]), h, Number(m[4] || 0));
  if (d.getTime() < now.getTime() - 40 * 86400000) d.setFullYear(d.getFullYear() + 1);
  return d.getTime();
}
function parseUsageText(t) {
  const windows = [];
  for (const line of t.split('\n')) {
    const m = line.match(/^\s*Current (session|week(?: \(([^)]+)\))?):\s*(\d+)% used(?:\s*·\s*resets\s*(.+))?/i); if (!m) continue;
    const label = m[1].toLowerCase() === 'session' ? '5-hour' : m[2] && !/all models/i.test(m[2]) ? 'Week ' + m[2] : 'Weekly';
    windows.push({ label, used: Number(m[3]), resetsAt: parseResets(m[4] || ''), resetsText: (m[4] || '').replace(/\s*\([^)]*\)\s*$/, '').trim(), status: '' });
  }
  if (!windows.length) return null;
  return { at: Date.now(), windows, status: '', extra: /subscription/i.test(t) ? '' : 'not on a subscription', source: 'usage' };
}
function probeUsage(root, acct) {
  return new Promise((resolve) => {
    if (acct.engine !== 'claude') return resolve(null);
    if (!isSignedIn(root, acct)) return resolve({ error: 'not signed in' });
    prepare(root, acct);
    const child = spawn('claude', ['-p', '--no-session-persistence', '--output-format', 'stream-json', '--verbose', '--model', 'haiku', '--effort', 'low'], { cwd: HOME, env: envFor(root, acct), shell: true, windowsHide: true });
    let buf = ''; let done = false; let errText = ''; let resultText = null;
    child.stderr.on('data', (d) => { errText = (errText + d.toString('utf8')).slice(-2000); });
    const finish = (v) => { if (done) return; done = true; if (child.exitCode === null) execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => {}); resolve(v); };
    child.stdout.on('data', (d) => {
      buf += d.toString('utf8'); let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line.includes('"type":"result"')) continue;
        try { const j = JSON.parse(line); resultText = String(j.result || ''); finish(parseUsageText(resultText) || { error: 'no usage lines in: ' + resultText.replace(/\s+/g, ' ').slice(0, 200) }); } catch { /* keep reading */ }
      }
    });
    child.on('error', (e) => finish({ error: 'could not start claude: ' + e.message }));
    child.on('close', (code) => finish({ error: 'claude exited (' + code + ') without a usage reply. ' + errText.replace(/\(node:\d+\)[^\n]*\n?|\(Use `node[^\n]*\n?/g, '').replace(/\s+/g, ' ').trim().slice(0, 300) }));
    setTimeout(() => finish({ error: 'timed out after 90 s' }), 90000);
    child.stdin.end('/usage');
  });
}
// Codex writes its limits into the chat file after each turn.
function codexUsage(file) {
  try {
    const st = fs.statSync(file); const len = Math.min(st.size, 600 * 1024);
    const fd = fs.openSync(file, 'r'); const b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, st.size - len); fs.closeSync(fd);
    const t = b.toString('utf8'); const i = t.lastIndexOf('"rate_limits":{'); if (i < 0) return null;
    let depth = 0; let j = i + 14;
    for (; j < t.length; j++) { if (t[j] === '{') depth++; else if (t[j] === '}') { depth--; if (depth === 0) break; } }
    const r = JSON.parse(t.slice(i + 14, j + 1)); const windows = [];
    for (const k of ['primary', 'secondary']) {
      const w = r[k]; if (!w) continue;
      const mins = w.window_minutes || 0;
      windows.push({ label: mins >= 10000 ? 'Weekly' : mins >= 1400 ? 'Daily' : mins ? Math.round(mins / 60) + '-hour' : k, used: Math.round(w.used_percent || 0), resetsAt: (w.resets_at || 0) * 1000, status: '' });
    }
    return { at: st.mtimeMs, windows, status: r.rate_limit_reached_type || '', extra: r.plan_type ? 'plan: ' + r.plan_type : '' };
  } catch { return null; }
}

module.exports = { parseUsageText, probeUsage, codexUsage, probeCommands, commandList, accountEmail, accountModels, prepare, run, openSignIn, isSignedIn, accountDir, looksLikeLimit, MAIN };
