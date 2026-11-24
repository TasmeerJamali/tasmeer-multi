// Mixed chats (Nov 25, 2026): one conversation that any of your Claude and Codex (GPT) accounts can answer,
// message by message. Claude Code and Codex keep different history formats, so one engine can never open
// the other's chat. Instead each engine keeps its own native session for the chat (a Claude Code session,
// a Codex thread), and this record ties them together and logs every turn. When the user switches engines,
// the engine that answers next is first told what the others did since it last spoke (the catch-up block
// in front of the user's message). The engines' own files stay the history; this record is only the glue,
// so if it were lost, the native sessions would simply show up again as ordinary chats.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ENGINES = ['claude', 'codex']; // Gemini (Antigravity) cannot be driven like this yet
const CATCH_TAG = 'tasmeer-multi-catch-up';
const CATCH_RE = new RegExp(`^\\s*<${CATCH_TAG}>[\\s\\S]*?</${CATCH_TAG}>\\s*`);
let dir = null;
const chats = new Map();

function init(root) {
  dir = path.join(root, 'mixed');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* read-only: nothing loads */ }
  let names = []; try { names = fs.readdirSync(dir); } catch { /* none */ }
  for (const f of names) {
    if (!/^[0-9a-f]{12}\.json$/.test(f)) continue;
    try { const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); if (j && j.id && j.sessions && Array.isArray(j.turns)) chats.set(j.id, j); } catch { /* skip a broken record */ }
  }
}
const fileOf = (id) => path.join(dir || '', id + '.json');
function save(m) {
  if (!dir) return;
  const f = fileOf(m.id);
  fs.writeFileSync(f + '.tmp', JSON.stringify(m, null, 1));
  fs.renameSync(f + '.tmp', f);
}
function create({ cwd, title }) {
  const m = { v: 1, id: crypto.randomBytes(6).toString('hex'), cwd: String(cwd || ''), title: String(title || '').slice(0, 120), created: Date.now(), sessions: {}, turns: [] };
  chats.set(m.id, m); save(m);
  return m;
}
const get = (id) => chats.get(String(id || '')) || null;
const all = () => [...chats.values()];
function remove(id) { chats.delete(id); try { fs.unlinkSync(fileOf(id)); } catch { /* gone */ } }
function setSession(m, engine, sid) { if (!m || !sid) return; m.sessions[engine] = String(sid); save(m); }
function addTurn(m, t) { if (!m) return; m.turns.push(t); if (m.turns.length > 500) m.turns = m.turns.slice(-500); save(m); }

const clip = (t, n) => { t = String(t || '').trim(); return t.length > n ? t.slice(0, n) + ' [...]' : t; };
const engineName = (e) => (e === 'codex' ? 'GPT (OpenAI Codex)' : e === 'claude' ? 'Claude (Claude Code)' : e);
// Who answered a turn, as the other engines are told it: "GPT (OpenAI Codex), model gpt-6-astra, account x@y".
const who = (t) => engineName(t.engine) + (t.model ? `, model ${t.model}` : '') + (t.account ? `, account ${t.account}` : '');

// The turns `engine` did not see: everything after its own last turn (all of them if it never spoke here).
// The newest turns go in full and older ones shortened, about 24,000 characters in all, so a long chat
// cannot crowd out the user's message.
function catchUp(m, engine, date = (ms) => new Date(ms).toISOString()) {
  if (!m) return '';
  let last = -1;
  for (let i = m.turns.length - 1; i >= 0; i -= 1) if (m.turns[i].engine === engine) { last = i; break; }
  const missed = m.turns.slice(last + 1).filter((t) => t.engine !== engine);
  if (!missed.length) return '';
  const blocks = []; let budget = 24000; let left = 0;
  for (let i = missed.length - 1; i >= 0; i -= 1) {
    if (budget <= 0) { left = i + 1; break; }
    const t = missed[i]; const full = budget > 8000;
    const steps = t.steps && t.steps.length ? `\n    Steps it ran (${t.stepCount || t.steps.length}): ${t.steps.slice(0, full ? 24 : 6).join('; ')}${(t.stepCount || t.steps.length) > (full ? 24 : 6) ? '; ...' : ''}` : '';
    const answer = t.error ? `it stopped with an error: ${clip(t.error, 300)}` + (t.reply ? `. What it wrote before that: ${clip(t.reply, full ? 3000 : 500)}` : '') : clip(t.reply, full ? 6000 : 700) || '(no written reply)';
    const b = `[turn ${i + 1}] The user (${date(t.at)}): ${clip(t.user, full ? 4000 : 500)}\n    ${who(t)} answered: ${answer}${steps}`;
    budget -= b.length; blocks.unshift(b);
  }
  const fresh = last < 0;
  return [
    `<${CATCH_TAG}>`,
    `This chat is shared between AI agents in Tasmeer Multi: for each message the user picks who answers, Claude (Claude Code) or GPT (OpenAI Codex), on any of their accounts. ${fresh ? 'This is your first turn in it' : 'You are back in it'}, and you did not see the ${missed.length === 1 ? 'turn' : `${missed.length} turns`} below: another agent answered ${missed.length === 1 ? 'it' : 'them'}. Oldest first${left ? ` (${left} older turn${left === 1 ? '' : 's'} left out)` : ''}:`,
    '',
    blocks.join('\n\n'),
    '',
    'You all work in the same folder, so whatever another agent changed is already on disk: read files again before relying on what you saw earlier. Continue as the next turn of this same conversation and answer the user\'s message below.',
    `</${CATCH_TAG}>`,
  ].join('\n');
}
// A user message as the user wrote it, without the catch-up the app put in front of it.
function stripCatchUp(text) {
  const t = String(text || ''); const m = CATCH_RE.exec(t);
  return m ? { text: t.slice(m[0].length), caughtUp: true } : { text: t, caughtUp: false };
}

module.exports = { ENGINES, CATCH_TAG, init, fileOf, save, create, get, all, remove, setSession, addTurn, catchUp, stripCatchUp };
