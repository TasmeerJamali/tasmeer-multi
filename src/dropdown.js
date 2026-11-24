// Themed dropdowns. Windows draws native <select> lists itself (white headings, blue highlight),
// so each .select <select> stays as the hidden source of truth and a styled button + list is drawn over it.
(function () {
  const made = new WeakMap(); // select -> { btn, label }
  let open = null;            // { sel, pop }

  // the closed button may show a shorter label (data-short) than the list does
  function textOf(sel) { const o = sel.options[sel.selectedIndex]; return o ? (o.dataset.short || o.textContent) : ''; }
  function sync(sel) {
    const m = made.get(sel); if (!m) return;
    m.label.textContent = textOf(sel);
    m.btn.title = sel.closest('label')?.title || '';
    m.btn.disabled = sel.disabled;
  }
  function close() {
    if (!open) return;
    open.pop.remove(); made.get(open.sel)?.btn.classList.remove('open'); open = null;
    document.removeEventListener('mousedown', outside, true);
  }
  function outside(e) { if (open && !open.pop.contains(e.target) && !made.get(open.sel)?.btn.contains(e.target)) close(); }
  function choose(sel, value) {
    if (sel.value !== value) { sel.value = value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    sync(sel); close();
  }
  function show(sel) {
    if (open && open.sel === sel) { close(); return; }
    close();
    const m = made.get(sel);
    const pop = document.createElement('div'); pop.className = 'dd-pop'; pop.setAttribute('role', 'listbox');
    const addOption = (o) => {
      const it = document.createElement('button'); it.type = 'button'; it.className = 'dd-item' + (o.value === sel.value ? ' on' : '');
      it.disabled = o.disabled; if (o.title) it.title = o.title;
      // optional extras per option: a colour swatch (data-swatch) and a quiet note on the right (data-meta)
      if (o.dataset.swatch) { const sw = document.createElement('i'); sw.className = 'dd-swatch'; sw.style.background = o.dataset.swatch; it.append(sw); }
      const tx = document.createElement('span'); tx.className = 'dd-text'; tx.textContent = o.textContent; it.append(tx);
      if (o.dataset.meta) { const m = document.createElement('span'); m.className = 'dd-meta' + (o.dataset.level ? ' ' + o.dataset.level : ''); m.textContent = o.dataset.meta; it.append(m); }
      it.onclick = () => choose(sel, o.value);
      pop.append(it);
    };
    if (sel.dataset.heading && !sel.querySelector('optgroup')) { const h = document.createElement('div'); h.className = 'dd-group'; h.textContent = sel.dataset.heading; pop.append(h); }
    for (const child of sel.children) {
      if (child.tagName === 'OPTGROUP') {
        const h = document.createElement('div'); h.className = 'dd-group'; h.textContent = child.label; pop.append(h);
        for (const o of child.children) addOption(o);
      } else addOption(child);
    }
    document.body.append(pop);
    // place it: open upward when the box sits low on the screen (the composer usually does)
    const r = m.btn.getBoundingClientRect();
    const h = Math.min(pop.scrollHeight + 2, window.innerHeight * 0.6);
    const up = r.bottom + h + 8 > window.innerHeight && r.top > h;
    pop.style.left = Math.min(r.left, window.innerWidth - pop.offsetWidth - 8) + 'px';
    pop.style.top = (up ? r.top - h - 6 : r.bottom + 6) + 'px';
    pop.style.maxHeight = h + 'px';
    pop.style.minWidth = Math.max(r.width, 180) + 'px';
    m.btn.classList.add('open');
    open = { sel, pop };
    pop.querySelector('.dd-item.on')?.scrollIntoView({ block: 'nearest' });
    setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
  }
  function enhance(sel) {
    if (made.has(sel)) return;
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'dd-btn';
    const label = document.createElement('span'); label.className = 'dd-label';
    const caret = document.createElement('span'); caret.className = 'dd-caret';
    btn.append(label, caret);
    sel.classList.add('dd-native'); sel.tabIndex = -1;
    sel.after(btn);
    made.set(sel, { btn, label });
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); show(sel); });
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const opts = [...sel.options].filter((o) => !o.disabled);
        const i = opts.findIndex((o) => o.value === sel.value);
        const n = opts[Math.max(0, Math.min(opts.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
        if (n) choose(sel, n.value);
      }
    });
    sel.addEventListener('change', () => sync(sel));
    new MutationObserver(() => sync(sel)).observe(sel, { childList: true, subtree: true });
    sync(sel);
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  window.addEventListener('resize', close);
  window.syncDropdowns = () => { document.querySelectorAll('.select select').forEach((s) => { enhance(s); sync(s); }); };
  window.syncDropdowns();
})();
