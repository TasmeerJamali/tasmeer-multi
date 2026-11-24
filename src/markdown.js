// Small, safe markdown renderer: escapes everything first, then adds the formatting Claude uses.
window.renderMarkdown = (function () {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // [app.css](file:///C:/...) links point at files on this PC: shown as the name, the full path in the tooltip
  function fileLink(t, u) {
    let p = u.replace(/^file:\/\/\/?/, '');
    try { p = decodeURIComponent(p); } catch { /* keep it as written */ }
    if (/^[A-Za-z]:\//.test(p)) p = p.replace(/\//g, '\\');
    return `<span class="flink" title="${esc(p)}">${esc(t)}</span>`;
  }
  function inline(s) {
    const codes = []; const files = [];
    s = s.replace(/`([^`\n]+)`/g, (_m, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    s = s.replace(/\[([^\]\n]+)\]\((file:\/\/[^)\s]+)\)/g, (_m, t, u) => { files.push([t, u]); return `\u0001${files.length - 1}\u0001`; });
    s = esc(s);
    s = s.replace(/\u0001(\d+)\u0001/g, (_m, i) => fileLink(...files[Number(i)]));
    s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, t, u) => `<a href="${u}" data-ext>${t}</a>`);
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_m, p, u) => `${p}<a href="${u}" data-ext>${u}</a>`);
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
    s = s.replace(/\u0000(\d+)\u0000/g, (_m, i) => `<code>${esc(codes[Number(i)])}</code>`);
    return s;
  }
  return function render(src) {
    const lines = String(src || '').replace(/\r/g, '').split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const fence = line.match(/^\s*```\s*([\w+-]*)/);
      if (fence) {
        const body = []; i += 1;
        while (i < lines.length && !/^\s*```/.test(lines[i])) { body.push(lines[i]); i += 1; }
        i += 1;
        out.push(`<div class="code"><div class="code-top"><span>${esc(fence[1] || 'code')}</span><button class="copy" type="button">Copy</button></div><pre><code>${esc(body.join('\n'))}</code></pre></div>`);
        continue;
      }
      const h = line.match(/^(#{1,4})\s+(.*)/);
      if (h) { out.push(`<h${h[1].length + 2}>${inline(h[2])}</h${h[1].length + 2}>`); i += 1; continue; }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
        const ordered = /^\s*\d/.test(line);
        const items = [];
        while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, '')); i += 1; }
        const tag = ordered ? 'ol' : 'ul';
        out.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${tag}>`);
        continue;
      }
      if (/^\s*>\s?/.test(line)) {
        const q = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, '')); i += 1; }
        out.push(`<blockquote>${inline(q.join(' '))}</blockquote>`);
        continue;
      }
      if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        const row = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        const head = row(line); i += 2;
        const body = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { body.push(row(lines[i])); i += 1; }
        // short numbers, amounts and percentages stay on one line (DESIGN.md "Hard content rules")
        const num = (c) => (c.length <= 24 && /^[-+~($€£]*\d[\d,.]*\s?(%|k|m|bn|ac|x)?\)?$/i.test(c.replace(/\*\*/g, '')) ? ' class="num"' : '');
        out.push(`<div class="table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td${num(c)}>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      if (/^\s*(---|\*\*\*)\s*$/.test(line)) { out.push('<hr>'); i += 1; continue; }
      if (!line.trim()) { i += 1; continue; }
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^\s*(```|#{1,4}\s|[-*+]\s|\d+[.)]\s|>)/.test(lines[i])) { para.push(lines[i]); i += 1; }
      if (!para.length) { para.push(line); i += 1; }
      out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    }
    return out.join('');
  };
})();
