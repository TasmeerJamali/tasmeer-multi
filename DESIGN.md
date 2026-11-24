# Tasmeer Multi's look: the seat token

Written Nov 24, 2026. Every visual choice traces back to this page, with its number and its reason.
A change that cannot point to a line here is a default; decide it and add it here, or remove it.

## Bottom line

- **What it is:** one quiet window over your Claude Code, Codex and Gemini chats, where any of your
  accounts can answer any chat. So it looks like a calm reading room (Antigravity's dark canvas was the
  brief), and the one loud thing is *who is answering*.
- **The signature, the seat token:** a small rounded square in the account's own colour with its
  initials, wrapped in a thin ring that shows how much of that account's 5-hour limit is left (real
  usage numbers). It appears wherever an account matters: the account picker in the message box, the
  "is working" line of a reply, the account list, and the new-chat picker. The brand mark is three
  tokens fanned out. Engines get a smaller sibling mark: a filled square (Claude), a hollow square
  (Codex), a diamond (Gemini), so they differ by shape as well as colour.
- **How every case is checked:** `node tools/shoot.cjs` photographs every demo state in dark and
  light and runs the fit check in each; `node tools/record.cjs` films a full exchange at 30 fps and
  writes contact sheets. Results land in `tools/shots/`.

## The brief (Nov 24)

Make the window feel designed, without removing any feature. Inspiration: an Antigravity window (dark canvas, quiet sidebar with relative times, breadcrumb
header, plain assistant text, "Worked for 15m" folds, centred dividers for events, one composer box
with the model picker inside and a white round send button). Earlier decisions that win over
the screenshot: no project groups in the chat list; Claude, Codex and Gemini must be told apart at a
glance; dark mode by default; nothing removed.

## What makes it feel alive (and what it never does)

1. **The seat token moves because something happened.** Switching accounts springs the new token in
   (scale 0.82 to 1, 0.40 s, bounce 0.12) and sweeps its ring from the old account's value to the new
   one's (0.50 s, bounce 0). A usage check that comes back with new numbers sweeps the ring too.
2. **A reply has a life:** your message lands (0.50 s, bounce 0.18), the working line shows the
   answering account's token with a turning arc segment (only while working), the reply fades in from
   a 6 px blur, and the chat's row in the sidebar morphs from working bars into a green dot that
   pulses twice and then rests.
3. **Real signals drive it:** ring = real 5-hour usage left; working = a real message written in the
   last 40 s (or Antigravity's own status); done = a run started here that finished while you were
   elsewhere.
4. **Restraint:** nothing loops at rest. The only loops are the working bars and arc (while something
   works) and the waiting dots (while a reply is pending). The done dot pulses 2 times, then rests.

## The parts and their states

| Part | State | Size | Corners | Shows |
|---|---|---|---|---|
| Sidebar | default | 300 px (200 to 640, drag) | none (frame) | brand, new chat, search, filters, chats, accounts |
| Chat row | rest / hover / selected | 32 px high | 7 px (control) | engine mark, title, star, time |
| Chat row | working | 32 px | 7 px | working bars replace the time |
| Chat row | done (unread) | 32 px | 7 px | green dot before the time, title in 600 |
| Account row | ok / low / failed / unknown | 46 px | 7 px | token with ring, email, usage bars, checked time |
| Header | chat / new | 44 px | none | sidebar button, project / title, last-reply model, folder, file |
| User message | sent / pending | text | 12 px (paper) | text, time and where it was sent from |
| Reply | done / live / error | text | none | markdown; "Worked for 15m" fold; time and copy |
| Note | summary, task, voice handoff | 1 line | none | centred label between two rules |
| Voice line | spoken reply | 1 to 3 lines | none | speaker icon and the line, muted |
| Composer | idle / typing / busy | min 96 px | 16 px (raised frame) | attachments, text, controls row |
| Popover | dropdown, slash, menu | content | 12 px, items 7 px (12 minus 5 inset) | items |

Rules for what the line above the composer says, in priority order: 1) the chat's file was archived,
2) something else wrote to this chat in the last minute, 3) voice typing is listening. Usage sits
under the composer, never inside it.

