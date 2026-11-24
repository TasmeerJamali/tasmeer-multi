// Tools that Tasmeer Multi gives every Claude Code run it starts (an MCP server over stdio).
// The Claude app gives its sessions SendUserFile, SendMessage and start_session; a run started from
// Tasmeer Multi has none of them, so a file Claude meant to hand over never reached the window, and a
// chat could not pass work to another chat (Nov 24, 2026). These tools are the stand-ins:
// - send_user_file: the window reads its calls from the chat file and shows each file as a card.
// - list_chats, read_chat, send_message, start_chat: answered by the app itself, through its local
//   bridge (main.js). The run's own key (TM_BRIDGE_TOKEN) works only while that run is going.
// Started by Claude Code itself (see engine.js, --mcp-config); runs under Electron as plain Node.
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = Number(process.env.TM_BRIDGE_PORT || 0);
const TOKEN = String(process.env.TM_BRIDGE_TOKEN || '');
const BRIDGE = PORT > 0 && TOKEN.length > 0;

const TOOLS = [{
  name: 'send_user_file',
  description: 'Show files to the user in the Tasmeer Multi window: images and PDFs preview inline, other files appear as cards they can open or show in their folder. Use this whenever you would use SendUserFile (that tool only exists in the Claude app, not here). Pass absolute paths of files that already exist.',
  inputSchema: {
    type: 'object',
    properties: {
      files: { type: 'array', items: { type: 'string' }, description: 'Absolute paths of the files to show.' },
      caption: { type: 'string', description: 'Optional one-line note shown with the files.' },
    },
    required: ['files'],
  },
}];
const CHAT_TOOLS = [{
  name: 'list_chats',
  description: "List the user's chats in Tasmeer Multi (their Claude Code, Codex and Gemini chats), newest first: each chat's title, key, engine, whether it is working right now, when it last had a message, and its folder. Use it to find the chat to message or read. This replaces the Claude app's ListAgents / list_sessions.",
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Optional words to look for in the title, folder or key.' },
      limit: { type: 'number', description: 'How many to list (default 25, at most 100).' },
    },
  },
}, {
  name: 'read_chat',
  description: 'Read the latest messages of another chat in Tasmeer Multi: what the user asked there, what it answered, and how many steps it ran in between. Use it to check what another chat did or said before acting on it.',
  inputSchema: {
    type: 'object',
    properties: {
      chat: { type: 'string', description: 'The chat key from list_chats (like claude:1b2c...), or its title.' },
      last: { type: 'number', description: 'How many of its latest messages to read (default 12, at most 60).' },
    },
    required: ['chat'],
  },
}, {
  name: 'send_message',
  description: "Send a message to another of the user's chats in Tasmeer Multi. That chat's own account answers it there, in that chat, as if the user had typed it; the user can watch it in the window. If the chat is busy it waits and goes as soon as the chat is free. Use it when the user asks you to message, hand work to, or ask another chat, or when the work clearly belongs to another chat. Set report_back to true when you need its answer: its final reply then comes back to this chat as a new message once it finishes (after your current turn ends), so end your turn after sending instead of waiting. This replaces the Claude app's SendMessage.",
  inputSchema: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'The chat key from list_chats (like claude:1b2c...), or its exact title.' },
      message: { type: 'string', description: 'What to say. Write it so it stands on its own: that chat does not see this conversation.' },
      report_back: { type: 'boolean', description: 'true: its final reply comes back to this chat as a new message when it finishes. Default false.' },
    },
    required: ['to', 'message'],
  },
}, {
  name: 'start_chat',
  description: "Start a new chat in Tasmeer Multi with a first message, for a separate task that should run on its own (the Claude app's start_session). By default it uses this chat's folder, account and settings, and its final reply comes back to this chat as a new message when it finishes (after your current turn ends). Use it when the user asks for a new or separate chat or session.",
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'The first message: the whole task, written so it stands on its own.' },
      title: { type: 'string', description: 'A short name for the chat in the list.' },
      folder: { type: 'string', description: "Absolute folder to work in. Default: this chat's folder." },
      account: { type: 'string', description: "Which account answers: an account email, or claude, codex or gemini. Default: this chat's account." },
      report_back: { type: 'boolean', description: 'false to not get its final reply back here. Default true.' },
    },
    required: ['prompt'],
  },
}];
CHAT_TOOLS.push({
  name: 'run_agent',
  description: "Hand a task to another AI agent the user has connected in Tasmeer Multi and wait for its answer: GPT (OpenAI Codex), or Claude on another of the user's accounts. It works in this same folder with this chat's permissions (or read-only), sees none of this conversation, so write the task to stand on its own (what to do, which files, what to report back), and returns its final answer plus the steps it ran. This is Tasmeer Multi's cross-engine version of the Agent tool: use it when the user asks for GPT, Codex or another agent, for a second opinion from a different model, or to split work. To run two or three helpers AT THE SAME TIME, put them all in tasks in ONE call: separate run_agent calls run one after another, never together.",
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'The whole task, standing on its own.' },
      tasks: {
        type: 'array', maxItems: 3,
        description: 'Instead of task: two or three tasks that run AT THE SAME TIME (separate run_agent calls run one after another, never together). Each is a string, or an object with its own task, engine, account, model, read_only; the answer holds every result.',
        items: { anyOf: [{ type: 'string' }, { type: 'object', properties: { task: { type: 'string' }, engine: { type: 'string', enum: ['codex', 'claude'] }, account: { type: 'string' }, model: { type: 'string' }, read_only: { type: 'boolean' } }, required: ['task'] }] },
      },
      engine: { type: 'string', enum: ['codex', 'claude'], description: 'codex (GPT, the default) or claude.' },
      account: { type: 'string', description: "An account email. Default: that engine's usual account." },
      model: { type: 'string', description: 'A model id, if the user asked for one. Default: one that works on that account.' },
      read_only: { type: 'boolean', description: 'true: it may read but not change anything. Default: the same permissions as this chat.' },
    },
  },
});
if (BRIDGE) TOOLS.push(...CHAT_TOOLS);

