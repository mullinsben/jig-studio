/*! Jig Studio · jig.js · MIT
 *  Drop-in presentation jig. Add ?jig to any URL on a site that loads this script.
 *  Drag, pinch, and step things on the live page; copy the patch; hand it to an AI.
 *  The jig never writes to your site. It proposes. See README.md.
 */
(function () {
  'use strict';

  // ------------------------------------------------------------ activation
  const url = new URL(location.href);
  const wanted = url.searchParams.has('jig') || location.hash === '#jig' || safeGet('jig') === '1';
  if (!wanted) return;
  if (window.__jig) return;

  const SCRIPT = document.currentScript;
  const DEFAULT_FOUNDATION = {
    name: 'inferred', version: 0,
    grid: { columns: 12, gutter: 24, margin: 32, maxWidth: 1200 },
    breakpoints: { phone: 390, desktop: 1440 },
    spacing: [4, 8, 12, 16, 24, 32, 48, 64, 96],
    type: { ramp: ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] },
    buttons: { sizes: ['sm', 'md', 'lg'], variants: ['primary', 'secondary', 'ghost'], classPrefix: 'btn-' },
    protect: { safeInset: 24, minContrast: 4.5, minTapTarget: 44, textOverImage: 'warn' }
  };

  const state = {
    F: null,                 // foundation
    foundationSource: '',
    changes: new Map(),      // key -> change record
    warnings: [],
    grid: false,
    selected: null,
    bp: 'desktop'
  };

  function safeGet(k) { try { return localStorage.getItem('__' + k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem('__' + k, v); } catch (e) {} }

  // ------------------------------------------------------------ foundation
  async function loadFoundation() {
    const inline = document.getElementById('jig-foundation');
    if (inline && inline.textContent.trim()) {
      try { state.F = JSON.parse(inline.textContent); state.foundationSource = 'inline'; return; } catch (e) {}
    }
    const src = (SCRIPT && SCRIPT.dataset.foundation) || document.body.dataset.jigFoundation || 'jig.foundation.json';
    try {
      const r = await fetch(src, { cache: 'no-store' });
      if (r.ok) { state.F = await r.json(); state.foundationSource = src; return; }
    } catch (e) {}
    state.F = DEFAULT_FOUNDATION; state.foundationSource = 'default (no foundation file found)';
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
  function rampPx() {
    return state.F.type.ramp.map(t => ({ token: t, px: varPx('--text-' + t) }));
  }
  function nearest(list, value, get) {
    let best = list[0], d = Infinity;
    for (const it of list) { const dd = Math.abs((get ? get(it) : it) - value); if (dd < d) { d = dd; best = it; } }
    return best;
  }

  // ------------------------------------------------------------ change log
  function record(el, ctl, data, summary) {
    const k = keyOf(el, ctl);
    const base = { el: selectorOf(el), name: nameOf(el), ctl, bp: state.bp };
    state.changes.set(k, Object.assign(base, data, { summary }));
    renderHUD();
  }
  function unrecord(el, ctl) { state.changes.delete(keyOf(el, ctl)); renderHUD(); }

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
        tr: el.style.transform || '', to: el.style.transformOrigin || ''
      };
      const parent = el.parentElement;
      if (isImg && css(parent).overflow === 'visible') parent.style.overflow = 'hidden';
      let [ox, oy] = parsePos(orig.op);
      let zoom = 1;
      el.__jigOrig = orig;
      el.style.cursor = 'grab';

      let drag = null;
      on(el, 'pointerdown', e => {
        if (e.button !== 0) return;
        e.preventDefault(); el.setPointerCapture(e.pointerId);
        drag = { x: e.clientX, y: e.clientY, ox, oy }; el.style.cursor = 'grabbing';
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
      const end = () => { if (drag) { drag = null; el.style.cursor = 'grab'; commit(); } };
      on(el, 'pointerup', end); on(el, 'pointercancel', end);
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
      el.__jigToolbar = () => [
        btn('−', () => setZoom(zoom - 0.1)), chip(() => (isImg ? r2(zoom).toFixed(2) + '×' : 'pan')), btn('+', () => setZoom(zoom + 0.1)),
        sep(), btn('←', () => nudge(-1, 0)), btn('→', () => nudge(1, 0)), btn('↑', () => nudge(0, -1)), btn('↓', () => nudge(0, 1))
      ];
      function nudge(dx, dy) { ox = clamp(ox + dx, 0, 100); oy = clamp(oy + dy, 0, 100); apply(); commit(); }
      el.__jigNudge = nudge;

      function apply() {
        const pos = `${r1(ox)}% ${r1(oy)}%`;
        if (isImg) {
          el.style.objectPosition = pos;
          el.style.transformOrigin = pos;
          el.style.transform = zoom !== 1 ? `scale(${r2(zoom)})` : '';
        } else el.style.backgroundPosition = pos;
        setBadge(el, `${isImg ? 'object' : 'background'}-position ${pos}${zoom !== 1 ? ' · zoom ' + r2(zoom) : ''}`);
      }
      function commit() {
        const same = parsePos(orig.op).join() === [r1(ox), r1(oy)].join() && zoom === 1;
        if (same) return unrecord(el, 'crop');
        const data = isImg ? { objectPosition: `${r1(ox)}% ${r1(oy)}%`, ...(zoom !== 1 ? { zoom: r2(zoom) } : {}) } : { backgroundPosition: `${r1(ox)}% ${r1(oy)}%` };
        record(el, 'crop', data, `crop moved to ${r1(ox)}% ${r1(oy)}%${zoom !== 1 ? ', zoom ' + r2(zoom) + '×' : ''}`);
      }
      el.__jigReset = () => { ox = parsePos(orig.op)[0]; oy = parsePos(orig.op)[1]; zoom = 1; apply(); unrecord(el, 'crop'); };
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
    const s = Math.max(W / nw, H / nh) * z;
    return { ovx: nw * s - W, ovy: nh * s - H };
  }

  // --- heading: step up / down the type ramp -------------------------------
  Controls.heading = {
    match: el => true,
    label: 'heading · − / + steps the ramp · pinch also works',
    init(el) {
      const ramp = rampPx();
      const origPx = px(css(el).fontSize);
      const origTok = nearest(ramp, origPx, r => r.px).token;
      let idx = ramp.findIndex(r => r.token === origTok);
      const origIdx = idx;
      el.__jigToolbar = () => [
        btn('−', () => step(-1)), chip(() => state.F.type.ramp[idx]), btn('+', () => step(1))
      ];
      on(el, 'wheel', e => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); step(e.deltaY < 0 ? 1 : -1); }, { passive: false });
      function step(d) {
        idx = clamp(idx + d, 0, ramp.length - 1);
        el.style.fontSize = `var(--text-${ramp[idx].token})`;
        el.style.fontWeight = '';
        setBadge(el, `--text-${ramp[idx].token}`);
        if (idx === origIdx) unrecord(el, 'heading');
        else record(el, 'heading', { from: origTok, to: ramp[idx].token, step: idx - origIdx },
          `ramp ${origTok} → ${ramp[idx].token} (${idx - origIdx > 0 ? '+' : ''}${idx - origIdx})`);
        refreshToolbar(el);
      }
      el.__jigReset = () => { idx = origIdx; el.style.fontSize = ''; unrecord(el, 'heading'); refreshToolbar(el); };
    }
  };

  // --- text: drag inside container, snapped to grid columns ----------------
  Controls.text = {
    match: el => true,
    label: 'text · drag to place · snaps to columns and the spacing scale',
    init(el) {
      const parent = el.offsetParent || el.parentElement;
      const isAbs = css(el).position === 'absolute';
      const orig = { ml: el.style.marginLeft, mt: el.style.marginTop, mw: el.style.maxWidth, ai: el.style.alignItems, ta: el.style.textAlign, inset: el.style.inset };
      let cols = 0, rowTok = 0, anchor = null;
      el.style.cursor = 'move';
      let drag = null;
      on(el, 'pointerdown', e => {
        if (e.target.closest('a, button')) return;
        e.preventDefault(); el.setPointerCapture(e.pointerId);
        drag = { x: e.clientX, y: e.clientY, cols, rowTok };
      });
      on(el, 'pointermove', e => {
        if (!drag) return;
        const colW = colWidth(parent);
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (isAbs) {
          // overlay copy (banner): choose a 9-point anchor from pointer position in parent
          const r = parent.getBoundingClientRect();
          const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
          const h = fx < 1 / 3 ? 'left' : fx > 2 / 3 ? 'right' : 'center';
          const v = fy < 1 / 3 ? 'top' : fy > 2 / 3 ? 'bottom' : 'center';
          anchor = `${v}-${h}`;
          el.style.justifyContent = v === 'top' ? 'flex-start' : v === 'bottom' ? 'flex-end' : 'center';
          el.style.alignItems = h === 'left' ? 'flex-start' : h === 'right' ? 'flex-end' : 'center';
          el.style.textAlign = h;
          setBadge(el, `anchor ${anchor}`);
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
      const end = () => { if (!drag) return; drag = null; commit(); };
      on(el, 'pointerup', end); on(el, 'pointercancel', end);
      on(el, 'wheel', e => {
        if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault();
        const cur = px(el.style.maxWidth) || el.getBoundingClientRect().width;
        const colW = colWidth(parent);
        const c = clamp(Math.round(cur / colW) + (e.deltaY < 0 ? 1 : -1), 2, state.F.grid.columns);
        el.style.maxWidth = `calc(${c} * (100% + ${state.F.grid.gutter}px) / ${state.F.grid.columns} - ${state.F.grid.gutter}px)`;
        el.dataset.jigCols = c; setBadge(el, `max-width ${c} cols`); commit();
      }, { passive: false });
      function commit() {
        const data = {}; const bits = [];
        if (anchor) { data.anchor = anchor; bits.push('anchor ' + anchor); }
        if (cols) { data.offsetCols = cols; bits.push(`+${cols} col`); }
        if (rowTok) { data.offsetY = rowTok; bits.push(`y ${rowTok}px`); }
        if (el.dataset.jigCols) { data.maxWidthCols = +el.dataset.jigCols; bits.push(`max ${el.dataset.jigCols} cols`); }
        if (!bits.length) return unrecord(el, 'text');
        record(el, 'text', data, 'moved: ' + bits.join(', '));
      }
      el.__jigReset = () => {
        Object.assign(el.style, { marginLeft: orig.ml, marginTop: orig.mt, maxWidth: orig.mw, alignItems: orig.ai, textAlign: orig.ta, justifyContent: '' });
        delete el.dataset.jigCols; cols = 0; rowTok = 0; anchor = null; unrecord(el, 'text');
      };
    }
  };
  function colWidth(parent) {
    const w = parent.getBoundingClientRect().width;
    return (w + state.F.grid.gutter) / state.F.grid.columns;
  }

  // --- button: size and variant steppers -----------------------------------
  Controls.button = {
    match: el => true,
    label: 'button · size and variant come from the foundation',
    init(el) {
      const B = state.F.buttons, P = B.classPrefix || 'btn-';
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
        refreshToolbar(el); scanProtection();
      }
      el.__jigReset = () => { el.classList.remove(P + size, P + variant); el.classList.add(P + origSize, P + origVar); size = origSize; variant = origVar; unrecord(el, 'button'); refreshToolbar(el); };
    }
  };

  // --- section: padding on the spacing scale --------------------------------
  Controls.section = {
    match: el => true,
    label: 'section · − / + steps vertical padding on the spacing scale',
    init(el) {
      const sp = state.F.spacing;
      const origTop = px(css(el).paddingTop);
      let idx = sp.indexOf(nearest(sp, origTop)); const origIdx = idx;
      el.__jigToolbar = () => [btn('−', () => step(-1)), chip(() => `pad ${sp[idx]}`), btn('+', () => step(1))];
      function step(d) {
        idx = clamp(idx + d, 0, sp.length - 1);
        el.style.paddingBlock = `var(--space-${sp[idx]}, ${sp[idx]}px)`;
        setBadge(el, `padding-block --space-${sp[idx]}`);
        if (idx === origIdx) unrecord(el, 'spacing');
        else record(el, 'spacing', { paddingY: sp[idx] }, `padding ${sp[origIdx]} → ${sp[idx]}`);
        refreshToolbar(el);
      }
      el.__jigReset = () => { idx = origIdx; el.style.paddingBlock = ''; unrecord(el, 'spacing'); refreshToolbar(el); };
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
    }
  };

  // ------------------------------------------------------------ wiring
  const listeners = [];
  function on(el, ev, fn, opt) { el.addEventListener(ev, fn, opt); listeners.push([el, ev, fn, opt]); }

  // Auto-targeting: the jig finds its own targets. data-jig="<ctl>" forces a control,
  // data-jig="off" excludes an element (and its subtree), data-jig-name names it.
  function autoTargets() {
    const out = new Map(); // el -> ctl
    const skip = el => !el.offsetParent && css(el).position !== 'fixed' || el.closest('#jig-hud, .jig-tb, [data-jig="off"]');
    const add = (el, ctl) => { if (!out.has(el) && !skip(el) && Controls[ctl]) out.set(el, ctl); };
    // explicit first
    $$('[data-jig]').forEach(el => { const c = el.dataset.jig; if (c && c !== 'off') add(el, c); });
    // crop: cover-fit images and background images of a useful size
    $$('img').forEach(img => { const r = img.getBoundingClientRect(); if (r.width >= 80 && r.height >= 80 && /cover|none/.test(css(img).objectFit)) add(img, 'crop'); });
    $$('body *').forEach(el => { if (el.tagName === 'IMG') return; const bg = css(el).backgroundImage; if (bg && bg !== 'none' && /url\(/.test(bg)) { const r = el.getBoundingClientRect(); if (r.width >= 80 && r.height >= 80) add(el, 'crop'); } });
    // headings
    $$('h1,h2,h3,h4,h5,h6').forEach(h => add(h, 'heading'));
    // buttons: anything using the foundation's button classes, plus real buttons
    const P = (state.F.buttons && state.F.buttons.classPrefix) || 'btn-';
    $$(`a[class*="${P}"], button, [role="button"], a.btn`).forEach(b => add(b, 'button'));
    // sections: top-level landmarks
    $$('body > section, main > section, body > main > section, section[id]').forEach(sec => add(sec, 'section'));
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
      if (ctl === 'heading' && !state.F.type) continue;
      if (ctl === 'button' && !state.F.buttons) continue;
      el.classList.add('jig-el'); el.dataset.jigCtl = ctl;
      C.init(el);
      on(el, 'pointerenter', () => hover(el));
      on(el, 'pointerleave', () => hover(null));
      on(el, 'click', e => { if (ctl !== 'crop' && e.target.closest('a, button')) e.preventDefault(); e.stopPropagation(); select(el); });
    }
  }

  // ------------------------------------------------------------ overlay UI
  const style = document.createElement('style');
  style.id = 'jig-style';
  style.textContent = `
    .jig-el { outline: 1.5px dashed rgba(224,122,31,.55); outline-offset: 2px; }
    .jig-el:hover, .jig-el.jig-selected { outline: 2px solid #e07a1f; }
    .jig-badge { position: fixed; z-index: 2147483646; pointer-events: none; font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
      background: #1b1612; color: #ffe8c9; padding: 3px 7px; border-radius: 4px; white-space: nowrap; transform: translate(0,-110%); box-shadow: 0 2px 8px rgba(0,0,0,.3); }
    .jig-tb { position: fixed; z-index: 2147483646; display: flex; gap: 4px; align-items: center; background: #1b1612; border-radius: 8px; padding: 4px; box-shadow: 0 4px 16px rgba(0,0,0,.35); }
    .jig-tb button { font: 600 13px ui-sans-serif, system-ui; background: #3a2f26; color: #fff; border: 0; border-radius: 6px; width: 28px; height: 28px; cursor: pointer; }
    .jig-tb button:hover { background: #e07a1f; }
    .jig-tb .chip { font: 11px ui-monospace, Menlo, monospace; color: #ffe8c9; padding: 0 6px; min-width: 34px; text-align: center; }
    .jig-tb .sep { width: 1px; height: 18px; background: #5a4a3c; margin: 0 2px; }
    #jig-grid { position: absolute; inset: 0; pointer-events: none; z-index: 2147483640; }
    #jig-grid .cols { position: sticky; top: 0; height: 100vh; margin: 0 auto; display: grid; }
    #jig-grid .cols i { background: rgba(224,122,31,.09); border-inline: 1px solid rgba(224,122,31,.35); }
    #jig-hud { position: fixed; top: 16px; right: 16px; width: 340px; max-height: calc(100vh - 32px); display: flex; flex-direction: column; z-index: 2147483647;
      background: #1b1612; color: #f3e9da; border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.45); font: 13px/1.45 ui-sans-serif, system-ui, sans-serif; overflow: hidden; }
    #jig-hud header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: #2b2118; cursor: move; user-select: none; }
    #jig-hud header b { font-size: 14px; letter-spacing: .02em; } #jig-hud header b i { color: #e07a1f; font-style: normal; }
    #jig-hud header small { opacity: .6; margin-left: auto; font-family: ui-monospace, Menlo, monospace; font-size: 11px; }
    #jig-hud .tools { display: flex; gap: 6px; padding: 8px 12px; border-bottom: 1px solid #3a2f26; flex-wrap: wrap; }
    #jig-hud .tools button, #jig-hud footer button { font: 600 12px ui-sans-serif, system-ui; background: #3a2f26; color: #fff; border: 0; border-radius: 6px; padding: 6px 10px; cursor: pointer; }
    #jig-hud .tools button.on { background: #5c6b3a; }
    #jig-hud .tools button:hover, #jig-hud footer button:hover { background: #e07a1f; }
    #jig-hud .list { overflow: auto; padding: 8px 12px; flex: 1; }
    #jig-hud h6 { margin: 8px 0 4px; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; opacity: .6; }
    #jig-hud .row { display: flex; gap: 8px; align-items: baseline; padding: 4px 0; border-bottom: 1px dashed #3a2f26; cursor: pointer; }
    #jig-hud .row:hover { color: #ffe8c9; }
    #jig-hud .row .n { font-weight: 600; min-width: 0; } #jig-hud .row .s { opacity: .8; flex: 1; } #jig-hud .row .x { opacity: .5; }
    #jig-hud .row.warn .n::before { content: "⚠ "; color: #f3b24a; }
    #jig-hud .empty { opacity: .55; padding: 8px 0; }
    #jig-hud footer { display: flex; gap: 6px; padding: 10px 12px; border-top: 1px solid #3a2f26; background: #2b2118; align-items: center; }
    #jig-hud footer button.primary { background: #e07a1f; flex: 1; }
    #jig-hud footer small { opacity: .6; }
    #jig-hud .src { padding: 0 12px 8px; font: 11px ui-monospace, Menlo, monospace; opacity: .55; }
    @media (max-width: 640px) {
      #jig-hud { top: auto; bottom: 0; left: 0; right: 0; width: auto; max-height: 50vh; border-radius: 12px 12px 0 0; }
      #jig-hud header { cursor: pointer; }
      #jig-hud header::before { content: ""; width: 36px; height: 4px; border-radius: 2px; background: #5a4a3c; position: absolute; left: 50%; top: 5px; transform: translateX(-50%); }
      #jig-hud header { position: relative; padding-top: 14px; }
      #jig-hud.collapsed .tools, #jig-hud.collapsed .src, #jig-hud.collapsed .list { display: none; }
      #jig-phone-btn { display: none; }
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

  on(document, 'click', e => {
    if (e.target.closest('#jig-hud, .jig-tb, .jig-el')) return;
    $$('.jig-selected').forEach(x => x.classList.remove('jig-selected')); state.selected = null; toolbar.hidden = true;
  });
  on(window, 'scroll', () => { if (state.selected) refreshToolbar(state.selected); }, { passive: true });
  on(window, 'resize', () => { if (state.selected) refreshToolbar(state.selected); drawGrid(); });
  on(document, 'keydown', e => {
    if (e.key === 'Escape') { $$('.jig-selected').forEach(x => x.classList.remove('jig-selected')); state.selected = null; toolbar.hidden = true; }
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
    cols.style.maxWidth = `${G.maxWidth}px`; cols.style.paddingInline = `${G.margin}px`;
    for (let i = 0; i < G.columns; i++) cols.appendChild(document.createElement('i'));
    gridEl.appendChild(cols);
    gridEl.style.height = `${document.documentElement.scrollHeight}px`;
  }
  function toggleGrid(force) {
    state.grid = force === undefined ? !state.grid : force;
    gridEl.hidden = !state.grid; if (state.grid) drawGrid();
    $('#jig-grid-btn').classList.toggle('on', state.grid);
  }

  // ------------------------------------------------------------ protection scan (AX)
  function scanProtection() {
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
      if (over) {
        bg = sampleImage(over.img, t); how = 'over image';
        if (!bg) { if ((P.textOverImage || 'warn') === 'warn' && !seen.has(over.img)) { seen.add(over.img); W.push({ kind: 'text-over-image', el: t, msg: 'text over an image; contrast could not be sampled (serve over http to enable)' }); } return; }
      } else { bg = solidBehind(t); how = 'on background'; }
      if (!bg) return;
      const ratio = contrast(fg, bg);
      const fs = px(css(t).fontSize), bold = px(css(t).fontWeight) >= 700;
      const large = fs >= 24 || (bold && fs >= 18.66);          // WCAG large text
      const need = large ? Math.min(3, P.minContrast || 4.5) : (P.minContrast || 4.5);
      if (ratio < need) W.push({ kind: 'contrast', el: t, msg: `contrast ${ratio.toFixed(1)} ${how}, min ${need}${large ? ' (large text)' : ''}`, value: +ratio.toFixed(1), min: need });
    });
    state.warnings = W; renderHUD();
  }
  function imageBehind(t) {
    let n = t.parentElement;
    while (n && n !== document.body) {
      const img = Array.from(n.children).find(c => c.tagName === 'IMG' && c !== t && !c.contains(t));
      if (img && css(n).position !== 'static') return { img, box: n };
      if (css(n).backgroundImage !== 'none') return { img: n, box: n };
      n = n.parentElement;
    }
    return null;
  }
  function solidBehind(t) {
    let n = t;
    while (n && n !== document.documentElement) { const c = parseColor(css(n).backgroundColor); if (c && c[3] > 0.9) return c; n = n.parentElement; }
    return parseColor(css(document.body).backgroundColor) || [255, 255, 255, 1];
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
      c.width = 24; c.height = 24; const ctx = c.getContext('2d');
      ctx.drawImage(img, x0, y0, w, h, 0, 0, 24, 24);
      const d = ctx.getImageData(0, 0, 24, 24).data; let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      return [r / n, g / n, b / n, 1];
    } catch (e) { return null; } // tainted canvas (file://) or cross-origin
  }
  function parseColor(s) { const m = (s || '').match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(parseFloat); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
  function lum([r, g, b]) { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
  function contrast(a, b) { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }

  // ------------------------------------------------------------ HUD
  const hud = document.createElement('div'); hud.id = 'jig-hud';
  hud.innerHTML = `
    <header><b>jig <i>studio</i></b><small id="jig-bp"></small></header>
    <div class="tools">
      <button id="jig-grid-btn" title="g">grid</button>
      <button id="jig-scan-btn">rescan</button>
      <button id="jig-phone-btn">phone preview</button>
      <button id="jig-reset-btn">reset all</button>
    </div>
    <div class="src" id="jig-src"></div>
    <div class="list"><h6>changes</h6><div id="jig-changes"></div><h6>protection</h6><div id="jig-warn"></div></div>
    <footer><button class="primary" id="jig-copy-btn">Copy patch</button><small id="jig-count"></small></footer>`;

  function renderHUD() {
    const ch = $('#jig-changes'), wn = $('#jig-warn');
    ch.innerHTML = ''; wn.innerHTML = '';
    if (!state.changes.size) ch.innerHTML = '<div class="empty">Nothing changed yet. Hover anything outlined; drag, pinch, or click it.</div>';
    for (const [k, c] of state.changes) {
      const row = document.createElement('div'); row.className = 'row';
      row.innerHTML = `<span class="n">${esc(c.name)}</span><span class="s">${esc(c.summary)}</span><span class="x" title="reset">×</span>`;
      row.querySelector('.x').onclick = e => { e.stopPropagation(); const el = $(c.el); if (el && el.__jigReset) el.__jigReset(); else state.changes.delete(k); renderHUD(); };
      row.onclick = () => { const el = $(c.el); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); select(el); } };
      ch.appendChild(row);
    }
    if (!state.warnings.length) wn.innerHTML = '<div class="empty">No protection warnings on this page.</div>';
    state.warnings.forEach(w => {
      const row = document.createElement('div'); row.className = 'row warn';
      row.innerHTML = `<span class="n">${esc(nameOf(w.el))}</span><span class="s">${esc(w.msg)}</span>`;
      row.onclick = () => { w.el.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (w.el.classList.contains('jig-el')) select(w.el); };
      wn.appendChild(row);
    });
    $('#jig-count').textContent = `${state.changes.size} change${state.changes.size === 1 ? '' : 's'} · ${state.warnings.length} warning${state.warnings.length === 1 ? '' : 's'}`;
    $('#jig-bp').textContent = `${state.bp} · ${window.innerWidth}px`;
    $('#jig-src').textContent = `foundation: ${state.F.name} (${state.foundationSource})`;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ------------------------------------------------------------ patch
  function buildPatch() {
    const when = new Date(); const stamp = when.toISOString().slice(0, 16).replace('T', ' ');
    const lines = [`# jig patch · ${state.F.name} · ${location.pathname} · ${stamp}`, ''];
    if (!state.changes.size) lines.push('- (no changes)');
    for (const c of state.changes.values()) lines.push(`- ${c.name}: ${c.summary}${c.bp !== 'desktop' ? ` (${c.bp})` : ''}`);
    if (state.warnings.length) { lines.push('', `⚠ ${state.warnings.length} protection warning${state.warnings.length === 1 ? '' : 's'}:`); state.warnings.forEach(w => lines.push(`- ${nameOf(w.el)}: ${w.msg}`)); }
    const json = [];
    for (const c of state.changes.values()) { const { name, summary, ...rest } = c; json.push(rest); }
    state.warnings.forEach(w => json.push({ warn: w.kind, el: selectorOf(w.el), msg: w.msg, ...(w.value ? { value: w.value, min: w.min } : {}) }));
    lines.push('', '---', JSON.stringify(json, null, 2));
    return lines.join('\n');
  }
  async function copyPatch() {
    const text = buildPatch();
    try { await navigator.clipboard.writeText(text); flash('Patch copied. Paste it to your AI.'); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;inset:16px;z-index:2147483647;width:60vw;height:60vh;font:12px monospace'; document.body.appendChild(ta); ta.select(); flash('Clipboard blocked; select the text manually.'); on(ta, 'blur', () => ta.remove()); }
  }
  function flash(msg) { const b = $('#jig-copy-btn'); const t = b.textContent; b.textContent = msg; setTimeout(() => (b.textContent = t), 1800); }

  // ------------------------------------------------------------ boot
  async function boot() {
    await loadFoundation();
    document.head.appendChild(style);
    document.body.append(gridEl, badge, toolbar, hud);
    state.bp = window.innerWidth <= (state.F.breakpoints && state.F.breakpoints.phone || 480) + 40 ? 'phone' : 'desktop';
    wire();
    $('#jig-grid-btn').onclick = () => toggleGrid();
    $('#jig-scan-btn').onclick = scanProtection;
    $('#jig-reset-btn').onclick = () => { $$('.jig-el').forEach(el => el.__jigReset && el.__jigReset()); state.changes.clear(); scanProtection(); };
    $('#jig-copy-btn').onclick = copyPatch;
    $('#jig-phone-btn').onclick = () => { const u = new URL(location.href); u.searchParams.set('jig', '1'); window.open(u, 'jig-phone', `width=${(state.F.breakpoints && state.F.breakpoints.phone) || 390},height=844`); };
    // HUD drag
    let d = null; const hdr = $('header', hud);
    on(hdr, 'pointerdown', e => { d = { x: e.clientX - hud.offsetLeft, y: e.clientY - hud.offsetTop }; hdr.setPointerCapture(e.pointerId); });
    on(hdr, 'pointermove', e => { if (!d || window.innerWidth <= 640) return; hud.style.left = `${e.clientX - d.x}px`; hud.style.top = `${e.clientY - d.y}px`; hud.style.right = 'auto'; });
    on(hdr, 'pointerup', e => { const moved = d && (Math.abs(e.clientX - d.x - hud.offsetLeft) > 4 || Math.abs(e.clientY - d.y - hud.offsetTop) > 4); d = null; if (window.innerWidth <= 640 && !moved) hud.classList.toggle('collapsed'); });
    if (window.innerWidth <= 640) hud.classList.add('collapsed');
    // first scan once images are in
    const imgs = $$('img').filter(i => !i.complete);
    await Promise.all(imgs.map(i => new Promise(r => { i.onload = i.onerror = r; })));
    scanProtection();
    window.__jig = { state, patch: buildPatch, scan: scanProtection, Controls };
    console.log('%cjig studio%c ready · ' + $$('.jig-el').length + ' elements · foundation ' + state.F.name, 'color:#e07a1f;font-weight:700', '');
  }
  function r1(v) { return Math.round(v * 10) / 10; }
  function r2(v) { return Math.round(v * 100) / 100; }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