## The signature

| Size | Where | Corner | Ring gap / stroke | Initials |
|---|---|---|---|---|
| 16 px | reply working line | 4.5 px | 2 / 1.5 px | 7 px / 650 |
| 20 px | composer account picker | 6 px | 2 / 1.75 px | 8.5 px / 650 |
| 26 px | account list | 7.5 px | 2.5 / 2 px | 10.5 px / 650 |
| 44 px | new-chat picker | 12.5 px | 3 / 2.5 px | 16 px / 650 |

Ring colour is a state: `--fg-2` when more than 30% is left, `--warn` at 30% or less, `--err` at 10%
or less. Dashed when the numbers are stale (last check failed or skipped), absent when unknown.
Gemini (since Nov 24) shows Antigravity's own quota view (RetrieveUserQuotaSummary on its local
service, every 30 s): models share limits in groups, "Gemini models" and "Claude and GPT models",
each with a 5-hour and a weekly limit, shown under a small group heading like the Claude rows. Its
ring follows the Gemini group's 5-hour limit. (The per-model numbers in GetUserStatus lag behind
and are only a fallback for older Antigravity.) Fill is the account's hue; initials are `--token-ink` (contrast 6.3:1 or better, below).

## Motion

| Change | Spring (duration s, bounce) |
|---|---|
| something arrives (your message, a new token) | 0.50, 0.18 |
| light response (switch account) | 0.40, 0.12 |
| ring sweep, sidebar width, folds | 0.50 / 0.35 / 0.35, 0 |
| back to rest, collapsing | 0.42, 0 |

- Content in: 260 ms, from opacity 0, blur 6 px, 3 px up, scale 0.985, easing (0.23, 1, 0.32, 1). Only
  blocks that just arrived animate; opening a chat draws it at once.
- Popovers in: 160 ms from opacity 0, 4 px, scale 0.98; out at once.
- Hover: background 120 ms. Attention: the done dot pulses 2 times (600 ms each), then rests.
- Reduced motion (system setting): springs jump, fades shorten to 100 ms, no blur.

## Colour and type

| Token | Dark | Light | Job | Contrast (dark / light) |
|---|---|---|---|---|
| --bg | #070709 | #fcfcfb | reading canvas (sampled from the Antigravity shot) | |
| --side | #111114 | #f5f5f3 | sidebar | |
| --raise | #15151a | #ffffff | composer, popovers, inputs | |
| --bubble | #131317 | #f1f1ef | your messages | |
| --sel | #1f1f24 | #e8e8e5 | selected row | |
| --fg | #ececf1 | #1a1a1e | text | 17.1 / 16.9 on bg |
| --fg-2 | #a1a1ab | #55555f | secondary text, controls | 7.4 / 6.8 on side |
| --fg-3 | #84848f | #6b6b75 | times, meta | 4.9 / 5.3 on raise, 5.1 / 4.8 on side |
| --done | #3fb950 | #1a7f37 | finished, unread | 7.4 / 4.7 on side |
| --warn | #d29922 | #8f5f00 | low usage, stale numbers | 7.5 / 5.1 on side |
| --err | #f0605a | #cf222e | errors, limit reached | 5.7 / 5.4 on raise |
| --eng-claude | #d97757 | #b8502f | Claude mark and token family | 6.0 / 4.6 on side |
| --eng-codex | #a8a4f8 | #5b54d6 | Codex | 8.4 / 5.2 |
| --eng-gemini | #5aa9e6 | #1f6fb2 | Gemini | 7.4 / 4.8 |
| --token-ink | #0b0b0d | #ffffff | initials on a token | 6.3+ / 5.0+ |
| --invert | #ffffff | #1a1a1e | the one filled button: send | 20.1 / 17.4 |

