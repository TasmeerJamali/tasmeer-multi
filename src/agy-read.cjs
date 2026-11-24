// Reads Antigravity conversation files (SQLite, read-only). Runs in the system Node (it has node:sqlite);
// Electron's built-in Node does not. Prints JSON to stdout.
//   node agy-read.cjs titles <db> [<db> ...]   -> [{ file, title, steps, lastType, lastStatus }]
//   node agy-read.cjs items <db>              -> { items: [...], steps, lastType, lastStatus }
process.removeAllListeners('warning');
const { DatabaseSync } = require('node:sqlite');

// Walk protobuf bytes; return readable text fields with their field path (e.g. ".19.2").
function strings(buf, path = '', out = [], depth = 0) {
  let i = 0;
  const varint = () => { let r = 0n, s = 0n; for (;;) { if (i >= buf.length) throw 0; const b = buf[i++]; r |= BigInt(b & 0x7f) << s; if (!(b & 0x80)) return r; s += 7n; } };
  try {
    while (i < buf.length) {
      const key = Number(varint()); const f = key >> 3; const wt = key & 7;
      if (f === 0) return out;
      if (wt === 0) varint(); else if (wt === 1) i += 8; else if (wt === 5) i += 4;
      else if (wt === 2) {
        const len = Number(varint()); if (len > buf.length - i) return out;
        const sub = buf.subarray(i, i + len); i += len;
        const p = path + '.' + f; const text = sub.toString('utf8');
        const printable = len > 0 && !/[\x00-\x08\x0e-\x1f]/.test(text) && !text.includes('�');
        let nested = false;
        if (depth < 12 && len > 1) { const before = out.length; try { strings(sub, p, out, depth + 1); nested = out.length > before; } catch { /* not a message */ } }
        if (printable && !nested) out.push([p, text]);
      } else return out;
    }
  } catch { /* stop */ }
  return out;
}
const first = (ss, path) => (ss.find(([p]) => p === path) || [])[1];

