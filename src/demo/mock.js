// Demo data for the state gallery and the motion recording (tools/shoot.cjs, tools/record.cjs).
// It only runs when the page is opened as app.html?demo=<state> outside the app, where there is no
// window.multi; inside the app the preload's window.multi exists and this file does nothing.
// Every name and number here is made up, and picked to be hard: long words, long titles, long
// emails, money, percentages, emoji first, a stale usage check, a failed run.
(function () {
  const q = new URLSearchParams(location.search);
  const state = q.get('demo');
  if (window.multi || !state) return;
  const now = Date.now(); const MIN = 60e3; const HOUR = 3600e3; const DAY = 86400e3;
  const iso = (ago) => new Date(now - ago).toISOString();
  const H = {};
  const on = (n) => (fn) => { (H[n] ||= []).push(fn); };
  const emit = (n, d) => (H[n] || []).forEach((f) => { try { f(d); } catch (e) { console.error('demo ' + n, e); } });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const mark = (name) => console.log('MARK ' + name); // tools/record.cjs cuts its contact sheets around these

  // ---------- accounts ----------
  const efforts = { default: 'xhigh', options: [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'xhigh', label: 'Extra high' }, { value: 'max', label: 'Max' }] };
  const claudeModels = { default: 'claude-opus-5-5', defaultLabel: 'Opus 5.5', efforts, options: [
    { value: 'claude-opus-5-5', label: 'Opus 5.5', desc: 'Most capable, for complex work' },
    { value: 'claude-opus-5-5[1m]', label: 'Opus 5.5 (1M context)', desc: 'Opus 5.5 for long sessions' },
    { value: 'claude-sonnet-5-5', label: 'Sonnet 5.5', desc: 'Best for everyday tasks' },
    { value: 'claude-haiku-5-5', label: 'Haiku 5.5', desc: 'Fastest for quick answers' },
  ] };
  const codexEfforts = [{ value: 'minimal', label: 'Minimal' }, { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }];
  const codexModels = { default: 'gpt-5.5-codex', defaultLabel: 'GPT-5.5 Codex', efforts: { default: 'medium', options: codexEfforts }, options: [
    { value: 'gpt-5.5-codex', label: 'GPT-5.5 Codex', efforts: codexEfforts },
    { value: 'gpt-5.5', label: 'GPT-5.5', efforts: codexEfforts },
  ] };
  const geminiModels = { default: 'gemini-4-pro', defaultLabel: 'Gemini 4 Pro', options: [{ value: 'gemini-4-pro', label: 'Gemini 4 Pro' }, { value: 'gemini-4-flash', label: 'Gemini 4 Flash' }] };
  const usage = (five, week, extra = {}) => ({ at: now - 3 * MIN, windows: [
    { label: '5-hour', used: five, resetsAt: now + 2.2 * HOUR },
    { label: 'Weekly', used: week, resetsAt: now + 3.9 * DAY },
  ], ...extra });
  let accounts = [
    { id: 'c-main', engine: 'claude', main: true, label: 'main@example.com', signedIn: true, models: claudeModels, usage: usage(15, 78) },
    { id: 'c-tc', engine: 'claude', label: 'work@example.com', signedIn: true, models: claudeModels, usage: usage(21, 40) },
    { id: 'c-team', engine: 'claude', label: 'team@example.com', signedIn: true, models: claudeModels,
      usage: { ...usage(93, 10), failedAt: now - MIN, failReason: 'skipped: under 0.8 GB free' } },
    { id: 'c-long', engine: 'claude', label: 'a.very.long.address.for.testing@holdings-international.example.com', signedIn: false, models: claudeModels },
    { id: 'x-main', engine: 'codex', main: true, label: 'main@example.com', signedIn: true, models: codexModels,
      usage: { at: now - 11 * MIN, windows: [{ label: '5-hour', used: 34, resetsAt: now + 4.1 * HOUR }, { label: 'Weekly', used: 12, resetsAt: now + 6 * DAY }, { label: 'Weekly (code review)', used: 3, resetsText: 'Mon 9:00 AM' }] } },
    { id: 'x-ops', engine: 'codex', label: 'ops@example.com', signedIn: true, models: codexModels, sameAs: 'main@example.com', usage: { at: now - 11 * MIN, windows: [{ label: '5-hour', used: 34, resetsAt: now + 4.1 * HOUR }, { label: 'Weekly', used: 12, resetsAt: now + 6 * DAY }] } },
    { id: 'g-main', engine: 'antigravity', main: true, label: 'main@example.com', signedIn: true, models: geminiModels,
      usage: { at: now - 20e3, source: 'antigravity', extra: 'Antigravity: the models in a group share a 5-hour and a weekly limit', windows: [
        { group: 'Gemini models', label: '5-hour', used: 62, resetsAt: now + 3.1 * HOUR }, { group: 'Gemini models', label: 'Weekly', used: 35, resetsAt: now + 6.2 * DAY },
        { group: 'Claude and GPT models', label: '5-hour', used: 0, resetsAt: now + 5 * HOUR }, { group: 'Claude and GPT models', label: 'Weekly', used: 4, resetsAt: now + 6.9 * DAY }] } },
  ];

  // ---------- chats ----------
  const HOME = 'C:\\Users\\you';
  const WT = HOME + '\\code\\shop-api\\.claude\\worktrees\\calm-otter-1f2e3d';
  const S = (key, title, ago, cwd, extra = {}) => ({ key, engine: key.split(':')[0], id: key.split(':')[1], title, cwd, updated: now - ago, running: false, active: false, done: false, ...extra });
  let sessions = [
    S('claude:desk', 'Release checklist, morning run (backend first, then the web app)', 20e3, HOME + '\\code\\ops', { running: true }),
    S('mixed:demo', 'Fix the flaky upload test, then review the fix', 90e3, HOME + '\\code\\shop-api', { engines: ['claude', 'codex'] }),
    S('claude:long', 'Unslop the Tasmeer Multi window: one signature, springs, every state', 3 * MIN, HOME + '\\tasmeer-multi'),
    S('codex:mail', 'Fix the upload path on Windows', 12 * MIN, HOME + '\\code\\mailer', { done: true }),
    S('antigravity:voice', 'Most Powerful Gemini Model', 47 * MIN, HOME + '\\code\\ops'),
    S('claude:err', 'Payments webhook deep dive, retry check', 2 * HOUR, HOME + '\\code\\ops'),
    S('claude:emoji', '\u{1F525} Notification "fetching message" fix, PR #1270', 5 * HOUR, HOME + '\\code\\web-app'),
    S('claude:longword', 'BrowserReconnectWindowAutoFillFixForTheBridgeVMCloudflareTapOnlyRunAndThenSomeMore', DAY + 2 * HOUR, WT),
    S('codex:arch', 'Old CSV import, January batch (file archived)', 3 * DAY, HOME + '\\code\\maps', { archivedFile: true }),
    S('claude:pin1', 'Status page v5', 2 * DAY, WT),
    S('codex:pin2', 'Pinned alerts on the map view', 6 * DAY, HOME + '\\code\\maps'),
    S('claude:u1', 'Profile the search query, indexes and plan', 4 * DAY, HOME + '\\code\\ops'),
    S('claude:u2', 'Fact check, 336 claims against the source data', 15 * DAY, HOME + '\\code\\ops'),
    S('claude:g1', 'Onboarding flow, three real users', 9 * HOUR, HOME + '\\code\\mailer'),
    S('codex:g2', 'Status checks: no job dropped since Nov 9', 30 * HOUR, HOME + '\\code\\web-app'),
    S('claude:g3', 'Android build: run it on the phone', 2 * DAY + HOUR, HOME + '\\code\\android-app'),
    S('antigravity:g4', 'Cache warmer, 55 entries written and read back', 3 * DAY + 5 * HOUR, HOME + '\\code\\ops'),
    S('claude:g5', 'Approval hole on live', 5 * DAY, HOME + '\\code\\maps'),
    S('codex:g6', 'Slow database investigation', 7 * DAY, HOME + '\\code\\web-app'),
    S('claude:g7', 'Row menu and old account cleanup', 8 * DAY, HOME + '\\code\\web-app'),
    S('claude:g8', 'Notes hand-off, verified on one record', 11 * DAY, HOME + '\\code\\web-app'),
    S('codex:g9', 'Model retirement check across every app', 19 * DAY, HOME + '\\code\\ops'),
    S('claude:g10', 'Disk space on C: and the bad blocks warning', 26 * DAY, HOME),
  ];
  const org = {
    meta: { 'claude:long': { star: true }, 'claude:emoji': { star: true }, 'codex:g6': { archived: true } },
    folders: [{ id: 'f1', name: 'Research', order: ['claude:u1', 'claude:u2'] }],
    pinOrder: ['claude:pin1', 'codex:pin2'],
    theme: q.get('theme') || 'dark', readAloud: false, chrome: true, sideWidth: 300, sideHidden: state === 'hidden',
  };
  let collapsed = state === 'tucked' ? { __accounts: true } : {};
  if (/^(dnd|dnd-test|reorder|reorder-test)$/.test(state)) { org.pinOrder = []; org.folders = []; } // a list with nothing pinned and no folders

  const tools = (list, from, step) => list.map(([name, detail], i) => ({ role: 'tool', name, detail, ts: iso(from - i * step) }));
  const md = [
    '### What changed',
    '',
    'The window now has **one signature**: the seat token, an account\'s own colour with a ring that shows how much of its 5-hour limit is left.',
    '',
    '1. Engine marks differ by shape as well as colour: a filled square for Claude, a hollow one for Codex, a diamond for Gemini.',
    '2. Every chat row is one line: mark, title, star, time.',
    '3. The ring sweeps when usage changes (0.50 s, no bounce).',
    '',
    '| Item | Before | After | Change |',
    '|---|---|---|---|',
    '| CSS lines | 353 | 412 | +16.7% |',
    '| Loops at rest | 4 | 0 | -100% |',
    '| Monthly cost | $1,250,000.00 | $1,187,500.00 | -5% |',
    '| Cold start | 2.5 s | 2.4 s | -0.1 s |',
    '',
    'The longest word a model will ever write: Pneumonoultramicroscopicsilicovolcanoconiosis_and_then_some_more_characters_with_no_break_at_all',
    '',
    'See [app.css](file:///C:/Users/you/tasmeer-multi/src/app.css) and `src/ui/token.js`, or the talk at https://developer.apple.com/videos/play/wwdc2023/10158/',
    '',
    '```js',
    'const s = new Spring(0, { duration: 0.5, bounce: 0.18 });',
    's.to(300, performance.now() / 1000); // aim somewhere new, from wherever it is now, keeping its speed',
    '```',
    '',
    '> Restraint makes the alive parts visible.',
  ].join('\n');
  const THINK = [
    'The brief is to unslop it without removing anything. So first a count: where are the glows, the pills, the gradients, the emoji standing in for icons? Then the one thing that should carry the identity.',
    '',
    'Who is answering matters most in this app: the same chat can be answered by any account. So the signature should be about the seat: an account token with its own colour and a ring for its 5-hour limit.',
    '',
    'Motion: springs for anything that can be interrupted, nothing that loops at rest. Check every state with hard content: long emails, a title that runs on, emoji first, a failed usage check.',
  ].join('\n');
  const chats = {
    'claude:long': [
      { role: 'user', text: 'Make the UI feel designed (inspiration attached), without removing any feature: /unslop-ui it.', ts: iso(52 * MIN), via: 'Tasmeer Multi' },
      { role: 'assistant', text: 'Starting with an audit: before photos in dark and light, then a count of the slop.', ts: iso(51.5 * MIN), model: 'claude-opus-5-5' },
      { role: 'thinking', text: THINK, ts: iso(51.4 * MIN) },
      ...tools([
        ['Read', HOME + '\\tasmeer-multi\\src\\app.css'], ['Grep', 'box-shadow|gradient|border-radius: 999px'], ['Bash', 'node tools/audit.cjs > tools/audit-before.txt'],
        ['Read', HOME + '\\.claude\\skills\\unslop-ui\\references\\numbers.md'], ['Bash', 'node tools/sample-colors.cjs "' + HOME + '\\Pictures\\Screenshots\\Screenshot 2026-11-24 021455.png" 40,40 220,300 640,700'],
        ['Write', HOME + '\\tasmeer-multi\\DESIGN.md'], ['Write', HOME + '\\tasmeer-multi\\src\\ui\\spring.js'], ['Write', HOME + '\\tasmeer-multi\\src\\ui\\token.js'],
        ['Edit', HOME + '\\tasmeer-multi\\src\\app.html'], ['Bash', 'node tools/contrast.cjs'], ['Write', HOME + '\\tasmeer-multi\\src\\app.css'], ['Write', HOME + '\\tasmeer-multi\\src\\app.js'],
      ], 51 * MIN, 80e3),
      { role: 'assistant', text: md, ts: iso(35 * MIN), model: 'claude-opus-5-5' },
      { role: 'model', model: 'claude-opus-5-5', effort: 'xhigh' },
      { role: 'note', text: 'Continued with work@example.com', ts: iso(30 * MIN) },
      { role: 'user', text: 'ok and the done dot, does it keep pulsing?\nit should stop after a couple of times\n\nalso check the light theme', ts: iso(29 * MIN), via: 'Orca' },
      { role: 'tool', name: 'Bash', detail: 'node tools/audit.cjs > tools/audit-after.txt && node tools/contrast.cjs', ts: iso(28.6 * MIN) },
      { role: 'assistant', text: 'It pulses twice, 600 ms each, then rests. Light theme contrast passes AA everywhere; the lowest pair is muted text on the sidebar at 4.8:1.', ts: iso(28 * MIN), model: 'claude-opus-5-5' },
      { role: 'user', text: '\u{1F389} emoji first, then a link that never ends: https://claude.ai/code/artifact/0123456789abcdef0123456789abcdef?with=a&very=long&query=string&that=keeps&going=on&and=on', ts: iso(4 * MIN), via: 'Tasmeer Multi' },
      { role: 'thinking', text: 'The bubble is capped at 80% of the column and breaks anywhere, so a link that never ends wraps inside it. Check the light theme too before saying it is done.', ts: iso(3.6 * MIN) },
      { role: 'assistant', text: 'Done. Long links break inside your bubble instead of pushing it wider.', ts: iso(3 * MIN), model: 'claude-opus-5-5' },
    ],
    'claude:desk': [
      { role: 'user', text: 'what is waiting on the reviewers today', ts: iso(44 * MIN), via: 'Tasmeer Multi' },
      ...tools([['Read', 'reviews since Nov 23, 9:00 AM'], ['Bash', 'node scripts/orphan-sweep.cjs'], ['Read', 'CI status for 14 PRs']], 43.8 * MIN, 50e3),
      { role: 'assistant', text: 'Three reviewers have open asks: two re-reviews and one approval waiting on a fix.', ts: iso(40 * MIN), model: 'claude-opus-5-5' },
      // the run going on now (started 31 minutes ago)
      { role: 'user', text: '/release-desk run this end to end', ts: iso(31 * MIN - 2000), via: 'Tasmeer Multi' },
      { role: 'thinking', text: 'Dana is out today, so Lee covers the release. Read the review comments first, then the 17 open PRs, then draft.', ts: iso(30.9 * MIN) },
      ...tools([['Read', HOME + '\\code\\ops\\release\\playbook.md'], ['Bash', 'node scripts/changes-since.cjs --since "Nov 23, 9:00 AM"'], ['Grep', 'TODO|FIXME|breaking change'], ['Read', 'CI status for 17 PRs']], 30.8 * MIN, 40e3),
      { role: 'assistant', text: '17 open PRs; 3 ship this week. Checking each one\'s last review now.', ts: iso(26 * MIN), model: 'claude-opus-5-5' },
      { role: 'relay', kind: 'send', to: 'claude:g1', text: 'When you finish the onboarding review, list the PRs that have no reviewer yet, with the PR number and the author.', reportBack: true, ts: iso(12 * MIN), id: 'rl-1' },
      ...tools([['Grep', '"reviewer" in PRs since Nov 20'], ['Read', 'PR 3184 description']], 11 * MIN, 30e3),
      { role: 'tool', name: 'Bash', detail: 'node scripts/orphan-sweep.cjs --prs 17 --since "Nov 23, 9:00 AM"', ts: iso(47e3), id: 'run-1' },
    ],
    'mixed:demo': [
      { role: 'user', text: 'The upload test fails about one run in five. Find out why and fix it.', ts: iso(26 * MIN), via: 'Tasmeer Multi' },
      { role: 'thinking', text: 'A test that fails one run in five usually races something. Read the test first, then the upload handler.', ts: iso(25.9 * MIN), who: { engine: 'claude', account: 'main@example.com', model: 'claude-opus-5-5' } },
      { role: 'tool', name: 'Read', detail: HOME + '\\code\\shop-api\\test\\upload.test.js', ts: iso(25.8 * MIN), who: { engine: 'claude', account: 'main@example.com', model: 'claude-opus-5-5' } },
      { role: 'tool', name: 'Bash', detail: 'npm test -- upload --repeat 20', ts: iso(25 * MIN), who: { engine: 'claude', account: 'main@example.com', model: 'claude-opus-5-5' } },
      { role: 'tool', name: 'Edit', detail: HOME + '\\code\\shop-api\\src\\upload.js', ts: iso(22 * MIN), who: { engine: 'claude', account: 'main@example.com', model: 'claude-opus-5-5' } },
      { role: 'assistant', text: 'The test read the file before the write had finished. `saveUpload` now waits for the stream to close; 20 runs in a row pass.', ts: iso(21 * MIN), model: 'claude-opus-5-5', who: { engine: 'claude', account: 'main@example.com', model: 'claude-opus-5-5' } },
      { role: 'user', text: 'GPT, review that fix. Anything Claude missed?', ts: iso(12 * MIN), via: 'Tasmeer Multi', caughtUp: true },
      { role: 'tool', name: 'shell', detail: 'git diff src/upload.js', ts: iso(11.8 * MIN), who: { engine: 'codex', account: 'main@example.com', model: 'gpt-5.5' } },
      { role: 'tool', name: 'shell', detail: 'rg "saveUpload" src test', ts: iso(11.5 * MIN), who: { engine: 'codex', account: 'main@example.com', model: 'gpt-5.5' } },
      { role: 'assistant', text: 'The fix is right for uploads, but `saveAvatar` has the same race: it also reads before the stream closes. Same one-line change there.', ts: iso(10 * MIN), who: { engine: 'codex', account: 'main@example.com', model: 'gpt-5.5' } },
      { role: 'user', text: 'Claude, apply that to saveAvatar too.', ts: iso(3 * MIN), via: 'Tasmeer Multi', caughtUp: true },
      { role: 'tool', name: 'Edit', detail: HOME + '\\code\\shop-api\\src\\avatar.js', ts: iso(2.6 * MIN), who: { engine: 'claude', account: 'work@example.com', model: 'claude-opus-5-5' } },
      { role: 'assistant', text: 'Done: `saveAvatar` waits for the stream too, and the avatar tests pass 20 times in a row.', ts: iso(90e3), model: 'claude-opus-5-5', who: { engine: 'claude', account: 'work@example.com', model: 'claude-opus-5-5' } },
    ],
    'claude:g1': [
      { role: 'user', text: 'review the three real sign-ups from this morning and tell me what broke', ts: iso(30 * MIN), via: 'Tasmeer Multi' },
      ...tools([['Read', 'sign-ups 641, 642, 645'], ['Bash', 'node scripts/signup-check.cjs --since 9:00']], 29 * MIN, 60e3),
      { role: 'assistant', text: 'All three accounts were created and saved; one invite link opened the sign-in page blank.', ts: iso(26 * MIN), model: 'claude-opus-5-5' },
      { role: 'user', text: '[Tasmeer Multi: message from the chat "Release checklist, morning run (backend first, then the web app)" (claude:desk). Your final reply goes back to it automatically when you finish.]\n\nWhen you finish the onboarding review, list the PRs that have no reviewer yet, with the PR number and the author.', ts: iso(12 * MIN), via: 'headless (Tasmeer Multi or a script)' },
      { role: 'thinking', text: 'Two PRs have no reviewer. Name them with their authors.', ts: iso(11.8 * MIN) },
      { role: 'tool', name: 'mcp__tasmeer_multi__read_chat', detail: 'claude:desk', ts: iso(11.7 * MIN) },
      { role: 'assistant', text: 'Two PRs have no reviewer yet: **#3184** (Dana) and **#3181** (Lee).', ts: iso(11 * MIN), model: 'claude-opus-5-5' },
      { role: 'user', text: 'ok, ask the mailer chat to build the two-recipient fix, and start a new chat for the time zone research', ts: iso(9 * MIN), via: 'Tasmeer Multi' },
      { role: 'relay', kind: 'send', to: 'codex:mail', text: 'Three asks came in from the team: keep both recipients when one record has two addresses, show the sign-in page and return to the page you were on, and let staff open attachments without a second sign-in. Build them, test with made-up data, and give me a short status.', reportBack: true, ts: iso(8.8 * MIN) },
      { role: 'relay', kind: 'start', to: 'Time zone research', text: 'Research how the scheduler should store time zones: UTC in the database, each user zone on screen, and what happens when the clocks change.', reportBack: true, ts: iso(8.6 * MIN) },
      { role: 'assistant', text: 'Sent to the mailer chat and started "Time zone research". Their replies come back here when they finish.', ts: iso(8.5 * MIN), model: 'claude-opus-5-5' },
      { role: 'user', text: '[Tasmeer Multi: reply from the chat "Fix the upload path on Windows" (codex:mail) to your message "Three asks came in from the team"]\n\nBuilt all three: the sync keeps both recipients, the sign-in page returns to where you were, and staff access checks the user, the record and the file. Tests pass with made-up data.', ts: iso(2 * MIN), via: 'headless (Tasmeer Multi or a script)' },
      { role: 'assistant', text: 'The mailer chat finished all three and its tests pass. Want me to draft the release note?', ts: iso(1.5 * MIN), model: 'claude-opus-5-5' },
    ],
    'claude:err': [
      { role: 'user', text: 'check whether the August contract renewal was signed', ts: iso(2 * HOUR + 3 * MIN), via: 'Tasmeer Multi' },
      { role: 'assistant', text: 'The renewal in the shared folder has their signature but not ours yet.', ts: iso(2 * HOUR), model: 'claude-opus-5-5' },
    ],
    'antigravity:voice': [
      { role: 'note', text: 'Started voice chat', ts: iso(95 * MIN) },
      { role: 'user', text: 'Can you check why the Gemini chat names are not syncing?', via: 'voice (spoken)', ts: iso(94 * MIN) },
      { role: 'note', voice: true, text: 'Voice replied: "Sure. The names live in a separate summaries file, so I will read that first, then the renames."', ts: iso(93.5 * MIN) },
      { role: 'tool', name: 'view_file', detail: HOME + '\\.gemini\\antigravity\\conversations\\conversation_summaries.db' },
      { role: 'tool', name: 'grep_search', detail: 'title: in annotations\\*.pbtxt' },
      { role: 'tool', name: 'run_command', detail: 'node agy-read.cjs --list' },
      { role: 'assistant', text: 'The titles come from **conversation_summaries.db**; renames are kept in `annotations/<id>.pbtxt`, so the app reads both.', ts: iso(90 * MIN) },
      { role: 'note', text: 'Stopped voice chat, 47m 23s', ts: iso(47 * MIN) },
    ],
  };
  const older = [
    { role: 'user', text: 'first, read the screenshot I attached', ts: iso(70 * MIN), via: 'Tasmeer Multi' },
    { role: 'assistant', text: 'It is an Antigravity window: a dark canvas, a quiet sidebar, and one composer box with the model picker inside.', ts: iso(69 * MIN), model: 'claude-opus-5-5' },
  ];
  const lives = {
    'claude:desk': { user: '/release-desk run this end to end', text: '', thinking: '', phase: 'tool', account: 'work@example.com', error: null, suggest: null, startedAt: now - 31 * MIN, steps: 112, subSteps: 0, sub: null,
      step: { name: 'Bash', detail: 'node scripts/orphan-sweep.cjs --prs 17 --since "Nov 23, 9:00 AM"', id: 'run-1', at: now - 47e3 },
      running: [{ name: 'Bash', detail: 'node scripts/orphan-sweep.cjs --prs 17 --since "Nov 23, 9:00 AM" --out C:\\Users\\you\\code\\ops\\release\\sweep-2026-11-24.json', id: 'run-1', at: now - 47e3 }] },
    'claude:err': { user: null, text: '', tools: [], account: 'team@example.com', done: true, suggest: { accountId: 'c-tc', name: 'work@example.com' },
      error: 'Claude usage limit reached. Your limit resets at 4:30 PM (Europe/London). Switch to another account to keep going in this same chat.' },
  };
  if (state === 'run-think') Object.assign(lives['claude:desk'], { phase: 'thinking', running: [], thinking: 'The sweep found 2 PRs with no reviewer. Before drafting anything, check whether Dana already picked up #3184: read the review log for Nov 23 first, then the PR, then decide whether the nudge goes to Dana or to Lee.' });
  if (state === 'run-agent') Object.assign(lives['claude:desk'], { phase: 'tool', running: [{ name: 'Agent', detail: 'Check the 17 PRs for review comments nobody answered', id: 'run-1', at: now - 3 * MIN - 12e3 }], sub: { name: 'Grep', detail: '"changes requested" in reviews since Nov 20', id: 'sub-9' }, subSteps: 23 });
  // messages waiting for a chat to be free (yours, and another chat's)
  const queues = state === 'chat-working' || state === 'now' || state === 'run-think' || state === 'run-agent' ? { 'claude:desk': [
    { id: 'q-you', text: 'also add the release date to the page', by: 'you', from: null, at: now - 2 * MIN },
    { id: 'q-chat', text: '[Tasmeer Multi: message from the chat "Onboarding flow, three real users" (claude:g1). To answer it, use send_message to "claude:g1".]\n\nWhen the run is done, say who gets the #3184 nudge.', by: 'chat', from: { key: 'claude:g1', title: 'Onboarding flow, three real users' }, at: now - MIN },
  ] } : {};
  // what a run can ask you (the 'ask', 'perm' and 'plan' states), on the long chat
  const ASKS = {
    ask: { id: 'q-demo', kind: 'question', tool: 'AskUserQuestion', input: { questions: [
      { question: 'Which PRs should the run cover today?', header: 'Scope', multiSelect: true, options: [
        { label: 'All 17 open PRs', description: 'Every PR on the release board' },
        { label: 'Only the 3 shipping this week', description: '#3170, #3176 and #3184' },
        { label: 'Only PRs with a reply waiting', description: 'Where a reviewer or the CI wrote last and nobody answered yet' }] },
      { question: 'When the page is ready, should I post it in the team channel, or hold it so you can check it first?', header: 'Posting', multiSelect: false, options: [
        { label: 'Hold it for me', description: 'Save the page, show it here, post nothing' },
        { label: 'Post it in the channel', description: 'Post the link in the team channel as you' }] },
    ] } },
    perm: { id: 'p-demo', kind: 'permission', tool: 'Bash', detail: 'git push origin feature/upload-path --force-with-lease', input: { command: 'git push origin feature/upload-path --force-with-lease', description: 'Push the rebased branch' } },
    plan: { id: 'pl-demo', kind: 'plan', tool: 'ExitPlanMode', input: { plan: '### Plan\n\n1. Read the 17 open PRs and their last comments (reviews, CI, chat).\n2. Mark each one: waiting on us, waiting on them, or done.\n3. Draft the follow-ups the authors would send; **send nothing**.\n4. Rebuild the page and show it here for your check.\n\nRisks: two PRs have no reviewer, so their rows say so instead of guessing.' } },
  };
  if (ASKS[state]) {
    lives['claude:long'] = { user: null, text: '', tools: [], account: 'main@example.com', error: null, suggest: null, startedAt: now - 4 * MIN, steps: 9, step: null, ask: ASKS[state] };
    sessions.find((x) => x.key === 'claude:long').asking = true;
  }
  if (state === 'files') chats['claude:long'].push(
    { role: 'user', text: '/release-desk run this end to end', ts: iso(2.5 * MIN), via: 'Tasmeer Multi' },
    { role: 'tool', name: 'Bash', detail: 'node scripts/orphan-sweep.cjs --prs 17', ts: iso(2.4 * MIN) },
    { role: 'ask', questions: [{ question: 'When the page is ready, should I post it in the team channel, or hold it so you can check it first?', header: 'Posting', options: ['Hold it for me', 'Post it in the channel'] }], ts: iso(2.2 * MIN) },
    { role: 'answered', pairs: [['When the page is ready, should I post it in the team channel, or hold it so you can check it first?', 'Hold it for me']], ts: iso(2 * MIN) },
    { role: 'plan', text: ASKS.plan.input.plan, ts: iso(1.8 * MIN) },
    { role: 'files', files: ['C:\\Users\\you\\tasmeer-multi\\tools\\shots\\before-after.png', 'C:\\Users\\you\\tasmeer-multi\\DESIGN.md', 'C:\\Users\\you\\code\\ops\\release\\runs\\2026-11-24\\Release desk, Nov 24 (17 PRs, 10 open rows, 2 due Tuesday).html'], caption: 'The release page, the before and after, and the design notes', ts: iso(1.2 * MIN) },
    { role: 'assistant', text: 'Saved and shown above. Publishing the page link has to happen in the Claude app.', ts: iso(MIN), model: 'claude-opus-5-5' },
  );
  const commands = [
    { name: 'unslop-ui', kind: 'skill', desc: 'Turn an interface that looks AI-generated, generic or lifeless into a crafted, distinctive, alive one' },
    { name: 'reviewer', kind: 'skill', desc: 'Review a PR end to end: tests, risks, rollout' },
    { name: 'team-skills:incident-deep-dive-with-a-really-long-plugin-skill-name', kind: 'skill', desc: 'Build a detailed, evidence-tiered incident report with a timeline, the root cause and the follow-ups' },
    { name: 'unified-review', kind: 'command', desc: 'Review the current diff' },
    { name: 'usage', kind: 'command', desc: 'Show plan usage limits' },
  ];
  const prefsBy = {
    new: { accountId: 'c-main', mode: 'full', model: '', effort: '', cwd: HOME + '\\code\\ops' },
    'claude:long': { accountId: 'c-main', mode: 'full', model: '', effort: '' },
    'mixed:demo': { accountId: 'x-main', mode: 'full', model: '', effort: '' },
    'claude:desk': { accountId: 'c-tc', mode: 'full', model: '', effort: 'high' },
    'claude:err': { accountId: 'c-team', mode: 'full', model: '', effort: '' },
    'antigravity:voice': { accountId: 'g-main', mode: 'full', model: '', effort: '' },
  };
  const prefsFor = (k, eng) => prefsBy[k] || (prefsBy[k] = { accountId: accounts.find((a) => a.engine === eng && a.main)?.id, mode: 'full', model: '', effort: '' });

  // ---------- what the app asks for ----------
  if (state === 'empty') { accounts = []; sessions = []; }
  const START = { mixed: 'mixed:demo', 'mixed-menu': 'mixed:demo', 'mixed-test': 'mixed:demo', new: 'new', modal: 'new', empty: 'new', 'chat-working': 'claude:desk', 'run-think': 'claude:desk', 'run-agent': 'claude:desk', now: 'claude:desk', relay: 'claude:g1', error: 'claude:err', voice: 'antigravity:voice' }[state] || 'claude:long';
  let firstOpen = true; let view = null;
  function open(key) {
    if (firstOpen && key === 'new') key = START;
    firstOpen = false;
    if (key === 'new') {
      const p = prefsBy.new; const a = accounts.find((x) => x.id === p.accountId) || { engine: 'claude' };
      view = { key: 'new', engine: a.engine };
      emit('view', { key: 'new', engine: a.engine, cwd: p.cwd, title: 'New chat', items: [], more: false });
      emit('chat-prefs', { key: 'new', ...p }); emit('live', { key: 'new', live: lives.new || null });
      return Promise.resolve();
    }
    const s = sessions.find((x) => x.key === key); if (!s) return Promise.resolve();
    view = { key, engine: s.engine };
    emit('view', { key, engine: s.engine, cwd: s.cwd, title: org.meta[key]?.title || s.title, items: (chats[key] || []).slice(), more: key === 'claude:long' });
    emit('chat-prefs', { key, ...prefsFor(key, s.engine) }); emit('live', { key, live: lives[key] || null }); emit('queue', { key, items: queues[key] || [] });
    if (s.done) { s.done = false; emit('sessions', sessions); }
    return Promise.resolve();
  }
  function setPrefs(key, patch) {
    const p = key === 'new' ? prefsBy.new : prefsFor(key, sessions.find((x) => x.key === key)?.engine);
    Object.assign(p, patch);
    if (key === 'new' && patch.accountId) { const a = accounts.find((x) => x.id === patch.accountId); if (a) view = { key: 'new', engine: a.engine }; }
    emit('chat-prefs', { key, ...p });
    return Promise.resolve(true);
  }
  function organise(op) {
    if (op.kind === 'theme') org.theme = op.theme;
    else if (op.kind === 'side') { if ('width' in op) org.sideWidth = op.width; if ('hidden' in op) org.sideHidden = op.hidden; }
    else if (op.kind === 'chrome') org.chrome = op.on;
    else if (op.kind === 'read-aloud') org.readAloud = op.on;
    else if (op.kind === 'star') (org.meta[op.key] ||= {}).star = op.on;
    else if (op.kind === 'new-folder') org.folders.push({ id: 'f' + Date.now(), name: op.name || 'New folder', order: op.key ? [op.key] : [] });
    else if (op.kind === 'place') { org.pinOrder = org.pinOrder.filter((k) => k !== op.key); for (const f of org.folders) f.order = f.order.filter((k) => k !== op.key); org.listOrder = op.order.slice(); }
    else if (op.kind === 'sort') { if (op.mode === 'recent') delete org.listOrder; }
    else if (op.kind === 'move') {
      org.pinOrder = org.pinOrder.filter((k) => k !== op.key); for (const f of org.folders) f.order = f.order.filter((k) => k !== op.key);
      if (op.to === 'pinned') org.pinOrder.splice(op.index ?? org.pinOrder.length, 0, op.key);
      else if (op.to !== 'project') org.folders.find((f) => f.id === op.to)?.order.splice(op.index ?? 1e9, 0, op.key);
    }
    emit('org', JSON.parse(JSON.stringify(org)));
    return Promise.resolve(true);
  }
  // A whole exchange, for the motion recording: streamed words, a step, the reply landing, the ring sweeping.
  async function send(key, text) {
    const s = sessions.find((x) => x.key === key); const p = prefsFor(key, s?.engine);
    const a = accounts.find((x) => x.id === p.accountId);
    if (lives[key] && !lives[key].done) { (queues[key] ||= []).push({ id: 'q' + Date.now(), text, by: 'you', at: Date.now() }); emit('queue', { key, items: queues[key].slice() }); return 'queued'; }
    const live = { user: text, text: '', thinking: '', phase: 'starting', running: [], sub: null, subSteps: 0, account: a.label, error: null, suggest: null, startedAt: Date.now(), steps: 0, step: null };
    lives[key] = live; if (s) { s.running = true; s.updated = Date.now(); }
    mark('send'); emit('live', { key, live }); emit('sessions', sessions);
    await wait(500);
    mark('think'); const thought = 'The ring should follow real usage numbers, so sweep from the old value to the new one and never bounce.'.split(' ');
    for (let i = 1; i <= thought.length; i += 3) { live.phase = 'thinking'; live.thinking = thought.slice(0, i).join(' '); emit('live', { key, live: { ...live } }); await wait(80); }
    live.thinking = '';
    const words = 'The ring now follows the real numbers. When a usage check comes back, it sweeps from the old value to the new one over half a second, with no bounce, so it reads as a measurement rather than a toy.'.split(' ');
    mark('stream');
    for (let i = 1; i <= words.length; i += 3) { live.phase = 'writing'; live.text = words.slice(0, i).join(' '); emit('live', { key, live: { ...live } }); await wait(90); }
    const first = live.text;
    const step = { name: 'Edit', detail: HOME + '\\tasmeer-multi\\src\\ui\\token.js', id: 'e1', at: Date.now() };
    mark('step'); live.text = ''; live.phase = 'tool'; live.steps += 1; live.step = step; live.running = [step]; emit('live', { key, live: { ...live } }); // a step started: the run lets go of its words
    await wait(350);
    const t0 = Date.now();
    chats[key].push({ role: 'user', text, ts: new Date(live.startedAt + 300).toISOString(), via: 'Tasmeer Multi' }, { role: 'assistant', text: first, ts: new Date(t0 - 2000).toISOString(), model: 'claude-opus-5-5' }, { role: 'tool', name: 'Edit', detail: step.detail, ts: new Date(t0).toISOString(), id: 'e1' });
    emit('append', { key, items: chats[key].slice(-3) });
    await wait(700);
    live.running = []; live.phase = 'thinking'; emit('live', { key, live: { ...live } }); // the step finished
    await wait(300);
    const more = 'Done: the token in the message box and the one in the account list both sweep, and nothing moves when the numbers stay the same.'.split(' ');
    for (let i = 1; i <= more.length; i += 3) { live.phase = 'writing'; live.text = more.slice(0, i).join(' '); emit('live', { key, live: { ...live } }); await wait(90); }
    const last = live.text;
    delete lives[key];
    chats[key].push({ role: 'assistant', text: last, ts: new Date().toISOString(), model: 'claude-opus-5-5' });
    mark('final'); emit('live', { key, live: null });
    await wait(250);
    emit('append', { key, items: chats[key].slice(-1) });
    if (s) { s.running = false; s.updated = Date.now(); }
    await wait(500);
    a.usage = { ...a.usage, at: Date.now(), windows: a.usage.windows.map((w, i) => (i === 0 ? { ...w, used: w.used + 9 } : w)) };
    mark('usage'); emit('sessions', sessions); emit('accounts', { accounts });
  }

  window.multi = {
    onAccounts: on('accounts'), onSessions: on('sessions'), onView: on('view'), onAppend: on('append'), onPrepend: on('prepend'),
    onLive: on('live'), onPrefs: on('chat-prefs'), onAsk: on('ask'), onSelect: on('select'), onCollapsed: on('collapsed'),
    onCommands: on('commands'), onUsageDone: on('usage-done'), onOrg: on('org'), onQueue: on('queue'),
    sendNow: (k, t) => { const l = lives[k]; if (l && !l.done) { l.said = [...(l.said || []), { text: t, at: Date.now(), taken: false }]; (window.__sentNow ||= []).push(t); emit('live', { key: k, live: { ...l } }); return Promise.resolve('sent-now'); } return window.multi.send(k, t); },
    queueSendNow: (k, id) => { const q = queues[k] || []; const i = q.findIndex((x) => x.id === id); if (i < 0) return Promise.resolve(null); const [it] = q.splice(i, 1); emit('queue', { key: k, items: q.slice() }); return window.multi.sendNow(k, it.text); },
    unqueue: (key, id) => { const q = queues[key] || []; const i = q.findIndex((x) => x.id === id); if (i < 0) return Promise.resolve(null); const [it] = q.splice(i, 1); emit('queue', { key, items: q.slice() }); (window.__unqueued ||= []).push(id); return Promise.resolve(it.by === 'you' ? it.text : ''); },
    refreshUsage: async () => { await wait(1200); for (const a of accounts) if (a.usage) a.usage = { ...a.usage, at: Date.now(), failedAt: undefined }; emit('accounts', { accounts }); emit('usage-done', true); },
    commands: () => Promise.resolve(commands),
    organise, chatMenu: () => {}, folderMenu: () => {}, markAllRead: () => {}, deleteChat: () => {},
    voiceType: () => {}, speakLast: () => {}, stopSpeaking: () => {}, exportChat: () => {},
    init: () => { emit('accounts', { accounts }); emit('org', JSON.parse(JSON.stringify(org))); emit('sessions', sessions); emit('collapsed', collapsed); return Promise.resolve(true); },
    open, more: () => { emit('prepend', { key: view.key, items: older, more: false }); return Promise.resolve(); },
    setPrefs, setCollapsed: (c) => { collapsed = c; return Promise.resolve(); },
    pickFolder: () => {}, reveal: () => {}, send: (k, t) => Promise.race([send(k, t), wait(20)]).then((x) => x || 'sent'),
    saveAttachment: (name) => Promise.resolve(HOME + '\\AppData\\Roaming\\Tasmeer Multi\\attachments\\' + Date.now() + '-3f9c2a-' + name),
    pathOf: () => '', stop: () => {}, addAccount: () => {}, accountMenu: () => {}, renameAccount: () => {}, openExternal: () => {},
    // your answer to what a run asked: recorded for the tests, and the card goes away like in the app
    answer: (key, id, reply) => {
      (window.__answers ||= []).push({ key, id, ...reply });
      const l = lives[key]; if (l && l.ask && l.ask.id === id) { lives[key] = { ...l, ask: null }; const s = sessions.find((x) => x.key === key); if (s) s.asking = false; emit('live', { key, live: { ...lives[key] } }); emit('sessions', sessions); }
      return Promise.resolve(true);
    },
    openFile: () => Promise.resolve(''), revealFile: () => Promise.resolve(),
  };

  // ---------- each state's last step: what a person would have done to get there ----------
  const $ = (s) => document.querySelector(s);
  const typeInto = async (text, gap = 35) => { const box = $('#input'); box.focus(); for (const ch of text) { box.value += ch; box.dispatchEvent(new Event('input', { bubbles: true })); await wait(gap); } };
  function picture(w, h, label) { // a stand-in screenshot for the attachment chips
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    g.fillStyle = '#1f6fb2'; g.fillRect(0, 0, w, h); g.fillStyle = '#d97757'; g.fillRect(w * 0.1, h * 0.2, w * 0.5, h * 0.5);
    g.fillStyle = '#fff'; g.font = `${Math.round(h / 8)}px Segoe UI`; g.fillText(label, w * 0.12, h * 0.85);
    return new Promise((r) => c.toBlob((b) => r(new File([b], label + '.png', { type: 'image/png' })), 'image/png'));
  }
  const STEPS = {
    slash: () => typeInto('/un', 10),
    now: () => typeInto('also add the release date to the page', 5), // a reply runs and you type: Send now shows
    menu: () => $('.acct-pick .dd-btn')?.click(),
    'mixed-menu': () => $('.acct-pick .dd-btn')?.click(), // a chat Claude and GPT share: both kinds of account to pick from
    modal: () => $('#add-acct')?.click(),
    voice: () => $('#input')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })),
    attach: async () => {
      const dt = new DataTransfer();
      dt.items.add(await picture(1600, 900, 'Screenshot 2026-11-24 021455'));
      dt.items.add(new File([new Uint8Array(48213)], 'Vendor agreement - Acme Hosting - signed renewal (August).pdf', { type: 'application/pdf' }));
      $('#main').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      await wait(200); await typeInto('compare these two', 5);
    },
    fold: () => { const d = document.querySelector('#log details.steps'); if (d) { d.open = true; d.scrollIntoView({ block: 'center' }); } },
    accounts: () => { const a = $('#accounts'); a.scrollTop = a.scrollHeight; }, // the Codex accounts: three usage windows, a same-login warning
    // "just sent" bubbles: gone once the file has the message or anything newer; long runs show their step
    'pending-test': async () => {
      const r = {}; const key = 'claude:long'; const shown = () => !!document.querySelector('#log .msg.user.pending');
      lives[key] = { user: '/release-desk run this end to end', text: '', account: 'main@example.com', startedAt: Date.now() - 1000, steps: 0, step: null, phase: 'starting', running: [] };
      emit('live', { key, live: { ...lives[key] } }); await wait(120);
      r.bubbleAtSend = shown(); r.dotsAtSend = !!document.querySelector('#log .typing');
      emit('append', { key, items: [{ role: 'tool', name: 'Bash', detail: 'node scripts/orphan-sweep.cjs', ts: new Date().toISOString(), id: 'p1' }] }); await wait(120);
      const st = { name: 'Bash', detail: 'node scripts/orphan-sweep.cjs --prs 17', id: 'p1', at: Date.now() };
      lives[key] = { ...lives[key], startedAt: Date.now() - 31 * MIN - 1000, steps: 112, step: st, running: [st], phase: 'tool' }; emit('live', { key, live: { ...lives[key] } }); await wait(120);
      r.bubbleAfterOutput = shown(); r.stepLine = document.querySelector('#log .activity')?.textContent || ''; r.whoMeta = document.querySelector('#log .who-meta')?.textContent || '';
      delete lives[key]; emit('live', { key, live: null }); await wait(400);
      lives[key] = { user: '/usage', text: '', account: 'main@example.com', startedAt: Date.now(), steps: 0, step: null, phase: 'starting', running: [] }; emit('live', { key, live: { ...lives[key] } }); await wait(120);
      r.secondBubble = shown();
      emit('append', { key, items: [{ role: 'user', text: '/usage', ts: new Date().toISOString(), via: 'headless' }] }); await wait(120);
      r.secondAfterSave = shown(); r.lastUserBlock = [...document.querySelectorAll('#log .user-wrap .msg.user')].pop()?.textContent;
      window.__pendResult = r; console.log('PEND ' + JSON.stringify(r));
    },
    // A run is one unit at the bottom (Nov 24, 2026): its steps never land above its "is working" line,
    // the step running now shows once (on the activity line), the line always says what it is doing, and
    // when it finishes everything stays in place as the reply. A message typed meanwhile waits under it.
    'live-test': async () => {
      const r = {}; const key = 'claude:long'; const T = () => new Date().toISOString();
      const blocks = () => [...document.querySelectorAll('#log > .blk')];
      const box = () => document.querySelector('#log > .msg.assistant.live');
      const act = () => box()?.querySelector('.activity')?.textContent || '';
      const count = (re) => (document.querySelector('#log').textContent.match(re) || []).length;
      lives[key] = { user: 'check the gallery', text: '', thinking: '', phase: 'starting', running: [], sub: null, subSteps: 0, account: 'main@example.com', startedAt: Date.now(), steps: 0, step: null };
      emit('live', { key, live: { ...lives[key] } }); await wait(150);
      r.startLine = act(); r.pendingAtSend = !!document.querySelector('#log .msg.user.pending');
      emit('append', { key, items: [{ role: 'user', text: 'check the gallery', ts: T(), via: 'Tasmeer Multi' }] }); await wait(150);
      r.pendingGone = !document.querySelector('#log .msg.user.pending');
      const s1 = { name: 'Bash', detail: 'node tools/shoot.cjs --all', id: 'b1', at: Date.now() };
      lives[key] = { ...lives[key], phase: 'tool', running: [s1], step: s1, steps: 1 }; emit('live', { key, live: { ...lives[key] } });
      emit('append', { key, items: [{ role: 'tool', name: 'Bash', detail: 'node tools/shoot.cjs --all', ts: T(), id: 'b1' }] }); await wait(150);
      r.nothingOfTheRunAbove = !!blocks().pop()?.classList.contains('user-wrap');
      r.runningStepShownOnce = count(/node tools\/shoot\.cjs --all/g);
      r.runningLine = act();
      lives[key] = { ...lives[key], phase: 'thinking', running: [], thinking: 'The gallery has 40 shots and all of them fit' }; emit('live', { key, live: { ...lives[key] } }); await wait(150);
      r.thinkingLine = act(); r.finishedStepInsideBox = !!box()?.querySelector('.turn details.steps'); r.stillNothingAbove = !!blocks().pop()?.classList.contains('user-wrap');
      lives[key] = { ...lives[key], phase: 'writing', text: 'All 40 shots fit.', thinking: '' }; emit('live', { key, live: { ...lives[key] } }); await wait(150);
      r.writingLine = act(); r.streamed = box()?.querySelector(':scope > .body')?.textContent || '';
      emit('append', { key, items: [{ role: 'assistant', text: 'All 40 shots fit.', ts: T(), model: 'claude-opus-5-5' }] });
      delete lives[key]; emit('live', { key, live: null }); await wait(250);
      const last = blocks().pop();
      r.boxGone = !box(); r.replyKeepsItsStep = !!last?.querySelector('details.steps') && /All 40 shots fit/.test(last?.textContent || ''); r.replyOnce = count(/All 40 shots fit/g);
      lives[key] = { user: 'and now the light theme', text: '', phase: 'thinking', running: [], account: 'main@example.com', startedAt: Date.now(), steps: 0 };
      emit('live', { key, live: { ...lives[key] } }); await wait(150);
      r.lastReplyStaysPut = !!blocks().some((b) => /All 40 shots fit/.test(b.textContent)) && !/All 40 shots fit/.test(box()?.textContent || '');
      const inp = $('#input'); r.buttonWhileWorking = $('#go').getAttribute('aria-label');
      inp.value = 'then check the narrow window'; inp.dispatchEvent(new Event('input', { bubbles: true })); await wait(50);
      r.buttonWithText = $('#go').getAttribute('aria-label');
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await wait(250);
      r.queued = document.querySelector('#log .queued .msg.user')?.textContent || ''; r.boxCleared = inp.value === '';
      document.querySelector('#log .queued .q-drop')?.click(); await wait(250);
      r.takenBack = inp.value; r.queueGone = !document.querySelector('#log .queued');
      window.__liveResult = r; console.log('LIVE ' + JSON.stringify(r));
    },
    // "Send now": the button shows only while a reply runs and something is typed; Ctrl+Enter sends into
    // the reply; the message reads "sent" until Claude takes it, then "Claude has it", and once the chat
    // file has it, it sits in the chat as "sent while it worked". A queued message can be sent now too.
    'now-test': async () => {
      const r = {}; const key = 'claude:long'; const T = () => new Date().toISOString();
      const btn = () => $('#go-now'); const inp = $('#input');
      const st = { name: 'Bash', detail: 'npm test', id: 'n1', at: Date.now() };
      lives[key] = { user: 'run the tests', text: '', phase: 'tool', running: [st], step: st, steps: 1, account: 'main@example.com', startedAt: Date.now(), said: [] };
      emit('append', { key, items: [{ role: 'user', text: 'run the tests', ts: T(), via: 'Tasmeer Multi' }] });
      emit('live', { key, live: { ...lives[key] } }); await wait(150);
      r.hiddenWhenEmpty = btn().hidden;
      inp.value = 'also check the light theme'; inp.dispatchEvent(new Event('input', { bubbles: true })); await wait(50);
      r.shownWhenTyped = !btn().hidden; r.label = btn().textContent;
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })); await wait(200);
      r.sentIntoReply = (window.__sentNow || [])[0]; r.boxCleared = inp.value === '';
      r.sentLabel = document.querySelector('#log .said .stamp')?.textContent;
      lives[key] = { ...lives[key], said: lives[key].said.map((m) => ({ ...m, taken: true })) }; emit('live', { key, live: { ...lives[key] } }); await wait(150);
      r.takenLabel = document.querySelector('#log .said .stamp')?.textContent;
      emit('append', { key, items: [{ role: 'user', text: 'also check the light theme', ts: T(), via: '', midRun: true }] }); await wait(200);
      r.pendingGone = !document.querySelector('#log .said');
      const stamps = [...document.querySelectorAll('#log .user-wrap .stamp')].map((x) => x.textContent);
      r.inTheChat = stamps.some((x) => /sent while it worked/.test(x));
      r.boxBelowIt = !!document.querySelector('#log > .msg.assistant.live') && [...document.querySelectorAll('#log > *')].indexOf(document.querySelector('#log > .msg.assistant.live')) > [...document.querySelectorAll('#log > .user-wrap')].findIndex((x) => /also check the light theme/.test(x.textContent));
      inp.value = 'and the narrow window'; inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await wait(200);
      r.queuedWithButton = !!document.querySelector('#log .queued .q-now');
      document.querySelector('#log .queued .q-now')?.click(); await wait(200);
      r.queuedSentNow = (window.__sentNow || [])[1]; r.queueEmpty = !document.querySelector('#log .queued');
      window.__nowResult = r; console.log('NOW ' + JSON.stringify(r));
    },
    // A chat Claude and GPT share (Nov 25, 2026): its picker offers Claude and Codex accounts, each reply
    // says who wrote it, and a run names the engine answering, with Send now matching that engine.
    'mixed-test': async () => {
      const r = {}; const key = 'mixed:demo'; const inp = $('#input'); const btn = () => $('#go-now');
      const whoText = () => document.querySelector('#log .msg.assistant.live .who-text')?.textContent || '';
      r.pickerGroups = [...document.querySelectorAll('#acct optgroup')].map((g) => g.label + ' ' + g.children.length);
      r.whoLines = [...document.querySelectorAll('#log .turn-who .tw-name')].map((x) => x.textContent);
      r.caughtUpStamps = [...document.querySelectorAll('#log .user-wrap .stamp')].filter((x) => /what the other agent did/.test(x.textContent)).length;
      r.listMark = document.querySelector('#chats [data-key="mixed:demo"] .emark')?.className || '';
      document.querySelector('#filter [data-f="codex"]')?.click(); await wait(100);
      r.inCodexFilter = !!document.querySelector('#chats [data-key="mixed:demo"]');
      document.querySelector('#filter [data-f="claude"]')?.click(); await wait(100);
      r.inClaudeFilter = !!document.querySelector('#chats [data-key="mixed:demo"]');
      document.querySelector('#filter [data-f="all"]')?.click(); await wait(100);
      r.hintOnGpt = inp.dataset.idle;
      const sel = $('#acct'); sel.value = 'c-main'; sel.dispatchEvent(new Event('change', { bubbles: true })); await wait(150);
      r.hintOnClaude = inp.dataset.idle; r.modelOnClaude = $('#model').selectedOptions[0]?.textContent || '';
      // GPT answering: the line names it, and the button stops its reply to send yours
      lives[key] = { user: 'GPT, check the avatar tests too', text: '', phase: 'tool', running: [], step: null, steps: 0, account: 'main@example.com', engine: 'codex', startedAt: Date.now(), said: [] };
      emit('live', { key, live: { ...lives[key] } }); await wait(150);
      inp.value = 'and the banner'; inp.dispatchEvent(new Event('input', { bubbles: true })); await wait(50);
      r.gptLine = whoText(); r.gptButton = btn().hidden ? '(hidden)' : btn().textContent;
      delete lives[key]; emit('live', { key, live: null }); await wait(150);
      // Claude answering: the button sends into its reply
      lives[key] = { user: 'Claude, check the banner too', text: '', phase: 'tool', running: [], step: null, steps: 0, account: 'main@example.com', engine: 'claude', startedAt: Date.now(), said: [] };
      emit('live', { key, live: { ...lives[key] } }); await wait(150);
      inp.dispatchEvent(new Event('input', { bubbles: true })); await wait(50);
      r.claudeLine = whoText(); r.claudeButton = btn().hidden ? '(hidden)' : btn().textContent;
      delete lives[key]; emit('live', { key, live: null }); inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true }));
      window.__mixedResult = r; console.log('MIXED ' + JSON.stringify(r));
    },
    // what a run asks you: one click answers one question; several questions, a typed answer that
    // survives a redraw, and a permission denied with a reason
    'ask-test': async () => {
      const r = {}; const key = 'claude:long'; const A = () => (window.__answers || []).shift();
      const put = (ask) => { lives[key] = { user: null, text: '', account: 'main@example.com', startedAt: Date.now(), steps: 3, step: null, ...(lives[key] || {}), ask }; const s = sessions.find((x) => x.key === key); s.asking = !!ask; emit('live', { key, live: { ...lives[key] } }); emit('sessions', sessions); };
      put({ id: 'q1', kind: 'question', tool: 'AskUserQuestion', input: { questions: [{ question: 'Which color?', header: 'Color', multiSelect: false, options: [{ label: 'Red' }, { label: 'Blue' }] }] } }); await wait(150);
      r.cardShown = !!document.querySelector('#log .ask-card'); r.whoText = document.querySelector('#log .who-text')?.textContent; r.sidebarMark = !!document.querySelector('.chat[data-key="claude:long"] .ask-dot');
      [...document.querySelectorAll('#log .ask-opt')].find((b) => b.textContent.includes('Blue')).click(); await wait(150);
      r.oneClick = A(); r.cardGone = !document.querySelector('#log .ask-card');
      put({ id: 'q2', kind: 'question', tool: 'AskUserQuestion', input: { questions: [{ question: 'Which PRs?', multiSelect: true, options: [{ label: 'All 17' }, { label: 'Shipping this week' }, { label: 'Replies waiting' }] }, { question: 'Post it?', multiSelect: false, options: [{ label: 'Hold it' }, { label: 'Post it' }] }] } }); await wait(150);
      const opts = () => [...document.querySelectorAll('#log .ask-card .ask-opt')];
      opts().find((b) => b.textContent.includes('Shipping this week')).click(); opts().find((b) => b.textContent.includes('Replies waiting')).click();
      r.submitBeforeSecond = !document.querySelector('#log .ask-card .primary').disabled;
      const other = document.querySelectorAll('#log .ask-card .ask-other')[1]; other.value = 'Hold it until 9 AM'; other.dispatchEvent(new Event('input', { bubbles: true }));
      emit('live', { key, live: { ...lives[key], steps: 4 } }); await wait(150); // a redraw arrives mid-answer
      r.typedSurvived = document.querySelectorAll('#log .ask-card .ask-other')[1]?.value;
      r.submitAfter = !document.querySelector('#log .ask-card .primary').disabled;
      document.querySelector('#log .ask-card .primary').click(); await wait(150);
      r.multi = A();
      put({ id: 'p1', kind: 'permission', tool: 'Bash', detail: 'git push --force', input: { command: 'git push --force' } }); await wait(150);
      r.permTitle = document.querySelector('#log .ask-card .ask-text')?.textContent;
      const why = document.querySelector('#log .ask-card .ask-other'); why.value = 'not without a review';
      [...document.querySelectorAll('#log .ask-card .ghost-btn')].find((b) => b.textContent === 'Deny').click(); await wait(150);
      r.deny = A();
      window.__askResult = r; console.log('ASK ' + JSON.stringify(r));
    },
    // reordering the main list: the blue line follows the half of the row under the pointer, the drop
    // lands there, the list says it is in your order, and "Newest first" undoes it
    'reorder-test': async () => {
      const r = {}; const ev = (node, type, dt, y) => node.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientY: y }));
      const keys = () => [...document.querySelectorAll('#chats .chat')].map((x) => x.dataset.key);
      const before = keys(); r.g7At = before.indexOf('claude:g7'); r.g3At = before.indexOf('claude:g3');
      const dt = new DataTransfer(); const src = $('.chat[data-key="claude:g7"]'); ev(src, 'dragstart', dt); await wait(60);
      const tgt = $('.chat[data-key="claude:g3"]'); const rc = tgt.getBoundingClientRect();
      ev(tgt, 'dragover', dt, rc.top + 3); r.topHalfLine = tgt.classList.contains('drop-before') ? getComputedStyle(tgt, '::before').backgroundColor : 'none';
      ev(tgt, 'dragover', dt, rc.bottom - 3); r.bottomHalfLine = tgt.classList.contains('drop-after') ? getComputedStyle(tgt, '::after').backgroundColor : 'none';
      r.onlyOneLine = document.querySelectorAll('#chats .drop-before, #chats .drop-after').length === 1;
      ev(tgt, 'drop', dt, rc.bottom - 3); ev(src, 'dragend', dt); await wait(150);
      const k = keys(); r.landedRightBelow = k.indexOf('claude:g7') === k.indexOf('claude:g3') + 1; r.label = document.querySelector('#chats .list-label')?.textContent;
      // drop ABOVE another row, near the top of the list
      const dt2 = new DataTransfer(); const src2 = $('.chat[data-key="claude:g10"]'); ev(src2, 'dragstart', dt2); await wait(60);
      const t2 = $('.chat[data-key="claude:long"]'); const r2 = t2.getBoundingClientRect(); ev(t2, 'dragover', dt2, r2.top + 3); ev(t2, 'drop', dt2, r2.top + 3); ev(src2, 'dragend', dt2); await wait(150);
      const k2 = keys(); r.landedRightAbove = k2.indexOf('claude:g10') === k2.indexOf('claude:long') - 1;
      document.querySelector('#chats .list-sort')?.click(); await wait(150);
      const k3 = keys(); r.newestFirstAgain = !org.listOrder && k3.indexOf('claude:g7') === before.indexOf('claude:g7');
      window.__reorderResult = r; console.log('REORDER ' + JSON.stringify(r));
    },
    reorder: async () => { // the photo: a chat held over the lower half of another row
      const dt = new DataTransfer(); const ev = (node, type, y) => node.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientY: y }));
      ev($('.chat[data-key="claude:g7"]'), 'dragstart'); await wait(250);
      const tgt = $('.chat[data-key="claude:g1"]'); const rc = tgt.getBoundingClientRect(); ev(tgt, 'dragover', rc.bottom - 3);
    },
    // a chat being dragged, held over the Pin target (for the photo)
    dnd: async () => {
      const dt = new DataTransfer(); const row = $('.chat[data-key="claude:g1"]');
      row.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
      await wait(250);
      $('.dnd-target').dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    },
    // the whole drag and drop story, checked step by step: results in window.__dndResult
    'dnd-test': async () => {
      const r = {}; const ev = (node, type, dt) => node.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      const drag = async (key, target) => { const dt = new DataTransfer(); const row = $(`.chat[data-key="${key}"]`); ev(row, 'dragstart', dt); await wait(60); const bar = getComputedStyle($('.dnd-bar')).display; const t = typeof target === 'function' ? target() : target; ev(t, 'dragover', dt); ev(t, 'drop', dt); ev(row, 'dragend', dt); await wait(80); return bar; };
      r.barWhileDragging = await drag('claude:g1', () => document.querySelectorAll('.dnd-target')[0]);
      r.barAfter = getComputedStyle($('.dnd-bar')).display;
      r.pinned = org.pinOrder.slice(); r.pinnedHeader = !![...document.querySelectorAll('.group .gname')].find((x) => x.textContent === 'Pinned');
      await drag('claude:g3', () => document.querySelectorAll('.dnd-target')[1]); // New folder: asks for a name
      r.askOpen = !$('#modal').hidden; $('#m-input').value = 'Work'; $('#m-form').dispatchEvent(new Event('submit', { cancelable: true })); await wait(80);
      r.folders = org.folders.map((f) => f.name + ':' + f.order.join(','));
      await drag('claude:g1', () => $('#chats .list-label') || $('#chats')); // back onto the plain list: unpin
      r.pinnedAfterUnpin = org.pinOrder.slice();
      sessions.find((x) => x.key === 'claude:g5').running = true; emit('sessions', sessions); // a list update arrives mid-drag
      const dt2 = new DataTransfer(); const row2 = $('.chat[data-key="claude:g7"]'); ev(row2, 'dragstart', dt2); await wait(60);
      sessions.find((x) => x.key === 'claude:g5').running = false; emit('sessions', sessions);
      r.rowSurvivedUpdate = row2.isConnected; ev(row2, 'dragend', dt2); await wait(80); r.redrawnAfter = !row2.isConnected;
      const files = new DataTransfer(); files.items.add(new File(['hello'], 'notes.txt', { type: 'text/plain' }));
      ev($('#side'), 'dragover', files); ev($('#side'), 'drop', files); await wait(300); // a file let go over the sidebar
      r.attachedFromSidebar = [...document.querySelectorAll('.file-chip .file-name')].map((x) => x.textContent);
      window.__dndResult = r; console.log('DND ' + JSON.stringify(r));
    },
    cycle: async () => {
      await wait(700);
      const sel = $('#acct'); sel.value = 'c-tc'; mark('switch'); sel.dispatchEvent(new Event('change', { bubbles: true })); // switch who answers
      await wait(1100);
      mark('type'); await typeInto('make the ring sweep when usage changes');
      await wait(300);
      $('#input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await wait(6800);
      const d = sessions.find((x) => x.key === 'claude:desk'); d.running = false; d.done = true; d.updated = Date.now(); delete lives['claude:desk'];
      mark('other-done'); emit('sessions', sessions); // another chat finishes while you are here
      await wait(2000);
      mark('hide'); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }));
      await wait(900);
      mark('show'); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }));
      await wait(900);
      window.__cycleDone = true;
    },
  };
  window.addEventListener('load', () => setTimeout(async () => { try { await (STEPS[state] || (() => {}))(); } catch (e) { console.error('demo step', e); } window.__demoReady = true; }, 350));
})();
