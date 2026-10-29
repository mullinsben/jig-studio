// Zero-change probe: paste into the console of ANY live site (or run it through a browser tool).
// It records every element's box and rendering styles, loads the jig, waits for the scan, then reports
// anything on the page that changed. The jig's own UI and highlight classes are ignored; anything left is
// the jig altering a page it was only supposed to look at.
//
//   await jigProbe()                       // loads https://capybutz.com/jig.js
//   await jigProbe('https://x/jig.js')     // another build
//
// Result: { changed: [{el, prop, before, after}], counts: {elements, changed, newNodes}, errors }.
// A zero-pixel screenshot diff (tests/zeropixel.js) is the stronger check; this one runs where that can't.
window.jigProbe = async function (src = 'https://capybutz.com/jig.js', settleMs = 5000) {
  const UI = '#jig-hud, #jig-grid, .jig-badge, .jig-tb, #jig-axtags, #jig-found, #jig-device, #jig-welcome, #jig-warn, [data-jig-injected]';
  const HL = ['jig-ax', 'jig-ax-focus', 'jig-active', 'jig-selected', 'jig-scanning'];
  const PROPS = ['display', 'visibility', 'opacity', 'color', 'background-color', 'background-image', 'background-position', 'background-size',
    'object-fit', 'object-position', 'font-size', 'font-weight', 'font-family', 'line-height', 'letter-spacing', 'text-transform', 'text-decoration-line',
    'transform', 'overflow-x', 'overflow-y', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'position', 'z-index', 'filter', 'clip-path'];
  // margins and sizes are left out on purpose: the rect already says where things are, and Chrome reports an auto margin differently once a class rule touches the element
  const sel = el => { const p = []; for (let e = el; e && e.nodeType === 1 && p.length < 4; e = e.parentElement) { let s = e.tagName.toLowerCase(); if (e.id) { p.unshift(s + '#' + e.id); break; } const c = (typeof e.className === 'string' ? e.className : '').split(/\s+/).filter(x => x && !/^jig-/.test(x)).slice(0, 2).join('.'); p.unshift(c ? s + '.' + c : s); } return p.join(' > ') + (el.textContent ? ' "' + el.textContent.trim().slice(0, 30).replace(/\s+/g, ' ') + '"' : ''); };
  const snap = () => { const m = new Map(); for (const el of document.querySelectorAll('body *')) { if (el.closest(UI)) continue; const cs = getComputedStyle(el), r = el.getBoundingClientRect(); const o = { rect: [r.x, r.y, r.width, r.height].map(Math.round).join(',') }; for (const p of PROPS) { if (p === 'line-height' && /^(IMG|VIDEO|CANVAS|SVG)$/.test(el.tagName)) continue; o[p] = cs.getPropertyValue(p); } m.set(el, o); } return m; };   // line-height is skipped on replaced elements: it never paints there
  const errors = []; const onErr = e => errors.push(String(e.message || e.reason).slice(0, 120));
  addEventListener('error', onErr); addEventListener('unhandledrejection', onErr);
  const scrollX0 = scrollX, scrollY0 = scrollY;
  const before = snap();
  if (!window.__jig && !window.__jigLoading) { const s = document.createElement('script'); s.src = src; s.dataset.jigInjected = '1'; document.head.appendChild(s); }
  await new Promise(r => setTimeout(r, settleMs));
  scrollTo(scrollX0, scrollY0);
  // take the jig's highlights off so they don't count as page changes
  document.querySelectorAll('.' + HL.join(', .')).forEach(el => el.classList.remove(...HL));
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 50)));
  const after = snap();
  const changed = []; let newNodes = 0;
  for (const [el, a] of after) {
    const b = before.get(el);
    if (!b) { if (!el.closest('.jig-crop-box, .jig-scrim-panel') && !/^jig-/.test(el.className || '')) newNodes++; continue; }
    for (const k of Object.keys(b)) {
      if (b[k] === a[k]) continue;
      // the one change the jig makes on purpose: a plain <img> whose box already matches its picture becomes object-fit: cover so it can be panned; identical pixels
      if (k === 'object-fit' && b[k] === 'fill' && a[k] === 'cover' && el.naturalWidth && Math.abs((el.offsetWidth / el.offsetHeight) / (el.naturalWidth / el.naturalHeight) - 1) < 0.03) continue;
      changed.push({ el: sel(el), prop: k, before: b[k], after: a[k] });
    }
  }
  removeEventListener('error', onErr); removeEventListener('unhandledrejection', onErr);
  // group: the same prop changing on many elements is one story
  const byProp = {}; changed.forEach(c => (byProp[c.prop] = (byProp[c.prop] || 0) + 1));
  const out = { site: location.host + location.pathname, jigBooted: !!document.getElementById('jig-hud'), counts: { elements: before.size, changed: changed.length, newNodes, byProp }, changed: changed.slice(0, 40), errors };
  console.log('%cjig zero-change probe', 'font-weight:bold', out.counts.changed ? '❌ page changed' : '✅ nothing changed', out);
  return out;
};