Measured with `node tools/contrast.cjs`. Each hue has one meaning everywhere: green finished, amber
low or stale, red error, engine hues only on engine marks and tokens, and blue (`--drop`, #4b8dff
dark / #1f66e5 light) only for drag and drop: the 2 px line above or below the row a dragged chat
will land on, and the outline of a group or target it will go into. No glows, no gradients, no
glass; shadows only on what floats (popovers, dialogs).

Type: Segoe UI Variable (Windows' own face, sharp at small sizes) for everything; Cascadia Mono for
code and paths. Weights 400, 500, 600. Sizes: 11 meta, 12 secondary, 13 controls and rows, 14.5 / 1.65
chat text, 15 the message box, 20 / 600 the new-chat title.

## Hard content rules

- A word longer than its box breaks (`overflow-wrap: anywhere`) in messages; titles truncate with an
  ellipsis in one line (rows, header), and the full title is in the tooltip.
- Numbers, amounts and percentages stay on one line in tables (`white-space: nowrap` only for
  short numeric cells); tables scroll sideways inside their own box.
- Long paths in tool steps keep their start and their end (the file name) and are cut in the middle
  (`midClip`, 96 characters, 80 in a fold's one-line summary); the full text is in the tooltip.
- Long emails in the composer's account picker truncate at 220 px; when the box is narrow the email
  shortens first (to 64 px), model and effort keep their names, and the controls wrap to a second row.
- Usage rows share one grid in every account at any sidebar width (label 56 px, bar takes the rest,
  "% left" 46 px, time until it resets 58 px: "49m", "3h 10m", "2d 20h"; the exact date and time in
  the tooltip), so all bars line up; the engine name sits beside the email to make room. A window
  name longer than 56 px trims, full text in the tooltip. The new-chat cards show the 5-hour and
  weekly windows the same way. Countdowns and "checked 12s ago" tick every second in place (seconds
  shown in the last hour: "4m 04s"); the numbers refresh on their own every 3 minutes, when the
  window comes back into focus, right after a limit resets, after each reply, and live from the
  limits Claude Code reports during a run. A check cannot run every second: each one is a whole
  Claude Code session (about 25 s on this PC while memory is short), and none runs under 0.8 GB free.
- A chat's time is its last real message (user or assistant line), never the file's modified time;
  Gemini chats use Antigravity's own last_modified_time.
- A tool's name in a fold never trims; names get a 46 px column so the details line up.

## How every case is checked

Run each from the repo folder with `npx electron` (or `node_modules\.bin\electron.cmd`).
The demo data (`src/demo/mock.js`) only switches on for `app.html?demo=<state>` opened outside the app.

| Check | Run | What it proves |
|---|---|---|
| State gallery | `electron tools/shoot.cjs [state ...]` | 15 demo states, hard content, dark and light, offscreen |
| Fit check | same run, `tools/fitcheck.js` in every state | no word or control escapes its box; trims listed in `tools/shots/fit.json` |
| Motion | `electron tools/record.cjs [dark\|light]` | a whole exchange filmed at 30 fps; contact sheets per moment; frames kept |
| Close-up | `electron tools/zoom.cjs <frames> <first> <last> <x> <y> <w> <h> <scale> <out>` | a tiny motion (ring, arc, dot) enlarged frame by frame |
| One value | `electron tools/probe.cjs <state> <theme> "<js>"` | computed styles or state in a demo page |
| Slop audit | `node tools/audit.cjs` (before: `tools/audit-before.txt`, after: `tools/audit-after.txt`) | glows, gradients, pills, stripes, loops, glyph icons |
| Contrast | `node tools/contrast.cjs` | every token pair above, WCAG ratio |

Demo states: chat-long, chat-working, new, slash, menu, modal, empty, narrow (720 px), voice, error,
attach, hidden (sidebar), tucked (accounts), fold (steps open), accounts (Codex accounts, same-login
warning), dnd (a chat held over the Pin target), run-think and run-agent (a run thinking, a helper
agent at work, with queued messages), relay (messages between chats), plus `live-test` (a run as one
unit, the queue; results in `window.__liveResult`), `cycle` for the recording and `dnd-test` (pin,
new folder, unpin, a list update mid-drag, a file dropped on the sidebar; results in
`window.__dndResult`, read with `tools/probe.cjs dnd-test dark "window.__dndResult"`).

## Results (Nov 24, 2026)

- **Gallery:** 30 frames (15 states, dark and light): 0 words or controls escaping, 0 console errors.
  Every trim on the list was read and is on purpose (titles, emails, file names, a long usage label).
- **Motion, read from the contact sheets and close-ups** (`tools/shots/motion/`, video
  `exchange-dark.mp4`):
  - switching account changes the face in one frame and the ring follows;
  - your message lands over about 3 frames, then the reply box fades in from the blur;
  - streamed words never blink: at a step and at the end they pass straight from the live box into
    the saved reply, no empty frame between;
  - usage coming back sweeps the ring from 79% to 70% over about 6 frames, no jump;
  - the busy arc turns about 11 degrees a frame and keeps its phase through redraws every 90 ms;
  - a chat finishing elsewhere: bars become the dot in about 130 ms, two pulses (about +0.9 s and
    +1.5 s), then rest; the title turns 600;
  - the sidebar slides out and back in about 0.3 s with no bounce.
- **Slop audit, before and after:** glyph icons 20 to 0, pill radii 9 to 3 (the done dot, the waiting
  dots, the round send button from the reference), one-sided stripes 5 to 1 (markdown quotes),
  box-shadows 9 to 3 (floating things only), uppercase labels 4 to 0, display serif 2 to 0, gradients
  1 to 0, glows 0. Loops: 4, each running only while something works (bars, arc, waiting dots, the
  usage check). CSS 353 to 402 lines, one layer instead of 19 patches.
- **Contrast:** every pair in the table is AA (`tools/contrast.cjs`).

## Lessons from this build (traps a screenshot hides)

1. A hidden Electron window never advances CSS transitions: the first capture showed every colour
   frozen halfway between themes. Shots and recordings render offscreen, and the page keeps all
   transitions off (`.still`) until the saved theme is applied, which also removes a real startup fade.
2. Hiding a grid child (`display: none` on the resizer) re-flowed the main column into the resizer's
   0 px track: 1,230 escapes in one frame. Grid children are now placed by column.
3. Initials from a whole email ("tom@example.com" and "tara@example.com") both read "TE"; they now come
   from the part before the @.
4. Loops rebuilt on every redraw restart from frame 0 and stutter; they share one clock (`inPhase`).
5. A run lets go of its streamed words before the chat file has them; without holding them (`held`)
   the reply blinked out and back in.
6. Growing the message box (attachments) pushed the newest message out of view; the chat now stays
   pinned to the bottom when you were at the bottom.
7. At 720 px the composer squeezed the account, model and effort names to bare arrows while the
   permission picker kept its width; the controls now wrap, and the email shortens first.
8. (Nov 24: chat times looked wrong) The list dated chats by the file's modified
   time, but the Claude desktop app appends bookkeeping lines (cost-state, artifact-comment-monitor,
   last-prompt) to many chats in the same second: old chats read "2m" and jumped to the top (37 of 84
   files were more than 10 minutes off). Times now come from the last real message; the cached list
   carries a version so old entries are re-read once.
9. (Nov 24: drag and drop did nothing) With nothing pinned and no folders there was nowhere to drop a
   chat, and the list redrew every few seconds, throwing a drag away. Now a Pin / New folder bar shows
   at the top while dragging, redraws wait until the drop, dropping on the plain list unpins, files
   dropped anywhere in the window attach (the sidebar used to let Electron open the file in place of
   the app), and the window refuses to navigate away. Checked by the `dnd-test` demo state (10 steps).
10. (Nov 24: a run looked stuck for half an hour) A slash command is saved as Claude
   Code's markup (`<command-name>/my-skill</command-name><command-args>...`), which the reader threw
   away as noise, so the "just sent" bubble never matched a saved message and stayed pinned under 30
   minutes of the run's output, over a box of waiting dots. Now commands read back as typed, the bubble
   goes the moment the chat file has it or anything newer, and a long run shows its elapsed time, step
   count and current step (`live.startedAt / steps / step` from main.js). Checked by `pending-test`.
11. (Nov 24: a long skill run could not ask anything) A long skill run
   inside the app hit three walls the Claude app does not have: Artifact and SendUserFile were
   "switched off in this session", Playwright refused a screenshot "outside allowed roots", and
   AskUserQuestion did not exist at all (a headless run falls back to asking in plain text). See
   "When a run needs you" above for what changed. Artifact publishing itself cannot be given to a run
   started here; runs now say so and hand the page over instead of failing.
12. (Nov 24: chats could not be dragged above or below each other)
   The main list was always newest first, so a chat dropped on another chat there had no order to
   change. Now every row takes a drop: a blue line shows above or below it (the half the pointer is
   over) and the chat lands exactly there. The main list then keeps your order ("Chats, in your
   order", saved as `listOrder`; new chats still appear on top) until "Newest first" puts it back.
   Pinned and folders use the same line. The dragged row fades only after the drag picture is taken.
13. (Nov 24, a Codex chat refused with "thread-store conflict ... already has an active writer") Codex
   lets one program write to a chat at a time, and the Codex app had the chat open. The refusal now
   reads in plain words (the raw text on hover) and your message goes back into the box.
14. (Nov 24: the list should be your own order, never by recency) Lesson 12 kept your order only after a first drag, and new activity could still
   lift chats. Now the list is always yours: the first time it freezes the order of that moment (after
   Gemini's list is in), activity never moves a chat, a brand-new chat appears once at the top, an old
   one that shows up late goes to the bottom, and "Sort by newest" is a one-time tidy. Rules unit
   tested against main.js's `keepListOrder`.
15. (Nov 24: Antigravity has weekly limits too) It does: RetrieveUserQuotaSummary gives a 5-hour
   and a weekly limit per model group; the first version read only the per-model 5-hour numbers.
16. (Nov 24: the working line sometimes hid what Claude was doing, and steps landed above it) The
   same step was drawn twice: once as a finished-looking reply above the "is
   working" line (as soon as the chat file had it) and once under it, so the line sat between its own
   steps; and the line hid the step once Claude had written a word. A run is now one unit (see "A run,
   as one unit" below). `live-test` checks it: nothing of the run above its line, the running step
   shown once, the reply staying in place when the run ends.
17. (same day) A headless run gets its thinking with no words (0 characters in the stream); Claude
   Code only sends them with `--thinking-display summarized` (229 characters on the same prompt).
   Every Claude run started here now asks for them.
18. (same day) The run's own items are found by time, with 0.25 s of slack. With 3 s, a queued message
   (sent 0.3 s after the last reply ended) pulled that reply into its own box for a moment; and "continue"
   sent twice must match the new message, not the older one with the same words.
20. (Nov 25) Codex turns failed with no model picked: config.toml named gpt-6.1-sol, which a ChatGPT
   login is refused, and Codex's own model list cannot be trusted to say so (it flipped between 8 and 12
   models in two minutes and listed the refused one). Codex now gets the newest model that really
   answered in this login's chats, and a refusal is retried once with the next one, unseen.
   The first version learned gpt-6.2-astra, which was refused too: it had only ever answered in the Codex
   desktop app, a newer client (0.171) than the CLI this app runs (0.155), and the model a login may use
   depends on the client. So only the CLI's own chats count (each chat file's first line names the
   program that wrote it), a refusal Codex wrote into a chat counts for 3 days, refusals are also kept in
   `<data>/codex-refused.json` so a restart never pays for the same refused try again, and the model
   picker's "default" names the model a run will really get.
19. (Nov 25: a way to send without waiting in the queue) Tested on Claude Code 2.1.331 before building:
   a message written to a running reply is read at its next step, inside the same reply; one written
   while Claude writes its last words waits and is answered as a next turn in the same process, so the
   run ends only once every message sent into it was taken. Such a message is saved as a
   `queued_command` note, not a message, so the chat never showed messages typed mid-reply (here or in
   the Claude app) until history.js read those notes.

## Sources (read Nov 24, 2026)

- The inspiration, an Antigravity screenshot, pixels sampled with `tools/sample-colors.cjs` (canvas #070709,
  sidebar #111114, selected row #1f1f24, composer #15151a, bubble #131317, rule #19191b).
- Spring numbers: the unslop-ui skill's numbers.md (WWDC23 "Animate with springs" mapping).
- WCAG 2.1 contrast formula.

## When a run needs you (Nov 24, 2026)

A Claude run started here talks both ways with the app (`--input-format stream-json
--permission-prompt-tool stdio`, plus `CLAUDE_CODE_ENABLE_ASK_USER_QUESTION_TOOL=1`, the switch the
Claude app sets for its own sessions). Everything that needs you arrives as a card in the live reply:

| What | Card | Your options |
|---|---|---|
| A question (AskUserQuestion) | header, question, options (radio or checkbox), "own answer" box | one click answers a single question; Send answers; Skip |
| A permission (Edit / Ask modes) | "Wants to use Bash" + the command | Allow; Deny with an optional reason |
| A plan (ExitPlanMode) | the plan, rendered | Approve plan; Keep planning with what to change |

- While a card waits, the reply line reads "is asking you" in amber, the busy arc stops, the chat's
  row in the list shows an amber "?", the window title counts it, and you get a notification if you
  are elsewhere. The card is kept across redraws, so a half-typed answer survives.
- The reply sent to Claude Code is built in the main process from the stored request; the window only
  says what you chose.
- In the chat history, a question shows with the answer you gave, a plan as a "Proposed a plan" fold,
  and files a run showed you (`send_user_file` here, SendUserFile in the Claude app) as file cards:
  images preview, any file opens or shows in its folder (programs and scripts only show in their folder).
- Each run gets the app's own tool server (`src/mcp/tm-tools.cjs`: `send_user_file` and the chat
  tools below), a short note of what differs from the Claude app (`src/mcp/run-note.txt`: no Artifact,
  no SendUserFile, the chat tools instead of SendMessage / start_session, so it saves the page and
  says to publish from the Claude app instead of failing), thinking in words
  (`--thinking-display summarized`), and, for a chat in a worktree, the repo folder as an extra
  allowed folder.
- Stop asks Claude Code to interrupt, then closes its input; a run that lingers is ended after 4 s.
- An update to the app's own files shows "Update ready / Restart" under the app name; Restart waits
  until no chat is running and reopens the chat you were in. Drafts are kept per chat.

Checked: a real Haiku run through `engine.run` (question asked, "Blue" sent back, `send_user_file`
called, process gone after the reply); a hidden copy of the whole app (card appeared, the click
went through, history shows the question with "Blue"); `ask-test` (one-click answer, two questions
with a multi-select and a typed answer that survives a redraw, a permission denied with a reason);
Stop (process gone within 5 s).

## A run, as one unit (Nov 24, 2026)

From top to bottom while a chat works: your message; the answering account's token with "is working",
its clock and step count (both tick every second); everything the run did so far, in order, exactly as
it will read once finished (folds, words, files, messages to other chats); then the activity line,
which is always there while it works and says what it is doing right now:

| Phase | Activity line | From |
|---|---|---|
| starting | "Starting" | the run began, nothing streamed yet |
| thinking | "Thinking" + its newest words, two lines at most, cut at the start | thinking deltas; also between steps |
| writing a step | "Writing a step" + the tool | a step's input streaming (a long file edit) |
| running | "Running" + tool + its detail + "+2 more" + the step's own clock (after 3 s) | the step started, until its result |
| a helper agent | a second line, "↳" + the helper's own step + "23 steps inside" | Agent steps |
| writing | the reply's words stream above the line; the line says "Writing" | text deltas |
| asking | the question, permission or plan card instead of the line | see "When a run needs you" |

- The step that is running shows only on the activity line; it joins its fold once it finishes, so no
  step is ever drawn twice.
- When the run ends, the line and the header go and the rest stays exactly where it was (no
  re-entrance animation), now with its time and copy button.
- Thinking in the history folds in with the steps around it ("Worked for 5m, 4 steps"; a stretch of
  only thinking reads "Thought for 8s"); inside a fold it is muted italic, four lines, "Show all".
- The dots on the activity line are the waiting dots from "Motion"; nothing new loops.

## Chats talking to each other (Nov 24, 2026)

Every Claude run started here can message the user's other chats and start new ones (the Claude app's
SendMessage, ListAgents and start_session): `list_chats`, `read_chat`, `send_message`, `start_chat`
in `src/mcp/tm-tools.cjs`, answered by the app through a local bridge (127.0.0.1, a key per run that
dies with the run). The other chat's own account answers in that chat; a busy chat gets it when free.
With `report_back`, its final reply comes back to the sender as a new message after it finishes.

- A message from another chat starts with the app's header line and shows as "From <chat>" (or
  "Reply from <chat>") over its bubble, a link to that chat; never "sent from headless".
- A message this chat sent shows as a card: "Sent to <chat>" or "Started a new chat: <name>", the
  words (four lines), "its reply comes back here" when it does. One 1 px rule, 10 px corners, no fill:
  a record of something sent, quieter than a reply.
- Guards: not to itself; "Ask only" chats may not set other chats to work; 6 chats messaging each other
  in a row is treated as a loop; at most 40 such messages in 10 minutes.

## Mixed chats: Claude and GPT in one chat (Nov 25, 2026)

A new chat started from the message box with a Claude or Codex account is a mixed chat: for every
message the account picker offers every Claude and every Codex account, and the chat carries on.

- **How:** Claude Code and Codex keep different history formats, so neither can open the other's chat.
  Each engine keeps its own native session for the chat; a small record (`<data>/mixed/<id>.json`,
  `src/mixed.js`) ties them together and logs every turn (who answered, the user's words, the reply,
  the steps). When the engine changes, the one that answers is first told what the others did since it
  last spoke: a catch-up block in front of your message (the newest turns in full, about 24,000
  characters in all). They share the folder, so file changes are already there.
- **In the window:** one row in the list with a half-filled mark (Claude's filled half beside Codex's
  ring); above each reply, who wrote it (engine mark, model, account); under your message, "with what
  the other agent did since" when a catch-up went with it. The catch-up itself never shows.
- **Safe by design:** existing chats are untouched (they stay one engine). The engines' own files are
  the history; if a record were lost, its sessions would show up again as ordinary chats. Gemini
  (Antigravity) cannot join a mixed chat yet; a new chat with a Gemini account is an ordinary one.
- **Checked with the real CLIs:** Claude wrote fruit.txt (apple); GPT, never having seen the chat, said
  "Claude created fruit.txt with one line, apple" and added banana; Claude, back again, said banana was
  added by GPT "per the catch-up note".

## Helpers: another engine as a sub-agent (Nov 25, 2026)

`run_agent` (Tasmeer Multi's own tool) lets a Claude run hand a self-contained task to GPT (Codex) or
to Claude on another account and get the answer back, like Claude Code's Agent tool across engines.
The helper works in the same folder, never with more than the chat may do (read-only when asked),
gets no chat tools itself, saves no chat, and at most three run at once. Its steps show live under the
run's line ("GPT: Shell ..."). Checked: Claude asked GPT to create helper.txt; GPT did in 17 s and Claude
reported it.

## The queue (Nov 24, 2026)

While a reply is being written, the send button is Stop until you type; then it queues (aria-label
"Queue"), and Enter queues too. A queued message waits under the reply ("Queued, goes when this reply
finishes", x takes it back into the message box) and goes the moment the chat is free. Another chat's
waiting message reads "Waiting, from <chat>". The queue survives a restart.

**Send now** (Nov 25, 2026): while a reply runs and you have typed, a "Send now" button sits left of the
send button (Ctrl+Enter does the same), and every queued message has its own "Send now". For Claude the
message goes into the running reply: Claude reads it after the step it is on, as the Claude app does. It
reads "Sent" under it, then "Claude has it" (Claude Code echoes each message it takes,
`--replay-user-messages`), and in the chat it sits where it landed, "sent while it worked". Codex and
Gemini cannot take a message mid-reply, so there the button reads "Stop and send": the reply stops and
your message goes first.

## Open

- Account hues inside each engine family are tuned by eye.
- Codex and Gemini runs do not get the chat tools yet (they can be messaged, but cannot message).
- Thumbs up / down from the inspiration were left out: there is nothing for them to send.
- The motion was filmed in dark only; light was checked in still frames.
- A chat row no longer shows its project and worktree under the title (one line, as in the
  reference); both are in the row's tooltip and in the header's breadcrumb, and search still matches
  the folder.
