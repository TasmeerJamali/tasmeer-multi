// The fit check: does every word and every control stay inside the box it belongs to? Run it in the
// page (or in each gallery frame's document); it lists what escapes, by how much and on which side,
// and can outline offenders in red. Copy into the project; no dependencies.
//
// A box is the nearest element marked data-fit (a card, a widget, a panel). Words must stay inside its
// padding; controls and images (and anything marked data-fit-part) inside its border. Mark decorations
// drawn past the edge on purpose with data-fit-skip. Words cut off on purpose (an ellipsis or a line
// clamp) are reported as trimmed, not as escaping, so a person can judge each cut.
//
//   import { fitCheck } from "./fitcheck.js";
//   const { frames, issues, trimmed } = fitCheck(document.body, { mark: true });
//   console.info("FIT " + JSON.stringify({ frames, issues, trimmed }));   // a test reads this line
//
// Measure rotated elements straight (remove the rotation while checking), or their corners read as
// escaping.
const TOL = 0.75; // sub-pixel rounding

const style = (el) => el.ownerDocument.defaultView.getComputedStyle(el);
const box = (el) => {
  const r = el.getBoundingClientRect();
  const s = style(el);
  const n = (p) => parseFloat(s[p]) || 0;
  return {
    border: { l: r.left, t: r.top, r: r.right, b: r.bottom },
    content: {
      l: r.left + n("borderLeftWidth") + n("paddingLeft"),
      t: r.top + n("borderTopWidth") + n("paddingTop"),
      r: r.right - n("borderRightWidth") - n("paddingRight"),
      b: r.bottom - n("borderBottomWidth") - n("paddingBottom"),
    },
  };
};
const outBy = (inner, outer) => ({
  l: outer.l - inner.l, t: outer.t - inner.t, r: inner.r - outer.r, b: inner.b - outer.b,
});
const label = (el) => {
  const id = el.id ? `#${el.id}` : "";
  const cls = [...el.classList].slice(0, 2).map((c) => `.${c}`).join("");
  return `${el.tagName.toLowerCase()}${id}${cls}`;
};
// an element that hides what does not fit on purpose
function trims(el) {
  for (let n = el; n && n !== n.ownerDocument.body; n = n.parentElement) {
    const s = style(n);
    if (s.textOverflow === "ellipsis" || (s.webkitLineClamp && s.webkitLineClamp !== "none")) return n;
    if (n.matches("[data-fit]")) break;
  }
  return null;
}
const hidden = (el) => {
  // what a closed <details> holds (all but its summary) is not drawn, though its own style says block
  const fold = el.closest("details:not([open])");
  if (fold && !el.closest("summary")) return true;
  for (let n = el; n; n = n.parentElement) {
    const s = style(n);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return true;
  }
  return false;
};

// A scrolling box inside the frame shows only part of what it holds, on purpose: measure only the part
// it shows (null when it is scrolled out of view entirely).
function visiblePart(host, r, frame) {
  let v = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  for (let n = host; n && n !== frame; n = n.parentElement) {
    const s = style(n);
    if (/(auto|scroll)/.test(s.overflowY + " " + s.overflowX)) {
      const b = n.getBoundingClientRect();
      v = { left: Math.max(v.left, b.left), top: Math.max(v.top, b.top), right: Math.min(v.right, b.right), bottom: Math.min(v.bottom, b.bottom) };
      if (v.right - v.left <= TOL || v.bottom - v.top <= TOL) return null;
    }
  }
  return v;
}

// The right edge of the last drawn (non-space) character on one line of a text node, or null.
function inkRight(doc, t, line) {
  let right = null;
  const r = doc.createRange();
  for (let i = 0; i < t.data.length; i += 1) {
    if (/\s/.test(t.data[i])) continue;
    r.setStart(t, i); r.setEnd(t, i + 1);
    const b = r.getBoundingClientRect();
    if (b.width && Math.abs(b.top - line.top) < 1 && (right == null || b.right > right)) right = b.right;
  }
  return right;
}

function fitCheck(root = document.body, { mark = false } = {}) {
  const doc = root.ownerDocument || root;
  const issues = [];
  const trimmed = [];
  const fits = [...(root.matches?.("[data-fit]") ? [root] : []), ...root.querySelectorAll("[data-fit]")];
  for (const frame of fits) {
    if (hidden(frame)) continue;
    const fb = box(frame);
    // words: every line of every text node inside the frame's padding
    const walker = doc.createTreeWalker(frame, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const host = t.parentElement;
      if (!host || hidden(host) || host.closest("[data-fit]") !== frame || host.closest("[data-fit-skip]")) continue;
      const cut = trims(host);
      const range = doc.createRange();
      range.selectNodeContents(t);
      // A line's text box is the font's full height, which is taller than a tight line height: that
      // slack above and below is empty space, not ink, so it may reach into the padding.
      const lh = parseFloat(style(host).lineHeight);
      for (const raw of range.getClientRects()) {
        if (!raw.width) continue;
        const r = visiblePart(host, raw, frame); if (!r) continue;
        const slack = Number.isFinite(lh) ? Math.max(0, (raw.height - lh) / 2) : 0;
        const o = outBy({ l: r.left, t: r.top + (r.top === raw.top ? slack : 0), r: r.right, b: r.bottom - (r.bottom === raw.bottom ? slack : 0) }, cut ? box(cut).content : fb.content);
        // A space at a line break in pre-wrap text hangs past the edge without being drawn: only ink counts.
        if (o.r > TOL) { const ink = inkRight(doc, t, raw); if (ink != null) o.r = Math.min(o.r, ink - (cut ? box(cut).content : fb.content).r); }
        const worst = Math.max(o.l, o.t, o.r, o.b);
        if (worst > TOL) {
          if (cut) continue; // clipped by its own trim: listed as trimmed below
          issues.push({ kind: "words", frame: label(frame), el: label(host), text: t.data.trim().slice(0, 40), out: round(o) });
          if (mark) host.style.outline = "2px solid #e5484d";
        }
      }
      if (cut && (cut.scrollWidth > cut.clientWidth + 1 || cut.scrollHeight > cut.clientHeight + 1)) {
        trimmed.push({ frame: label(frame), el: label(cut), text: cut.textContent.trim().slice(0, 40) });
      }
    }
    // controls and images: inside the frame's border
    for (const c of frame.querySelectorAll("button, input, textarea, select, img, svg, canvas, [data-fit-part]")) {
      if (hidden(c) || c.closest("[data-fit]") !== frame || c.closest("[data-fit-skip]")) continue;
      const vis = visiblePart(c.parentElement, c.getBoundingClientRect(), frame); if (!vis) continue;
      const o = outBy({ l: vis.left, t: vis.top, r: vis.right, b: vis.bottom }, fb.border);
      if (Math.max(o.l, o.t, o.r, o.b) > TOL) {
        issues.push({ kind: "part", frame: label(frame), el: label(c), text: (c.textContent || c.placeholder || c.getAttribute("aria-label") || "").trim().slice(0, 40), out: round(o) });
        if (mark) c.style.outline = "2px solid #e5484d";
      }
    }
  }
  return { frames: fits.length, issues, trimmed };
}
const round = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v > TOL).map(([k, v]) => [k, Math.round(v * 10) / 10]));

window.fitCheck = fitCheck;
