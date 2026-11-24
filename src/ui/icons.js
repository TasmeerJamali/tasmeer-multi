// One line-icon set for the whole app: 16 px grid, 1.5 px stroke, round ends, coloured like its text.
// Replaces the emoji and glyphs (pin, folder, mic, speaker, star, sun, moon...) that stood in for icons.
(function () {
  const P = {
    plus: '<path d="M8 3.25v9.5M3.25 8h9.5"/>',
    search: '<circle cx="7.1" cy="7.1" r="4.35"/><path d="M10.4 10.4l3.1 3.1"/>',
    sidebar: '<rect x="2.25" y="3" width="11.5" height="10" rx="2"/><path d="M6.25 3v10"/>',
    pin: '<path d="M6 2.5h4M6.75 2.5l-.35 3.6L4.25 8.5h7.5L9.6 6.1 9.25 2.5M8 8.5v5"/>',
    folder: '<path d="M2.25 5A1.5 1.5 0 0 1 3.75 3.5h2.3l1.5 1.5h4.7A1.5 1.5 0 0 1 13.75 6.5v5a1.5 1.5 0 0 1-1.5 1.5h-8.5a1.5 1.5 0 0 1-1.5-1.5z"/>',
    star: '<path d="M8 2.6l1.65 3.4 3.75.5-2.73 2.6.68 3.7L8 11l-3.35 1.8.68-3.7L2.6 6.5l3.75-.5z"/>',
    starFill: '<path fill="currentColor" d="M8 2.6l1.65 3.4 3.75.5-2.73 2.6.68 3.7L8 11l-3.35 1.8.68-3.7L2.6 6.5l3.75-.5z"/>',
    archive: '<rect x="2.25" y="3" width="11.5" height="3" rx="1"/><path d="M3.25 6v6a1 1 0 0 0 1 1h7.5a1 1 0 0 0 1-1V6M6.5 8.75h3"/>',
    refresh: '<path d="M13 7.5A5 5 0 1 1 11.5 4M13 2.75V5.5h-2.75"/>',
    sun: '<circle cx="8" cy="8" r="2.75"/><path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.05 1.05M11.35 11.35l1.05 1.05M3.6 12.4l1.05-1.05M11.35 4.65l1.05-1.05"/>',
    moon: '<path d="M13.25 9.6A5.5 5.5 0 0 1 6.4 2.75a5.5 5.5 0 1 0 6.85 6.85z"/>',
    system: '<circle cx="8" cy="8" r="5.5"/><path fill="currentColor" stroke="none" d="M8 2.5a5.5 5.5 0 0 1 0 11z"/>',
    chevronDown: '<path d="M4.5 6.25L8 9.75l3.5-3.5"/>',
    chevronRight: '<path d="M6.25 4.5L9.75 8l-3.5 3.5"/>',
    copy: '<rect x="5.25" y="5.25" width="8.5" height="8.5" rx="1.75"/><path d="M10.75 5.25V4a1.75 1.75 0 0 0-1.75-1.75H4A1.75 1.75 0 0 0 2.25 4v5A1.75 1.75 0 0 0 4 10.75h1.25"/>',
    check: '<path d="M3.5 8.5l3 3 6-7"/>',
    clip: '<path d="M11.5 7.25L7.1 11.65a2.4 2.4 0 0 1-3.4-3.4l4.9-4.9a1.6 1.6 0 0 1 2.25 2.25L6.1 10.35a.8.8 0 0 1-1.15-1.15l4.15-4.15"/>',
    mic: '<rect x="5.75" y="2" width="4.5" height="7.5" rx="2.25"/><path d="M3.5 7.75a4.5 4.5 0 0 0 9 0M8 12.25V14"/>',
    speaker: '<path d="M2.5 6.1h2.4L8 3.25v9.5L4.9 9.9H2.5z"/><path d="M10.6 5.6a3.4 3.4 0 0 1 0 4.8M12.3 3.9a5.8 5.8 0 0 1 0 8.2"/>',
    speakerOff: '<path d="M2.5 6.1h2.4L8 3.25v9.5L4.9 9.9H2.5z"/><path d="M10.5 6.25l3 3.5M13.5 6.25l-3 3.5"/>',
    globe: '<circle cx="8" cy="8" r="5.75"/><path d="M2.25 8h11.5M8 2.25c1.6 1.6 2.4 3.5 2.4 5.75S9.6 12.15 8 13.75C6.4 12.15 5.6 10.25 5.6 8S6.4 3.85 8 2.25z"/>',
    file: '<path d="M4 2.25h4.75L12 5.5v8.25H4z"/><path d="M8.75 2.25V5.5H12"/>',
    send: '<path d="M8 12.75V3.5M3.75 7.5L8 3.25l4.25 4.25" stroke-width="1.9"/>',
    stop: '<rect x="4.5" y="4.5" width="7" height="7" rx="1.5" fill="currentColor" stroke="none"/>',
    close: '<path d="M4.25 4.25l7.5 7.5M11.75 4.25l-7.5 7.5"/>',
    more: '<circle cx="3.75" cy="8" r=".9" fill="currentColor"/><circle cx="8" cy="8" r=".9" fill="currentColor"/><circle cx="12.25" cy="8" r=".9" fill="currentColor"/>',
    wave: '<path d="M2.5 8h1.2M5.2 5.75v4.5M7.6 3.75v8.5M10 5.75v4.5M12.4 7.25v1.5"/>',
    alert: '<path d="M8 2.5l6 10.5H2z"/><path d="M8 6.5v3M8 11.25v.01"/>',
    // a message going to another chat, and one coming from another chat
    forward: '<path d="M2.75 12.5v-1.25A3.75 3.75 0 0 1 6.5 7.5h6.25M9.75 4.5l3 3-3 3"/>',
    incoming: '<path d="M13.25 12.5v-1.25A3.75 3.75 0 0 0 9.5 7.5H3.25M6.25 4.5l-3 3 3 3"/>',
  };
  const svg = (name, size = 16, cls = '') => `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 16 16" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
  window.icon = svg;
  window.iconEl = (name, size, cls) => { const t = document.createElement('template'); t.innerHTML = svg(name, size, cls); return t.content.firstElementChild; };
  // fill every [data-icon] placeholder in the static page
  window.paintIcons = (root = document) => { for (const n of root.querySelectorAll('[data-icon]')) { n.innerHTML = svg(n.dataset.icon, Number(n.dataset.size) || 16); } };
})();
