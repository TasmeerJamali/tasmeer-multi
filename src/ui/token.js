// The seat token (DESIGN.md "The signature"): an account's own colour and initials, wrapped in a ring
// that shows how much of its 5-hour limit is left. The ring is real usage data; it sweeps with a
// spring when the numbers change, and the face springs in when the account changes.
(function () {
  const SIZES = { // size: [corner, ring gap, ring stroke, initials px]  (DESIGN.md table)
    16: [4.5, 2, 1.5, 7], 20: [6, 2, 1.75, 8.5], 26: [7.5, 2.5, 2, 10.5], 44: [12.5, 3, 2.5, 16],
  };
  const FAMILY = { claude: 4, codex: 4, antigravity: 2 };
  // an account's hue: a CSS variable, so a theme switch recolours every token
  function hueOf(a) {
    if (!a) return 'var(--fg-3)';
    const n = FAMILY[a.engine] || 4;
    let h = 0; for (const ch of String(a.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const i = a.main ? 0 : 1 + (h % (n - 1));
    return `var(--acct-${a.engine}-${i})`;
  }
  // From the part before the @, so tc@ and team@ read TC and TE (the whole address gave both "TE").
  const initials = (n) => {
    const s = String(n || '?'); const p = (s.includes('@') ? s.split('@')[0] : s).match(/[A-Za-z0-9]+/g) || [];
    return (p.length >= 2 ? p[0][0] + p[1][0] : (p[0] || '?').slice(0, 2)).toUpperCase();
  };
  // how much of the 5-hour window is left (0..1), whether the numbers are stale, or null when unknown
  function left(a) {
    const u = a && a.usage; const w = u && u.windows && (u.windows.find((x) => x.label === '5-hour') || u.windows[0]);
    if (!w || w.used == null) return null;
    return { frac: Math.max(0, Math.min(1, (100 - w.used) / 100)), stale: !!(u.failedAt && u.failedAt > u.at) };
  }
  const state = new WeakMap(); // element -> { motion, frac, id }

  function make(a, size = 20, { busy = false } = {}) {
    const [corner, gap, stroke, fs] = SIZES[size] || SIZES[20];
    const outer = size + 2 * (gap + stroke);
    const r = size / 2 + gap + stroke / 2; const c = outer / 2; const circ = 2 * Math.PI * r;
    const el = document.createElement('span');
    el.className = 'seat' + (busy ? ' busy' : '');
    el.style.setProperty('--seat', size + 'px'); el.style.setProperty('--seat-outer', outer + 'px');
    const mid = 'm' + Math.random().toString(36).slice(2, 9);
    el.innerHTML = `<svg class="seat-ring" viewBox="0 0 ${outer} ${outer}" width="${outer}" height="${outer}" aria-hidden="true">
      <defs><mask id="${mid}" maskUnits="userSpaceOnUse" x="0" y="0" width="${outer}" height="${outer}">
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#fff" stroke-width="${stroke + 1}" class="seat-dash"/></mask></defs>
      <circle class="seat-track" cx="${c}" cy="${c}" r="${r}" fill="none" stroke-width="${stroke}"/>
      <circle class="seat-arc" cx="${c}" cy="${c}" r="${r}" fill="none" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${circ}" stroke-dashoffset="${circ}" transform="rotate(-90 ${c} ${c})" mask="url(#${mid})"/>
      <circle class="seat-busy" cx="${c}" cy="${c}" r="${r}" fill="none" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${circ * 0.22} ${circ}"/>
    </svg><span class="seat-face" style="border-radius:${corner}px;font-size:${fs}px"></span>`;
    el._circ = circ;
    update(el, a, { animate: false });
    return el;
  }

  function update(el, a, { animate = true } = {}) {
    if (!el) return;
    const face = el.querySelector('.seat-face'); const arc = el.querySelector('.seat-arc'); const dash = el.querySelector('.seat-dash');
    const st = state.get(el) || {};
    const changedAccount = st.id !== undefined && st.id !== (a && a.id);
    face.textContent = a ? initials(a.label || a.name) : '';
    face.style.background = hueOf(a);
    el.title = a ? `${a.label || a.name}${a.signedIn === false ? ' (not signed in)' : ''}` : '';
    const l = left(a);
    el.classList.toggle('no-ring', !l);
    el.classList.toggle('stale', !!(l && l.stale));
    el.classList.toggle('low', !!(l && l.frac <= 0.3 && l.frac > 0.1));
    el.classList.toggle('crit', !!(l && l.frac <= 0.1));
    dash.setAttribute('stroke-dasharray', l && l.stale ? '1.6 2.4' : 'none');
    const target = l ? l.frac : 0;
    if (!st.motion) {
      st.motion = new window.Motion({ frac: target, scale: 1 }, (v) => {
        arc.setAttribute('stroke-dashoffset', String(el._circ * (1 - Math.max(0, Math.min(1, v.frac)))));
        face.style.transform = v.scale === 1 ? '' : `scale(${v.scale})`;
      });
      st.motion.eps = { frac: 0.001, scale: 0.001 };
      st.motion.set({ frac: target, scale: 1 });
    } else if (animate) { // nothing changed, nothing moves
      if (changedAccount) { st.motion.set({ scale: 0.82 }); st.motion.to({ scale: 1 }, { duration: 0.40, bounce: 0.12 }); }
      if (target !== st.frac) st.motion.to({ frac: target }, { duration: 0.50, bounce: 0 });
    } else st.motion.set({ frac: target, scale: 1 });
    st.id = a && a.id; st.frac = target;
    state.set(el, st);
  }

  // The brand mark: three tokens fanned out (one window, many accounts).
  const brand = (size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">
    <rect x="1.5" y="7" width="11" height="11" rx="3.2" transform="rotate(-10 7 12.5)" fill="var(--eng-gemini)"/>
    <rect x="11.5" y="7" width="11" height="11" rx="3.2" transform="rotate(10 17 12.5)" fill="var(--eng-codex)"/>
    <rect x="6.5" y="5" width="11" height="11" rx="3.2" fill="var(--eng-claude)" stroke="var(--side)" stroke-width="1.6"/></svg>`;

  window.SeatToken = { make, update, hueOf, initials, left, brand };
})();
