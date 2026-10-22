/*! Jig Studio · jig.js · MIT
 *  Drop-in presentation jig. Add ?jig to any URL on a site that loads this script.
 *  Drag, pinch, and step things on the live page; copy the patch; hand it to an AI.
 *  The jig never writes to your site. It proposes. See README.md.
 */
(function () {
  'use strict';

  // ------------------------------------------------------------ activation
  const url = new URL(location.href);
  const wanted = url.searchParams.has('jig') || location.hash === '#jig' || safeGet('jig') === '1' || (document.currentScript && document.currentScript.dataset.jigInjected);
  if (!wanted) return;
  if (window.__jig) return;
  const EMBED = url.searchParams.get('jig') === 'embed' && window.parent !== window;
  const DEVICE = url.searchParams.get('device') || '';
  const DEVICES = [
    { id: 'iphone-15-pro', name: 'iPhone 15 Pro', w: 393, h: 852, bp: 'phone' },
    { id: 'iphone-se', name: 'iPhone SE', w: 375, h: 667, bp: 'phone' },
    { id: 'pixel-8', name: 'Pixel 8', w: 412, h: 915, bp: 'phone' },
    { id: 'galaxy-s24', name: 'Galaxy S24', w: 360, h: 780, bp: 'phone' },
    { id: 'ipad-mini', name: 'iPad Mini', w: 744, h: 1133, bp: 'tablet' }
  ];

  const SCRIPT = document.currentScript;
  const SCRIPT_SRC = (SCRIPT && SCRIPT.src) || (window.__jigSrc || '');
  const INJECTED = !!(SCRIPT && SCRIPT.dataset.jigInjected);
  const DEFAULT_FOUNDATION = {
    name: 'inferred', version: 0,
    grid: { columns: 12, gutter: 24, margin: 32, maxWidth: 1200, phone: { columns: 4, gutter: 16, margin: 16 } },
    breakpoints: { phone: 390, desktop: 1440 },
    spacing: [4, 8, 12, 16, 24, 32, 48, 64, 96],
    type: { ramp: ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] },
    buttons: { sizes: ['sm', 'md', 'lg'], variants: ['primary', 'secondary', 'ghost'], classPrefix: 'btn-' },
    protect: { safeInset: 24, minContrast: 4.5, minTapTarget: 44, textOverImage: 'warn' }
  };

  // jig toggles: nothing is live until the person switches a jig on
  const JIGS = [
    { id: 'images', label: 'images', ctls: ['crop'] },
    { id: 'text', label: 'type', ctls: ['type', 'heading', 'text'] },
    { id: 'buttons', label: 'buttons', ctls: ['button'] },
    { id: 'spacing', label: 'spacing', ctls: ['section', 'grid'] },
    { id: 'ax', label: 'ax', ctls: [] }          // paints protection failures pink on the page
  ];
  const groupOf = ctl => (JIGS.find(j => j.ctls.includes(ctl)) || {}).id;
  const state = {
    F: null,                 // foundation
    foundationSource: '',
    changes: new Map(),      // key -> change record
    warnings: [],
    grid: false,
    selected: null,
    bp: 'desktop',
    device: null,          // active device preview
    frame: { changes: [], warnings: [] },   // changes reported by an embedded device frame
    normalize: null,                        // [{el, prop, from, to}] while normalize mode is on
    jigs: new Set()                         // active jig ids
  };

  function safeGet(k) { try { return localStorage.getItem('__' + k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem('__' + k, v); } catch (e) {} }

  // ------------------------------------------------------------ foundation
  async function loadFoundation() {
    const saved = safeGet('jig-foundation:' + location.host);
    if (saved) { try { state.F = JSON.parse(saved); state.foundationSource = 'edited in the jig (saved for this site)'; state.F.edited = true; return; } catch (e) {} }
    const inline = document.getElementById('jig-foundation');
    if (inline && inline.textContent.trim()) {
      try { state.F = JSON.parse(inline.textContent); state.foundationSource = 'inline'; return; } catch (e) {}
    }
    const src = (SCRIPT && SCRIPT.dataset.foundation) || document.body.dataset.jigFoundation || 'jig.foundation.json';
    try {
      const r = await fetch(src, { cache: 'no-store' });
      if (r.ok) { state.F = await r.json(); state.foundationSource = src; return; }
    } catch (e) {}
    // 2. the site's own CSS custom properties
    const vars = readRootVars();
    if (vars) { state.F = vars; state.foundationSource = 'css custom properties on :root'; return; }
    // 3. nothing to read: measure the page and manufacture the scales
    state.F = inferFromPage(); state.foundationSource = 'inferred from this page';
  }

  // Foundation shape used by the controls once resolved:
  //   F.type.steps   = [{ token, px, var? }]   sorted ascending
  //   F.spacingSteps = [{ token, px, var? }]   sorted ascending
  //   F.buttons.mode = 'classes' | 'measured'; measured carries sizes [{ token, h, padX, padY, fs }] and variants [{ token, bg, fg, border }]
  //   F.mode         = 'file' | 'vars' | 'inferred'
  const RAMP_NAMES = ['5xs', '4xs', '3xs', '2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl'];
  function toPx(v, prop) {
    if (typeof v === 'number') return v;
    const m = String(v).trim().match(/^(-?[\d.]+)(px|rem|em)?$/);
    if (m) return m[2] === 'rem' || m[2] === 'em' ? parseFloat(m[1]) * 16 : parseFloat(m[1]);
    // clamp()/calc()/var(): let the browser resolve it
    document.body.appendChild(measureEl); measureEl.style[prop || 'fontSize'] = v; const r = px(css(measureEl)[prop || 'fontSize']); measureEl.remove(); return r;
  }
  function readRootVars() {
    const found = {};
    for (const sheet of Array.from(document.styleSheets)) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }   // cross-origin sheets are opaque
      for (const rule of Array.from(rules)) {
        if (!rule.style || !/(^|,)\s*(:root|html)\s*(,|$)/.test(rule.selectorText || '')) continue;
        for (const name of Array.from(rule.style)) if (name.startsWith('--')) found[name] = rule.style.getPropertyValue(name).trim();
      }
    }
    const names = Object.keys(found); if (!names.length) return null;
    const pick = (re) => names.filter(n => re.test(n)).map(n => ({ var: n, token: n.replace(re, ''), px: toPx(found[n]) })).filter(x => x.px > 0 && x.px < 400).sort((a, b) => a.px - b.px);
    const type = pick(/^--(?:text|font-size|fs|type|typo|size)-/i);
    const space = pick(/^--(?:space|spacing|sp|gap)-/i);
    if (type.length < 3 && space.length < 3) return null;   // vars exist but say nothing about scales
    const F = JSON.parse(JSON.stringify(DEFAULT_FOUNDATION));
    F.name = (location.hostname || 'site').replace(/^www\./, ''); F.mode = 'vars';
    if (type.length >= 3) { F.type = { ramp: type.map(t => t.token), steps: type }; }
    else F.type = inferType();
    if (space.length >= 3) { F.spacing = space.map(x => x.px); F.spacingSteps = space; }
    else { const sp = inferSpacing(); F.spacing = sp.map(x => x.px); F.spacingSteps = sp; }
    F.buttons = inferButtons(); F.grid = inferGrid();
    return F;
  }
  function inferFromPage() {
    const F = JSON.parse(JSON.stringify(DEFAULT_FOUNDATION));
    F.name = (location.hostname || 'site').replace(/^www\./, '') || 'page'; F.mode = 'inferred';
    F.type = inferType();
    const sp = inferSpacing(); F.spacing = sp.map(x => x.px); F.spacingSteps = sp;
    F.buttons = inferButtons(); F.grid = inferGrid();
    return F;
  }
  function visible(el) { if (!el.offsetParent && css(el).position !== 'fixed') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
  function cluster(values, tol) {
    // values: [{v, n}] -> merged clusters within tol (relative), weighted by count
    const sorted = values.filter(x => x.v > 0).sort((a, b) => a.v - b.v); const out = [];
    for (const x of sorted) { const last = out[out.length - 1]; if (last && (x.v - last.lo) / last.lo <= tol) { last.n += x.n; last.sum += x.v * x.n; last.hi = x.v; last.members.push(x.v); } else out.push({ lo: x.v, hi: x.v, n: x.n, sum: x.v * x.n, members: [x.v] }); }
    return out.map(c => ({ px: Math.round(c.sum / c.n), n: c.n, members: Array.from(new Set(c.members)).sort((a, b) => a - b) }));
  }
  function inferType() {
    const counts = new Map(), pCounts = new Map();
    $$('body *').forEach(el => {
      if (el.closest('#jig-hud, .jig-tb, script, style') || !visible(el)) return;
      const own = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 1); if (!own) return;
      const fs = Math.round(px(css(el).fontSize) * 2) / 2; const w = (el.textContent || '').trim().length;
      counts.set(fs, (counts.get(fs) || 0) + Math.min(w, 200));
      if (/^(P|LI|DD|TD|BLOCKQUOTE)$/.test(el.tagName) && w >= 40) pCounts.set(fs, (pCounts.get(fs) || 0) + Math.min(w, 400));
    });
    const cl = cluster(Array.from(counts, ([v, n]) => ({ v, n })), 0.09);
    if (!cl.length) return { ramp: ['md'], steps: [{ token: 'md', px: 16 }], observed: [] };
    // body = the size real paragraphs are set in (when a page has them); otherwise the cluster carrying the most characters
    let bodyIdx = cl.reduce((bi, c, i) => (c.n > cl[bi].n ? i : bi), 0);
    if (pCounts.size) { const bodyPx = Array.from(pCounts.entries()).sort((a, b) => b[1] - a[1])[0][0]; const i = cl.findIndex(c => c.members.includes(bodyPx) || Math.abs(c.px - bodyPx) <= c.px * 0.09); if (i >= 0) bodyIdx = i; }
    const mdPos = RAMP_NAMES.indexOf('md');
    const steps = cl.map((c, i) => ({ token: RAMP_NAMES[clamp(mdPos + (i - bodyIdx), 0, RAMP_NAMES.length - 1)], px: c.px, observed: c.members, n: c.n }));
    // de-dupe token names if the page has more clusters than names on one side
    const seen = new Set(); steps.forEach((st, i) => { while (seen.has(st.token)) st.token = st.token + '+'; seen.add(st.token); });
    return { ramp: steps.map(x => x.token), steps, observed: Array.from(counts.keys()).sort((a, b) => a - b) };
  }
  function inferSpacing() {
    const counts = new Map();
    $$('body *').forEach(el => {
      if (el.closest('#jig-hud, .jig-tb') || !visible(el)) return; const c = css(el);
      if (!/block|flex|grid|table/.test(c.display)) return;
      ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'marginTop', 'marginBottom', 'rowGap', 'columnGap'].forEach(k => { const v = Math.round(px(c[k])); if (v >= 2 && v <= 200) counts.set(v, (counts.get(v) || 0) + 1); });
    });
    const cl = cluster(Array.from(counts, ([v, n]) => ({ v, n })), 0.2);
    const LADDER = [2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128, 160];
    const snapped = new Map();
    cl.forEach(c => { const sn = nearest(LADDER, c.px); const cur = snapped.get(sn) || { px: sn, n: 0, observed: [] }; cur.n += c.n; cur.observed.push(...c.members); snapped.set(sn, cur); });
    let steps = Array.from(snapped.values()).sort((a, b) => a.px - b.px);
    if (steps.length < 4) steps = LADDER.filter(v => v >= 4 && v <= 96).map(v => ({ px: v, n: 0, observed: [] }));
    return steps.map(st => ({ token: String(st.px), px: st.px, observed: Array.from(new Set(st.observed)).sort((a, b) => a - b), n: st.n }));
  }
  function looksLikeButton(el) {
    if (!visible(el) || el.closest('#jig-hud, .jig-tb')) return false;
    if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || (el.tagName === 'INPUT' && /button|submit/.test(el.type))) return true;
    if (el.tagName !== 'A') return false;
    const c = css(el); const bg = parseColor(c.backgroundColor); const bw = px(c.borderTopWidth);
    const padded = px(c.paddingLeft) >= 6 && px(c.paddingTop) >= 3; const r = el.getBoundingClientRect();
    return padded && r.width < 480 && ((bg && bg[3] > 0.1) || bw >= 1) && /inline-block|flex|block/.test(c.display);
  }
  function inferButtons() {
    const els = $$('a, button, input, [role=button]').filter(looksLikeButton).filter(e => { const r = e.getBoundingClientRect(); return r.height >= 20 && r.height <= 72 && r.width <= 420; });
    if (!els.length) return { mode: 'measured', sizes: [{ token: 'md', h: 44, padX: 20, padY: 10, fs: 14 }], variants: [{ token: 'primary', bg: '#3f6fff', fg: '#fff', border: 'transparent' }], classPrefix: '' };
    const hs = cluster(els.map(e => ({ v: Math.round(e.getBoundingClientRect().height), n: 1 })), 0.12);
    const names = hs.length === 1 ? ['md'] : hs.length === 2 ? ['sm', 'lg'] : ['sm', 'md', 'lg', 'xl', '2xl'];
    const sizes = hs.slice(0, 5).map((c, i) => { const ex = els.find(e => Math.abs(e.getBoundingClientRect().height - c.px) <= c.px * 0.12) || els[0]; const cs = css(ex); return { token: names[i], h: c.px, padX: Math.round(px(cs.paddingLeft)), padY: Math.round(px(cs.paddingTop)), fs: Math.round(px(cs.fontSize)), n: c.n }; });
    const vmap = new Map();
    els.forEach(e => { const c = css(e); const k = `${c.backgroundColor}|${c.color}|${c.borderTopColor}`; const v = vmap.get(k) || { bg: c.backgroundColor, fg: c.color, border: px(c.borderTopWidth) ? c.borderTopColor : 'transparent', n: 0 }; v.n++; vmap.set(k, v); });
    const vnames = ['primary', 'secondary', 'tertiary', 'ghost', 'link'];
    const weight = v => { const bg = parseColor(v.bg) || [255, 255, 255, 0], fg = parseColor(v.fg) || [0, 0, 0, 1]; const mx = Math.max(bg[0], bg[1], bg[2]), mn = Math.min(bg[0], bg[1], bg[2]); const sat = mx ? (mx - mn) / mx : 0; const dark = 1 - lum(bg); return (bg[3] < 0.1 ? 0 : 1) + sat + dark * 0.8 + (lum(fg) > 0.6 ? 0.5 : 0); };
    const variants = Array.from(vmap.values()).sort((a, b) => weight(b) - weight(a) || b.n - a.n).slice(0, 5).map((v, i) => ({ token: vnames[i], ...v }));
    return { mode: 'measured', sizes, variants, classPrefix: '' };
  }
  function inferGrid() {
    const vw = document.documentElement.clientWidth;
    // centered containers narrower than the viewport, by how often their width recurs; ties go to the wider one
    const els = $$('body *').filter(el => { if (!visible(el)) return false; const r = el.getBoundingClientRect(); return r.width >= vw * 0.5 && r.width <= vw - 16 && Math.abs(r.left - (vw - r.right)) < 3 && r.height >= 40; });
    const byW = new Map(); els.forEach(el => { const w = Math.round(el.getBoundingClientRect().width / 4) * 4; const e = byW.get(w) || { w, n: 0, el }; e.n++; byW.set(w, e); });
    const best = Array.from(byW.values()).sort((a, b) => b.n - a.n || b.w - a.w)[0];
    const maxWidth = best ? best.w : Math.min(1200, vw - 64);
    const margin = best ? 0 : 32;
    gridAnchor = best ? best.el : null;
    return { columns: 12, gutter: 24, margin, maxWidth, inferred: true };
  }
  let gridAnchor = null;   // the element whose edges the inferred grid is drawn on
  function resolveFoundation() {
    const F = state.F; F.mode = F.mode || 'file';
    // type steps: explicit sizes in the file, else resolve the site's --text-* vars, else infer
    if (!F.type) F.type = { ramp: DEFAULT_FOUNDATION.type.ramp };
    if (!F.type.steps) {
      if (F.type.sizes) F.type.steps = F.type.ramp.map(t => ({ token: t, px: toPx(F.type.sizes[t]), var: '--text-' + t })).sort((a, b) => a.px - b.px);
      else {
        const steps = F.type.ramp.map(t => ({ token: t, px: varPx('--text-' + t), var: '--text-' + t }));
        if (steps.every(x => x.px > 0)) F.type.steps = steps;
        else { const inf = inferType(); F.type = { ...F.type, ramp: inf.ramp, steps: inf.steps, observed: inf.observed, inferred: true }; }
      }
    }
    if (!F.spacingSteps) {
      const steps = (F.spacingEdited || (F.spacing || []).map(v => ({ token: String(v), px: v }))).map(x => ({ token: x.token, px: x.px, var: '--space-' + x.token }));
      const ok = steps.length && steps.every(x => varPx(x.var, 'paddingTop') > 0);
      F.spacingSteps = ok ? steps : steps.map(x => ({ token: x.token, px: x.px }));   // px fallback is fine for spacing
    }
    if (!F.buttons) F.buttons = inferButtons();
    if (F.buttons.measured && !F.buttons.mode) F.buttons = { mode: 'measured', sizes: F.buttons.measured.sizes, variants: F.buttons.measured.variants, classPrefix: '' };
    if (!F.buttons.mode) F.buttons.mode = F.buttons.classPrefix !== undefined && F.buttons.sizes && typeof F.buttons.sizes[0] === 'string' ? 'classes' : 'measured';
    if (F.buttons.mode === 'classes') {
      // confirm the classes exist on the page; if nothing uses them, measure instead
      const P = F.buttons.classPrefix || 'btn-'; const any = F.buttons.sizes.some(sz => document.querySelector('.' + P + sz));
      if (!any) { F.buttons = inferButtons(); F.buttons.inferred = true; }
    }
    if (!F.grid) F.grid = inferGrid();
    if (!F.protect) F.protect = DEFAULT_FOUNDATION.protect;
  }
  function proposedTokens() {
    // a :root block + a foundation file the site could adopt
    const F = state.F; const lines = [':root {'];
    F.type.steps.forEach(st => lines.push(`  --text-${st.token}: ${st.px}px;${st.observed && st.observed.length > 1 ? `   /* collapsed ${st.observed.join(', ')} */` : ''}`));
    F.spacingSteps.forEach(st => lines.push(`  --space-${st.token}: ${st.px}px;${st.observed && st.observed.length > 1 ? `   /* collapsed ${st.observed.join(', ')} */` : ''}`));
    lines.push('}');
    return { css: lines.join('\n'), json: JSON.stringify(exportFoundation(), null, 2) };
  }

  // ------------------------------------------------------------ helpers
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const css = getComputedStyle;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const px = v => parseFloat(v) || 0;

  function nameOf(el) {
    if (el.dataset.jigName) return el.dataset.jigName;
    if (el.id) return '#' + el.id;
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28);
    return el.tagName.toLowerCase() + (t ? ' "' + t + (t.length >= 28 ? '…' : '') + '"' : '');
  }
  function selectorOf(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    if (el.dataset.jigName) return `[data-jig-name="${el.dataset.jigName}"]`;
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && parts.length < 4) {
      let s = n.tagName.toLowerCase();
      if (n.id) { parts.unshift('#' + CSS.escape(n.id)); break; }
      const sib = Array.from(n.parentNode ? n.parentNode.children : []).filter(c => c.tagName === n.tagName);
      if (sib.length > 1) s += `:nth-of-type(${sib.indexOf(n) + 1})`;
      parts.unshift(s); n = n.parentNode;
    }
    return parts.join(' > ');
  }
  function keyOf(el, ctl) { return selectorOf(el) + '::' + ctl; }

  // resolve a CSS custom property to px (fonts) by measuring
  const measureEl = document.createElement('div');
  measureEl.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;';
  function varPx(name, prop) {
    document.body.appendChild(measureEl);
    measureEl.style[prop || 'fontSize'] = `var(${name})`;
    const v = px(css(measureEl)[prop || 'fontSize']);
    measureEl.remove();
    return v;
  }
  function rampPx() { return state.F.type.steps.filter(x => x.px > 0); }
  function typeValue(st) { return st.var ? `var(${st.var}, ${st.px}px)` : `${st.px}px`; }
  function spaceValue(st) { return st.var ? `var(${st.var}, ${st.px}px)` : `${st.px}px`; }
  function nearest(list, value, get) {
    let best = list[0], d = Infinity;
    for (const it of list) { const dd = Math.abs((get ? get(it) : it) - value); if (dd < d) { d = dd; best = it; } }
    return best;
  }

  // ------------------------------------------------------------ change log
  function record(el, ctl, data, summary) {
    const k = keyOf(el, ctl);
    const base = { el: selectorOf(el), name: nameOf(el), ctl, bp: state.bp, ...(DEVICE ? { device: DEVICE } : {}) };
    state.changes.set(k, Object.assign(base, data, { summary }));
    renderHUD(); postToParent(); scanSoon();
  }
  function unrecord(el, ctl) { state.changes.delete(keyOf(el, ctl)); renderHUD(); postToParent(); }
  function postToParent() {
    if (!EMBED) return;
    try { window.parent.postMessage({ jig: 'frame', changes: Array.from(state.changes.values()), warnings: state.warnings.map(w => ({ kind: w.kind, el: selectorOf(w.el), name: nameOf(w.el), msg: w.msg, value: w.value, min: w.min })), bp: state.bp, device: DEVICE }, '*'); } catch (e) {}
  }

  // ------------------------------------------------------------ controls
  const Controls = {};

  // --- crop: drag to pan, wheel/pinch to zoom -------------------------------
  Controls.crop = {
    match: el => el.matches('img, picture > img') || css(el).backgroundImage !== 'none',
    label: 'crop · drag to pan · pinch or ⌘-wheel to zoom · click for zoom buttons · arrows nudge',
    init(el) {
      const isImg = el.tagName === 'IMG';
      const orig = {
        op: isImg ? css(el).objectPosition : css(el).backgroundPosition,
        tr: el.style.transform || '', to: el.style.transformOrigin || '',
        fit: isImg ? css(el).objectFit : ''
      };
      const parent = el.parentElement;
      if (isImg && css(parent).overflow === 'visible') parent.style.overflow = 'hidden';
      // a plain <img> (fill / scale-down) has nothing to pan; in jig mode it becomes a cover crop
      const upgraded = isImg && !/cover|none/.test(orig.fit);
      if (upgraded) el.style.setProperty('object-fit', 'cover', 'important');
      let [ox, oy] = parsePos(orig.op);
      let zoom = 1;
      el.__jigOrig = orig; el.dataset.jigDrag = '1';
      el.style.cursor = 'grab';

      let drag = null;
      on(el, 'pointerdown', e => {
        if (e.button !== 0) return;
        if (e.altKey) return;
        if (e.target.closest('[data-jig-drag]') !== el) return;
        e.preventDefault(); e.stopPropagation(); try { el.setPointerCapture(e.pointerId); } catch (x) {}
        if (isImg) { const f = naturalFit(el, zoom); if (f.ovx < 2 && f.ovy < 2) { zoom = Math.max(zoom, 1.2); apply(); } }
        drag = { x: e.clientX, y: e.clientY, ox, oy, id: e.pointerId }; el.style.cursor = 'grabbing';
      });
      on(el, 'pointermove', e => {
        if (!drag) return;
        const r = el.getBoundingClientRect();
        // moving the image by its own overflow: 1px of drag = overflow-proportional % shift
        const nat = isImg ? naturalFit(el, zoom) : { ovx: r.width, ovy: r.height };
        const dx = (e.clientX - drag.x), dy = (e.clientY - drag.y);
        ox = clamp(drag.ox - (nat.ovx > 0 ? dx / nat.ovx * 100 : 0), 0, 100);
        oy = clamp(drag.oy - (nat.ovy > 0 ? dy / nat.ovy * 100 : 0), 0, 100);
        apply();
      });
      const end = () => { if (drag) { try { el.releasePointerCapture(drag.id); } catch (x) {} drag = null; el.style.cursor = 'grab'; commit(); } };
      on(el, 'pointerup', end); on(el, 'pointercancel', end); on(window, 'pointerup', end); on(window, 'blur', end);
      on(el, 'wheel', e => {
        if (!(e.ctrlKey || e.metaKey) || !isImg) return;
        e.preventDefault();
        setZoom(zoom * (e.deltaY < 0 ? 1.04 : 0.96));
      }, { passive: false });
      // two-finger pinch on touch
      let pinch = null;
      on(el, 'touchstart', e => { if (e.touches.length === 2) pinch = { d: dist(e.touches), z: zoom }; }, { passive: true });
      on(el, 'touchmove', e => { if (pinch && e.touches.length === 2) { e.preventDefault(); setZoom(pinch.z * dist(e.touches) / pinch.d, true); } }, { passive: false });
      on(el, 'touchend', () => { if (pinch) { pinch = null; commit(); } });
      function dist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
      function setZoom(z, silent) { if (!isImg) return; zoom = clamp(Math.round(z * 100) / 100, 1, 4); apply(); if (!silent) commit(); refreshToolbar(el); }
      // the box we resize: a wrapper that exists only to hold this image, else the image itself
      const box = (parent && parent.children.length === 1 && !/^(BODY|MAIN|HTML)$/.test(parent.tagName) && parent.getBoundingClientRect().width <= el.getBoundingClientRect().width + 2) ? parent : el;
      const origBox = { w: box.style.getPropertyValue('width'), mw: box.style.getPropertyValue('max-width'), h: box.style.getPropertyValue('height') };
      let wCols = null;
      const colsNow = () => { const cw = colWidth(box.parentElement || document.body); return wCols != null ? wCols : Math.max(1, Math.round((box.getBoundingClientRect().width + state.F.grid.gutter) / cw)); };
      function setWidth(dc) {
        const cw = colWidth(box.parentElement || document.body);
        wCols = clamp(colsNow() + dc, 1, state.F.grid.columns);
        const w = Math.round(wCols * cw - state.F.grid.gutter);
        box.style.setProperty('width', `${w}px`, 'important'); box.style.setProperty('max-width', '100%', 'important');
        if (box !== el) { el.style.setProperty('width', '100%', 'important'); }
        setBadge(el, `width ${wCols} col (${w}px)`);
        record(el, 'size', { widthCols: wCols, widthPx: w, ...(box !== el ? { box: selectorOf(box) } : {}) }, `width → ${wCols} col (${w}px)`);
        refreshToolbar(el);
      }
      el.__jigToolbar = () => [
        btn('−', () => setZoom(zoom - 0.1)), chip(() => (isImg ? r2(zoom).toFixed(2) + '×' : 'pan')), btn('+', () => setZoom(zoom + 0.1)),
        sep(), btn('←', () => nudge(-1, 0)), btn('→', () => nudge(1, 0)), btn('↑', () => nudge(0, -1)), btn('↓', () => nudge(0, 1)),
        sep(), btn('w−', () => setWidth(-1)), chip(() => colsNow() + ' col'), btn('w+', () => setWidth(1))
      ];
      function nudge(dx, dy) { ox = clamp(ox + dx, 0, 100); oy = clamp(oy + dy, 0, 100); apply(); commit(); }
      el.__jigNudge = nudge;

      function apply() {
        const pos = `${r1(ox)}% ${r1(oy)}%`;
        if (isImg) {
          el.style.setProperty('object-position', pos, 'important');
          el.style.setProperty('transform-origin', pos, 'important');
          if (zoom !== 1) el.style.setProperty('transform', `scale(${r2(zoom)})`, 'important'); else el.style.removeProperty('transform');
        } else el.style.setProperty('background-position', pos, 'important');
        setBadge(el, `${isImg ? 'object' : 'background'}-position ${pos}${zoom !== 1 ? ' · zoom ' + r2(zoom) : ''}`);
      }
      function commit() {
        const same = parsePos(orig.op).join() === [r1(ox), r1(oy)].join() && zoom === 1;
        if (same) return unrecord(el, 'crop');
        const data = isImg ? { objectPosition: `${r1(ox)}% ${r1(oy)}%`, ...(zoom !== 1 ? { zoom: r2(zoom) } : {}), ...(upgraded ? { objectFit: 'cover' } : {}) } : { backgroundPosition: `${r1(ox)}% ${r1(oy)}%` };
        record(el, 'crop', data, `crop moved to ${r1(ox)}% ${r1(oy)}%${zoom !== 1 ? ', zoom ' + r2(zoom) + '×' : ''}${upgraded ? ' (as object-fit: cover)' : ''}`);
      }
      // place a focal point (fx, fy as fractions of the natural image) in the centre of the visible window
      el.__jigSetFocal = (fx, fy) => {
        if (!isImg) return false;
        const W = el.offsetWidth, H = el.offsetHeight, nw = el.naturalWidth || W, nh = el.naturalHeight || H;
        const sc = Math.max(W / nw, H / nh) * zoom; const sw = nw * sc, sh = nh * sc;
        const px_ = sw > W + 1 ? clamp((fx * sw - W / 2) / (sw - W), 0, 1) : 0.5;
        const py_ = sh > H + 1 ? clamp((fy * sh - H / 2) / (sh - H), 0, 1) : 0.5;
        const before = [ox, oy]; ox = Math.round(px_ * 1000) / 10; oy = Math.round(py_ * 1000) / 10; apply(); commit();
        return Math.abs(before[0] - ox) > 0.5 || Math.abs(before[1] - oy) > 0.5;
      };
      el.__jigReset = () => {
        ox = parsePos(orig.op)[0]; oy = parsePos(orig.op)[1]; zoom = 1; apply(); ['object-position', 'transform-origin', 'transform'].forEach(k => el.style.removeProperty(k)); unrecord(el, 'crop');
        if (wCols != null) { ['width', 'max-width'].forEach(k => box.style.removeProperty(k)); if (origBox.w) box.style.width = origBox.w; if (origBox.mw) box.style.maxWidth = origBox.mw; if (box !== el) el.style.removeProperty('width'); wCols = null; unrecord(el, 'size'); }
      };
    }
  };
  function parsePos(s) {
    const m = (s || '50% 50%').split(/\s+/).map(v => px(v));
    return [isFinite(m[0]) ? m[0] : 50, isFinite(m[1]) ? m[1] : 50];
  }
  function naturalFit(img, zoom) {
    // overflow in px for object-fit: cover at a given zoom (box = the untransformed layout box)
    const z = zoom || 1;
    const W = img.offsetWidth, H = img.offsetHeight;
    const nw = img.naturalWidth || W, nh = img.naturalHeight || H;
    if (!W || !H) return { ovx: 0, ovy: 0 };
    const s = Math.max(W / nw, H / nh) * z;
    return { ovx: nw * s - W, ovy: nh * s - H };
  }

  // --- heading: step up / down the type ramp -------------------------------
  Controls.type = {
    match: el => true,
    label: 'type · − / + steps the ramp · ⌘-wheel also works',
    init(el) {
      const ramp = rampPx();
      const origPx = px(css(el).fontSize);
      const origTok = nearest(ramp, origPx, r => r.px).token;
      let idx = ramp.findIndex(r => r.token === origTok);
      const origIdx = idx;
      // descendants that render at the element's own size (a link inside a heading, a span inside a p) travel with it;
      // ones that are deliberately different (a <small>) are left alone
      const texty = d => Array.from(d.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
      const riders = $$('*', el).filter(d => !d.closest('.jig-tb, .jig-badge') && Math.abs(px(css(d).fontSize) - origPx) <= Math.max(2, origPx * 0.12));
      const forced = [];
      const setSize = v => {
        const f = (n) => { if (v) n.style.setProperty('font-size', v, 'important'); else n.style.removeProperty('font-size'); };
        f(el); riders.forEach(f); forced.forEach(f); forced.length = 0;
        if (!v) return;
        // verify: the first text-bearing node must now render at the new size; if not, the text lives in a descendant that sets its own size
        const want = px(getComputedStyle(el).fontSize);
        const holders = [el, ...$$('*', el)].filter(d => !d.closest('.jig-tb, .jig-badge') && texty(d));
        holders.forEach(d => { if (Math.abs(px(css(d).fontSize) - want) > 1 && Math.abs(px(css(d).fontSize) - origPx) <= Math.max(2, origPx * 0.12)) { forced.push(d); f(d); } });
      };
      el.__jigToolbar = () => [
        btn('−', () => step(-1)), chip(() => state.F.type.ramp[idx]), btn('+', () => step(1))
      ];
      on(el, 'wheel', e => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); step(e.deltaY < 0 ? 1 : -1); }, { passive: false });
      function step(d) {
        idx = clamp(idx + d, 0, ramp.length - 1);
        setSize(idx === origIdx ? '' : typeValue(ramp[idx]));
        setBadge(el, `${ramp[idx].var || 'step ' + ramp[idx].token} · ${ramp[idx].px}px`);
        if (idx === origIdx) unrecord(el, 'type');
        else record(el, 'type', { from: origTok, to: ramp[idx].token, step: idx - origIdx, px: ramp[idx].px, ...(ramp[idx].var ? { var: ramp[idx].var } : { inferred: true }) },
          `ramp ${origTok} → ${ramp[idx].token} (${idx - origIdx > 0 ? '+' : ''}${idx - origIdx}${ramp[idx].var ? '' : ', ' + ramp[idx].px + 'px'})`);
        refreshToolbar(el);
      }
      el.__jigReset = () => { idx = origIdx; setSize(''); unrecord(el, 'type'); refreshToolbar(el); };
      el.__jigStepType = step;
    }
  };

  Controls.heading = Controls.type; // alias: data-jig="heading" still works

  // --- text: drag inside container, snapped to grid columns ----------------
  Controls.text = {
    match: el => true,
    label: 'text · drag to place · snaps to columns and the spacing scale',
    init(el) {
      const parent = el.offsetParent || el.parentElement;
      const isAbs = css(el).position === 'absolute';
      const orig = { ml: el.style.marginLeft, mt: el.style.marginTop, mw: el.style.maxWidth, ai: el.style.alignItems, ta: el.style.textAlign, inset: el.style.inset };
      let cols = 0, rowTok = 0, anchor = null, scrim = 'none', offX = 0, offY = 0;
      const snapTok = v => { const sp = state.F.spacing; const a = nearest(sp.concat([0]), Math.abs(v)); return a * Math.sign(v); };
      const SCRIMS = (state.F.protect && state.F.protect.scrims) || ['none', 'gradient', 'tint', 'glass'];
      // jig-mode only: wrap the overlay's children in a panel so tint/glass hug the text, not the whole image
      let panel = null;
      if (isAbs) {
        panel = document.createElement('div'); panel.className = 'jig-scrim-panel';
        while (el.firstChild) panel.appendChild(el.firstChild);
        // a block overlay centred by text-align needs the panel centred too; flex overlays do it through align-items: inherit
        const pc = css(el); if (!/flex|grid/.test(pc.display)) { if (pc.textAlign === 'center') panel.classList.add('c'); else if (pc.textAlign === 'right' || pc.textAlign === 'end') panel.classList.add('r'); }
        el.appendChild(panel);
      }
      const dirFor = () => { const [v, h] = (anchor || 'center-center').split('-'); return v === 'top' ? 'to bottom' : v === 'bottom' ? 'to top' : h === 'left' ? 'to right' : h === 'right' ? 'to left' : 'to top'; };
      function applyScrim() {
        if (!panel) return;
        el.style.background = ''; panel.style.cssText = '';
        if (scrim === 'gradient') el.style.background = `linear-gradient(${dirFor()}, rgba(0,0,0,.62), rgba(0,0,0,0) 65%)`;
        if (scrim === 'tint') panel.style.cssText = 'background: rgba(10,10,12,.48); padding: 20px 24px; border-radius: 12px;';
        if (scrim === 'glass') panel.style.cssText = 'background: rgba(10,10,12,.32); backdrop-filter: blur(14px) saturate(1.2); -webkit-backdrop-filter: blur(14px) saturate(1.2); padding: 20px 24px; border-radius: 14px; border: 1px solid rgba(255,255,255,.14);';
        setBadge(el, `scrim ${scrim}`);
      }
      const arrows = () => [btn('←', () => el.__jigNudge(-1, 0)), btn('→', () => el.__jigNudge(1, 0)), btn('↑', () => el.__jigNudge(0, -1)), btn('↓', () => el.__jigNudge(0, 1))];
      el.__jigSetScrim = isAbs ? (name => { scrim = SCRIMS.includes(name) ? name : 'none'; applyScrim(); commit(); refreshToolbar(el); }) : null;
      el.__jigToolbarText = isAbs
        ? () => [btn('◐', () => { scrim = SCRIMS[(SCRIMS.indexOf(scrim) + 1) % SCRIMS.length]; applyScrim(); commit(); refreshToolbar(el); scanSoon(); }), chip(() => 'scrim ' + scrim), sep(), ...arrows()]
        : () => [chip(() => `${cols} col · ${rowTok}px`), ...arrows()];
      if (!el.__jigToolbar) el.__jigToolbar = el.__jigToolbarText;
      el.dataset.jigDrag = '1';
      el.style.cursor = 'move';
      let drag = null;
      on(el, 'pointerdown', e => {
        if (e.button !== 0 || e.altKey) return;
        if (e.target.closest('[data-jig-drag]') !== el) return;   // the nearest thing that actually drags owns the gesture
        e.preventDefault(); e.stopPropagation(); try { el.setPointerCapture(e.pointerId); } catch (x) {}
        drag = { x: e.clientX, y: e.clientY, cols, rowTok, offX, offY, anchor, id: e.pointerId, gridWas: state.grid };
        if (isAbs) { const r0 = parent.getBoundingClientRect(); const p0 = (panel || el).getBoundingClientRect(); drag.baseLeft = p0.left - r0.left - padL(el) - offX; }   // where the panel sits with zero offset
        if (!state.grid) toggleGrid(true);
      });
      on(el, 'pointermove', e => {
        if (!drag) return;
        const colW = colWidth(parent);
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (isAbs) {
          // overlay copy: x snaps to the grid columns inside the container; y is a band (top/center/bottom) plus spacing-scale steps
          const r = parent.getBoundingClientRect();
          const inner = r.width - (padL(el) + padR(el)); const cw = (inner + state.F.grid.gutter) / state.F.grid.columns;
          const pr = panel ? panel.getBoundingClientRect() : r;
          const px0 = drag.baseLeft + drag.offX + dx;                        // panel's left edge if it followed the pointer exactly
          const maxCol = Math.max(0, state.F.grid.columns - Math.ceil(pr.width / cw));
          cols = clamp(Math.round(px0 / cw), 0, maxCol);
          const fy = (e.clientY - r.top) / r.height; const v = fy < 1 / 3 ? 'top' : fy > 2 / 3 ? 'bottom' : 'center';
          if (v !== drag.anchor) { anchor = v; offY = 0; drag.y = e.clientY; drag.offY = 0; drag.anchor = v; } else offY = snapTok(drag.offY + dy);
          offY = boundY(offY, v, r, pr);
          offX = Math.round(cols * cw);
          el.style.justifyContent = v === 'top' ? 'flex-start' : v === 'bottom' ? 'flex-end' : 'center';
          el.style.alignItems = 'flex-start'; el.style.textAlign = 'left';
          if (panel) panel.style.translate = `${offX}px ${offY}px`;
          if (scrim === 'gradient') applyScrim();
          setBadge(el, `col ${cols + 1} · ${anchor}${offY ? ` ${offY > 0 ? '+' : ''}${offY}px` : ''}`);
        } else {
          cols = clamp(Math.round(drag.cols + dx / colW), 0, state.F.grid.columns - 1);
          const sp = state.F.spacing;
          const snapped = nearest(sp, Math.abs(dy)) * Math.sign(dy);
          rowTok = drag.rowTok + snapped;
          el.style.marginLeft = cols ? `calc(${cols} * (100% + ${state.F.grid.gutter}px) / ${state.F.grid.columns})` : '';
          el.style.marginTop = rowTok ? `${rowTok}px` : '';
          setBadge(el, `offset ${cols} col · ${rowTok}px`);
        }
      });
      const end = () => { if (!drag) return; try { el.releasePointerCapture(drag.id); } catch (x) {} const was = drag.gridWas; drag = null; commit(); if (!was) toggleGrid(false); };
      on(el, 'pointerup', end); on(el, 'pointercancel', end); on(window, 'pointerup', end); on(window, 'blur', end);
      on(el, 'wheel', e => {
        if (!(e.ctrlKey || e.metaKey) || el.dataset.jigCtl === 'type') return; e.preventDefault();   // type owns ⌘-wheel on text
        const cur = px(el.style.maxWidth) || el.getBoundingClientRect().width;
        const colW = colWidth(parent);
        const c = clamp(Math.round(cur / colW) + (e.deltaY < 0 ? 1 : -1), 2, state.F.grid.columns);
        el.style.maxWidth = `calc(${c} * (100% + ${state.F.grid.gutter}px) / ${state.F.grid.columns} - ${state.F.grid.gutter}px)`;
        el.dataset.jigCols = c; setBadge(el, `max-width ${c} cols`); commit();
      }, { passive: false });
      function commit() {
        const data = {}; const bits = [];
        if (isAbs) {
          if (anchor) { data.anchor = anchor; bits.push(anchor); }
          if (cols || anchor) { data.col = cols + 1; bits.push(`col ${cols + 1}`); }
          if (offY) { data.offsetY = offY; bits.push(`${offY > 0 ? '+' : ''}${offY}px`); }
        } else {
          if (cols) { data.offsetCols = cols; bits.push(`+${cols} col`); }
          if (rowTok) { data.offsetY = rowTok; bits.push(`y ${rowTok}px`); }
        }
        if (el.dataset.jigCols) { data.maxWidthCols = +el.dataset.jigCols; bits.push(`max ${el.dataset.jigCols} cols`); }
        if (scrim !== 'none') { data.scrim = scrim; bits.push(`scrim ${scrim}`); }
        if (!bits.length) return unrecord(el, 'text');
        record(el, 'text', data, 'moved: ' + bits.join(', '));
      }
      el.__jigResetText = el.__jigReset = () => {
        Object.assign(el.style, { marginLeft: orig.ml, marginTop: orig.mt, maxWidth: orig.mw, alignItems: orig.ai, textAlign: orig.ta, justifyContent: '' });
        delete el.dataset.jigCols; cols = 0; rowTok = 0; anchor = null; offX = 0; offY = 0; if (panel) panel.style.translate = ''; scrim = 'none'; applyScrim(); unrecord(el, 'text');
      };
      // arrow keys: overlays nudge by the smallest spacing step; in-flow text by one column / one step
      el.__jigNudge = (dx, dy) => {
        if (isAbs) {
          const r = parent.getBoundingClientRect(); const inner = r.width - (padL(el) + padR(el)); const cw = (inner + state.F.grid.gutter) / state.F.grid.columns;
          const maxCol = Math.max(0, state.F.grid.columns - Math.ceil((panel ? panel.getBoundingClientRect().width : 0) / cw));
          cols = clamp(cols + dx, 0, maxCol); offX = Math.round(cols * cw);
          const sp = state.F.spacing.filter(v => v > 0); const i = sp.indexOf(nearest(sp, Math.abs(offY)));
          if (dy) offY = offY === 0 ? dy * sp[0] : Math.sign(offY) * sp[clamp(i + (Math.sign(offY) === dy ? 1 : -1), 0, sp.length - 1)] * (Math.sign(offY) === dy || i > 0 ? 1 : 0);
          if (!anchor) anchor = 'center';
          offY = boundY(offY, anchor, r, panel ? panel.getBoundingClientRect() : r);
          if (panel) panel.style.translate = `${offX}px ${offY}px`;
        }
        else { cols = clamp(cols + dx, 0, state.F.grid.columns - 1); const sp = state.F.spacing; const i = Math.max(0, sp.indexOf(nearest(sp, Math.abs(rowTok)))); rowTok = dy === 0 ? rowTok : Math.sign(rowTok + dy) * sp[clamp(i + (Math.sign(rowTok) === dy || rowTok === 0 ? 1 : -1), 0, sp.length - 1)];
          el.style.marginLeft = cols ? `calc(${cols} * (100% + ${state.F.grid.gutter}px) / ${state.F.grid.columns})` : ''; el.style.marginTop = rowTok ? `${rowTok}px` : ''; }
        commit();
      };
    }
  };
  // an overlay block may only move inward from its band's edge, and never past the opposite edge
  function boundY(v, band, r, pr) {
    const room = Math.max(0, r.height - pr.height - padTB(r));
    if (band === 'top') return clamp(v, 0, room);
    if (band === 'bottom') return clamp(v, -room, 0);
    return clamp(v, -room / 2, room / 2);
  }
  function padTB() { return 0; }
  function padL(el) { return px(css(el).paddingLeft); }
  function padR(el) { return px(css(el).paddingRight); }
  function colWidth(parent) {
    const box = (gridAnchor && gridAnchor.isConnected && gridAnchor.contains(parent)) ? gridAnchor : parent;
    const w = box.getBoundingClientRect().width;
    return (w + state.F.grid.gutter) / state.F.grid.columns;
  }

  // --- button: size and variant steppers -----------------------------------
  Controls.button = {
    match: el => true,
    label: 'button · size and variant come from the foundation',
    init(el) {
      const B = state.F.buttons;
      if (B.mode === 'measured') return initMeasured(el, B);
      const P = B.classPrefix || 'btn-';
      const origSize = B.sizes.find(s => el.classList.contains(P + s)) || B.sizes[1];
      const origVar = B.variants.find(v => el.classList.contains(P + v)) || B.variants[0];
      let size = origSize, variant = origVar;
      el.__jigToolbar = () => [
        btn('−', () => cycle('size', -1)), chip(() => size), btn('+', () => cycle('size', 1)),
        sep(), btn('◐', () => cycle('variant', 1)), chip(() => variant)
      ];
      function cycle(what, d) {
        const list = what === 'size' ? B.sizes : B.variants;
        const cur = what === 'size' ? size : variant;
        const next = list[(list.indexOf(cur) + d + list.length) % list.length];
        el.classList.remove(P + cur); el.classList.add(P + next);
        if (what === 'size') size = next; else variant = next;
        setBadge(el, `${P}${size} ${P}${variant}`);
        if (size === origSize && variant === origVar) unrecord(el, 'button');
        else {
          const data = {}; const bits = [];
          if (size !== origSize) { data.size = size; bits.push(`size ${origSize} → ${size}`); }
          if (variant !== origVar) { data.variant = variant; bits.push(`variant ${origVar} → ${variant}`); }
          record(el, 'button', data, bits.join(', '));
        }
        refreshToolbar(el); scanSoon();
      }
      el.__jigReset = () => { el.classList.remove(P + size, P + variant); el.classList.add(P + origSize, P + origVar); size = origSize; variant = origVar; unrecord(el, 'button'); refreshToolbar(el); };
      el.__jigStepSize = d => { if ((d > 0 && B.sizes.indexOf(size) < B.sizes.length - 1) || (d < 0 && B.sizes.indexOf(size) > 0)) { cycle('size', d); return true; } return false; };
    }
  };

  // measured buttons (no class convention on the site): sizes and variants are observed clusters, applied as px
  function initMeasured(el, B) {
    const h0 = el.getBoundingClientRect().height; const c0 = css(el);
    const sizes = B.sizes, variants = B.variants;
    let si = sizes.indexOf(nearest(sizes, h0, x => x.h)); const si0 = si;
    const k0 = `${c0.backgroundColor}|${c0.color}`; let vi = Math.max(0, variants.findIndex(v => `${v.bg}|${v.fg}` === k0)); const vi0 = vi;
    const orig = { p: el.style.padding, fs: el.style.fontSize, mh: el.style.minHeight, bg: el.style.background, c: el.style.color, bc: el.style.borderColor };
    el.__jigToolbar = () => [btn('−', () => cyc('size', -1)), chip(() => sizes[si].token), btn('+', () => cyc('size', 1)), sep(), btn('◐', () => cyc('variant', 1)), chip(() => variants[vi].token)];
    function apply() {
      const sz = sizes[si], v = variants[vi];
      if (si !== si0) {
        el.style.setProperty('padding', `${sz.padY}px ${sz.padX}px`, 'important'); el.style.setProperty('font-size', `${sz.fs}px`, 'important'); el.style.setProperty('line-height', '1.2', 'important');
        const d = css(el).display; if (!/flex|grid/.test(d)) el.style.setProperty('display', d === 'block' ? 'flex' : 'inline-flex', 'important');
        el.style.setProperty('align-items', 'center', 'important'); el.style.setProperty('justify-content', 'center', 'important'); el.style.setProperty('box-sizing', 'border-box', 'important');
      } else { ['padding', 'font-size', 'line-height', 'display', 'align-items', 'justify-content', 'box-sizing', 'min-height'].forEach(k => el.style.removeProperty(k)); Object.assign(el.style, { padding: orig.p, fontSize: orig.fs }); }
      if (vi !== vi0) { el.style.background = v.bg; el.style.color = v.fg; el.style.borderColor = v.border; } else Object.assign(el.style, { background: orig.bg, color: orig.c, borderColor: orig.bc });
      setBadge(el, `size ${sz.token} (${sz.h}px) · ${v.token}`);
    }
    function cyc(what, d) {
      if (what === 'size') si = (si + d + sizes.length) % sizes.length; else vi = (vi + d + variants.length) % variants.length;
      apply();
      if (si === si0 && vi === vi0) unrecord(el, 'button');
      else { const data = { inferred: true }; const bits = []; if (si !== si0) { data.size = sizes[si].token; data.height = sizes[si].h; bits.push(`size ${sizes[si0].token} → ${sizes[si].token} (${sizes[si].h}px)`); } if (vi !== vi0) { data.variant = variants[vi].token; bits.push(`variant ${variants[vi0].token} → ${variants[vi].token}`); } record(el, 'button', data, bits.join(', ')); }
      refreshToolbar(el); scanSoon();
    }
    el.__jigReset = () => { si = si0; vi = vi0; apply(); unrecord(el, 'button'); refreshToolbar(el); };
    el.__jigStepSize = d => { if ((d > 0 && si < sizes.length - 1) || (d < 0 && si > 0)) { cyc('size', d); return true; } return false; };
  }

  // --- section: padding on the spacing scale --------------------------------
  Controls.section = {
    match: el => true,
    label: 'section · − / + steps vertical padding on the spacing scale',
    init(el) {
      const steps = state.F.spacingSteps.filter(x => x.px > 0); const sp = steps.map(x => x.px);
      const origTop = px(css(el).paddingTop);
      let idx = sp.indexOf(nearest(sp, origTop)); const origIdx = idx;
      el.__jigToolbar = () => [btn('−', () => step(-1)), chip(() => `pad ${sp[idx]}`), btn('+', () => step(1))];
      function step(d) {
        idx = clamp(idx + d, 0, sp.length - 1);
        if (idx === origIdx) el.style.removeProperty('padding-block'); else el.style.setProperty('padding-block', spaceValue(steps[idx]), 'important');
        setBadge(el, `padding-block ${steps[idx].var || sp[idx] + 'px'}`);
        if (idx === origIdx) unrecord(el, 'spacing');
        else record(el, 'spacing', { paddingY: sp[idx], ...(steps[idx].var ? {} : { inferred: true }) }, `padding ${Math.round(origTop)} → ${sp[idx]}`);
        refreshToolbar(el);
      }
      el.__jigReset = () => { idx = origIdx; el.style.removeProperty('padding-block'); unrecord(el, 'spacing'); refreshToolbar(el); };
    }
  };

  // --- grid: a row that should sit on the columns; nudge back ---------------
  Controls.grid = {
    match: el => true,
    label: 'grid · − / + nudges inline offset · 0 = on the columns',
    init(el) {
      const origML = px(css(el).marginLeft);
      let ml = origML;
      el.__jigToolbar = () => [btn('−', () => nudge(-2)), chip(() => `${ml}px`), btn('0', () => set(0)), btn('+', () => nudge(2))];
      function nudge(d) { set(ml + d); }
      function set(v) {
        ml = v; el.style.marginLeft = `${ml}px`;
        setBadge(el, `margin-left ${ml}px`);
        if (ml === origML) unrecord(el, 'grid');
        else record(el, 'grid', { marginLeft: ml }, `inline offset ${origML}px → ${ml}px${ml === 0 ? ' (on grid)' : ''}`);
        refreshToolbar(el);
      }
      el.__jigReset = () => { set(origML); };
      el.__jigSetML = set; el.__jigOrigML = origML;
    }
  };

  // ------------------------------------------------------------ wiring
  const listeners = [];
  function on(el, ev, fn, opt) { el.addEventListener(ev, fn, opt); listeners.push([el, ev, fn, opt]); }
  function unwire() {
    for (let i = listeners.length - 1; i >= 0; i--) { const [el, ev, fn, opt] = listeners[i]; if (el instanceof Element && el.classList && el.classList.contains('jig-el')) { el.removeEventListener(ev, fn, opt); listeners.splice(i, 1); } }
    $$('.jig-el').forEach(el => { el.classList.remove('jig-el', 'jig-selected'); delete el.dataset.jigCtl; delete el.dataset.jigDrag; delete el.__jigToolbar; delete el.__jigToolbarText; delete el.__jigReset; delete el.__jigResetText; delete el.__jigNudge; const pn = el.querySelector(':scope > .jig-scrim-panel'); if (pn) { while (pn.firstChild) el.appendChild(pn.firstChild); pn.remove(); } });
    state.selected = null; toolbar.hidden = true;
  }
  function rewire() { unwire(); delete state.F.type.steps; delete state.F.spacingSteps; resolveFoundation(); wire(); scanProtection(); renderHUD(); }

  // Auto-targeting: the jig finds its own targets. data-jig="<ctl>" forces a control,
  // data-jig="off" excludes an element (and its subtree), data-jig-name names it.
  function autoTargets() {
    const out = new Map(); // el -> ctl
    const skip = el => !el.offsetParent && css(el).position !== 'fixed' || el.closest('#jig-hud, .jig-tb, [data-jig="off"]');
    const add = (el, ctl) => { if (!out.has(el) && !skip(el) && Controls[ctl]) out.set(el, ctl); };
    // explicit first
    $$('[data-jig]').forEach(el => { let c = el.dataset.jig; if (c === 'heading') c = 'type'; if (c && c !== 'off') add(el, c); });
    // crop: cover-fit images and background images of a useful size
    $$('img').forEach(img => { const r = img.getBoundingClientRect(); if (r.width >= 80 && r.height >= 80) add(img, 'crop'); });
    $$('body *').forEach(el => { if (el.tagName === 'IMG') return; const bg = css(el).backgroundImage; if (bg && bg !== 'none' && /url\(/.test(bg)) { const r = el.getBoundingClientRect(); if (r.width >= 80 && r.height >= 80) add(el, 'crop'); } });
    // type: headings first, then any text block that has its own words and no block children
    $$('h1,h2,h3,h4,h5,h6').forEach(h => add(h, 'type'));
    $$('p, li, figcaption, blockquote, small, label, dt, dd, summary, [class*="eyebrow"], [class*="caption"], [class*="lede"], [class*="subtitle"]').forEach(t => {
      if (!(t.textContent || '').trim()) return;
      if (Array.from(t.children).some(c => /^(P|DIV|UL|OL|H[1-6]|SECTION|FIGURE|TABLE)$/.test(c.tagName))) return;
      add(t, 'type');
    });
    // buttons: anything using the foundation's button classes, plus real buttons
    if (state.F.buttons && state.F.buttons.mode === 'measured') $$('a, button, input, [role=button]').filter(looksLikeButton).forEach(b => add(b, 'button'));
    else { const P = (state.F.buttons && state.F.buttons.classPrefix) || 'btn-'; $$(`a[class*="${P}"], button, [role="button"], a.btn`).forEach(b => add(b, 'button')); }
    // sections: top-level landmarks
    $$('body > section, main > section, body > main > section, section[id]').forEach(sec => add(sec, 'section'));
    const nSec = () => Array.from(out.values()).filter(v => v === 'section').length;
    if (!nSec()) $$('body > div, body > main > div, main > div, body > table, body > header, body > footer').forEach(d => { const r = d.getBoundingClientRect(); if (r.height >= 120 && r.width >= 300) add(d, 'section'); });
    if (nSec() < 3) { // a single wrapper: its big children are the real sections
      const wraps = Array.from(out.entries()).filter(([, v]) => v === 'section').map(([k]) => k);
      const bigKids = w => Array.from(w.children).filter(d => { const r = d.getBoundingClientRect(); return r.height >= 48 && r.width >= 300 && /^(DIV|SECTION|HEADER|FOOTER|TABLE|ASIDE|ARTICLE|MAIN|NAV)$/.test(d.tagName); });
      wraps.forEach(w => { const kids = bigKids(w); if (kids.length > 1) { kids.forEach(d => add(d, 'section')); out.delete(w); } });
      // a content block holding most of the page: its own big children are sections too (columns, boxes)
      const docH = document.documentElement.scrollHeight;
      Array.from(out.entries()).filter(([el, v]) => v === 'section' && el.getBoundingClientRect().height > docH * 0.5).forEach(([el]) => { const kids = bigKids(el); if (kids.length > 1) { kids.forEach(d => add(d, 'section')); out.delete(el); } });
    }
    // text overlays: absolutely positioned text sitting on an image
    $$('body *').forEach(el => {
      if (css(el).position !== 'absolute' || !(el.textContent || '').trim()) return;
      const par = el.parentElement; if (!par) return;
      const hasImg = Array.from(par.children).some(c => c !== el && (c.tagName === 'IMG' || css(c).backgroundImage !== 'none'));
      if (hasImg) add(el, 'text');
    });
    return out;
  }

  function wire() {
    for (const [el, ctl] of autoTargets()) {
      const C = Controls[ctl];
      if (!C || !C.match(el)) continue;
      if ((ctl === 'type' || ctl === 'heading') && !state.F.type) continue;
      if (ctl === 'button' && !state.F.buttons) continue;
      el.classList.add('jig-el'); el.dataset.jigCtl = ctl;
      el.classList.toggle('jig-active', state.jigs.has(groupOf(ctl)));
      C.init(el);
      // every in-flow text element can also be repositioned: compose the text control on top of type
      const inOverlay = (() => { let n = el.parentElement; while (n && n !== document.body) { if (css(n).position === 'absolute' || n.dataset.jig === 'text') return true; n = n.parentElement; } return false; })();
      if (ctl === 'type' && css(el).position !== 'absolute' && !inOverlay) {
        const tb = el.__jigToolbar; const reset = el.__jigReset;
        Controls.text.init(el);
        const tbText = el.__jigToolbarText, resetText = el.__jigReset;
        el.__jigToolbar = () => [...tb(), sep(), ...tbText()];
        el.__jigReset = () => { reset(); resetText(); };
      }
      on(el, 'pointerenter', () => hover(el));
      on(el, 'pointerleave', () => hover(null));
      on(el, 'click', e => { if (e.altKey) return; e.preventDefault(); e.stopPropagation(); select(el); });
    }
  }

  // ------------------------------------------------------------ overlay UI
  const style = document.createElement('style');
  style.id = 'jig-style';
  style.textContent = `
    /* the jig's own UI must not inherit the host site's styling */
    #jig-hud, #jig-hud *, .jig-tb, .jig-tb *, .jig-badge, #jig-found, #jig-found *, #jig-device, #jig-device *, #jig-grid, #jig-grid * { all: revert; box-sizing: border-box; }
    #jig-grid[hidden], .jig-tb[hidden], .jig-badge[hidden], #jig-hud [hidden], #jig-found [hidden], #jig-device [hidden] { display: none !important; }
    #jig-hud, .jig-tb, .jig-badge, #jig-found, #jig-device .cap { text-transform: none; letter-spacing: normal; text-shadow: none; }
    #jig-hud *, .jig-tb *, #jig-found * { text-transform: none; letter-spacing: normal; text-shadow: none; line-height: 1.45; }
    #jig-hud button, .jig-tb button, #jig-found button, #jig-hud select, #jig-found input { appearance: none; -webkit-appearance: none; text-transform: none; letter-spacing: normal; box-shadow: none; }
    #jig-hud h5, #jig-hud h6, #jig-found h5, #jig-found h6, #jig-hud p, #jig-found p { margin: 0; }
    #jig-hud button:focus-visible, .jig-tb button:focus-visible, #jig-found button:focus-visible { outline: 2px solid #3f6fff; outline-offset: 2px; }
    .jig-scrim-panel { display: flex; flex-direction: column; align-items: inherit; width: fit-content; max-width: 100%; }
    .jig-scrim-panel.c { margin-inline: auto; } .jig-scrim-panel.r { margin-left: auto; }
    html.jig-scanning *, html.jig-scanning *::before, html.jig-scanning *::after { transition: none !important; animation: none !important; }
    html.jig-scanning #jig-axtags { display: none !important; }
    .jig-el.jig-active { outline: 1.5px dashed rgba(63,111,255,.55); outline-offset: 2px; }
    .jig-el.jig-active:hover, .jig-el.jig-active.jig-selected { outline: 2px solid #3f6fff; }
    .jig-el.jig-el:not(.jig-active) { pointer-events: none; cursor: auto !important; }
    .jig-el:not(.jig-active) * { pointer-events: auto; }
    #jig-hud .jigs { display: flex; gap: 5px; padding: 10px 12px 8px; border-bottom: 1px solid #262833; }
    #jig-hud .jigs button { flex: 1; font: 600 12px ui-sans-serif, system-ui; background: transparent; color: #9aa3b8; border: 1px solid #262833; border-radius: 999px; padding: 6px 4px; cursor: pointer; text-align: center; }
    #jig-hud .jigs button:hover { border-color: #3f6fff; color: #fff; }
    #jig-hud .jigs button.on { background: #3f6fff; border-color: #3f6fff; color: #fff; }
    #jig-hud .jigs button[data-jig-toggle="ax"]:hover { border-color: #ff2d9b; }
    #jig-hud .jigs button[data-jig-toggle="ax"].on { background: #ff2d9b; border-color: #ff2d9b; color: #fff; }
    .jig-ax.jig-ax { outline: 2px solid #ff2d9b !important; outline-offset: 2px !important; box-shadow: 0 0 0 5px rgba(255,45,155,.22) !important; }
    #jig-axtags { all: revert; position: fixed; inset: 0; z-index: 2147483645; pointer-events: none; }
    #jig-axtags .tag { all: revert; position: fixed; pointer-events: auto; cursor: pointer; background: #ff2d9b; color: #fff; font: 700 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .02em; padding: 4px 6px; border-radius: 4px; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,.35); }
    #jig-axtags .tag[hidden] { display: none !important; }
    #jig-hud .jigs .lbl { font: 11px ui-sans-serif, system-ui; letter-spacing: .14em; text-transform: uppercase; opacity: .6; align-self: center; margin-right: 2px; }
    .jig-badge { position: fixed; z-index: 2147483646; pointer-events: none; font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
      background: #0b0b0d; color: #dfe6ff; padding: 3px 7px; border-radius: 4px; white-space: nowrap; transform: translate(0,-110%); box-shadow: 0 2px 8px rgba(0,0,0,.3); }
    .jig-tb { position: fixed; z-index: 2147483646; display: flex; gap: 4px; align-items: center; background: #0b0b0d; border-radius: 8px; padding: 4px; box-shadow: 0 4px 16px rgba(0,0,0,.35); }
    .jig-tb button { font: 600 13px ui-sans-serif, system-ui; background: #262833; color: #fff; border: 0; border-radius: 6px; min-width: 28px; height: 28px; padding: 0 6px; cursor: pointer; }
    .jig-tb button:hover { background: #3f6fff; }
    .jig-tb .chip { font: 11px ui-monospace, Menlo, monospace; color: #dfe6ff; padding: 0 6px; min-width: 34px; text-align: center; }
    .jig-tb .sep { width: 1px; height: 18px; background: #3a3d4a; margin: 0 2px; }
    #jig-grid { position: absolute; inset: 0; pointer-events: none; z-index: 2147483640; }
    #jig-grid .cols { position: sticky; top: 0; height: 100vh; margin: 0 auto; display: grid; }
    #jig-grid .cols i { background: rgba(63,111,255,.08); border-inline: 1px solid rgba(63,111,255,.35); }
    @media (max-width: 640px) { #jig-grid .cols i { background: rgba(63,111,255,.12); border-inline: 1px solid rgba(63,111,255,.5); } }
    #jig-hud { position: fixed; top: 16px; right: 16px; width: 372px; height: auto; max-height: calc(100vh - 32px); min-width: 280px; min-height: 92px; display: flex; flex-direction: column; z-index: 2147483647;
      background: #0b0b0d; color: #f3f4f7; border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.45); font: 13px/1.45 ui-sans-serif, system-ui, sans-serif; overflow: hidden; resize: both; }
    #jig-hud.collapsed { resize: none; height: auto !important; }
    #jig-hud.collapsed .tools, #jig-hud.collapsed .advpanel, #jig-hud.collapsed .list, #jig-hud.collapsed .jigs, #jig-hud.collapsed .hint { display: none; }
    #jig-hud header .min { margin-left: 8px; width: 24px; height: 24px; border: 0; border-radius: 6px; background: #262833; color: #fff; cursor: pointer; font: 700 14px/1 ui-sans-serif, system-ui; }
    #jig-hud header .min:hover { background: #3f6fff; }
    #jig-hud select { font: 600 12px ui-sans-serif, system-ui; background: #262833; color: #fff; border: 0; border-radius: 6px; padding: 6px 8px; cursor: pointer; }
    #jig-found { position: fixed; top: 16px; left: 16px; width: 380px; padding-right: 40px; max-height: calc(100vh - 32px); overflow: auto; z-index: 2147483644; background: #0b0b0d; color: #f3f4f7; border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.45); font: 13px/1.45 ui-sans-serif, system-ui, sans-serif; padding: 12px 14px 14px; }
    #jig-found h5 { margin: 0 0 6px; font-size: 14px; } #jig-found h5 i { color: #3f6fff; font-style: normal; }
    #jig-found h6 { margin: 12px 0 4px; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; opacity: .6; }
    #jig-found .lead { opacity: .7; font-size: 12px; margin: 0 0 4px; }
    #jig-found .frow { display: grid; grid-template-columns: 1fr 72px 24px; gap: 6px; align-items: center; margin: 3px 0; }
    #jig-found .frow.obs { grid-template-columns: 1fr 72px 24px; }
    #jig-found input { font: 12px ui-monospace, Menlo, monospace; background: #13141a; color: #f3f4f7; border: 1px solid #262833; border-radius: 6px; padding: 5px 7px; min-width: 0; width: 100%; box-sizing: border-box; }
    #jig-found input:focus { outline: 2px solid #3f6fff; outline-offset: 1px; }
    #jig-found small.o { grid-column: 1 / -1; opacity: .5; font: 11px ui-monospace, Menlo, monospace; margin: -2px 0 2px; }
    #jig-found button { font: 600 12px ui-sans-serif, system-ui; background: #262833; color: #fff; border: 0; border-radius: 6px; padding: 5px 9px; cursor: pointer; }
    #jig-found button:hover { background: #3f6fff; } #jig-found button.x { padding: 4px 0; width: 24px; }
    #jig-found .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; } #jig-found .grid4 label { font-size: 11px; opacity: .7; display: block; margin-bottom: 2px; }
    #jig-found .actions { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; } #jig-found .actions .primary { background: #3f6fff; }
    #jig-device { position: fixed; inset: 0; z-index: 2147483645; background: rgba(27,22,18,.82); display: flex; align-items: center; justify-content: center; }
    #jig-device .shell { position: relative; background: #0b0908; border-radius: 44px; padding: 14px; box-shadow: 0 30px 80px rgba(0,0,0,.6), inset 0 0 0 2px #2a2420; transform-origin: center; }
    #jig-device iframe { display: block; border: 0; background: #fff; border-radius: 32px; width: attr(width px); height: attr(height px); }
    #jig-device .cap { position: absolute; top: -34px; left: 0; right: 0; text-align: center; color: #dfe6ff; font: 12px ui-monospace, Menlo, monospace; }
    #jig-device .close { position: absolute; top: 16px; left: 16px; width: 36px; height: 36px; border: 0; border-radius: 50%; background: #262833; color: #fff; font: 700 16px/1 ui-sans-serif, system-ui; cursor: pointer; }
    #jig-device .close:hover { background: #3f6fff; }
    #jig-hud header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: #13141a; cursor: move; user-select: none; }
    #jig-hud header b { font-size: 14px; letter-spacing: .02em; } #jig-hud header b i { color: #3f6fff; font-style: normal; }
    #jig-hud header small { opacity: .6; margin-left: auto; font-family: ui-monospace, Menlo, monospace; font-size: 11px; }
    #jig-hud .tools { display: flex; gap: 6px; padding: 8px 12px; border-bottom: 1px solid #262833; align-items: center; }
    #jig-hud .tools .spacer { flex: 1; }
    #jig-hud .advpanel { border-bottom: 1px solid #262833; padding: 6px 12px 8px; }
    #jig-hud:not(.advanced) .advpanel { display: none; }
    #jig-hud .arow { display: grid; grid-template-columns: 64px 1fr; align-items: center; gap: 8px; padding: 4px 0; }
    #jig-hud .arow label { font: 11px ui-sans-serif, system-ui; letter-spacing: .12em; text-transform: uppercase; opacity: .55; }
    #jig-hud .arow > div { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
    #jig-hud .arow button, #jig-hud .arow select { font: 600 12px ui-sans-serif, system-ui; background: #262833; color: #fff; border: 0; border-radius: 6px; padding: 6px 10px; cursor: pointer; }
    #jig-hud .arow button:hover { background: #3f6fff; } #jig-hud .arow button.on { background: #3f6fff; }
    #jig-hud .hint { padding: 6px 12px 8px; font: 11px ui-monospace, Menlo, monospace; opacity: .4; background: #13141a; }
    #jig-hud .tools button, #jig-hud footer button { font: 600 12px ui-sans-serif, system-ui; background: #262833; color: #fff; border: 0; border-radius: 6px; padding: 6px 10px; cursor: pointer; }
    #jig-hud .tools button.on { background: #2bb673; }
    #jig-hud .devwrap { position: relative; }
    #jig-hud #jig-device-btn.on { background: #3f6fff; }
    #jig-device-menu { position: absolute; top: calc(100% + 6px); left: 0; z-index: 3; min-width: 200px; background: #13141a; border: 1px solid #262833; border-radius: 8px; padding: 4px; box-shadow: 0 10px 30px rgba(0,0,0,.45); display: flex; flex-direction: column; gap: 2px; }
    #jig-device-menu button { display: flex; justify-content: space-between; gap: 12px; width: 100%; text-align: left; background: transparent; color: #dfe6ff; border: 0; border-radius: 6px; padding: 7px 10px; font: 500 12px ui-sans-serif, system-ui; cursor: pointer; }
    #jig-device-menu button small { color: #9aa3b8; font: 11px ui-monospace, Menlo, monospace; }
    #jig-device-menu button:hover { background: #262833; }
    #jig-device-menu button.on { background: #3f6fff; color: #fff; } #jig-device-menu button.on small { color: #dfe6ff; }
    #jig-device-menu button.back { border-top: 1px solid #262833; border-radius: 0 0 6px 6px; margin-top: 2px; color: #9aa3b8; }
    #jig-device-menu[hidden] { display: none !important; }
    #jig-hud .tools button.ghost { background: transparent; color: #9aa3b8; border: 1px solid #262833; }
    #jig-hud .tools button.ghost.on { background: transparent; color: #fff; border-color: #3f6fff; }
    #jig-hud .tools button:hover, #jig-hud footer button:hover { background: #3f6fff; }
    #jig-hud .list { overflow: auto; padding: 8px 12px; flex: 1; }
    #jig-hud h6 { margin: 8px 0 4px; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; opacity: .6; }
    #jig-hud .row { display: flex; gap: 8px; align-items: baseline; padding: 4px 0; border-bottom: 1px dashed #262833; cursor: pointer; }
    #jig-hud .row:hover { color: #dfe6ff; }
    #jig-hud .row .n { font-weight: 600; min-width: 0; flex: 0 1 42%; } #jig-hud .row .s { opacity: .8; flex: 1 1 58%; min-width: 0; } #jig-hud .row .x { opacity: .5; }
    #jig-hud .row.warn .n::before { content: "⚠ "; color: #ffb84d; }
    #jig-hud .empty { opacity: .55; padding: 8px 0; }
    #jig-hud footer { display: flex; gap: 6px; padding: 10px 12px; border-top: 1px solid #262833; background: #13141a; align-items: center; }
    #jig-hud footer button.primary { background: #3f6fff; flex: 1; }
    #jig-hud footer small { opacity: .6; }
    #jig-hud .src { padding: 6px 0 0; font: 11px ui-monospace, Menlo, monospace; opacity: .55; }
    @media (max-width: 640px) {
      #jig-hud { top: auto; bottom: 0; left: 0; right: 0; width: auto; max-height: 50vh; border-radius: 12px 12px 0 0; }
      #jig-hud header { cursor: pointer; }
      #jig-hud header::before { content: ""; width: 36px; height: 4px; border-radius: 2px; background: #3a3d4a; position: absolute; left: 50%; top: 5px; transform: translateX(-50%); }
      #jig-hud header { position: relative; padding-top: 14px; }
      .devwrap { display: none; }
      #jig-hud { resize: none; }
      .jig-tb button { width: 36px; height: 36px; }
    }
  `;

  const badge = document.createElement('div'); badge.className = 'jig-badge'; badge.hidden = true;
  const toolbar = document.createElement('div'); toolbar.className = 'jig-tb'; toolbar.hidden = true;
  let hoverEl = null;

  function setBadge(el, text) {
    if (!el) { badge.hidden = true; return; }
    const r = el.getBoundingClientRect();
    badge.textContent = `${nameOf(el)} · ${text}`;
    badge.style.left = `${Math.max(8, r.left)}px`; badge.style.top = `${Math.max(24, r.top)}px`;
    badge.hidden = false;
  }
  function hover(el) {
    hoverEl = el;
    if (!el) { if (!state.selected) badge.hidden = true; return; }
    setBadge(el, Controls[el.dataset.jigCtl].label);
  }
  function deselect() { $$('.jig-selected').forEach(x => x.classList.remove('jig-selected')); state.selected = null; hoverEl = null; toolbar.hidden = true; badge.hidden = true; }
  function select(el) {
    $$('.jig-selected').forEach(e => e.classList.remove('jig-selected'));
    state.selected = el; el.classList.add('jig-selected');
    refreshToolbar(el);
  }
  function refreshToolbar(el) {
    if (!el || el !== state.selected || !el.__jigToolbar) { toolbar.hidden = true; return; }
    toolbar.innerHTML = ''; el.__jigToolbar().forEach(n => toolbar.appendChild(n));
    const r = el.getBoundingClientRect();
    toolbar.style.left = `${Math.max(8, r.left)}px`; toolbar.style.top = `${Math.min(window.innerHeight - 44, r.bottom + 6)}px`;
    toolbar.hidden = false;
  }
  function btn(t, fn) { const b = document.createElement('button'); b.textContent = t; b.onclick = e => { e.stopPropagation(); fn(); }; return b; }
  function chip(fn) { const c = document.createElement('span'); c.className = 'chip'; c.textContent = fn(); return c; }
  function sep() { const s = document.createElement('span'); s.className = 'sep'; return s; }

  // The page is inert while the jig is on: clicks never navigate, submit, or reach the site's own handlers.
  // Hold Alt to let a click through on purpose.
  const inJigUI = t => !!(t && t.closest && t.closest('#jig-hud, .jig-tb, #jig-found, #jig-device, .jig-badge'));
  on(document, 'click', e => {
    if (inJigUI(e.target) || e.altKey) return;
    e.preventDefault();
    if (!e.target.closest('.jig-el')) { e.stopPropagation(); $$('.jig-selected').forEach(x => x.classList.remove('jig-selected')); state.selected = null; toolbar.hidden = true; }
  }, true);
  on(document, 'auxclick', e => { if (!inJigUI(e.target) && !e.altKey) { e.preventDefault(); e.stopPropagation(); } }, true);
  on(document, 'submit', e => { if (!inJigUI(e.target)) { e.preventDefault(); e.stopPropagation(); } }, true);
  on(document, 'dragstart', e => { if (!inJigUI(e.target)) e.preventDefault(); }, true);  // native image/link drag fights our drag
  on(document, 'contextmenu', e => { if (!inJigUI(e.target) && e.target.closest('.jig-el')) e.preventDefault(); }, true);
  on(window, 'scroll', () => { if (state.selected) refreshToolbar(state.selected); }, { passive: true });
  on(window, 'resize', () => { if (state.selected) refreshToolbar(state.selected); drawGrid(); });
  on(document, 'keydown', e => {
    if (e.key === 'Escape') { if (foundEl) return closeFoundationPanel(); if (deviceEl) return closeDevice(); $$('.jig-selected').forEach(x => x.classList.remove('jig-selected')); state.selected = null; toolbar.hidden = true; }
    if (e.key === 'g' && !e.metaKey && !e.ctrlKey && !/input|textarea/i.test(e.target.tagName)) toggleGrid();
    if (state.selected && state.selected.__jigNudge && /^Arrow/.test(e.key)) {
      e.preventDefault(); const step = e.shiftKey ? 5 : 1;
      state.selected.__jigNudge(e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
    }
  });

  // ------------------------------------------------------------ grid overlay
  const gridEl = document.createElement('div'); gridEl.id = 'jig-grid'; gridEl.hidden = true;
  function drawGrid() {
    const G = state.F.grid;
    gridEl.innerHTML = '';
    const cols = document.createElement('div'); cols.className = 'cols';
    cols.style.gridTemplateColumns = `repeat(${G.columns}, 1fr)`; cols.style.gap = `${G.gutter}px`;
    if (gridAnchor && gridAnchor.isConnected && state.bp !== 'phone') {
      // inferred grid: sit exactly on the content container's edges
      const r = gridAnchor.getBoundingClientRect();
      cols.style.maxWidth = `${Math.round(r.width)}px`; cols.style.paddingInline = '0'; cols.style.marginLeft = `${Math.round(r.left)}px`;
    } else { cols.style.maxWidth = `${G.maxWidth}px`; cols.style.paddingInline = `${Math.min(G.margin, Math.floor(window.innerWidth * 0.06))}px`; }
    for (let i = 0; i < G.columns; i++) cols.appendChild(document.createElement('i'));
    gridEl.appendChild(cols);
    gridEl.style.height = `${document.documentElement.scrollHeight}px`;
  }
  function toggleGrid(force) {
    state.grid = force === undefined ? !state.grid : force;
    const frameOpen = !!(deviceEl && $('iframe', deviceEl));
    gridEl.hidden = !state.grid || frameOpen; if (state.grid && !frameOpen) drawGrid();
    const fr = deviceEl && $('iframe', deviceEl); if (fr && fr.contentWindow) fr.contentWindow.postMessage({ jig: 'grid', on: state.grid }, '*');
    const gb = $('#jig-grid-btn'); if (gb) gb.classList.toggle('on', state.grid);
  }

  // ------------------------------------------------------------ protection scan (AX)
  let scanTimer = null;
  function scanSoon() { clearTimeout(scanTimer); scanTimer = setTimeout(scanProtection, 250); }
  function scanProtection() {
    clearTimeout(scanTimer);
    document.documentElement.classList.add('jig-scanning');   // transitions off: read settled values, not a frame of an animation
    try { scanNow(); } finally { document.documentElement.classList.remove('jig-scanning'); }
  }
  function scanNow() {
    const P = state.F.protect || {}; const W = [];
    // 1. heading order
    const hs = $$('h1,h2,h3,h4,h5,h6').filter(h => h.offsetParent && !h.closest('#jig-hud'));
    let last = 0;
    hs.forEach(h => { const n = +h.tagName[1]; if (last && n > last + 1) W.push({ kind: 'heading-order', el: h, msg: `h${last} → h${n} skips a level` }); last = n; });
    // 1b. visual hierarchy: an h2 rendered larger than the page h1
    const h1 = hs.find(h => h.tagName === 'H1');
    if (h1) { const h1px = px(css(h1).fontSize); hs.filter(h => h.tagName === 'H2' && px(css(h).fontSize) > h1px).forEach(h => W.push({ kind: 'hierarchy', el: h, msg: `h2 renders at ${r1(px(css(h).fontSize))}px, larger than the h1 (${r1(h1px)}px)` })); }
    // 2. tap targets
    const min = P.minTapTarget || 44;
    $$('a.btn, button, [role=button], [data-jig=button]').forEach(b => {
      if (!b.offsetParent || b.closest('#jig-hud, .jig-tb')) return; const r = b.getBoundingClientRect();
      if (r.height < min - 0.5) W.push({ kind: 'tap-target', el: b, msg: `tap target ${Math.round(r.width)}×${Math.round(r.height)}px, min ${min}px tall` });
    });
    // 3. contrast: every element with its own text, sampled under its own box
    const seen = new Set();
    $$('h1,h2,h3,h4,h5,h6,p,a,li,span,small,figcaption,label,button').forEach(t => {
      if (!t.offsetParent || t.closest('#jig-hud, .jig-tb')) return;
      const own = Array.from(t.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
      if (!own) return;
      const fg = parseColor(css(t).color); if (!fg || fg[3] === 0) return;
      const over = imageBehind(t);
      let bg = null, how = '';
      let busy = 0;
      if (over) {
        const patches = sampleImage(over.img, t); how = 'over image';
        if (!patches) { if ((P.textOverImage || 'warn') === 'warn' && !seen.has(over.img)) { seen.add(over.img); W.push({ kind: 'text-over-image', el: t, msg: 'text over an image; contrast could not be sampled (serve over http to enable)' }); } return; }
        // a scrim (gradient/translucent overlay) or a text-shadow earns some credit; otherwise grade by the WORST patch
        const shadow = css(t).textShadow !== 'none';
        const scrim = scrimBehind(t);
        let pool = patches;
        if (scrim && scrim.blur) { const m = patches.reduce((a, pc) => [a[0] + pc[0] / patches.length, a[1] + pc[1] / patches.length, a[2] + pc[2] / patches.length, 1], [0, 0, 0, 1]); pool = patches.map(() => m); }
        const ratios = pool.map(pc => contrast(fg, scrim ? blend(pc, scrim) : pc)).sort((a, b) => a - b);
        const worst = ratios[Math.floor(ratios.length * 0.1)];      // 10th percentile: ignores a stray pixel, not a region
        const lums = patches.map(lum); const mean = lums.reduce((a, b) => a + b, 0) / lums.length;
        busy = Math.sqrt(lums.reduce((a, l) => a + (l - mean) ** 2, 0) / lums.length);
        bg = null; var ratioOverride = shadow ? Math.max(worst, ratios[Math.floor(ratios.length * 0.5)]) : worst;
        if (busy > 0.16 && !scrim && !shadow) W.push({ kind: 'busy-background', el: t, msg: `text over a busy image (luminance spread ${busy.toFixed(2)}); add a scrim, a shadow, or move it` });
      } else { bg = solidBehind(t); how = 'on background'; }
      if (!bg && ratioOverride === undefined) return;
      const ratio = bg ? contrast(fg, bg) : ratioOverride;
      const fs = px(css(t).fontSize), bold = px(css(t).fontWeight) >= 700;
      const large = fs >= 24 || (bold && fs >= 18.66);          // WCAG large text
      const need = large ? Math.min(3, P.minContrast || 4.5) : (P.minContrast || 4.5);
      if (ratio < need) W.push({ kind: 'contrast', el: t, msg: `contrast ${ratio.toFixed(1)} ${how}${over ? ' (worst patch)' : ''}, min ${need}${large ? ' (large text)' : ''}`, value: +ratio.toFixed(1), min: need });
    });
    state.warnings = W; renderHUD(); postToParent(); paintAX();
  }
  // ax jig: every element with a protection warning gets a pink outline and a chip saying why
  let axTags = null;
  function paintAX() {
    const axOn = state.jigs.has('ax');
    $$('.jig-ax').forEach(el => el.classList.remove('jig-ax'));
    if (!axTags) { axTags = document.createElement('div'); axTags.id = 'jig-axtags'; document.body.appendChild(axTags); on(window, 'scroll', placeAXTags, { passive: true }); on(window, 'resize', placeAXTags); }
    axTags.innerHTML = '';
    if (!axOn) return;
    const byEl = new Map();
    state.warnings.forEach(w => { if (!w.el || !w.el.isConnected) return; w.el.classList.add('jig-ax'); byEl.set(w.el, (byEl.get(w.el) || []).concat(w)); });
    byEl.forEach((ws, el) => {
      const tag = document.createElement('div'); tag.className = 'tag'; tag.__el = el;
      tag.textContent = ws.map(w => w.kind === 'contrast' ? `contrast ${w.value} / ${w.min}` : w.kind === 'tap-target' ? `tap ${w.msg.replace(/.*×(\d+)px.*/, '$1')}px tall` : w.kind).join(' · ');
      tag.title = ws.map(w => w.msg).join('\n');
      tag.onclick = () => { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (el.classList.contains('jig-el') && el.classList.contains('jig-active')) select(el); };
      axTags.appendChild(tag);
    });
    placeAXTags();
  }
  function placeAXTags() {
    if (!axTags) return;
    $$('.tag', axTags).forEach(t => { const r = t.__el.getBoundingClientRect(); const off = r.top < 22; t.style.top = `${Math.max(0, off ? r.bottom + 4 : r.top - 20)}px`; t.style.left = `${Math.max(0, r.left)}px`; t.hidden = r.width === 0 || r.bottom < 0 || r.top > window.innerHeight; });
  }
  function imageBehind(t) {
    let n = t.parentElement;
    while (n && n !== document.body) {
      const img = Array.from(n.children).find(c => c.tagName === 'IMG' && c !== t && !c.contains(t));
      if (img && css(n).position !== 'static') return { img, box: n };
      const bgi = css(n).backgroundImage;
      if (bgi !== 'none' && /url\(/.test(bgi)) return { img: n, box: n };
      n = n.parentElement;
    }
    return null;
  }
  function scrimBehind(t) {
    // a translucent background on the text's own box or an ancestor between it and the image
    let n = t;
    while (n && n !== document.body) {
      const bgc = parseColor(css(n).backgroundColor); const bgi = css(n).backgroundImage;
      const bf = css(n).backdropFilter || css(n).webkitBackdropFilter || '';
      if (bgc && bgc[3] > 0.05 && bgc[3] < 1) { if (/blur/.test(bf)) bgc.blur = true; return bgc; }
      if (bgi && /gradient/.test(bgi)) { const m = bgi.match(/rgba?\([^)]+\)/g); if (m) { const cs = m.map(parseColor).filter(Boolean); const a = cs.reduce((x, c) => x + c[3], 0) / cs.length; const avg = cs.reduce((x, c) => [x[0] + c[0] / cs.length, x[1] + c[1] / cs.length, x[2] + c[2] / cs.length], [0, 0, 0]); return [avg[0], avg[1], avg[2], Math.min(0.95, a)]; } }
      if (bgc && bgc[3] >= 1) return null; // solid: not "over image" at all
      n = n.parentElement;
    }
    return null;
  }
  function blend(under, over) { const a = over[3]; return [over[0] * a + under[0] * (1 - a), over[1] * a + under[1] * (1 - a), over[2] * a + under[2] * (1 - a), 1]; }
  function solidBehind(t) {
    let n = t;
    while (n && n !== document.documentElement) { const c = parseColor(css(n).backgroundColor); if (c && c[3] > 0.9) return c; n = n.parentElement; }
    const h = parseColor(css(document.documentElement).backgroundColor);
    if (h && h[3] > 0.9) return h;
    return [255, 255, 255, 1];   // the canvas: browsers paint white under a transparent html/body
  }
  function sampleImage(img, t) {
    if (img.tagName !== 'IMG' || !img.complete || !img.naturalWidth) return null;
    try {
      const c = document.createElement('canvas'); const ir = img.getBoundingClientRect(), tr = t.getBoundingClientRect();
      const fit = naturalFit(img); const [ox, oy] = parsePos(css(img).objectPosition);
      const s = Math.max(ir.width / img.naturalWidth, ir.height / img.naturalHeight);
      const offX = -fit.ovx * ox / 100, offY = -fit.ovy * oy / 100;
      // text box in natural image px
      const x0 = clamp((tr.left - ir.left - offX) / s, 0, img.naturalWidth), y0 = clamp((tr.top - ir.top - offY) / s, 0, img.naturalHeight);
      const x1 = clamp((tr.right - ir.left - offX) / s, 0, img.naturalWidth), y1 = clamp((tr.bottom - ir.top - offY) / s, 0, img.naturalHeight);
      const w = Math.max(1, Math.round(x1 - x0)), h = Math.max(1, Math.round(y1 - y0));
      // 8x8 patches; each patch is averaged, then we keep every patch so the caller can grade by the worst one
      const N = 8; c.width = N; c.height = N; const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true; ctx.drawImage(img, x0, y0, w, h, 0, 0, N, N);
      const d = ctx.getImageData(0, 0, N, N).data; const patches = [];
      for (let i = 0; i < d.length; i += 4) patches.push([d[i], d[i + 1], d[i + 2], 1]);
      return patches;
    } catch (e) { return null; } // tainted canvas (file://) or cross-origin
  }
  function parseColor(s) { const m = (s || '').match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(parseFloat); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
  function lum([r, g, b]) { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
  function contrast(a, b) { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }

  // ------------------------------------------------------------ HUD
  const hud = document.createElement('div'); hud.id = 'jig-hud';
  hud.innerHTML = `
    <header><b>jig <i>studio</i></b><small id="jig-bp"></small><button class="min" id="jig-min-btn" title="minimize">–</button></header>
    <div class="jigs">${JIGS.map(j => `<button data-jig-toggle="${j.id}" aria-pressed="false">${j.label}</button>`).join('')}</div>
    <div class="tools">
      <button id="jig-grid-btn" title="g">grid</button>
      <span class="devwrap"><button id="jig-device-btn" title="preview on a phone or tablet" aria-haspopup="menu" aria-expanded="false">device ▾</button>
      <div id="jig-device-menu" role="menu" hidden>${DEVICES.map(d => `<button role="menuitemradio" data-device="${d.id}"><span>${d.name}</span><small>${d.w}×${d.h}</small></button>`).join('')}<button role="menuitem" data-device="" class="back">back to desktop</button></div></span>
      <span class="spacer"></span>
      <button id="jig-adv-btn" class="ghost" title="foundation, columns, auto, rescan, reset">advanced</button>
    </div>
    <div class="advpanel">
      <div class="arow"><label>columns</label><div><select id="jig-cols-sel" title="grid columns"></select></div></div>
      <div class="arow"><label>auto</label><div><button id="jig-norm-btn" title="snap every size and space to the scales, and fix what protection flagged">auto</button><select id="jig-q-res" title="how many steps to snap to"><option value="32">light</option><option value="16" selected>medium</option><option value="8">strict</option></select></div></div>
      <div class="arow"><label>scales</label><div><button id="jig-found-btn">foundation</button><button id="jig-scan-btn">rescan</button><button id="jig-reset-btn">reset all</button></div></div>
      <div class="src" id="jig-src"></div>
    </div>
    <div class="list"><h6>changes</h6><div id="jig-changes"></div><h6>notes</h6><div id="jig-warn"></div></div>
    <footer><button class="primary" id="jig-copy-btn">Copy patch</button><small id="jig-count"></small></footer>
    <div class="hint">page is inert while the jig is on · hold Alt to click through · Esc deselects</div>`;

  function renderHUD() {
    if (EMBED || !hud.isConnected) return;
    const ch = $('#jig-changes'), wn = $('#jig-warn');
    ch.innerHTML = ''; wn.innerHTML = '';
    if (!state.changes.size) ch.innerHTML = state.jigs.size ? '<div class="empty">Nothing changed yet. Hover anything outlined; drag, pinch, or click it.</div>' : '<div class="empty">Switch on a jig above. Only that kind of thing becomes adjustable, so the page stays readable.</div>';
    for (const [k, c] of state.changes) {
      const row = document.createElement('div'); row.className = 'row';
      row.innerHTML = `<span class="n">${esc(c.name)}</span><span class="s">${esc(c.summary)}</span><span class="x" title="reset">×</span>`;
      row.querySelector('.x').onclick = e => { e.stopPropagation(); const el = $(c.el); if (el && el.__jigReset) el.__jigReset(); else state.changes.delete(k); renderHUD(); };
      row.onclick = () => { const el = $(c.el); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); select(el); } };
      ch.appendChild(row);
    }
    if (state.normalize) {
      const g = normalizeGroups(); const h = document.createElement('h6'); h.textContent = `auto ${resName(state.normalizeRes)} · ${state.normalize.length} snaps · ${(state.autoFixes || []).length} fixes`; ch.appendChild(h);
      (state.autoFixes || []).forEach(f => { const row = document.createElement('div'); row.className = 'row'; row.innerHTML = `<span class="n">${esc(nameOf(f.el))}</span><span class="s">${esc(f.what)}</span>`; ch.appendChild(row); });
      g.slice(0, 12).forEach(x => { const row = document.createElement('div'); row.className = 'row'; row.innerHTML = `<span class="n">${esc(x.prop)}</span><span class="s">${x.from}px → ${x.to}px · ${x.els.length} element${x.els.length === 1 ? '' : 's'}</span>`; ch.appendChild(row); });
      if (g.length > 12) { const m = document.createElement('div'); m.className = 'empty'; m.textContent = `+ ${g.length - 12} more groups in the patch`; ch.appendChild(m); }
    }
    if (state.frame.changes.length) {
      const h = document.createElement('h6'); h.textContent = (state.frame.device || 'device') + ' changes'; ch.appendChild(h);
      state.frame.changes.forEach(c => { const row = document.createElement('div'); row.className = 'row'; row.innerHTML = `<span class="n">${esc(c.name)}</span><span class="s">${esc(c.summary)}</span>`; ch.appendChild(row); });
    }
    if (!state.warnings.length) wn.innerHTML = '<div class="empty">No notes. The page passes.</div>';
    state.warnings.forEach(w => {
      const row = document.createElement('div'); row.className = 'row warn';
      row.innerHTML = `<span class="n">${esc(nameOf(w.el))}</span><span class="s">${esc(w.msg)}</span>`;
      row.onclick = () => { w.el.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (w.el.classList.contains('jig-el')) select(w.el); };
      wn.appendChild(row);
    });
    const total = state.changes.size + state.frame.changes.length + (state.normalize ? state.normalize.length : 0);
    $('#jig-count').textContent = `${total} change${total === 1 ? '' : 's'} · ${state.warnings.length + state.frame.warnings.length} note${state.warnings.length + state.frame.warnings.length === 1 ? '' : 's'}`;
    if (!state.device) $('#jig-bp').textContent = `${state.bp} · ${window.innerWidth}px`;
    const F = state.F; const inf = F.mode === 'inferred' || F.type.inferred || F.buttons.inferred;
    $('#jig-src').textContent = `${INJECTED ? 'injected by bookmarklet · ' : ''}foundation: ${F.name} · ${state.foundationSource}${inf ? ` · ${F.type.steps.length} type steps, ${F.spacingSteps.length} spacing steps, ${F.buttons.sizes.length} button size${F.buttons.sizes.length === 1 ? '' : 's'} · proposed tokens ride in the patch` : ''}`;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ------------------------------------------------------------ patch
  function buildPatch() {
    const when = new Date(); const stamp = when.toISOString().slice(0, 16).replace('T', ' ');
    const lines = [`# jig patch · ${state.F.name} · ${location.pathname} · ${stamp}`, ''];
    const all = [...state.changes.values(), ...state.frame.changes];
    if (!all.length) lines.push('- (no changes)');
    all.forEach(c => lines.push(`- ${c.name}: ${c.summary}${c.bp !== 'desktop' ? ` (${c.device ? c.device + ', ' : ''}${c.bp})` : ''}`));
    const warns = [...state.warnings.map(w => ({ kind: w.kind, el: selectorOf(w.el), name: nameOf(w.el), msg: w.msg, value: w.value, min: w.min })), ...state.frame.warnings.map(w => ({ ...w, msg: w.msg + ' (' + (state.frame.device || 'device') + ')' }))];
    if (warns.length) { lines.push('', `⚠ ${warns.length} note${warns.length === 1 ? '' : 's'} (accessibility):`); warns.forEach(w => lines.push(`- ${w.name}: ${w.msg}`)); }
    const json = [];
    all.forEach(c => { const { name, summary, ...rest } = c; json.push(rest); });
    warns.forEach(w => json.push({ warn: w.kind, el: w.el, msg: w.msg, ...(w.value ? { value: w.value, min: w.min } : {}) }));
    if (state.normalize) {
      const g = normalizeGroups();
      const qs = quantizeScales(state.normalizeRes || '16');
      if ((state.autoFixes || []).length) { lines.push('', `# auto fixes · ${state.autoFixes.length}`, '', 'Protection failures fixed with the same controls a person would use; each is also listed under changes above with its values.', ''); state.autoFixes.forEach(f => lines.push(`- ${nameOf(f.el)}: ${f.what}`)); }
      lines.push('', `# auto · ${resName(state.normalizeRes || '16')} · ${state.normalize.length} snaps in ${g.length} groups`, '', `Every font-size, padding, margin, and gap on the page snapped to the nearest step, like notes to a grid. Type steps: ${qs.typeSteps.join(', ')}px. Spacing steps: ${qs.spaceSteps.join(', ')}px. Apply as rule changes, not inline styles: find the rule that sets each value and change it; where several elements share a group they almost certainly share a rule.`, '');
      g.forEach(x => lines.push(`- ${x.prop}: ${x.from}px → ${x.to}px on ${x.els.length} element${x.els.length === 1 ? '' : 's'}`));
      g.forEach(x => json.push({ op: 'quantize', prop: x.prop, from: x.from, to: x.to, count: x.els.length, els: x.els.slice(0, 20), ...(x.els.length > 20 ? { more: x.els.length - 20 } : {}) }));
    }
    lines.push('', '---', JSON.stringify(json, null, 2));
    const F = state.F;
    if (F.mode === 'inferred' || F.type.inferred || F.buttons.inferred || F.mode === 'vars' || F.edited) {
      const t = proposedTokens();
      const how = F.edited ? 'edited by hand in the jig' : F.mode === 'vars' ? 'read from this site\'s CSS variables' : 'inferred from the rendered page';
      lines.push('', '---', `# proposed tokens · ${how}`, '', (F.edited ? 'The person reviewed and adjusted these scales in the jig. ' : 'This site has no jig foundation. The scales below were ' + (F.mode === 'vars' ? 'read from :root' : 'measured, clustered, and snapped') + '. ') + 'Save as jig.foundation.json and add the :root block.', '', '```css', t.css, '```', '', '```json', t.json, '```');
    }
    return lines.join('\n');
  }
  async function copyPatch() {
    const text = buildPatch();
    try { await navigator.clipboard.writeText(text); flash('Patch copied. Paste it to your AI.'); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;inset:16px;z-index:2147483647;width:60vw;height:60vh;font:12px monospace'; document.body.appendChild(ta); ta.select(); flash('Clipboard blocked; select the text manually.'); on(ta, 'blur', () => ta.remove()); }
  }
  function flash(msg) { const b = $('#jig-copy-btn'); const t = b.textContent; b.textContent = msg; setTimeout(() => (b.textContent = t), 1800); }

  // ------------------------------------------------------------ normalize: snap the whole page to the scales
  function normalizePage(on) {
    if (!on) {
      (state.normalize || []).forEach(n => { n.el.style.removeProperty(n.prop); if (n.prev) n.el.style.setProperty(n.prop, n.prev); });
      (state.autoFixes || []).forEach(f => { if (f.undo) { f.undo(); unrecord(f.el, 'grid'); } else if (f.el.__jigReset) f.el.__jigReset(); });
      state.normalize = null; state.autoFixes = []; $('#jig-norm-btn').classList.remove('on'); renderHUD(); scanSoon(); return;
    }
    const F = state.F; const out = [];
    const res = ($('#jig-q-res') && $('#jig-q-res').value) || '16';
    const { typeSteps, spaceSteps } = quantizeScales(res);
    state.normalizeRes = res;
    const skipEl = el => el.closest('#jig-hud, .jig-tb, #jig-found, #jig-device, .jig-badge, script, style, svg') || el === document.body || el === document.documentElement || !visible(el);
    const snap = (el, prop, cur, steps, min, max) => {
      if (!(cur >= min && cur <= max)) return;
      const to = nearest(steps, cur); if (Math.abs(to - cur) < 0.1) return;   // sub-pixel drift counts; it's the most common kind
      out.push({ el, prop, from: Math.round(cur * 10) / 10, to, prev: el.style.getPropertyValue(prop) || '' });
      el.style.setProperty(prop, to + 'px', 'important');
    };
    // 1. type: elements with their own text (and their same-size riders, so headline links follow their headings)
    const texty = d => Array.from(d.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    $$('body *').forEach(el => { if (skipEl(el) || !texty(el)) return; snap(el, 'font-size', px(css(el).fontSize), typeSteps, 8, 200); });
    // 2. space: paddings, margins, gaps on block-ish boxes (positive, px-sized; negative and huge values are layout, not rhythm)
    $$('body *').forEach(el => {
      if (skipEl(el)) return; const c = css(el); if (!/block|flex|grid|table|list-item/.test(c.display) || c.position === 'fixed') return;
      ['padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'margin-top', 'margin-bottom'].forEach(prop => snap(el, prop, px(c[prop]), spaceSteps, 2, 160));
      if (/flex|grid/.test(c.display)) ['row-gap', 'column-gap'].forEach(prop => snap(el, prop, px(c[prop]), spaceSteps, 2, 160));
    });
    state.normalize = out; $('#jig-norm-btn').classList.add('on');
    autoFixAX();
    autoAlignRows();
    autoFocusImages();
    renderHUD(); scanSoon();
  }
  // Where is the subject? Faces when the browser can find them; otherwise the centroid of the image's high-detail region.
  async function focalPoint(img) {
    if (!img.complete || !img.naturalWidth) return null;
    try {
      if ('FaceDetector' in window) {
        const faces = await new window.FaceDetector({ fastMode: true, maxDetectedFaces: 5 }).detect(img);
        if (faces && faces.length) {
          const b = faces.reduce((a, f) => ({ x: a.x + f.boundingBox.x + f.boundingBox.width / 2, y: a.y + f.boundingBox.y + f.boundingBox.height / 2 }), { x: 0, y: 0 });
          return { fx: b.x / faces.length / img.naturalWidth, fy: b.y / faces.length / img.naturalHeight, how: `${faces.length} face${faces.length === 1 ? '' : 's'}` };
        }
      }
    } catch (e) {}
    try {
      const N = 64, c = document.createElement('canvas'); c.width = N; c.height = N; const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, N, N); const d = ctx.getImageData(0, 0, N, N).data;
      const lum = new Float32Array(N * N); for (let i = 0; i < N * N; i++) lum[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      const e = new Float32Array(N * N); let cells = [];
      for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) { const i = y * N + x; const gx = lum[i + 1] - lum[i - 1], gy = lum[i + N] - lum[i - N]; e[i] = Math.hypot(gx, gy); cells.push([i, e[i]]); }
      cells.sort((a, b) => b[1] - a[1]); const top = cells.slice(0, Math.max(20, Math.floor(cells.length * 0.12)));
      let sx = 0, sy = 0, sw = 0; top.forEach(([i, w]) => { sx += (i % N) * w; sy += Math.floor(i / N) * w; sw += w; });
      if (!sw) return null;
      return { fx: (sx / sw + 0.5) / N, fy: (sy / sw + 0.5) / N, how: 'detail centroid' };
    } catch (e) { return null; }   // tainted canvas
  }
  // Blocks that sit a few px off a column line get put back on it (the demo's nudged card row, a container with a stray margin).
  function autoAlignRows() {
    const G = state.F.grid; const anchor = (gridAnchor && gridAnchor.isConnected) ? gridAnchor : null;
    const ar = anchor ? anchor.getBoundingClientRect() : { left: Math.max(0, (window.innerWidth - G.maxWidth) / 2) + G.margin, width: Math.min(G.maxWidth, window.innerWidth) - 2 * G.margin };
    const cw = (ar.width + G.gutter) / G.columns;
    const lines = Array.from({ length: G.columns + 1 }, (_, i) => ar.left + i * cw);
    const cands = new Set($$('.jig-el[data-jig-ctl="grid"]'));
    $$('body *').forEach(el => { if (el.closest('#jig-hud, .jig-tb, #jig-found, #jig-device') || !visible(el)) return; const c = css(el); if (!/block|flex|grid/.test(c.display) || c.position === 'fixed' || c.position === 'absolute') return; const r = el.getBoundingClientRect(); if (r.width >= ar.width * 0.4 && r.height >= 60 && r.width < ar.width - 1) cands.add(el); });
    cands.forEach(el => {
      const r = el.getBoundingClientRect(); const near = nearest(lines, r.left); const delta = r.left - near;   // +: sits right of the line
      if (Math.abs(delta) < 1 || Math.abs(delta) > 16) return;
      const cur = px(css(el).marginLeft);
      const before = el.style.getPropertyValue('margin-left');
      el.style.setProperty('margin-left', `${Math.round(cur - delta)}px`, 'important');
      if (Math.abs(el.getBoundingClientRect().left - near) > 1) { el.style.removeProperty('margin-left'); if (before) el.style.setProperty('margin-left', before); return; }   // layout didn't take it; leave it
      state.autoFixes.push({ el, what: `on grid (was ${Math.round(delta)}px off the column line)`, undo: () => { el.style.removeProperty('margin-left'); if (before) el.style.setProperty('margin-left', before); } });
      record(el, 'grid', { marginLeft: Math.round(cur - delta), wasOffBy: Math.round(delta) }, `inline offset ${Math.round(cur)}px → ${Math.round(cur - delta)}px (on grid)`);
    });
  }
  async function autoFocusImages() {
    const imgs = $$('img.jig-el[data-jig-ctl="crop"]').filter(i => i.__jigSetFocal);
    for (const img of imgs) {
      const f = await focalPoint(img); if (!f) continue;
      if (img.__jigSetFocal(f.fx, f.fy)) state.autoFixes.push({ el: img, what: `crop re-centred on subject (${f.how})` });
    }
    renderHUD();
  }

  // Fix what protection flagged, using the same controls a person would: scrims for text over images,
  // a size step for short tap targets, a ramp step down for an h2 that outgrew the h1. Colour stays a warning.
  function autoFixAX() {
    state.autoFixes = [];
    scanProtection();
    const seen = new Set();
    for (let pass = 0; pass < 4; pass++) {
      let did = false;
      for (const w of state.warnings.slice()) {
        if (w.kind === 'contrast' || w.kind === 'busy-background' || w.kind === 'text-over-image') {
          const ov = w.el.closest('.jig-el[data-jig-ctl="text"]'); if (!ov || !ov.__jigSetScrim || seen.has(ov)) continue;
          seen.add(ov);
          for (const sc of ['gradient', 'tint', 'glass']) {
            ov.__jigSetScrim(sc); scanProtection();
            if (!state.warnings.some(x => ov.contains(x.el) && /contrast|busy|text-over/.test(x.kind))) { state.autoFixes.push({ el: ov, what: `scrim ${sc} (text over image now passes)` }); did = true; break; }
            if (sc === 'glass') state.autoFixes.push({ el: ov, what: 'scrim glass (best effort; still short of AA)' });
          }
        }
        if (w.kind === 'tap-target' && w.el.__jigStepSize && !seen.has(w.el)) {
          seen.add(w.el); let steps = 0;
          while (steps < 2 && w.el.getBoundingClientRect().height < ((state.F.protect || {}).minTapTarget || 44) - 0.5 && w.el.__jigStepSize(1)) steps++;
          if (steps) { state.autoFixes.push({ el: w.el, what: `size +${steps} (tap target now ${Math.round(w.el.getBoundingClientRect().height)}px)` }); did = true; }
        }
        if (w.kind === 'hierarchy' && w.el.__jigStepType && !seen.has(w.el)) {
          seen.add(w.el); const h1 = $$('h1').find(h => h.offsetParent); const h1px = h1 ? px(css(h1).fontSize) : 0; let steps = 0;
          while (steps < 3 && px(css(w.el).fontSize) > h1px + 0.5) { w.el.__jigStepType(-1); steps++; }
          if (steps) { state.autoFixes.push({ el: w.el, what: `ramp -${steps} (now ≤ h1)` }); did = true; }
        }
      }
      scanProtection();
      if (!did) break;
    }
  }
  // 1/32: the page's own (inferred or edited) steps. 1/16: a 1.25 modular scale off the body size + 4..96 ladder. 1/8: four sizes, four spaces.
  function quantizeScales(res) {
    const F = state.F;
    const own = F.type.steps.filter(x => x.px > 0).map(x => x.px);
    const bodyStep = F.type.steps.find(x => x.token === 'md' || x.token === 'body') || F.type.steps[Math.floor(F.type.steps.length / 2)];
    const body = bodyStep ? Math.round(bodyStep.px) : 16;
    if (res === '32') return { typeSteps: own, spaceSteps: F.spacingSteps.filter(x => x.px > 0).map(x => x.px) };
    if (res === '8') return { typeSteps: [Math.round(body * 0.8), body, Math.round(body * 1.5625), Math.round(body * 2.44)], spaceSteps: [8, 16, 32, 64] };
    return { typeSteps: [-2, -1, 0, 1, 2, 3, 4, 5].map(i => Math.round(body * Math.pow(1.25, i))), spaceSteps: [4, 8, 12, 16, 24, 32, 48, 64, 96] };
  }
  function resName(r) { return r === '32' ? 'light (page\'s own steps)' : r === '8' ? 'strict (4 sizes, 4 spaces)' : 'medium (8 sizes, 9 spaces)'; }
  function normalizeGroups() {
    const g = new Map();
    (state.normalize || []).forEach(n => { const k = `${n.prop}|${n.from}|${n.to}`; const e = g.get(k) || { prop: n.prop, from: n.from, to: n.to, els: [] }; e.els.push(selectorOf(n.el)); g.set(k, e); });
    return Array.from(g.values()).sort((a, b) => b.els.length - a.els.length);
  }

  // ------------------------------------------------------------ foundation panel (inspect and edit the scales)
  let foundEl = null;
  function toggleFoundationPanel() { if (foundEl) closeFoundationPanel(); else renderFoundationPanel(); }
  function closeFoundationPanel() { if (foundEl) { foundEl.remove(); foundEl = null; } const b = $('#jig-found-btn'); if (b) b.classList.remove('on'); }
  function renderFoundationPanel() {
    if (foundEl) foundEl.remove();
    const F = state.F; foundEl = document.createElement('div'); foundEl.id = 'jig-found';
    const inf = F.mode === 'inferred' || F.mode === 'vars';
    const stepRows = (steps, kind) => steps.map((st, i) => `<div class="frow"><input data-k="${kind}" data-i="${i}" data-f="token" value="${esc(st.token)}" title="token name"><input data-k="${kind}" data-i="${i}" data-f="px" type="number" value="${st.px}" title="px"><button class="x" data-del="${kind}:${i}" title="remove">×</button></div>${st.observed && st.observed.length > 1 ? `<small class="o">observed ${st.observed.join(', ')}</small>` : ''}`).join('');
    const fb = $('#jig-found-btn'); if (fb) fb.classList.add('on');
    foundEl.innerHTML = `
      <button class="x close" id="jf-close" title="close (Esc)" style="position:absolute;top:10px;right:10px">×</button>
      <h5>foundation <i>${esc(F.name)}</i></h5>
      <p class="lead">${esc(state.foundationSource)}. ${inf ? 'These are a reading of the page, not a decision. Rename, retune, add or remove steps; the controls and the patch follow.' : 'Edit here to try a different scale on this page; the patch will carry the change as a proposal.'}</p>
      <h6>type ramp (px)</h6><div id="jf-type">${stepRows(F.type.steps, 'type')}</div><button data-add="type">+ step</button>
      <h6>spacing (px)</h6><div id="jf-space">${stepRows(F.spacingSteps, 'space')}</div><button data-add="space">+ step</button>
      <h6>grid</h6><div class="grid4">${['columns', 'gutter', 'margin', 'maxWidth'].map(k => `<div><label>${k}</label><input data-g="${k}" type="number" value="${F.grid[k]}"></div>`).join('')}</div>
      <h6>buttons</h6><p class="lead">${F.buttons.mode === 'measured' ? `measured: ${F.buttons.sizes.map(x => `${x.token} ${x.h}px`).join(' · ')}; variants ${F.buttons.variants.map(x => x.token).join(', ')}` : `classes: ${F.buttons.classPrefix}{${F.buttons.sizes.join('|')}} · {${F.buttons.variants.join('|')}}`}</p>
      <div class="actions"><button class="primary" id="jf-apply">Apply to page</button><button id="jf-canon" title="replace the scales with a modular type scale off the body size and a 4/8/12/16/24/32/48/64 ladder">Canonical</button><button id="jf-remember">Remember for this site</button><button id="jf-forget">Forget</button><button id="jf-copy">Copy foundation.json</button><button id="jf-reinfer">Re-infer</button></div>`;
    document.body.appendChild(foundEl);
    const readBack = () => {
      const steps = kind => { const rows = {}; $$(`input[data-k="${kind}"]`, foundEl).forEach(inp => { (rows[inp.dataset.i] = rows[inp.dataset.i] || {})[inp.dataset.f] = inp.dataset.f === 'px' ? +inp.value : inp.value.trim(); }); return Object.values(rows).filter(r => r.token).sort((a, b) => a.px - b.px); };
      const t = steps('type'), sp = steps('space');
      F.type = { ramp: t.map(x => x.token), sizes: Object.fromEntries(t.map(x => [x.token, x.px])), edited: true };
      F.spacing = sp.map(x => x.px); F.spacingEdited = sp;
      const mwBefore = F.grid.maxWidth;
      ['columns', 'gutter', 'margin', 'maxWidth'].forEach(k => { F.grid[k] = +$(`input[data-g="${k}"]`, foundEl).value || F.grid[k]; });
      if (F.grid.maxWidth !== mwBefore || F.grid.margin) gridAnchor = null;   // a hand-set width or margin wins over the detected container
      F.edited = true; delete F.type.steps; delete F.spacingSteps; resolveFoundation();
    };
    foundEl.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      const syncSpace = () => { F.spacing = F.spacingEdited.map(x => x.px); };
      if (b.dataset.add) { readBack(); if (b.dataset.add === 'type') { F.type.ramp.push('new'); F.type.sizes.new = 0; } else { F.spacingEdited.push({ token: 'new', px: 0 }); syncSpace(); } delete F.type.steps; delete F.spacingSteps; resolveFoundation(); renderFoundationPanel(); return; }
      if (b.dataset.del) { const [k, i] = b.dataset.del.split(':'); readBack(); if (k === 'type') { const tok = F.type.ramp.splice(+i, 1)[0]; delete F.type.sizes[tok]; } else { F.spacingEdited.splice(+i, 1); syncSpace(); } delete F.type.steps; delete F.spacingSteps; resolveFoundation(); renderFoundationPanel(); return; }
      if (b.id === 'jf-close') { closeFoundationPanel(); return; }
      if (b.id === 'jf-canon') {
        // body stays what the page uses; everything else becomes a 1.25 modular scale around it, spacing a clean ladder
        const bodyStep = (F.type.steps || []).find(x => x.token === 'md' || x.token === 'body') || (F.type.steps || [])[0];
        const body = bodyStep ? Math.round(bodyStep.px) : 16;
        const names = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'];
        const sizes = {}; names.forEach((n, i) => { sizes[n] = Math.round(body * Math.pow(1.25, i - 2)); });
        F.type = { ramp: names, sizes, edited: true };
        F.spacingEdited = [4, 8, 12, 16, 24, 32, 48, 64, 96].map(v => ({ token: String(v), px: v })); F.spacing = F.spacingEdited.map(x => x.px);
        F.edited = true; delete F.type.steps; delete F.spacingSteps; resolveFoundation(); rewire(); renderFoundationPanel();
        if (state.normalize) { normalizePage(false); normalizePage(true); }
        return;
      }
      if (b.id === 'jf-apply') { readBack(); rewire(); renderFoundationPanel(); flashBtn(b, 'Applied'); }
      if (b.id === 'jf-remember') { readBack(); safeSet('jig-foundation:' + location.host, JSON.stringify(exportFoundation())); state.foundationSource = 'edited in the jig (saved for this site)'; renderHUD(); flashBtn(b, 'Saved'); }
      if (b.id === 'jf-forget') { try { localStorage.removeItem('__jig-foundation:' + location.host); } catch (x) {} flashBtn(b, 'Forgotten; reload to re-infer'); }
      if (b.id === 'jf-copy') { readBack(); navigator.clipboard.writeText(JSON.stringify(exportFoundation(), null, 2)).then(() => flashBtn(b, 'Copied')).catch(() => flashBtn(b, 'Clipboard blocked')); }
      if (b.id === 'jf-reinfer') { try { localStorage.removeItem('__jig-foundation:' + location.host); } catch (x) {} state.F = inferFromPage(); state.foundationSource = 'inferred from this page'; rewire(); renderFoundationPanel(); }
    };
  }
  function flashBtn(b, msg) { const t = b.textContent; b.textContent = msg; setTimeout(() => (b.textContent = t), 1600); }
  function exportFoundation() {
    const F = state.F; const steps = F.type.steps || [];
    const G = F.grid.desktop ? { ...F.grid.desktop, maxWidth: F.grid.maxWidth, phone: { columns: F.grid.columns, gutter: F.grid.gutter, margin: F.grid.margin } } : { columns: F.grid.columns, gutter: F.grid.gutter, margin: F.grid.margin, maxWidth: F.grid.maxWidth, phone: F.grid.phone || { columns: 4, gutter: 16, margin: 16 } };
    return { name: F.name, version: 1, grid: G, breakpoints: F.breakpoints || DEFAULT_FOUNDATION.breakpoints,
      spacing: (F.spacingSteps || []).map(x => x.px), type: { ramp: steps.map(x => x.token), sizes: Object.fromEntries(steps.map(x => [x.token, x.px])) },
      buttons: F.buttons.mode === 'measured' ? { sizes: F.buttons.sizes.map(x => x.token), variants: F.buttons.variants.map(x => x.token), classPrefix: 'btn-', measured: { sizes: F.buttons.sizes, variants: F.buttons.variants } } : F.buttons, protect: F.protect };
  }

  // ------------------------------------------------------------ device preview
  let deviceEl = null;
  function openDevice(id) {
    closeDevice();
    const d = DEVICES.find(x => x.id === id); if (!d) return;
    state.device = d; deselect();
    const u = new URL(location.href); u.searchParams.set('jig', 'embed'); u.searchParams.set('device', d.id); u.searchParams.set('jigs', Array.from(state.jigs).join(','));
    deviceEl = document.createElement('div'); deviceEl.id = 'jig-device';
    deviceEl.innerHTML = `<button class="close" title="close">×</button><div class="shell"><div class="cap">${d.name} · ${d.w}×${d.h} · changes here are tagged ${d.bp}</div><iframe width="${d.w}" height="${d.h}" style="width:${d.w}px !important;height:${d.h}px !important" title="${d.name} preview"></iframe></div>`;
    document.body.appendChild(deviceEl);
    const fr = $('iframe', deviceEl); fr.src = u.toString();
    fr.onload = () => {
      // a page that doesn't ship jig.js (bookmarklet use) gets it injected into the frame
      try {
        const w = fr.contentWindow;
        if (w && !w.__jig && SCRIPT_SRC) { const sc = w.document.createElement('script'); sc.src = SCRIPT_SRC; sc.dataset.jigInjected = '1'; w.document.body.appendChild(sc); }
      } catch (e) {}
      if (state.grid) setTimeout(() => fr.contentWindow && fr.contentWindow.postMessage({ jig: 'grid', on: true }, '*'), 600);
    };
    const fit = () => { const sh = $('.shell', deviceEl); const sc = Math.min(1, (window.innerHeight - 90) / (d.h + 28), (window.innerWidth - 400) / (d.w + 28)); sh.style.transform = `scale(${sc})`; };
    fit(); on(window, 'resize', fit);
    gridEl.hidden = true; $('#jig-bp').textContent = `${d.name} · ${d.w}px`; syncDeviceBtn();
    $('.close', deviceEl).onclick = closeDevice;
    on(deviceEl, 'click', e => { if (e.target === deviceEl) closeDevice(); });
  }
  function syncDeviceBtn() {
    const b = $('#jig-device-btn'); if (!b) return;
    const d = state.device; b.textContent = d ? `${d.name} ▾` : 'device ▾'; b.classList.toggle('on', !!d);
    $$('#jig-device-menu [data-device]').forEach(m => m.classList.toggle('on', !!d && m.dataset.device === d.id));
    const back = $('#jig-device-menu .back'); if (back) back.hidden = !d;
  }
  function closeDevice() {
    if (deviceEl) { deviceEl.remove(); deviceEl = null; }
    state.device = null; syncDeviceBtn();
    if (state.grid) { gridEl.hidden = false; drawGrid(); }
    // keep frame changes in the patch until reset; they were real
    renderHUD();
  }

  // ------------------------------------------------------------ boot
  async function boot() {
    await loadFoundation();
    document.head.appendChild(style);
    document.body.appendChild(measureEl); measureEl.remove();
    resolveFoundation();
    document.body.append(gridEl, badge, toolbar);
    const dev = DEVICES.find(d => d.id === DEVICE);
    state.bp = dev ? dev.bp : (window.innerWidth <= (state.F.breakpoints && state.F.breakpoints.phone || 480) + 40 ? 'phone' : 'desktop');
    if (state.bp === 'phone') {
      // phones get their own grid; the desktop one is kept for the patch header
      const G = state.F.grid; const P = G.phone || { columns: 4, gutter: 16, margin: 16 };
      state.F.grid = { ...G, desktop: { columns: G.columns, gutter: G.gutter, margin: G.margin }, columns: P.columns, gutter: P.gutter, margin: P.margin, maxWidth: window.innerWidth };
    }
    wire();
    if (EMBED) {
      // inside a device frame: no HUD; the parent page's HUD collects our changes and drives the grid
      (url.searchParams.get('jigs') || '').split(',').filter(Boolean).forEach(id => state.jigs.add(id));
      $$('.jig-el').forEach(el => el.classList.toggle('jig-active', state.jigs.has(groupOf(el.dataset.jigCtl))));
      on(window, 'message', e => { if (e.data && e.data.jig === 'jigs') { state.jigs = new Set(e.data.jigs); $$('.jig-el').forEach(el => el.classList.toggle('jig-active', state.jigs.has(groupOf(el.dataset.jigCtl)))); if (state.selected && !state.selected.classList.contains('jig-active')) deselect(); paintAX(); } });
      on(window, 'message', e => { if (e.data && e.data.jig === 'grid') { if (e.data.columns) { state.F.grid.columns = e.data.columns; if (state.grid) drawGrid(); } toggleGrid(!!e.data.on); } });
      const imgs0 = $$('img').filter(i => !i.complete);
      await Promise.all(imgs0.map(i => new Promise(r => { i.onload = i.onerror = r; })));
      scanProtection();
      window.__jig = { state, patch: buildPatch, scan: scanProtection, Controls, embed: true };
      return;
    }
    document.body.append(hud);
    on(window, 'message', e => { if (e.data && e.data.jig === 'frame') { state.frame = { changes: e.data.changes || [], warnings: e.data.warnings || [], device: e.data.device, bp: e.data.bp }; renderHUD(); } });
    $('#jig-min-btn').onclick = e => { e.stopPropagation(); hud.classList.toggle('collapsed'); $('#jig-min-btn').textContent = hud.classList.contains('collapsed') ? '+' : '–'; };
    const devBtn = $('#jig-device-btn'), devMenu = $('#jig-device-menu');
    const showDevMenu = show => { devMenu.hidden = !show; devBtn.setAttribute('aria-expanded', show ? 'true' : 'false'); };
    devBtn.onclick = e => { e.stopPropagation(); showDevMenu(devMenu.hidden); };
    $$('[data-device]', devMenu).forEach(m => m.onclick = e => { e.stopPropagation(); showDevMenu(false); if (m.dataset.device) openDevice(m.dataset.device); else closeDevice(); });
    on(document, 'pointerdown', e => { if (!devMenu.hidden && !e.target.closest('.devwrap')) showDevMenu(false); }, true);
    syncDeviceBtn();
    try { JSON.parse(safeGet('jig-jigs:' + location.host) || '[]').forEach(id => state.jigs.add(id)); } catch (e) {}
    const applyJigs = () => {
      $$('[data-jig-toggle]', hud).forEach(b => { const on = state.jigs.has(b.dataset.jigToggle); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      $$('.jig-el').forEach(el => { const on = state.jigs.has(groupOf(el.dataset.jigCtl)); el.classList.toggle('jig-active', on); if (!on && el === state.selected) { el.classList.remove('jig-selected'); state.selected = null; toolbar.hidden = true; } });
      safeSet('jig-jigs:' + location.host, JSON.stringify(Array.from(state.jigs)));
      const fr = deviceEl && $('iframe', deviceEl); if (fr && fr.contentWindow) fr.contentWindow.postMessage({ jig: 'jigs', jigs: Array.from(state.jigs) }, '*');
      paintAX(); renderHUD();
    };
    $$('[data-jig-toggle]', hud).forEach(b => b.onclick = () => { const id = b.dataset.jigToggle; if (state.jigs.has(id)) state.jigs.delete(id); else state.jigs.add(id); applyJigs(); });
    applyJigs();
    $('#jig-grid-btn').onclick = () => toggleGrid();
    const setAdv = on => { hud.classList.toggle('advanced', on); $('#jig-adv-btn').classList.toggle('on', on); safeSet('jig-advanced', on ? '1' : '0'); };
    setAdv(safeGet('jig-advanced') === '1');
    $('#jig-adv-btn').onclick = () => setAdv(!hud.classList.contains('advanced'));
    const colSel = $('#jig-cols-sel'); const colOpts = Array.from(new Set([2, 3, 4, 5, 6, 8, 10, 12, 16, state.F.grid.columns])).sort((a, b) => a - b);
    colSel.innerHTML = colOpts.map(n => `<option value="${n}"${n === state.F.grid.columns ? ' selected' : ''}>${n} col</option>`).join('');
    const origCols = state.F.grid.columns;
    colSel.onchange = e => {
      const fr = deviceEl && $('iframe', deviceEl);
      if (fr && fr.contentWindow) { fr.contentWindow.postMessage({ jig: 'grid', on: state.grid, columns: +e.target.value }, '*'); return; }   // frame open: columns belong to the frame
      state.F.grid.columns = +e.target.value; if (state.grid) drawGrid();
      const k = 'foundation::grid';
      if (state.F.grid.columns === origCols) state.changes.delete(k);
      else state.changes.set(k, { el: ':root', name: 'Foundation', ctl: 'foundation', bp: state.bp, grid: { columns: state.F.grid.columns }, summary: `grid ${origCols} → ${state.F.grid.columns} columns` });
      renderHUD();
    };
    $('#jig-scan-btn').onclick = scanProtection;
    $('#jig-found-btn').onclick = toggleFoundationPanel;
    $('#jig-norm-btn').onclick = () => normalizePage(!state.normalize);
    $('#jig-q-res').onchange = () => { if (state.normalize) { normalizePage(false); normalizePage(true); } };
    $('#jig-reset-btn').onclick = () => { normalizePage(false); $$('.jig-el').forEach(el => el.__jigReset && el.__jigReset()); state.changes.clear(); state.frame = { changes: [], warnings: [] }; closeDevice(); scanProtection(); };
    $('#jig-copy-btn').onclick = copyPatch;

    // HUD drag
    let d = null; const hdr = $('header', hud);
    on(hdr, 'pointerdown', e => { if (e.target.closest('.min')) return; d = { x: e.clientX - hud.offsetLeft, y: e.clientY - hud.offsetTop }; hdr.setPointerCapture(e.pointerId); });
    on(hdr, 'pointermove', e => { if (!d || window.innerWidth <= 640) return; hud.style.left = `${e.clientX - d.x}px`; hud.style.top = `${e.clientY - d.y}px`; hud.style.right = 'auto'; });
    on(hdr, 'pointerup', e => { if (e.target.closest('.min')) { d = null; return; } const moved = d && (Math.abs(e.clientX - d.x - hud.offsetLeft) > 4 || Math.abs(e.clientY - d.y - hud.offsetTop) > 4); d = null; if (window.innerWidth <= 640 && !moved) hud.classList.toggle('collapsed'); });
    if (window.innerWidth <= 640) hud.classList.add('collapsed');
    // first scan once images are in
    const imgs = $$('img').filter(i => !i.complete);
    await Promise.all(imgs.map(i => new Promise(r => { i.onload = i.onerror = r; })));
    scanProtection();
    window.__jig = { state, patch: buildPatch, scan: scanProtection, Controls };
    console.log('%cjig studio%c ready · ' + $$('.jig-el').length + ' elements · foundation ' + state.F.name, 'color:#3f6fff;font-weight:700', '');
  }
  function r1(v) { return Math.round(v * 10) / 10; }
  function r2(v) { return Math.round(v * 100) / 100; }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