const text = (t, isError) => ({ content: [{ type: 'text', text: String(t) }], ...(isError ? { isError: true } : {}) });
function askApp(tool, args) { // one call to the app's local bridge (a helper agent may work for up to an hour)
  return new Promise((resolve) => {
    const body = JSON.stringify({ token: TOKEN, tool, args: args || {} });
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/tool', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: tool === 'run_agent' ? 3600000 : 60000 }, (res) => {
      let out = ''; res.setEncoding('utf8');
      res.on('data', (d) => { out += d; });
      res.on('end', () => { let j = null; try { j = JSON.parse(out); } catch { /* not JSON */ } resolve(j && j.text ? text(j.text) : text((j && j.error) || `Tasmeer Multi did not answer (HTTP ${res.statusCode}).`, true)); });
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', (e) => resolve(text(`Could not reach Tasmeer Multi: ${e.message}. Is the app still open?`, true)));
    req.end(body);
  });
}

async function call(name, args) {
  if (name === 'send_user_file') {
    const files = (Array.isArray(args && args.files) ? args.files : []).map(String);
    if (!files.length) return text('Pass at least one file path in "files".', true);
    const shown = []; const missing = [];
    for (const f of files) (path.isAbsolute(f) && fs.existsSync(f) ? shown : missing).push(f);
    if (!shown.length) return text(`None of these files exist: ${missing.join(', ')}`, true);
    return text(`Shown to the user in Tasmeer Multi: ${shown.map((f) => path.basename(f)).join(', ')}.` + (missing.length ? ` Not found (not shown): ${missing.join(', ')}.` : ''));
  }
  if (CHAT_TOOLS.some((t) => t.name === name)) {
    if (!BRIDGE) return text('This run was not started by Tasmeer Multi, so the chat tools are off here.', true);
    return askApp(name, args);
  }
  return text(`Unknown tool: ${name}`, true);
}

const send = (m) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
function handle(m) {
  if (!m || typeof m !== 'object') return;
  const { id, method, params } = m;
  if (id === undefined || id === null) return; // a notification: nothing to answer
  try {
    if (method === 'initialize') send({ id, result: { protocolVersion: (params && params.protocolVersion) || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'tasmeer-multi', version: '1.1.0' } } });
    else if (method === 'tools/list') send({ id, result: { tools: TOOLS } });
    else if (method === 'tools/call') call(params && params.name, params && params.arguments).then((result) => send({ id, result }), (e) => send({ id, error: { code: -32603, message: String(e && e.message || e) } }));
    else if (method === 'ping') send({ id, result: {} });
    else send({ id, error: { code: -32601, message: `Method not found: ${method}` } });
  } catch (e) { send({ id, error: { code: -32603, message: String(e && e.message || e) } }); }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => {
  buf += d; let i;
  while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) { try { handle(JSON.parse(line)); } catch { /* not JSON */ } } }
});
process.stdin.on('end', () => process.exit(0));