// step_type 14 = your message (.19.2), 15 = model reply (.20.1), tool steps carry .5.4.2 (tool name) + .5.4.3 (JSON args)
// Antigravity voice chats: your spoken words and the voice assistant's lines arrive inside
// <talker_agent_context> blocks ("[time] user: ..." / "[time] talker: ..."); <voice_instructions> is Antigravity's own setup text.
function voiceParts(t, seen) {
  const lines = [];
  const re = /<talker_agent_context>([\s\S]*?)<\/talker_agent_context>/g; let m;
  while ((m = re.exec(t))) {
    for (const line of m[1].split('\n')) {
      const x = line.match(/^\s*(?:\[([^\]]+)\]\s*)?(user|talker):\s*"?([\s\S]*?)"?\s*$/); if (!x || !x[3].trim()) continue;
      const key = (x[1] || '') + '|' + x[2] + '|' + x[3];
      if (seen.has(key)) continue; seen.add(key);
      lines.push({ ts: x[1] ? Date.parse(x[1]) || 0 : 0, who: x[1] ? x[2] : 'task', text: x[3].trim() });
    }
  }
  let typed = t.replace(/<voice_instructions>[\s\S]*?<\/voice_instructions>/g, '').replace(/<talker_agent_context>[\s\S]*?<\/talker_agent_context>/g, '');
  if (/^\s*<voice_instructions>/.test(typed)) typed = ''; // an unclosed setup block
  return { lines, typed: typed.trim() };
}
function pushVoice(items, lines) {
  for (const l of lines) {
    const last = items[items.length - 1];
    if (l.who === 'user') {
      if (last && last.role === 'user' && last.via === 'voice') { last.text += '\n' + l.text; continue; }
      items.push({ role: 'user', text: l.text, via: 'voice (spoken)', ts: l.ts || undefined });
    } else if (l.who === 'talker') {
      if (last && last.role === 'note' && last.voice) { last.text = last.text.replace(/"$/, ' ' + l.text + '"'); continue; }
      items.push({ role: 'note', voice: true, text: 'Voice replied: "' + l.text + '"', ts: l.ts || undefined });
    } else items.push({ role: 'note', text: 'Voice handed Gemini this task: ' + l.text });
  }
}
function itemsOf(db) {
  const rows = db.prepare('select idx, step_type, status, step_payload from steps order by idx').all();
  const items = []; const seen = new Set();
  for (const r of rows) {
    if (!r.step_payload) continue;
    const ss = strings(Buffer.from(r.step_payload));
    if (r.step_type === 14) {
      const t = first(ss, '.19.2'); if (!t) continue;
      const v = voiceParts(t, seen);
      pushVoice(items, v.lines);
      if (v.typed) items.push({ role: 'user', text: v.typed });
    } else if (r.step_type === 101) {
      // "[Message] ... sender=system ..." is a message sent in through agentapi (this app). Other senders are
      // Gemini's own background tasks reporting back, not you.
      const head = first(ss, '.114.1') || '';
      const tsm = head.match(/timestamp=(\S+)/); const ts = tsm ? Date.parse(tsm[1]) || undefined : undefined;
      if (/sender=system\b/.test(head)) { const t = first(ss, '.114.4.4') || first(ss, '.114.2.10.1'); if (t) items.push({ role: 'user', text: t, via: 'Tasmeer Multi', ts }); }
      else { const what = first(ss, '.114.2.1') || 'a background task'; items.push({ role: 'note', text: 'Background task: ' + what, ts }); }
    }
    else if (r.step_type === 15) { const t = first(ss, '.20.1'); if (t && t.trim()) items.push({ role: 'assistant', text: t }); }
    else {
      const name = first(ss, '.5.4.2');
      if (name) {
        let detail = '';
        try { const a = JSON.parse(first(ss, '.5.4.3') || '{}'); detail = a.toolSummary || a.CommandLine || a.AbsolutePath || a.Query || a.query || a.DirectoryPath || ''; } catch { /* plain */ }
        items.push({ role: 'tool', name, detail: String(detail).slice(0, 160) });
      } else if (r.step_type === 17) { const t = ss.map(([, x]) => x).find((x) => x.length > 20 && / /.test(x)); if (t) items.push({ role: 'tool', name: 'notice', detail: t.slice(0, 160) }); }
    }
  }
  const last = rows[rows.length - 1] || {};
  return { items, steps: rows.length, lastType: last.step_type ?? null, lastStatus: last.status ?? null };
}

const [, , cmd, ...files] = process.argv;
const open = (f) => new DatabaseSync(f, { readOnly: true });
try {
  if (cmd === 'titles') {
    const out = [];
    for (const f of files) {
      try {
        const db = open(f);
        const r = itemsOf(db); db.close();
        const u = r.items.find((i) => i.role === 'user');
        out.push({ file: f, title: u ? u.text.replace(/\s+/g, ' ').slice(0, 90) : '', steps: r.steps, lastType: r.lastType, lastStatus: r.lastStatus });
      } catch (e) { out.push({ file: f, error: String(e.message || e) }); }
    }
    process.stdout.write(JSON.stringify(out));
  } else if (cmd === 'models') {
    const count = {};
    for (const f of files) {
      try {
        const db = open(f);
        for (const r of db.prepare('select data from gen_metadata').all()) {
          const b = Buffer.from(r.data).toString('latin1');
          for (const m of b.match(/gemini-[0-9][a-z0-9.]*(-[a-z]+){1,3}/g) || []) count[m] = (count[m] || 0) + 1;
        }
        db.close();
      } catch { /* skip */ }
    }
    process.stdout.write(JSON.stringify(count));
  } else if (cmd === 'summaries') {
    // Antigravity's own list: names, running state, sub-chats, folders.
    const db = open(files[0]); const out = {};
    for (const r of db.prepare('select conversation_id, title, preview, status, parent_conversation_id, nesting_depth, not_fully_idle, killed, workspace_uris, last_modified_time from conversation_summaries').all()) {
      out[r.conversation_id] = { title: r.title || '', preview: r.preview || '', status: r.status || '', parent: r.parent_conversation_id || '', depth: r.nesting_depth || 0, notIdle: !!r.not_fully_idle, killed: !!r.killed, ws: r.workspace_uris || '', modified: Date.parse(String(r.last_modified_time).replace(' ', 'T').replace(/\.(\d{3})\d*/, '.$1')) || 0 };
    }
    db.close();
    process.stdout.write(JSON.stringify(out));
  } else if (cmd === 'items') {
    const db = open(files[0]); const r = itemsOf(db); db.close();
    process.stdout.write(JSON.stringify(r));
  }
} catch (e) { process.stdout.write(JSON.stringify({ error: String(e.message || e) })); }
