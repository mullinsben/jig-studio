/*! Jig Studio · jig.js · MIT
 *  Drop-in presentation jig. Add ?jig to any URL on a site that loads this script.
 *  Drag, pinch, and step things on the live page; copy the patch; hand it to an AI.
 *  The jig never writes to your site. It proposes. See README.md.
 */
(function () {
  'use strict';

  // ------------------------------------------------------------ activation
  const JIG_VERSION = '0.1.0';
  // never the site's content: elements marked off, and the CMS's own chrome a logged-in owner sees (WordPress admin bar)
  const OFF = '[data-jig="off"], #wpadminbar';
  const url = new URL(location.href);
  const wanted = url.searchParams.has('jig') || location.hash === '#jig' || safeGet('jig') === '1' || (document.currentScript && document.currentScript.dataset.jigInjected);
  if (!wanted) return;
  if (window.__jig || window.__jigLoading) return;   // one jig per document; boot is async, so claim the slot now
  window.__jigLoading = true;
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
    protect: { safeInset: 24, minContrast: 4.5, minTapTarget: 24, textOverImage: 'warn' }   // 24px = WCAG 2.2 AA (2.5.8); a foundation can ask for 44 (AAA / Apple HIG)
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
    F.name = ((document.title || '').split(/\s+[-·|–]\s+/)[0].trim() || (location.hostname || 'site').replace(/^www\./, '') || 'page').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); F.mode = 'inferred';
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
    els.forEach(e => { const c = css(e); const k = `${c.backgroundColor}|${c.color}|${c.borderTopColor}`; const v = vmap.get(k) || { bg: c.backgroundColor, fg: c.color, border: px(c.borderTopWidth) ? c.borderTopColor : 'transparent', fw: c.fontWeight, n: 0 }; v.n++; vmap.set(k, v); });
    const vnames = ['primary', 'secondary', 'tertiary', 'ghost', 'link'];
    const weight = v => { const bg = parseColor(v.bg) || [255, 255, 255, 0], fg = parseColor(v.fg) || [0, 0, 0, 1]; const mx = Math.max(bg[0], bg[1], bg[2]), mn = Math.min(bg[0], bg[1], bg[2]); const sat = mx ? (mx - mn) / mx : 0; const dark = 1 - lum(bg); return (bg[3] < 0.1 ? 0 : 1) + sat + dark * 0.8 + (lum(fg) > 0.6 ? 0.5 : 0); };
    const variants = Array.from(vmap.values()).sort((a, b) => weight(b) - weight(a) || b.n - a.n).slice(0, 5).map((v, i) => ({ token: vnames[i], ...v }));
    return { mode: 'measured', sizes, variants, classPrefix: '' };
  }
  function inferGrid() {
    const vw = document.documentElement.clientWidth;
    // centered containers narrower than the viewport, by how often their width recurs; ties go to the wider one
    const els = $$('body *').filter(el => { if (!visible(el)) return false; const r = el.getBoundingClientRect(); return r.width >= vw * 0.5 && r.width <= vw - 16 && Math.abs(r.left - (vw - r.right)) < 3 && r.height >= 40; });
    const byW = new Map(); els.forEach(el => { const w = Math.round(el.getBoundingClientRect().width / 4) * 4; const e = byW.get(w) || { w, n: 0, el, els: [] }; e.n++; e.els.push(el); byW.set(w, e); });
    // the grid belongs on the edge real content sits on (logo, nav, images, headings), not whichever wrapper width recurs most
    const marks = $$('img, svg, picture, video, h1, h2, h3, h4, p, a, button, input').filter(m => visible(m) && !m.closest('#jig-hud, #jig-axtags, .jig-tb')).map(m => Math.round(m.getBoundingClientRect().left));
    const near = x => marks.reduce((n, l) => n + (Math.abs(l - x) <= 2 ? 1 : 0), 0);
    Array.from(byW.values()).forEach(e => { const r = e.el.getBoundingClientRect(); const pl = px(css(e.el).paddingLeft), pr = px(css(e.el).paddingRight);
      const outer = near(r.left), inner = pl > 2 ? near(r.left + pl) : 0;
      e.content = inner > outer; e.aligned = Math.max(outer, inner); e.box = e.content ? { left: r.left + pl, width: r.width - pl - pr } : { left: r.left, width: r.width }; });
    const cands = Array.from(byW.values()); const onEdge = cands.filter(e => e.aligned >= 1).sort((a, b) => b.box.width - a.box.width);
    const best = onEdge[0] || cands.sort((a, b) => b.n - a.n || b.w - a.w)[0];   // the widest centred box real content sits on; inner strips are insets
    gridAnchor = best ? best.el : null; gridAnchorContent = !!(best && best.content); gridInset = null; gridFit = null; gridMeasured = false;
    let columns = 12, gutter = 24, maxWidth = best ? Math.round(best.box.width) : Math.min(1200, vw - 64);
    if (best) {
      // measure the grid the content actually uses: where the blocks start and end, the gap between neighbours, and the column count that puts the most block edges on lines
      const A = best.box; const kids = Array.from(new Set(best.els.flatMap(c => $$('*', c)))).filter(k => { if (!visible(k) || k.closest('#jig-hud, #jig-axtags, .jig-tb')) return false; const r = k.getBoundingClientRect(); return r.height >= 60 && r.width >= 60 && r.left >= A.left - 1 && r.right <= A.left + A.width + 1; }).map(k => { const r = k.getBoundingClientRect(), c = css(k); const pl = px(c.paddingLeft) + px(c.borderLeftWidth), pr = px(c.paddingRight) + px(c.borderRightWidth); return { left: r.left + pl, right: r.right - pr, width: r.width - pl - pr, height: r.height, top: r.top }; });   // content boxes: a Bootstrap column's padding is gutter, not content
      const mode = arr => { const m = new Map(); arr.forEach(v => m.set(v, (m.get(v) || 0) + 1)); return Array.from(m).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]; };
      const wide = kids.filter(r => r.width >= A.width * 0.5);
      if (wide.length >= 2) {
        const l = mode(wide.map(r => Math.round(r.left)))[0], rr = mode(wide.map(r => Math.round(r.right)))[0];
        if (rr - l >= A.width * 0.7) gridInset = { l: l - A.left, r: A.left + A.width - rr };
      }
      // better evidence for the extent: where full-width rows of content start and end. Rows covering under 70% of the box (inner sections) don't vote.
      { const cb0 = k => { const r = k.getBoundingClientRect(), c = css(k); const pl = px(c.paddingLeft) + px(c.borderLeftWidth), pr = px(c.paddingRight) + px(c.borderRightWidth); return { left: r.left + pl, right: r.right - pr, width: r.width - pl - pr, top: r.top, bottom: r.bottom, height: r.height }; };
        const starts = [], ends = [];
        [document.body].forEach(c => $$('*', c).forEach(row => {   // rows anywhere on the page within the grid's range; content often lives outside the box that set the edges
          if (row.children.length < 2 || row.closest('#jig-hud, #jig-axtags, .jig-tb, #jig-grid, #jig-device')) return;
          const ks = Array.from(row.children).filter(visible).map(cb0).filter(k => k.width >= A.width * 0.15 && k.height >= 60 && k.left >= A.left - 2 && k.right <= A.left + A.width + 2);
          const side = ks.filter((k, i) => ks.some((o, j) => j !== i && o.top < k.bottom - 10 && k.top < o.bottom - 10 && (o.left >= k.right - 1 || o.right <= k.left + 1)));
          if (side.length < 2) return; const st = Math.round(Math.min(...side.map(k => k.left))), en = Math.round(Math.max(...side.map(k => k.right)));
          if (en - st >= A.width * 0.7) { starts.push(st); ends.push(en); }
        }));
        const modeBy = (arr, outer) => { const m = new Map(); arr.forEach(v => m.set(v, (m.get(v) || 0) + 1)); return Array.from(m).sort((a, b) => b[1] - a[1] || (outer === 'max' ? b[0] - a[0] : a[0] - b[0]))[0]; };   // ties go to the outermost edge
        if (starts.length >= 2) { const l = modeBy(starts, 'min')[0], rr = modeBy(ends, 'max')[0]; if (rr - l >= A.width * 0.6) gridInset = { l: l - A.left, r: A.left + A.width - rr }; }
      }
      const L0 = A.left + (gridInset ? gridInset.l : 0), W = A.width - (gridInset ? gridInset.l + gridInset.r : 0);
      // page-level rows only: siblings side by side, each a real block (≥15% of the content width). A thumbnail beside its text is a card's layout, not the page's.
      const cbox = k => { const r = k.getBoundingClientRect(), c = css(k); const pl = px(c.paddingLeft) + px(c.borderLeftWidth), pr = px(c.paddingRight) + px(c.borderRightWidth); return { left: r.left + pl, right: r.right - pr, width: r.width - pl - pr, top: r.top, bottom: r.bottom, height: r.height }; };
      const Lset = new Set(), Rset = new Set(), gaps = [], pairs = new Map();   // pairs: right edge + the next block's left edge, one gutter apart; the strongest evidence a grid leaves
      [document.body].forEach(c => $$('*', c).forEach(row => {   // rows anywhere on the page within the grid's range; content often lives outside the box that set the edges
        if (row.children.length < 2 || row.closest('#jig-hud, #jig-axtags, .jig-tb, #jig-grid, #jig-device')) return;
        const ks = Array.from(row.children).filter(visible).map(cbox).filter(k => k.width >= W * 0.15 && k.height >= 60 && k.left >= L0 - 2 && k.right <= L0 + W + 2);
        const side = ks.filter((k, i) => ks.some((o, j) => j !== i && o.top < k.bottom - 10 && k.top < o.bottom - 10 && (o.left >= k.right - 1 || o.right <= k.left + 1)));
        if (side.length < 2) return;
        side.forEach(k => { Lset.add(Math.round(k.left)); Rset.add(Math.round(k.right));
          const nx = side.filter(o => o !== k && o.left >= k.right - 1 && o.top < k.bottom - 10 && k.top < o.bottom - 10).sort((x, y) => x.left - y.left)[0];   // the neighbour to the right in the same row (grids wrap)
          if (nx) { const g = Math.round(nx.left - k.right); if (g >= 4 && g <= 48) { gaps.push(g); const pk = Math.round(k.right) + ',' + Math.round(nx.left); pairs.set(pk, (pairs.get(pk) || 0) + 1); } } });
      }));
      const Ls = Array.from(Lset), Rs = Array.from(Rset);   // each distinct edge counts once: twelve identical teasers don't outvote the page
      // fit gutter and column count together; keep the simplest grid (fewest columns) that lands as many real edges on lines as the best fit does
      const edges = Ls.map(x => x - L0).concat(Rs.map(x => x - L0)).filter(e => e > 2 && e < W - 2);   // the outer edges fit every grid; they prove nothing
      const gapCount = new Map(); gaps.forEach(g => gapCount.set(g, (gapCount.get(g) || 0) + 1));
      const gCands = Array.from(new Set([...gapCount.keys(), 12, 16, 20, 24, 30, 32]));
      const P = Array.from(pairs).map(([k, n]) => { const [r, l] = k.split(',').map(Number); return { r: r - L0, l: l - L0, w: Math.sqrt(n) }; }).filter(p => p.r > 2 && p.l < W - 2);
      gridDebug = { box: [Math.round(A.left), Math.round(A.width)], inset: gridInset, L0: Math.round(L0), W: Math.round(W), pairs: P.length, gaps: gaps.length, els: best.els.length };
      if (P.length >= 2) {
        const fits = []; const total = P.reduce((a, p) => a + p.w, 0);
        gCands.forEach(g => [3, 4, 5, 6, 8, 9, 10, 12, 16, 24].forEach(N => { const cw = (W - (N - 1) * g) / N; if (cw < 16) return;
          const pitch = cw + g; const onR = x => { const k = Math.round((x + g) / pitch); return k >= 1 && k < N && Math.abs(k * pitch - g - x) <= 2; }, onL = x => { const k = Math.round(x / pitch); return k >= 1 && k < N && Math.abs(k * pitch - x) <= 2; };
          const ok = p => Math.abs(p.l - p.r - g) <= 2 && onR(p.r) && onL(p.l);
          fits.push({ N, g, hit: P.reduce((a, p) => a + (ok(p) ? p.w : 0), 0) / total, n: P.filter(ok).length, rep: P.reduce((a, p) => a + (ok(p) && p.w > 1 ? p.w : 0), 0) }); }));   // rep: gaps that recur row after row are the page's real grid
        const cand = fits.filter(f => f.n >= 2);   // one gap can't define a grid: a dozen column counts explain any single gap
        const top = cand.length ? Math.max(...cand.map(f => f.hit)) : 0;
        gridDebug = { box: [Math.round(A.left), Math.round(A.width)], inset: gridInset, L0: Math.round(L0), W: Math.round(W), pairs: P.map(p => [Math.round(p.r), Math.round(p.l), +p.w.toFixed(2)]), top: +top.toFixed(2), best: fits.slice().sort((x, y) => y.hit - x.hit).slice(0, 4) };
        const strong = cand.filter(f => f.n >= 3 && f.hit >= 0.15);   // three exact column gaps don't happen by accident: a grid exists, even if other sections do their own thing
        if (top >= 0.3 || strong.length) {
          const pick = cand.filter(f => f.hit >= top - 0.03 && (top >= 0.3 || f.n >= 3)).sort((a, b) => Math.round((b.rep - a.rep) * 10) || a.N - b.N || (gapCount.get(b.g) || 0) - (gapCount.get(a.g) || 0) || b.hit - a.hit)[0];
          columns = pick.N; gutter = pick.g; gridFit = Math.round(pick.hit * 100); gridMeasured = true;
        } else if (gaps.length >= 2) { gutter = mode(gaps)[0]; gridFit = Math.round(top * 100); }
      } else if (gaps.length >= 2) gutter = mode(gaps)[0];
      maxWidth = Math.round(W);
    }
    return { columns, gutter, margin: best ? 0 : 32, maxWidth, inferred: true };
  }
  let gridAnchor = null, gridAnchorContent = false, gridInset = null, gridFit = null, gridDebug = null, gridMeasured = false;   // gridFit: % of measured content edges on the inferred lines   // the element whose edges the inferred grid is drawn on (its padded content edge when that's where things line up)
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
  // when auto snapped the page to a medium or strict scale, that scale is the proposal: one scale per patch, never two that argue
  function autoScale() {
    if (!state.normalize || !state.normalizeRes || state.normalizeRes === '32') return null;
    const { typeSteps, spaceSteps } = quantizeScales(state.normalizeRes); const names = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'];
    const ts = Array.from(new Set(typeSteps)).sort((a, b) => a - b); const mdAt = Math.max(0, ts.indexOf(ts.reduce((b, v) => Math.abs(v - 16) < Math.abs(b - 16) ? v : b, ts[0])));
    const shift = Math.max(0, 2 - mdAt);   // keep md on the body size
    return { type: ts.map((v, i) => ({ token: names[Math.min(names.length - 1, i + shift)], px: v })), space: spaceSteps.map(v => ({ token: String(v), px: v })) };
  }
  function proposedTokens() {
    // a :root block + a foundation file the site could adopt
    const F = state.F; const lines = [':root {']; const A = autoScale();
    if (A) lines.push('  /* auto (' + resName(state.normalizeRes) + ') snapped the page to these steps; manual type changes below give px, map each to the nearest step */');
    (A ? A.type : F.type.steps).forEach(st => lines.push(`  --text-${st.token}: ${st.px}px;${st.observed && st.observed.length > 1 ? `   /* collapsed ${st.observed.join(', ')} */` : ''}`));
    (A ? A.space : F.spacingSteps).forEach(st => lines.push(`  --space-${st.token}: ${st.px}px;${st.observed && st.observed.length > 1 ? `   /* collapsed ${st.observed.join(', ')} */` : ''}`));
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
    const jigWrap = x => x.classList && (x.classList.contains('jig-crop-box') || x.classList.contains('jig-scrim-panel'));
    while (n && n.nodeType === 1 && n !== document.body && n !== document.documentElement && parts.length < 6) {
      if (jigWrap(n)) { n = n.parentNode; continue; }
      if (n !== el && n.id) { parts.unshift('#' + CSS.escape(n.id)); break; }
      if (n !== el && n.dataset.jigName) { parts.unshift(`[data-jig-name="${n.dataset.jigName}"]`); break; }
      let s = n.tagName.toLowerCase();
      const par = n.parentNode; const kin = Array.from(par ? par.children : []).filter(c => c.tagName === n.tagName);
      const usable = Array.from(n.classList).filter(c => !/^jig-/.test(c) && !/^(active|on|is-|has-)/.test(c));
      // prefer a class that tells this element apart from its siblings (div.left, not div.col:nth-of-type(2)); an AI reading the HTML can find a class, it can't easily count siblings
      const cls = usable.find(c => kin.filter(k => k.classList.contains(c)).length === 1) || usable[0];
      if (cls) s += '.' + CSS.escape(cls);
      const sib = kin.filter(c => !cls || c.classList.contains(cls));
      if (sib.length > 1) s += `:nth-of-type(${Array.from(par.children).filter(c => c.tagName === n.tagName).indexOf(n) + 1})`;
      parts.unshift(s); n = par;
      // a class-qualified chain of three is usually unique enough; stop early if it already is
      if (parts.length >= 3) { try { if (document.querySelectorAll(parts.join(' > ')).length === 1) break; } catch (e) {} }
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
  const srOnly = el => { const r = el.getBoundingClientRect(); if (r.width <= 2 || r.height <= 2) return true; const c = css(el); if (/rect\(0|inset\(50%|inset\(100%/.test(c.clip + ' ' + c.clipPath) || px(c.textIndent) <= -500) return true;
    for (let p = el.parentElement, d = 0; p && d < 3; p = p.parentElement, d++) { const pc = css(p); if (px(pc.textIndent) <= -500) return true; if (/hidden|clip/.test(pc.overflow + pc.overflowX + pc.overflowY)) { const pr = p.getBoundingClientRect(); const ix = Math.min(r.right, pr.right) - Math.max(r.left, pr.left), iy = Math.min(r.bottom, pr.bottom) - Math.max(r.top, pr.top); if (ix <= 2 || iy <= 2) return true; } }
    return false; };
  function nearest(list, value, get) {
    let best = list[0], d = Infinity;
    for (const it of list) { const dd = Math.abs((get ? get(it) : it) - value); if (dd < d) { d = dd; best = it; } }
    return best;
  }

  // ------------------------------------------------------------ change log
  function record(el, ctl, data, summary, sub) {
    if (state.replaying) return;   // the frame is catching up with the desktop; those changes are already in the patch
    const k = keyOf(el, ctl) + (sub ? '::' + sub : '');
    const base = { el: selectorOf(el), name: nameOf(el), ctl, bp: state.bp, ...(DEVICE ? { device: DEVICE } : {}) };
    state.changes.set(k, Object.assign(base, data, { summary }));
    if (state.batch) return;   // auto is mid-run; it draws once when done
    renderHUD(); postToParent(); scanSoon();
  }
  function unrecord(el, ctl, sub) { if (state.replaying) return; state.changes.delete(keyOf(el, ctl) + (sub ? '::' + sub : '')); if (state.batch) return; renderHUD(); postToParent(); }
  // Apply a patch entry to this document with the same controls a person would use. Used when a device frame catches up with the desktop.
  function applyChange(c) {
    const el = $(c.el); if (!el) return false;
    try {
      switch (c.ctl) {
        case 'crop': if (el.__jigSetCrop) { const m = /([\d.]+)%\s+([\d.]+)%/.exec(c.objectPosition || c.backgroundPosition || ''); el.__jigSetCrop(m ? +m[1] : undefined, m ? +m[2] : undefined, c.zoom); return true; } break;
        case 'type': case 'heading': if (c.step && el.__jigStepType) el.__jigStepType(c.step); if (c.contrast) fixContrast(el); return true;
        case 'text': if (c.scrim && el.__jigSetScrim) el.__jigSetScrim(c.scrim); return true;   // placement is per breakpoint; only the scrim carries over
        case 'button': if (c.size && el.__jigSetSize) el.__jigSetSize(c.size); if (c.variant && el.__jigSetVariant) el.__jigSetVariant(c.variant); return true;
        case 'spacing': if (c.paddingY && el.__jigSetPad) el.__jigSetPad(c.paddingY); return true;
        case 'grid': if (el.__jigSetML && typeof c.marginLeft === 'number') el.__jigSetML(c.marginLeft); return true;
      }
    } catch (e) {}
    return false;
  }
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
        tr: el.style.transform || '', to: el.style.transformOrigin || '', opInline: isImg ? (el.style.objectPosition || '') : (el.style.backgroundPosition || ''),
        fit: isImg ? css(el).objectFit : ''
      };
      let parent = el.parentElement;
      if (isImg) {
        // the image needs a box of its own to be clipped in. If its parent holds other things too (a caption, a paragraph), a scaled image would
        // paint over them, so the jig wraps the image in a tight block that clips. The wrapper is removed on unwire.
        const siblings = Array.from(parent.children).filter(c => c !== el && css(c).position !== 'absolute');
        const loose = parent.getBoundingClientRect().height > el.getBoundingClientRect().height + 6;
        if ((siblings.length || loose) && !/^(PICTURE|A)$/.test(parent.tagName)) {
          const w = document.createElement('div'); w.className = 'jig-crop-box';
          const d = css(el).display; w.style.cssText = `display:${d === 'inline' || d === 'inline-block' ? 'inline-block' : 'block'};overflow:hidden;position:relative;line-height:0;width:${d === 'inline' || d === 'inline-block' ? 'auto' : '100%'};`;
          ['margin', 'float', 'border-radius'].forEach(k => { const v = el.style.getPropertyValue(k); if (v) w.style.setProperty(k, v); });
          const cm = css(el); if (cm.float !== 'none') { w.style.float = cm.float; w.style.width = cm.width; w.style.marginRight = cm.marginRight; w.style.marginLeft = cm.marginLeft; }
          parent.insertBefore(w, el); w.appendChild(el); el.__jigWrap = w; parent = w;
        }
        if (css(parent).overflow === 'visible') parent.style.overflow = 'hidden';
      }
      // a plain <img> (fill / scale-down) has nothing to pan; in jig mode it becomes a cover crop
      const upgraded = isImg && !/cover|none/.test(orig.fit);
      if (upgraded) el.style.setProperty('object-fit', 'cover', 'important');
      let [ox, oy] = parsePos(orig.op);
      const zoom0 = (() => { const m = orig.tr.match(/scale\(\s*([\d.]+)/); return m ? clamp(+m[1], 1, 4) : 1; })();   // a site can ship a baked-in zoom
      let zoom = zoom0;
      el.__jigOrig = orig; el.dataset.jigDrag = '1';
      el.style.cursor = 'grab';

      let drag = null;
      on(el, 'pointerdown', e => {
        if (e.button !== 0) return;
        if (e.altKey) return;
        if (!el.classList.contains('jig-active')) return;
        if (e.target.closest('[data-jig-drag], .jig-el.jig-active') !== el) return;
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
        // where the subject sits inside the window as currently cropped (0..1 across the visible box)
        const visX = sw > W + 1 ? (fx * sw - (ox / 100) * (sw - W)) / W : 0.5, visY = sh > H + 1 ? (fy * sh - (oy / 100) * (sh - H)) / H : 0.5;
        const inFrame = visX > 0.22 && visX < 0.78 && visY > 0.22 && visY < 0.78;
        const nx = Math.round(px_ * 1000) / 10, ny = Math.round(py_ * 1000) / 10;
        if (inFrame || (Math.abs(nx - ox) < 8 && Math.abs(ny - oy) < 8)) return false;   // already framed, or not worth the churn
        ox = nx; oy = ny; apply(); commit(); return true;
      };
      el.__jigZoom = () => zoom;
      el.__jigInFrame = (fx, fy) => {   // is this natural-image point inside the comfortable middle of the current window?
        if (!isImg) return true; const W = el.offsetWidth, H = el.offsetHeight, nw = el.naturalWidth || W, nh = el.naturalHeight || H;
        const sc = Math.max(W / nw, H / nh) * zoom; const sw = nw * sc, sh = nh * sc;
        const vx = sw > W + 1 ? (fx * sw - (ox / 100) * (sw - W)) / W : 0.5, vy = sh > H + 1 ? (fy * sh - (oy / 100) * (sh - H)) / H : 0.5;
        return vx > 0.1 && vx < 0.9 && vy > 0.1 && vy < 0.9;
      };
      el.__jigSetCrop = (x, y, z) => { if (typeof x === 'number') ox = x; if (typeof y === 'number') oy = y; if (isImg && typeof z === 'number') zoom = clamp(z, 1, 4); apply(); commit(); };
      el.__jigReset = () => {
        ox = parsePos(orig.op)[0]; oy = parsePos(orig.op)[1]; zoom = zoom0; apply(); ['object-position', 'transform-origin', 'transform'].forEach(k => el.style.removeProperty(k)); if (orig.opInline) el.style[isImg ? 'objectPosition' : 'backgroundPosition'] = orig.opInline; if (orig.tr) el.style.transform = orig.tr; if (orig.to) el.style.transformOrigin = orig.to; unrecord(el, 'crop');
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
      // the site's own inline font-size (CMS output, a planted style="font-size: var(--x)") is what reset goes back to; removing it would leave the page changed
      const inline0 = new Map(); const keep = n => { if (!inline0.has(n)) inline0.set(n, [n.style.getPropertyValue('font-size'), n.style.getPropertyPriority('font-size')]); };
      keep(el); riders.forEach(keep);
      const setSize = v => {
        const f = (n) => { if (v) { keep(n); n.style.setProperty('font-size', v, 'important'); } else { const o = inline0.get(n); if (o && o[0]) n.style.setProperty('font-size', o[0], o[1]); else n.style.removeProperty('font-size'); } };
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
      let cfix = null;
      el.__jigFixContrast = () => { if (cfix) { cfix.undo(); cfix = null; setBadge(el, 'colour restored'); return; } const r = fixContrast(el); if (!r) setBadge(el, 'contrast: nothing the jig can do here (text over an image wants a scrim)'); else if (r.already) setBadge(el, `contrast already passes (${r.ratio.toFixed(1)})`); else { cfix = r; setBadge(el, `${r.prop} ${r.from} → ${r.to} · contrast ${r.before.toFixed(1)} → ${r.after.toFixed(1)}`); } scanSoon(); refreshToolbar(el); };
      const tb0 = el.__jigToolbar; el.__jigToolbar = () => [...tb0(), sep(), (() => { const b = btn('aa', () => el.__jigFixContrast()); b.title = cfix ? 'restore the original colour' : 'fix contrast: nearest passing shade of the same hue'; if (cfix) b.classList.add('on'); return b; })()];
      el.__jigReset = () => { idx = origIdx; setSize(''); unrecord(el, 'type'); if (cfix) { cfix.undo(); cfix = null; } refreshToolbar(el); };
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
      // a site that already implements the scrim (a .scrim-panel inside a .scrim-* overlay) keeps its own markup: wrapping it would break selectors like .scrim-tint > .scrim-panel
      const own = isAbs && el.children.length === 1 && /(^|\s)scrim-panel(\s|$)/.test(el.children[0].className) ? el.children[0] : null;
      if (own) { panel = own; const m = (el.className.match(/(?:^|\s)scrim-(gradient|tint|glass)(?:\s|$)/) || [])[1]; if (m) scrim = m; }
      else if (isAbs) {
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
      el.__jigScrim = () => scrim; el.__jigScrims = SCRIMS;
      el.__jigToolbarText = isAbs
        ? () => [btn('◐', () => { scrim = SCRIMS[(SCRIMS.indexOf(scrim) + 1) % SCRIMS.length]; applyScrim(); commit(); refreshToolbar(el); scanSoon(); }), chip(() => 'scrim ' + scrim), sep(), ...arrows()]
        : () => [chip(() => `${cols} col · ${rowTok}px`), ...arrows()];
      if (!el.__jigToolbar) el.__jigToolbar = el.__jigToolbarText;
      el.dataset.jigDrag = '1';
      el.style.cursor = 'move';
      let drag = null;
      on(el, 'pointerdown', e => {
        if (e.button !== 0 || e.altKey) return;
        if (!el.classList.contains('jig-active')) return;          // this jig is switched off; let the event reach whatever is inside
        const owner = e.target.closest('[data-jig-drag], .jig-el.jig-active');
        // words inside overlay copy (a heading, a line) can only step size, so a press-and-drag on them moves the whole overlay; a plain click still selects the words
        const viaChild = isAbs && owner !== el && owner && el.contains(owner) && !owner.dataset.jigDrag;
        if (owner !== el && !viaChild) return;   // the nearest active thing owns the gesture
        e.preventDefault(); if (!viaChild) e.stopPropagation();
        drag = { x: e.clientX, y: e.clientY, cols, rowTok, offX, offY, anchor, id: e.pointerId, gridWas: state.grid, pending: viaChild };
        if (isAbs) { const r0 = parent.getBoundingClientRect(); const p0 = (panel || el).getBoundingClientRect(); drag.baseLeft = p0.left - r0.left - padL(el) - offX; }   // where the panel sits with zero offset
        if (!viaChild) startDrag();
      });
      function startDrag() { drag.pending = false; drag.moved = true; try { el.setPointerCapture(drag.id); } catch (x) {} if (!state.grid) toggleGrid(true); }
      // after a drag that began on the words, the click that follows selects the overlay, not the words
      on(el, 'click', e => { if (!el.__jigDragged) return; el.__jigDragged = false; e.preventDefault(); e.stopPropagation(); select(el); }, true);
      on(el, 'pointermove', e => {
        if (!drag) return;
        if (drag.pending) { if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return; startDrag(); }
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
          offY = Math.round(boundY(offY, v, r, pr));
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
      const end = () => { if (!drag) return; const d0 = drag; drag = null; if (d0.pending) return; try { el.releasePointerCapture(d0.id); } catch (x) {} if (d0.moved) { el.__jigDragged = true; setTimeout(() => (el.__jigDragged = false), 400); } commit(); if (!d0.gridWas) toggleGrid(false); };
      on(el, 'pointerup', end); on(el, 'pointercancel', end); on(window, 'pointerup', end); on(window, 'blur', end);
      on(el, 'wheel', e => {
        if (!(e.ctrlKey || e.metaKey) || el.dataset.jigCtl === 'type') return; e.preventDefault();   // type owns ⌘-wheel on text
        const cur = px(el.style.maxWidth) || el.getBoundingClientRect().width;
        const colW = colWidth(parent);
        const c = clamp(Math.round(cur / colW) + (e.deltaY < 0 ? 1 : -1), 2, state.F.grid.columns);
        el.style.maxWidth = `calc(${c} * (100% + ${state.F.grid.gutter}px) / ${state.F.grid.columns} - ${state.F.grid.gutter}px)`;
        el.dataset.jigCols = c; setBadge(el, `max-width ${c} cols`); commit();
      }, { passive: false });
      el.__jigSetMaxCols = c => { c = clamp(c, 2, state.F.grid.columns); el.style.maxWidth = `calc(${c} * (100% + ${state.F.grid.gutter}px) / ${state.F.grid.columns} - ${state.F.grid.gutter}px)`; el.dataset.jigCols = c; commit(); };
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
        const movedBits = bits.filter(b => !/^scrim /.test(b));
        record(el, 'text', data, (movedBits.length ? 'moved: ' + movedBits.join(', ') : '') + (data.scrim ? (movedBits.length ? ', ' : '') + 'scrim ' + data.scrim : ''));
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
      el.__jigSizeIndex = () => B.sizes.indexOf(size); el.__jigVariant = () => variant;
      el.__jigSetSize = tok => { const t = B.sizes.indexOf(tok); let g = 0; while (t >= 0 && B.sizes.indexOf(size) !== t && g++ < 8) cycle('size', B.sizes.indexOf(size) < t ? 1 : -1); };
      el.__jigSetVariant = tok => { let g = 0; while (B.variants.includes(tok) && variant !== tok && g++ < 8) cycle('variant', 1); };
    }
  };

  // measured buttons (no class convention on the site): sizes and variants are observed clusters, applied as px
  function initMeasured(el, B) {
    const h0 = el.getBoundingClientRect().height; const c0 = css(el); el.__jigH0 = h0;
    const sizes = B.sizes, variants = B.variants;
    let si = sizes.indexOf(nearest(sizes, h0, x => x.h)); const si0 = si;
    const k0 = `${c0.backgroundColor}|${c0.color}`; let vi = Math.max(0, variants.findIndex(v => `${v.bg}|${v.fg}` === k0)); const vi0 = vi;
    const orig = { p: el.style.padding, fs: el.style.fontSize, mh: el.style.minHeight, bg: el.style.background, c: el.style.color, bc: el.style.borderColor, fw: el.style.fontWeight, bw: el.style.borderWidth, bs: el.style.borderStyle };
    el.__jigToolbar = () => [btn('−', () => cyc('size', -1)), chip(() => sizes[si].token), btn('+', () => cyc('size', 1)), sep(), btn('◐', () => cyc('variant', 1)), chip(() => variants[vi].token)];
    function apply() {
      const sz = sizes[si], v = variants[vi];
      if (si !== si0) {
        el.style.setProperty('padding', `${sz.padY}px ${sz.padX}px`, 'important'); el.style.setProperty('font-size', `${sz.fs}px`, 'important'); el.style.setProperty('line-height', '1.2', 'important'); el.style.setProperty('min-height', `${sz.h}px`, 'important');
        const d = css(el).display; if (!/flex|grid/.test(d)) el.style.setProperty('display', d === 'block' ? 'flex' : 'inline-flex', 'important');
        el.style.setProperty('align-items', 'center', 'important'); el.style.setProperty('justify-content', 'center', 'important'); el.style.setProperty('box-sizing', 'border-box', 'important');
      } else { ['padding', 'font-size', 'line-height', 'display', 'align-items', 'justify-content', 'box-sizing', 'min-height'].forEach(k => el.style.removeProperty(k)); Object.assign(el.style, { padding: orig.p, fontSize: orig.fs }); }
      if (vi !== vi0) {
        // become a twin of a live button of that variant (it carries any contrast fix auto gave it); else the measured look, weight included
        const twin = $$('.jig-el[data-jig-ctl="button"]').find(o => o !== el && o.__jigVariant && o.__jigVariant() === v.token);
        const tc = twin ? css(twin) : null;
        el.style.background = tc ? tc.backgroundColor : v.bg; el.style.color = tc ? tc.color : v.fg;
        el.style.borderColor = tc ? tc.borderTopColor : v.border; if (tc) { el.style.borderWidth = tc.borderTopWidth; el.style.borderStyle = tc.borderTopStyle; }
        el.style.fontWeight = tc ? tc.fontWeight : (v.fw || '');
      } else Object.assign(el.style, { background: orig.bg, color: orig.c, borderColor: orig.bc, fontWeight: orig.fw, borderWidth: orig.bw, borderStyle: orig.bs });
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
    el.__jigSizeIndex = () => si; el.__jigVariant = () => variants[vi].token;
    el.__jigSetSize = tok => { const t = sizes.findIndex(x => x.token === tok); let g = 0; while (t >= 0 && si !== t && g++ < 8) cyc('size', si < t ? 1 : -1); };
    el.__jigSetVariant = tok => { let g = 0; while (variants.some(v => v.token === tok) && variants[vi].token !== tok && g++ < 8) cyc('variant', 1); };
  }

  // --- section: padding on the spacing scale --------------------------------
  Controls.section = {
    match: el => true,
    label: 'section · − / + steps vertical padding on the spacing scale',
    init(el) {
      const steps = state.F.spacingSteps.filter(x => x.px > 0); const sp = steps.map(x => x.px);
      const origTop = px(css(el).paddingTop);
      let idx = sp.indexOf(nearest(sp, origTop)); const origIdx = idx;
      el.__jigToolbar = () => [btn('−', () => step(-1)), chip(() => `spacing ${sp[idx]}`), btn('+', () => step(1))];
      function step(d) {
        idx = clamp(idx + d, 0, sp.length - 1);
        if (idx === origIdx) el.style.removeProperty('padding-block'); else el.style.setProperty('padding-block', spaceValue(steps[idx]), 'important');
        setBadge(el, `padding-block ${steps[idx].var || sp[idx] + 'px'}`);
        if (idx === origIdx) unrecord(el, 'spacing');
        else record(el, 'spacing', { paddingY: sp[idx], ...(steps[idx].var ? {} : { inferred: true }) }, `padding ${Math.round(origTop)} → ${sp[idx]}`);
        refreshToolbar(el);
      }
      el.__jigReset = () => { idx = origIdx; el.style.removeProperty('padding-block'); unrecord(el, 'spacing'); refreshToolbar(el); };
      el.__jigSetPad = pxv => { const i = sp.indexOf(nearest(sp, pxv)); if (i >= 0 && i !== idx) step(i - idx); };
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
    $$('.jig-crop-box').forEach(w => { const img = w.firstElementChild; if (img) w.parentNode.insertBefore(img, w); w.remove(); if (img) delete img.__jigWrap; });
    for (let i = listeners.length - 1; i >= 0; i--) { const [el, ev, fn, opt] = listeners[i]; if (el instanceof Element && el.classList && el.classList.contains('jig-el')) { el.removeEventListener(ev, fn, opt); listeners.splice(i, 1); } }
    $$('.jig-el').forEach(el => { el.classList.remove('jig-el', 'jig-selected'); delete el.dataset.jigCtl; delete el.dataset.jigDrag; delete el.__jigToolbar; delete el.__jigToolbarText; delete el.__jigReset; delete el.__jigResetText; delete el.__jigNudge; const pn = el.querySelector(':scope > .jig-scrim-panel'); if (pn) { while (pn.firstChild) el.appendChild(pn.firstChild); pn.remove(); } });
    state.selected = null; toolbar.hidden = true;
  }
  function rewire() { unwire(); delete state.F.type.steps; delete state.F.spacingSteps; resolveFoundation(); wire(); scanProtection(); renderHUD(); }

  // Auto-targeting: the jig finds its own targets. data-jig="<ctl>" forces a control,
  // data-jig="off" excludes an element (and its subtree), data-jig-name names it.
  function autoTargets() {
    const out = new Map(); // el -> ctl
    const skip = el => !el.offsetParent && css(el).position !== 'fixed' || el.closest('#jig-hud, .jig-tb, .jig-badge, #jig-grid, #jig-found, #jig-device, #jig-axtags, ' + OFF) || el.classList.contains('jig-crop-box') || el.classList.contains('jig-scrim-panel');
    const add = (el, ctl) => { if (!out.has(el) && !skip(el) && Controls[ctl]) out.set(el, ctl); };
    // explicit first
    $$('[data-jig]').forEach(el => { let c = el.dataset.jig; if (c === 'heading') c = 'type'; if (c && c !== 'off') add(el, c); });
    // crop: cover-fit images and background images of a useful size
    $$('img').forEach(img => { const r = img.getBoundingClientRect(); if (r.width >= 80 && r.height >= 80) add(img, 'crop'); });
    $$('body *').forEach(el => { if (el.tagName === 'IMG') return; const bg = css(el).backgroundImage; if (bg && bg !== 'none' && /url\(/.test(bg)) { const r = el.getBoundingClientRect(); if (r.width >= 80 && r.height >= 80) add(el, 'crop'); } });
    // text overlays: absolutely positioned text sitting on an image
    $$('body *').forEach(el => {
      if (css(el).position !== 'absolute' || !(el.textContent || '').trim()) return;
      const par = el.parentElement; if (!par) return;
      const hasImg = Array.from(par.children).some(c => c !== el && (c.tagName === 'IMG' || css(c).backgroundImage !== 'none'));
      if (hasImg) add(el, 'text');
    });
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
      // an overlay that carries its own words (a caption div) also gets the ramp
      if (ctl === 'text' && state.F.type && Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 1)) {
        const tbText = el.__jigToolbar, resetText = el.__jigReset;
        Controls.type.init(el);
        const tbType = el.__jigToolbar, resetType = el.__jigReset;
        el.__jigToolbar = () => [...tbType(), sep(), ...tbText()];
        el.__jigReset = () => { resetType(); resetText(); };
      }
      // every in-flow text element can also be repositioned: compose the text control on top of type
      const inOverlay = (() => { let n = el.parentElement; while (n && n !== document.body) { if (css(n).position === 'absolute' || n.dataset.jig === 'text') return true; n = n.parentElement; } return false; })();
      if (ctl === 'type' && inOverlay) {
        const ov = el.parentElement && el.parentElement.closest('.jig-el[data-jig-ctl="text"]');
        if (ov && ov.__jigSetScrim) {
          const tb = el.__jigToolbar;
          el.__jigToolbar = () => [...tb(), sep(), btn('◐', () => { const L = ov.__jigScrims; ov.__jigSetScrim(L[(L.indexOf(ov.__jigScrim()) + 1) % L.length]); scanSoon(); refreshToolbar(el); }), chip(() => 'scrim ' + ov.__jigScrim())];
        }
      }
      if (ctl === 'type' && css(el).position !== 'absolute' && !inOverlay) {
        const tb = el.__jigToolbar; const reset = el.__jigReset;
        Controls.text.init(el);
        const tbText = el.__jigToolbarText, resetText = el.__jigReset;
        el.__jigToolbar = () => [...tb(), sep(), ...tbText()];
        el.__jigReset = () => { reset(); resetText(); };
      }
      on(el, 'pointerenter', () => hover(el));
      on(el, 'pointerleave', () => hover(null));
      on(el, 'click', e => { if (e.altKey) return; if (!el.classList.contains('jig-active')) return; e.preventDefault(); e.stopPropagation(); select(el); });
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
    #jig-axtags .tag { all: revert; position: fixed; pointer-events: none; background: #ff2d9b; color: #fff; font: 700 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .02em; padding: 4px 6px; border-radius: 4px; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,.35); }
    #jig-axtags .tag[hidden] { display: none !important; }
    #jig-axtags .tag .n { all: revert; display: inline-block; min-width: 9px; text-align: center; background: #fff; color: #c4106c; border-radius: 999px; padding: 1px 4px; margin-right: 4px; font: 800 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
    #jig-axtags .tag.focus { outline: 2px solid #fff; outline-offset: 1px; z-index: 1; }
    .jig-ax.jig-ax.jig-ax-focus { outline: 4px solid #ff2d9b !important; outline-offset: 4px !important; box-shadow: 0 0 0 10px rgba(255,45,155,.28) !important; }
    @media (prefers-reduced-motion: no-preference) { .jig-ax.jig-ax.jig-ax-focus { animation: jig-ax-pulse .5s ease-in-out 3 alternate; } @keyframes jig-ax-pulse { to { box-shadow: 0 0 0 18px rgba(255,45,155,.08) !important; } } }
    #jig-hud .axrow .s .tw { opacity: .5; margin-left: 4px; font-size: 10px; }
    #jig-hud .axitems { margin: 2px 0 6px 34px; }
    #jig-hud .axi { display: flex; gap: 8px; align-items: baseline; padding: 3px 0; cursor: pointer; font-size: 12px; } #jig-hud .axi:hover { color: #fff; }
    #jig-hud .axi .ign { all: revert; margin-left: auto; flex: none; font: 600 10px ui-monospace, Menlo, monospace; color: #9aa3b8; background: transparent; border: 1px solid #262833; border-radius: 999px; padding: 1px 7px; cursor: pointer; opacity: 0; } #jig-hud .axi:hover .ign, #jig-hud .axi .ign:focus-visible { opacity: 1; } #jig-hud .axi .ign:hover { color: #fff; border-color: #3f6fff; }
    #jig-hud .axi b { flex: none; font: 700 11px ui-monospace, Menlo, monospace; color: #ff2d9b; min-width: 24px; } #jig-hud .axi span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } #jig-hud .axi.fixed { opacity: .45; } #jig-hud .axi.fixed b { color: #35c186; }
    #jig-hud .welcome { margin: 10px 12px 2px; padding: 10px 12px; background: #13141a; border: 1px solid #262833; border-left: 3px solid #3f6fff; border-radius: 8px; font: 12px/1.5 ui-sans-serif, system-ui; color: #c9d1e6; }
    #jig-hud .welcome b { color: #fff; font-weight: 600; } #jig-hud .welcome i { font-style: normal; color: #fff; border: 1px solid #3a3d4a; border-radius: 999px; padding: 0 6px; font-size: 11px; }
    #jig-hud .jigs .lbl { font: 11px ui-sans-serif, system-ui; letter-spacing: .14em; text-transform: uppercase; opacity: .6; align-self: center; margin-right: 2px; }
    .jig-badge { position: fixed; z-index: 2147483646; pointer-events: none; font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
      background: #0b0b0d; color: #dfe6ff; padding: 3px 7px; border-radius: 4px; white-space: nowrap; transform: translate(0,-110%); box-shadow: 0 2px 8px rgba(0,0,0,.3); }
    .jig-tb { position: fixed; z-index: 2147483646; display: flex; gap: 4px; align-items: center; background: #0b0b0d; border-radius: 8px; padding: 4px; box-shadow: 0 4px 16px rgba(0,0,0,.35); }
    .jig-tb button { font: 600 13px ui-sans-serif, system-ui; background: #262833; color: #fff; border: 0; border-radius: 6px; min-width: 28px; height: 28px; padding: 0 6px; cursor: pointer; }
    .jig-tb button:hover { background: #3f6fff; }
    .jig-tb button.on { background: #3f6fff; }
    .jig-tb .chip { font: 11px ui-monospace, Menlo, monospace; color: #dfe6ff; padding: 0 6px; min-width: 34px; text-align: center; }
    .jig-tb .sep { width: 1px; height: 18px; background: #3a3d4a; margin: 0 2px; }
    #jig-grid { position: absolute; inset: 0; pointer-events: none; z-index: 2147483640; }
    #jig-grid .cols { position: sticky; top: 0; height: 100vh; margin: 0 auto; display: grid; }
    #jig-grid .cols i { background: rgba(63,111,255,.08); border-inline: 1px solid rgba(63,111,255,.35); }
    #jig-grid .cols { position: sticky; } #jig-grid .gmeta { position: absolute; left: 0; bottom: 8px; font: 600 11px/1 ui-monospace, monospace; background: #3f6fff; color: #fff; padding: 4px 6px; border-radius: 4px; white-space: nowrap; }
    #jig-grid .cols.none i { visibility: hidden; }
    #jig-grid .cols.faint i { background: transparent; border-inline: 1px dashed rgba(63,111,255,.25); }
    #jig-grid .modrow { position: absolute; background: rgba(63,111,255,.06); border-block: 1px solid rgba(63,111,255,.45); box-sizing: border-box; }
    #jig-grid .region { position: absolute; border: 2px solid rgba(155,93,229,.75); background: rgba(155,93,229,.05); border-radius: 6px; box-sizing: border-box; }
    #jig-grid .region span { position: absolute; top: 6px; left: 6px; font: 600 11px/1 ui-monospace, monospace; background: #9b5de5; color: #fff; padding: 3px 6px; border-radius: 4px; white-space: nowrap; }
    #jig-grid .offgrid { position: absolute; border: 2px dashed #f5a524; border-radius: 4px; box-sizing: border-box; }
    #jig-grid .offgrid span { position: absolute; top: -1px; left: -1px; transform: translateY(-100%); font: 600 11px/1 ui-monospace, monospace; background: #f5a524; color: #111; padding: 3px 6px; border-radius: 4px 4px 0 0; white-space: nowrap; }
    @media (max-width: 640px) { #jig-grid .cols i { background: rgba(63,111,255,.12); border-inline: 1px solid rgba(63,111,255,.5); } }
    #jig-hud { position: fixed; top: 16px; right: 16px; width: 372px; height: auto; max-height: calc(100vh - 32px); min-width: 280px; min-height: 92px; display: flex; flex-direction: column; z-index: 2147483647;
      background: #0b0b0d; color: #f3f4f7; border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.45); font: 13px/1.45 ui-sans-serif, system-ui, sans-serif; overflow: hidden; resize: both; }
    #jig-hud.jig-collapsed { resize: none; height: auto !important; }
    #jig-hud.jig-collapsed .tools, #jig-hud.jig-collapsed .advpanel, #jig-hud.jig-collapsed .list, #jig-hud.jig-collapsed .jigs, #jig-hud.jig-collapsed .hint { display: none; }
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
    #jig-hud:not(.jig-advanced) .advpanel { display: none; }
    #jig-hud .arow { display: grid; grid-template-columns: 76px 1fr; align-items: center; gap: 8px; padding: 4px 0; }
    #jig-hud .arow label { font: 11px ui-sans-serif, system-ui; letter-spacing: .12em; text-transform: uppercase; opacity: .55; white-space: nowrap; }
    #jig-hud .arow > div { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
    #jig-hud .arow button, #jig-hud .arow select { font: 600 12px ui-sans-serif, system-ui; background: #262833; color: #fff; border: 0; border-radius: 6px; padding: 6px 10px; cursor: pointer; }
    #jig-hud .arow button:hover { background: #3f6fff; } #jig-hud .arow button.on { background: #3f6fff; }
    #jig-hud .hint { padding: 6px 12px 8px; font: 11px ui-monospace, Menlo, monospace; opacity: .4; background: #13141a; cursor: move; user-select: none; } #jig-hud .hint:hover { opacity: .7; }
    #jig-hud .tools button, #jig-hud footer button, #jig-hud .axb button { font: 600 12px ui-sans-serif, system-ui; background: #262833; color: #fff; border: 0; border-radius: 6px; padding: 6px 10px; cursor: pointer; }
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
    #jig-hud .tools button:hover, #jig-hud footer button:hover, #jig-hud .axb button:hover:not(:disabled) { background: #3f6fff; }
    #jig-hud .axb button.ghost { background: transparent; color: #9aa3b8; border: 1px solid #262833; } #jig-hud .axb button.ghost:hover { color: #fff; }
    #jig-hud .list { overflow: auto; padding: 8px 12px; flex: 1; }
    #jig-hud .axr { padding: 6px 0 10px; }
    #jig-hud:not(.jig-frame) h6.fold[data-fold="warn"], #jig-hud:not(.jig-frame) #jig-warn { display: none !important; }
    #jig-hud .axh { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; } #jig-hud .axh b { font: 700 26px/1 ui-sans-serif, system-ui; color: #ff2d9b; } #jig-hud .axh b.ok { color: #35c186; } #jig-hud .axh span { font: 12px ui-sans-serif, system-ui; color: #9aa3b8; }
    #jig-hud .axrow { align-items: center; } #jig-hud .axrow .c { flex: 0 0 26px; font: 700 12px ui-monospace, Menlo, monospace; text-align: right; color: #ffb84d; } #jig-hud .axrow .c.wcag { color: #ff2d9b; } #jig-hud .axrow.done .c { color: #35c186; } #jig-hud .axrow.done { opacity: .55; }
    #jig-hud .axrow .s small { display: block; font: 10.5px ui-monospace, Menlo, monospace; opacity: .6; }
    #jig-hud .axb { display: flex; gap: 6px; flex-wrap: nowrap; margin-top: 8px; } #jig-hud .axb button { flex: 1 1 0; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 6px 6px !important; font-size: 11.5px !important; } #jig-hud #jig-axfix.on { background: #35c186; border-color: #35c186; color: #0b0b0d; } #jig-hud .axb button:disabled { opacity: .45; cursor: default; }
    #jig-hud h6 { margin: 8px 0 4px; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; opacity: .6; }
    #jig-hud h6.fold { display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; opacity: .85; padding: 4px 0; }
    #jig-hud h6.fold::before { content: "▸"; font-size: 10px; opacity: .7; transition: transform .12s; }
    #jig-hud h6.fold[aria-expanded="true"]::before { transform: rotate(90deg); }
    #jig-hud h6.fold em { font-style: normal; margin-left: auto; background: #262833; color: #dfe6ff; border-radius: 999px; padding: 1px 8px; font-size: 11px; letter-spacing: 0; text-transform: none; }
    #jig-hud h6.fold em.warn { background: #ff2d9b; color: #fff; }
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
      #jig-hud .devwrap { display: none !important; }
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
      const r0 = gridAnchor.getBoundingClientRect(); const pl = gridAnchorContent ? px(css(gridAnchor).paddingLeft) : 0, pr = gridAnchorContent ? px(css(gridAnchor).paddingRight) : 0;
      const r = { left: r0.left + pl + (gridInset ? gridInset.l : 0), width: r0.width - pl - pr - (gridInset ? gridInset.l + gridInset.r : 0) };
      cols.style.maxWidth = `${Math.round(r.width)}px`; cols.style.width = `${Math.round(r.width)}px`; cols.style.paddingInline = '0'; cols.style.marginLeft = `${Math.round(r.left)}px`; cols.style.marginRight = '0'; cols.style.boxSizing = 'border-box';
      for (let i = 0; i < G.columns; i++) cols.appendChild(document.createElement('i'));
      gridEl.appendChild(cols);
      // pages with an offset or positioned body put the overlay somewhere else than measured: correct by what actually landed
      const off = cols.getBoundingClientRect().left - r.left; if (Math.abs(off) > 0.5) cols.style.marginLeft = `${Math.round(r.left - off)}px`;
      gridEl.style.height = `${document.documentElement.scrollHeight}px`;
      // three kinds of grid: column (gap pairs fit), modular (columns plus repeating equal-height rows), hierarchical (no shared columns; regions ranked by importance)
      const measured = gridMeasured;
      const meta = document.createElement('b'); meta.className = 'gmeta';
      if (measured) {
        const mods = markModules(cols);
        meta.textContent = `${mods ? 'modular' : 'column'} grid · ${G.columns} col · ${G.gutter}px gutter${mods ? ` · ${mods} module block${mods === 1 ? '' : 's'}` : ''} · ${gridFit}% of column gaps on lines`;
        markOffGrid(cols); state.gridType = mods ? 'modular' : 'column';
      } else {
        cols.classList.add('faint'); const n = markRegions(r);
        meta.textContent = n >= 2 ? `hierarchical · ${n} regions ranked by size · no shared column grid` : `${G.columns} col · ${G.gutter}px gutter · assumed (not enough side-by-side content to measure)`;
        state.gridType = n >= 2 ? 'hierarchical' : 'assumed'; if (n >= 2) cols.classList.add('none');   // no shared columns: don't draw any
      }
      cols.appendChild(meta);
      return;
    } else { cols.style.maxWidth = `${G.maxWidth}px`; cols.style.paddingInline = `${Math.min(G.margin, Math.floor(window.innerWidth * 0.06))}px`; }
    for (let i = 0; i < G.columns; i++) cols.appendChild(document.createElement('i'));
    gridEl.appendChild(cols);
    gridEl.style.height = `${document.documentElement.scrollHeight}px`;
  }
  // modular: containers whose children repeat as rows of equal-height modules get horizontal module lines
  function markModules(cols) {
    const ci = Array.from(cols.querySelectorAll('i')).map(i => i.getBoundingClientRect()); if (ci.length < 2) return 0;
    const L = ci[0].left, R = ci[ci.length - 1].right, W = R - L; const gr = gridEl.getBoundingClientRect(); let n = 0; const done = [];
    for (const box of $$('body *')) {
      if (n >= 8) break; if (box.closest('#jig-hud, #jig-grid, #jig-axtags, .jig-tb, #jig-device') || done.some(d => d.contains(box))) continue;
      const fit = k => k.width >= W * 0.12 && k.height >= 60 && k.left >= L - 2 && k.right <= R + 2;
      const test = ks => {
        if (ks.length < 4) return null;
        const tops = Array.from(new Set(ks.map(k => Math.round(k.top / 4) * 4))).sort((a, b) => a - b); const lefts = new Set(ks.map(k => Math.round(k.left / 4)));
        if (tops.length < 2 || lefts.size < 2) return null;
        const hs = ks.map(k => k.height); const hMed = hs.slice().sort((a, b) => a - b)[hs.length >> 1];
        if (hs.filter(h => Math.abs(h - hMed) <= 4).length < ks.length * 0.8) return null;   // modules share a height
        const ws = ks.map(k => k.width); const wMed = ws.slice().sort((a, b) => a - b)[ws.length >> 1];
        if (ws.filter(w => Math.abs(w - wMed) <= wMed * 0.1).length < ks.length * 0.8) return null;   // and a width (a thumbnail beside its text is a list, not modules)
        const steps = tops.slice(1).map((t, i) => t - tops[i]); if (Math.max(...steps) - Math.min(...steps) > 8) return null;   // and a row rhythm
        return { tops, hMed };
      };
      const kids = Array.from(box.children).filter(visible);
      let hitM = test(kids.map(k => k.getBoundingClientRect()).filter(fit));
      if (!hitM && kids.length >= 2 && kids.every(c => /flex|grid/.test(css(c).display))) hitM = test(kids.flatMap(c => Array.from(c.children)).filter(visible).map(k => k.getBoundingClientRect()).filter(fit));   // rows wrapped one container each
      if (!hitM) continue; const { tops, hMed } = hitM;
      done.push(box); n++; const br = box.getBoundingClientRect();
      tops.forEach(t => { const band = document.createElement('div'); band.className = 'modrow'; band.style.cssText = `left:${Math.round(br.left - gr.left)}px;width:${Math.round(br.width)}px;top:${Math.round(t - gr.top)}px;height:${Math.round(hMed)}px`; gridEl.appendChild(band); });
    }
    return n;
  }
  // hierarchical: no shared column grid, so show the regions the page is built from, ranked by how much of it they take
  function markRegions(r) {
    const gr = gridEl.getBoundingClientRect(); const L = r.left, W = r.width; const regs = [];
    for (const row of $$('body *')) {
      if (row.closest('#jig-hud, #jig-grid, #jig-axtags, .jig-tb, #jig-device') || regs.some(g => g.el.contains(row) || row.contains(g.el))) continue;
      const ks = Array.from(row.children).filter(visible).map(k => ({ k, b: k.getBoundingClientRect() })).filter(o => o.b.width >= W * 0.2 && o.b.height >= 120 && o.b.left >= L - 40 && o.b.right <= L + W + 40);
      const side = ks.filter((o, i) => ks.some((p, j) => j !== i && p.b.top < o.b.bottom - 10 && o.b.top < p.b.bottom - 10 && (p.b.left >= o.b.right - 1 || p.b.right <= o.b.left + 1)));
      if (side.length < 2) continue;
      side.forEach(o => { if (regs.length < 10 && !regs.some(g => g.el.contains(o.k) || o.k.contains(g.el))) regs.push({ el: o.k, b: o.b, a: o.b.width * Math.min(o.b.height, 1600) }); });
    }
    const ranked = regs.slice().sort((a, b) => b.a - a.a); const names = ['primary', 'secondary', 'tertiary'];
    ranked.forEach((g, i) => { const box = document.createElement('div'); box.className = 'region'; box.style.cssText = `left:${Math.round(g.b.left - gr.left)}px;top:${Math.round(g.b.top - gr.top)}px;width:${Math.round(g.b.width)}px;height:${Math.round(g.b.height)}px`;
      box.innerHTML = `<span>${names[i] || 'region ' + (i + 1)} · ${Math.round(g.b.width)}px</span>`; gridEl.appendChild(box); });
    return ranked.length;
  }
  // rows whose blocks don't sit on the grid get a dashed outline: real sites hand-build heroes and sidebars, and pretending they fit helps nobody
  function markOffGrid(cols) {
    const ci = Array.from(cols.querySelectorAll('i')).map(i => i.getBoundingClientRect()); if (ci.length < 2) return;
    const L = ci[0].left, R = ci[ci.length - 1].right, W = R - L; const lines = ci.flatMap(c => [c.left, c.right]); const on = x => lines.some(l => Math.abs(l - x) <= 2);
    const gr = gridEl.getBoundingClientRect(); const flagged = []; let n = 0;
    for (const row of $$('body *')) {
      if (n >= 12) break; if (row.closest('#jig-hud, #jig-grid, #jig-axtags, .jig-tb, #jig-device') || flagged.some(f => f.contains(row))) continue;
      const kids = Array.from(row.children).map(k => { const r = k.getBoundingClientRect(), c = css(k); const pl = px(c.paddingLeft) + px(c.borderLeftWidth), pr = px(c.paddingRight) + px(c.borderRightWidth); return { left: r.left + pl, right: r.right - pr, top: r.top, bottom: r.bottom, width: r.width - pl - pr, height: r.height }; }).filter(k => k.width >= W * 0.08 && k.height >= 60 && k.left >= L - 2 && k.right <= R + 2);
      if (kids.length < 2) continue;
      const side = kids.filter((k, i) => kids.some((o, j) => j !== i && o.top < k.bottom - 10 && k.top < o.bottom - 10 && (o.left >= k.right - 1 || o.right <= k.left + 1)));
      if (side.length < 2) continue;
      const edges = side.flatMap(k => [k.left, k.right]).filter(x => x > L + 2 && x < R - 2); if (!edges.length) continue;
      const hit = edges.filter(on).length / edges.length; if (hit >= 0.75) continue;
      const rr = row.getBoundingClientRect(); flagged.push(row); n++;
      const box = document.createElement('div'); box.className = 'offgrid';
      box.style.cssText = `left:${Math.round(rr.left - gr.left)}px;top:${Math.round(rr.top - gr.top)}px;width:${Math.round(rr.width)}px;height:${Math.round(rr.height)}px`;
      const ws = side.map(k => Math.round(k.width)); const uniq = Array.from(new Set(ws));   // a carousel lists twenty identical slides: say "597px × 20"
      const desc = uniq.length === 1 && ws.length > 2 ? `${uniq[0]}px × ${ws.length}` : (ws.length > 4 ? uniq.slice(0, 4).join(' | ') + ' …' : ws.join(' | ')) + 'px';
      box.innerHTML = `<span>own layout · ${desc} · not on the grid</span>`; gridEl.appendChild(box);
    }
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
  function scanSoon() { clearTimeout(scanTimer); scanTimer = setTimeout(scanProtection, 600); }
  // faces: detected once per image (where the browser can), then checked against the current crop on every scan
  const faceCache = new Map(); let faceRun = null;
  function checkFaces() {
    if (!('FaceDetector' in window) || faceRun) return;
    const imgs = $$('img.jig-el[data-jig-ctl="crop"]').filter(i => i.complete && i.naturalWidth && i.__jigInFrame);
    const todo = imgs.filter(i => !faceCache.has(i.currentSrc || i.src)); if (!todo.length) { applyFaces(imgs); return; }
    faceRun = (async () => { const fd = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 3 }); for (const i of todo) { try { const f = await fd.detect(i); faceCache.set(i.currentSrc || i.src, f.length ? { fx: (f[0].boundingBox.x + f[0].boundingBox.width / 2) / i.naturalWidth, fy: (f[0].boundingBox.y + f[0].boundingBox.height / 2) / i.naturalHeight } : null); } catch (e) { faceCache.set(i.currentSrc || i.src, null); } } })().then(() => { faceRun = null; if (applyFaces(imgs)) scanSoon(); });
  }
  function applyFaces(imgs) {
    let changed = false;
    imgs.forEach(i => { const f = faceCache.get(i.currentSrc || i.src); const out = !!(f && !i.__jigInFrame(f.fx, f.fy)); if (out !== !!i.__jigFaceOut) changed = true; i.__jigFaceOut = out; i.__jigFace = f || null; });
    return changed;
  }
  function scanProtection() {
    clearTimeout(scanTimer); checkFaces();
    document.documentElement.classList.add('jig-scanning');   // transitions off: read settled values, not a frame of an animation
    const ts = performance.now(); scanTimer = null;
    try { scanNow(); } finally { document.documentElement.classList.remove('jig-scanning'); state.lastScanMs = performance.now() - ts; }
  }
  function scanNow() {
    const P = state.F.protect || {}; const W = [];
    // 1. heading order
    const hs = $$('h1,h2,h3,h4,h5,h6').filter(h => h.offsetParent && !h.closest('#jig-hud'));
    let last = 0;
    hs.forEach(h => { const n = +h.tagName[1]; if (last && n > last + 1) W.push({ kind: 'heading-order', el: h, msg: `h${last} → h${n} skips a level` }); last = n; });
    // 0. alt text: every visible content image needs an alt attribute; "" is fine (decorative), a filename is not
    $$('img').forEach(img => {
      if (!img.offsetParent || img.closest('#jig-hud, .jig-tb, #jig-found, #jig-device') || img.width < 24 || img.height < 24) return;
      if (img.getAttribute('role') === 'presentation' || img.getAttribute('aria-hidden') === 'true') return;
      if (!img.hasAttribute('alt')) W.push({ kind: 'alt', el: img, msg: 'image has no alt attribute' });
      else { const a = img.getAttribute('alt').trim(); if (a && (/\.(jpe?g|png|gif|webp|svg|avif)$/i.test(a) || /^(image|img|photo|picture|dsc|img_)[\s_\-\d]*$/i.test(a))) W.push({ kind: 'alt', el: img, msg: `alt text looks like a placeholder: "${a.slice(0, 40)}"` }); }
    });
    // 1b. visual hierarchy: an h2 rendered larger than the page h1
    const h1 = hs.find(h => h.tagName === 'H1');
    if (h1) {
      const h1px = px(css(h1).fontSize); const big = hs.filter(h => h.tagName === 'H2' && px(css(h).fontSize) > h1px);
      const pv = $$('p, li').filter(t => t.offsetParent && (t.textContent || '').trim().length >= 40 && !t.closest('#jig-hud, #jig-found')).map(t => px(css(t).fontSize)).sort((a, b) => a - b); const body0 = pv.length ? pv[pv.length >> 1] : 16;
      // a logo or hidden h1 isn't a size reference: the h1 is what's wrong, not every headline on the page
      const weakH1 = srOnly(h1) || !!h1.querySelector('img, svg, picture') || h1.closest('header, nav, [class*="logo"], [class*="brand"]') || h1px <= body0 * 1.1;
      if (big.length && (weakH1 || big.length > 3)) { const top = big.slice().sort((a, b) => px(css(b).fontSize) - px(css(a).fontSize))[0];
        W.push({ kind: 'h1-role', el: h1, msg: `the h1 is ${h1.querySelector('img, svg, picture') || h1.closest('header, nav, [class*="logo"], [class*="brand"]') ? 'the logo/site name' : srOnly(h1) ? 'visually hidden' : 'no bigger than body copy'}; the page's real top heading is an h2 at ${r1(px(css(top).fontSize))}px. Make the main headline the h1, or leave the logo h1 and ignore this.` }); }
      else big.forEach(h => W.push({ kind: 'hierarchy', el: h, msg: `h2 renders at ${r1(px(css(h).fontSize))}px, larger than the h1 (${r1(h1px)}px)` }));
    }
    // 1c. a heading that renders no larger than body copy isn't reading as a heading
    const bodyPx = (() => { const ps = $$('p, li, dd, td').filter(t => t.offsetParent && (t.textContent || '').trim().length >= 40 && !t.closest('#jig-hud, #jig-found')); if (!ps.length) return 16; const v = ps.map(t => px(css(t).fontSize)).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; })();
    const localBody = h => {   // the body text this heading sits with: a following sibling text block, else one inside the same parent, else the page's
      const ok = t => t && t !== h && !h.contains(t) && /^(P|LI|DD|TD|FIGCAPTION|SMALL|SPAN|DIV)$/.test(t.tagName) && (t.textContent || '').trim().length >= 20 && !/^H[1-6]$/.test(t.tagName);
      let n = h.nextElementSibling; while (n && !ok(n)) n = n.nextElementSibling; if (n) return px(css(n).fontSize);
      const inPar = h.parentElement && Array.from(h.parentElement.querySelectorAll('p, li, dd, figcaption')).find(ok); if (inPar) return px(css(inPar).fontSize);
      return bodyPx;
    };
    hs.forEach(h => {
      if (h.querySelector("img, svg, picture") && !(h.textContent || "").trim().replace(/\s+/g, "").length) return;   // a logo heading: its size is the image
      const f = px(css(h).fontSize); const bold = px(css(h).fontWeight) >= 600; const lb = localBody(h);
      const distinct = f > lb + 0.5 && (f >= lb * 1.15 - 0.01 || bold);
      if (!distinct) W.push({ kind: 'hierarchy', el: h, msg: `${h.tagName.toLowerCase()} renders at ${r1(f)}px${bold ? '' : ', regular weight'}, next to body copy at ${r1(lb)}px; it doesn't read as a heading`, small: true, bodyPx: lb });
    });
    // 2. tap targets
    const min = P.minTapTarget || 24;
    const taps = new Set($$('button, [role=button], [data-jig=button], .jig-el[data-jig-ctl="button"], input[type=submit], input[type=button]'));
    $$('a').forEach(a => { if (looksLikeButton(a)) taps.add(a); });
    taps.forEach(b => {
      if (!b.offsetParent || b.closest('#jig-hud, .jig-tb, #jig-found, #jig-device')) return; const r = b.getBoundingClientRect();
      if (r.height < min - 0.5) W.push({ kind: 'tap-target', el: b, msg: `tap target ${Math.round(r.width)}×${Math.round(r.height)}px, min ${min}px tall${min <= 24 ? ' (WCAG 2.2 AA)' : ''}` });
      else if (r.width < min - 0.5) W.push({ kind: 'tap-target', el: b, narrow: true, msg: `tap target ${Math.round(r.width)}×${Math.round(r.height)}px, min ${min}px wide` });
      // a label that wraps inside a button reads as two buttons
      if (b.getClientRects().length === 1 && (b.textContent || '').trim()) { // count the label's real lines (distinct line tops), not height ÷ line-height: a min-height makes a box tall without wrapping anything
        const rg = document.createRange(); rg.selectNodeContents(b); const tops = new Set(Array.from(rg.getClientRects()).filter(q => q.width > 1).map(q => Math.round(q.top / 4))); const lines = tops.size;
        if (lines > 1 && (b.textContent || '').trim().split(/\s+/).length > 1) W.push({ kind: 'button-wrap', el: b, msg: `button label wraps to ${lines} lines` }); }
    });
    // 2b. buttons and links with nothing a screen reader can say
    $$('a, button, [role=button]').forEach(b => {
      if (!b.offsetParent || b.closest('#jig-hud, .jig-tb, #jig-found, #jig-device, #jig-axtags')) return;
      if (b.getAttribute('aria-hidden') === 'true' || b.closest('[aria-hidden="true"]') || b.getAttribute('tabindex') === '-1' || srOnly(b) || (b.tagName === 'A' && !b.hasAttribute('href'))) return;   // not reachable by keyboard or screen reader
      const name = (b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent || '').trim() || Array.from(b.querySelectorAll('img[alt], [aria-label], svg title')).map(i => (i.getAttribute('alt') || i.getAttribute('aria-label') || i.textContent || '').trim()).join(' ').trim() || (b.getAttribute('aria-labelledby') ? 'x' : '');
      if (!name) {
        // the common case: a thumbnail link to the same page as the headline link beside it. The headline already names it; the thumbnail should step out of the way.
        const href = b.tagName === 'A' && b.getAttribute('href');
        const twin = href && $$('a[href]').find(x => x !== b && x.getAttribute('href') === href && (x.textContent || '').trim().length > 2 && !x.closest('#jig-hud'));
        if (twin) W.push({ kind: 'dup-link', el: b, msg: 'image link repeats the headline link beside it; hide it from keyboard and screen readers (aria-hidden="true" tabindex="-1")' });
        else W.push({ kind: 'no-name', el: b, msg: `${b.tagName === 'A' ? 'link' : 'button'} has no accessible name (no text, alt, or aria-label)` });
      }
    });
    // 2c. more than one h1
    const h1s = hs.filter(h => h.tagName === 'H1'); if (h1s.length > 1) h1s.slice(1).forEach(h => W.push({ kind: 'heading-order', el: h, msg: `${h1s.length} h1s on the page; one is the convention` }));
    // 2d. body copy too small to read, and measures too long or short to read comfortably
    const phone = state.bp === 'phone'; const minBody = 14;
    $$('body *').forEach(t => {
      if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|SVG|H[1-6]|BUTTON|A|LABEL|OPTION)$/.test(t.tagName) || !t.offsetParent || t.closest('#jig-hud, .jig-tb, #jig-found, #jig-device, #jig-axtags, nav, footer, small, .jig-badge')) return;
      const ownTxt = Array.from(t.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').trim(); if (ownTxt.length < 40) return; const txt = ownTxt;
      if (css(t).textTransform === 'uppercase' || /footer|copyright|legal|colophon|credit/i.test((t.id || '') + ' ' + (t.className || '') + ' ' + ((t.closest('[id*="footer"],[class*="footer"]') || {}).tagName || ''))) return;   // labels and fine print aren't body copy
      const c = css(t); const f = px(c.fontSize);
      if (f < minBody - 0.5) W.push({ kind: 'small-text', el: t, msg: `body copy at ${r1(f)}px; ${minBody}px is the floor${phone ? ' on a phone' : ''}`, min: minBody });
      // measure: characters per line, from the box width and an average glyph width
      const r = t.getBoundingClientRect(); if (r.width < 40) return; const cpl = r.width / (f * 0.5);
      const lines = Math.round(r.height / (px(c.lineHeight) || f * 1.4));
      if (lines >= 3 && cpl > 90) W.push({ kind: 'measure', el: t, msg: `about ${Math.round(cpl)} characters per line; 45 to 85 reads best`, cpl, long: true });
    });
    // 2e. text spilling out of its box
    $$('h1, h2, h3, h4, h5, h6, p, li, a, button, span, div').forEach(t => {
      if (!t.offsetParent || t.closest('#jig-hud, .jig-tb, #jig-found, #jig-device, #jig-axtags, .jig-crop-box') || t.tagName === 'DIV' && !Array.from(t.childNodes).some(n => n.nodeType === 3 && n.textContent.trim())) return;
      if (srOnly(t)) return;   // visually hidden on purpose (skip links, screen-reader labels)
      const c = css(t); if (c.overflow !== 'visible' && c.overflow !== '') return;
      if (t.scrollWidth > t.clientWidth + 4 && c.whiteSpace !== 'nowrap' && t.clientWidth > 0) W.push({ kind: 'overflow', el: t, msg: `text runs ${Math.round(t.scrollWidth - t.clientWidth)}px past its box` });
      const par = t.parentElement; if (par && /hidden|clip/.test(css(par).overflow + css(par).overflowY)) { const pr = par.getBoundingClientRect(), tr = t.getBoundingClientRect(); if (tr.bottom > pr.bottom + 2 || tr.right > pr.right + 2) W.push({ kind: 'overflow', el: t, msg: 'text is clipped by its container' }); }
    });
    // 2f. images rendering past their native resolution (soft), and faces the crop leaves out
    $$('img').forEach(img => {
      if (!img.offsetParent || !img.naturalWidth || img.closest('#jig-hud, #jig-device')) return;
      const r = img.getBoundingClientRect(); const z = (img.__jigZoom ? img.__jigZoom() : 1);
      const scale = Math.max(r.width / img.naturalWidth, r.height / img.naturalHeight) * z;
      if (scale > 1.5) W.push({ kind: 'soft', el: img, msg: `image rendered at ${scale.toFixed(1)}× its native pixels${z > 1 ? ` (zoom ${z.toFixed(2)})` : ''}; it will look soft` });
      if (img.__jigFaceOut) W.push({ kind: 'face', el: img, msg: 'a detected face sits outside the crop' });
    });
    // 3. contrast: every element with its own text, sampled under its own box
    const seen = new Set();
    $$('body *').forEach(t => {   // any element that carries its own words: old sites put text straight into divs, tds, fonts
      if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|SVG|OPTION)$/.test(t.tagName) || !t.offsetParent || t.closest('#jig-hud, .jig-tb, #jig-found, #jig-device, #jig-axtags, .jig-badge, #jig-grid')) return;
      const own = Array.from(t.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
      if (!own) return;
      const fg = parseColor(css(t).color); if (!fg || fg[3] === 0) return;
      const over = imageBehind(t);
      let bg = null, how = '';
      let busy = 0;
      if (over) {
        let patches = sampleImage(over.img, t); how = 'over image';
        if (patches && patches.some(pc => pc[3] < 1)) { const under = solidBehind(over.img); patches = patches.map(pc => pc[3] < 1 ? blend(under, pc) : pc); }
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
    W.forEach(w => { if (w.el && w.el.classList && w.el.classList.contains('jig-scrim-panel') && w.el.parentElement) w.el = w.el.parentElement; });
    // 9. page and form basics, links and empty headings: the first things a screen reader user runs into
    { const root = document.documentElement; const jigUI = x => x.closest('#jig-hud, .jig-tb, #jig-found, #jig-device, #jig-axtags, .jig-badge');
      // out of everyone's reach: hidden from assistive tech, or parked off the page (spam traps like Mailchimp's sit at left: -5000px)
      const unreachable = x => { if (x.closest('[aria-hidden="true"], [inert]')) return true; const r = x.getBoundingClientRect(); return r.right <= 0 || r.bottom + window.scrollY <= 0 || r.left >= document.documentElement.scrollWidth; };
      if (!(root.getAttribute('lang') || '').trim()) W.push({ kind: 'lang', el: root, page: true, msg: 'no lang attribute on <html>; screen readers have to guess the language and may read every word with the wrong accent' });
      if (!(document.title || '').trim()) W.push({ kind: 'title', el: root, page: true, msg: 'the page has no <title>' });
      $$('input, select, textarea').forEach(f => {
        if (jigUI(f) || !visible(f) || unreachable(f) || f.getAttribute('tabindex') === '-1') return; const type = (f.getAttribute('type') || '').toLowerCase(); if (/^(hidden|submit|button|reset|image)$/.test(type)) return;
        const named = (f.getAttribute('aria-label') || '').trim() || (f.getAttribute('aria-labelledby') || '').split(/\s+/).some(id => { const n = id && document.getElementById(id); return n && n.textContent.trim(); }) || (f.labels && Array.from(f.labels).some(l => l.textContent.trim())) || (f.getAttribute('title') || '').trim();
        if (!named) W.push({ kind: 'label', el: f, msg: `${f.tagName === 'INPUT' ? (type || 'text') + ' field' : f.tagName.toLowerCase()} has no label${f.placeholder ? ` (the placeholder "${f.placeholder.slice(0, 30)}" disappears as you type; it isn't a label)` : ''}` });
      });
      const VAGUE = /^(click here|click|here|read more|more|learn more|find out more|details|more info|more details|link|this|go|continue|see more|view more|see all)$/i;
      $$('a[href]').forEach(a => {
        if (jigUI(a) || !visible(a) || unreachable(a)) return;
        const name = ((a.getAttribute('aria-label') || '').trim() || (a.textContent || '').trim().replace(/\s+/g, ' ').replace(/[\s›»→>….]+$/, '').trim());
        if (VAGUE.test(name) && !a.getAttribute('aria-describedby')) W.push({ kind: 'vague-link', el: a, msg: `link text "${name}" doesn't say where it goes` });
        // colour-only link: sits in a sentence, no underline/border/background/weight cue, and under 3:1 against the words around it
        const p = a.parentElement; if (!p || !/^(P|LI|TD|DD|BLOCKQUOTE|SPAN|DIV|FIGCAPTION)$/.test(p.tagName)) return;
        const own = Array.from(p.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('').replace(/\s+/g, ' ').trim(); if (own.length < 20) return;
        const ca = css(a), cp = css(p);
        if (/underline/.test(ca.textDecorationLine + ' ' + cp.textDecorationLine) || px(ca.borderBottomWidth) > 0 || (parseColor(ca.backgroundColor) || [0, 0, 0, 0])[3] > 0.1 || (px(ca.fontWeight) >= 600 && px(cp.fontWeight) < 600) || (ca.fontStyle !== cp.fontStyle)) return;
        if ($$('*', a).some(d => /underline/.test(css(d).textDecorationLine) || px(css(d).borderBottomWidth) > 0)) return;
        const fa = parseColor(ca.color), fp = parseColor(cp.color); if (!fa || !fp) return; const r = contrast(fa, fp);
        if (r < 3) W.push({ kind: 'colour-link', el: a, msg: `link marked by colour alone (${r.toFixed(1)}:1 against the text around it; needs an underline, or 3:1 plus a hover/focus cue)`, value: +r.toFixed(1), min: 3 });
      });
      $$('h1,h2,h3,h4,h5,h6').forEach(h => { if (jigUI(h) || !h.offsetParent && css(h).position !== 'fixed') return; if (!(h.textContent || '').trim() && !h.querySelector('img[alt]:not([alt=""]), svg[aria-label], [aria-label]') && !(h.getAttribute('aria-label') || '').trim()) W.push({ kind: 'empty-heading', el: h, msg: `empty ${h.tagName.toLowerCase()}; screen reader users jump between headings and land on nothing` }); });
    }
    const hid = new Map(); const hidden = el => { if (!hid.has(el)) hid.set(el, srOnly(el)); return hid.get(el); };   // visually hidden text is for screen readers; size, contrast and clipping rules don't apply
    state.warnings = W.filter((w, i) => W.findIndex(x => x.el === w.el && x.kind === w.kind) === i && (/heading|h1|^lang$|^title$/.test(w.kind) || !hidden(w.el)) && (w.page || !w.el.closest(OFF))); state.warnings = splitDismissed(state.warnings); axTrackBaseline(); renderHUD(); postToParent(); paintAX();
  }
  // ax jig: every element with a protection warning gets a pink outline and a chip saying why
  let axTags = null;
  function paintAX() {
    const axOn = state.jigs.has('ax');
    $$('.jig-ax').forEach(el => el.classList.remove('jig-ax'));
    if (!axTags) { axTags = document.createElement('div'); axTags.id = 'jig-axtags'; document.body.appendChild(axTags); on(window, 'scroll', placeAXTags, { passive: true }); on(window, 'resize', placeAXTags); }
    axTags.innerHTML = '';
    const frameOpen = !!(deviceEl && $('iframe', deviceEl));
    if (!axOn || frameOpen) { $$('.jig-ax').forEach(el => el.classList.remove('jig-ax')); return; }
    const byEl = new Map(); const num = new Map(); buildAXReport().rules.forEach(r => r.items.forEach(i => num.set(axKey(i.el, i.kind), i.n)));
    state.warnings.forEach(w => { if (!w.el || !w.el.isConnected || w.page) return; w.el.classList.add('jig-ax'); byEl.set(w.el, (byEl.get(w.el) || []).concat(w)); });
    byEl.forEach((ws, el) => {
      const tag = document.createElement('div'); tag.className = 'tag'; tag.__el = el;
      const label = w => w.kind === 'contrast' ? `contrast ${w.value} / ${w.min}` : w.kind === 'tap-target' ? `tap ${w.msg.replace(/.*×(\d+)px.*/, '$1')}px tall` : w.kind === 'alt' ? 'no alt' : w.kind === 'small-text' ? 'small text' : w.kind === 'measure' ? `${Math.round(w.cpl)} cpl` : w.kind === 'button-wrap' ? 'label wraps' : w.kind === 'no-name' ? 'no name' : w.kind === 'overflow' ? 'overflows' : w.kind === 'soft' ? 'soft' : w.kind === 'face' ? 'face cropped' : w.kind === 'h1-role' ? 'h1 is the logo?' : w.kind === 'dup-link' ? 'duplicate link' : w.kind === 'label' ? 'no label' : w.kind === 'vague-link' ? 'vague link' : w.kind === 'colour-link' ? `colour only ${w.value}` : w.kind === 'empty-heading' ? 'empty heading' : w.kind;
      ws.slice().sort((a, b) => (num.get(axKey(a.el, a.kind)) || 1e9) - (num.get(axKey(b.el, b.kind)) || 1e9)).forEach((w, k) => { if (k) tag.append(' · '); const b = document.createElement('span'); b.className = 'n'; b.textContent = num.get(axKey(w.el, w.kind)) || '•'; tag.append(b, label(w)); });
      tag.title = ws.map(w => w.msg).join('\n');
      axTags.appendChild(tag);
    });
    placeAXTags();
  }
  function placeAXTags() {
    if (!axTags) return;
    $$('.tag', axTags).forEach(t => { const r = t.__el.getBoundingClientRect(); const off = r.top < 22; t.style.top = `${Math.max(0, off ? r.bottom + 4 : r.top - 20)}px`; t.style.left = `${Math.max(0, r.left)}px`; t.hidden = r.width === 0 || r.bottom < 0 || r.top > window.innerHeight; });
  }
  function imageBehind(t) {
    const tr = t.getBoundingClientRect(); const ta = Math.max(1, tr.width * tr.height);
    const overlap = r => Math.max(0, Math.min(tr.right, r.right) - Math.max(tr.left, r.left)) * Math.max(0, Math.min(tr.bottom, r.bottom) - Math.max(tr.top, r.top)) / ta;
    let n = t.parentElement;
    while (n && n !== document.body) {
      // an <img> counts only if it actually sits under the words (an avatar beside a byline doesn't)
      const img = Array.from(n.children).find(c => c.tagName === 'IMG' && c !== t && !c.contains(t) && overlap(c.getBoundingClientRect()) >= 0.5);
      if (img && css(n).position !== 'static') return { img, box: n };
      // page builders (Bold, Elementor, Divi) put the photo in an absolutely positioned layer beside the content, not behind it in the tree
      for (const c of n.children) {
        if (c === t || c.contains(t) || /^(SCRIPT|STYLE|TEMPLATE|svg)$/i.test(c.tagName) || (c.id || '').startsWith('jig-') || !/absolute|fixed/.test(css(c).position) || overlap(c.getBoundingClientRect()) < 0.5) continue;
        const cand = [c, ...c.querySelectorAll('*')].slice(0, 40);
        const src = cand.find(e => (/^(IMG|VIDEO|CANVAS)$/.test(e.tagName) || /url\(/.test(css(e).backgroundImage)) && overlap(e.getBoundingClientRect()) >= 0.5);
        if (src) return { img: src, box: n };
      }
      const c = css(n), bgi = c.backgroundImage;
      if (bgi !== 'none' && /url\(/.test(bgi)) {
        // a small no-repeat background is an icon (a bullet, an arrow), not a picture behind the text
        const pxs = ((c.backgroundSize || '').match(/[\d.]+px/g) || []).map(parseFloat); const icon = /no-repeat/.test(c.backgroundRepeat) && pxs.length > 0 && pxs.every(v => v <= 96);   // 'auto 16px' is an icon too
        if (!icon && overlap(n.getBoundingClientRect()) >= 0.5) return { img: n, box: n };
      }
      const bgc = parseColor(c.backgroundColor); if (bgc && bgc[3] >= 0.95) return null;   // text sits on a solid colour: nothing further up is behind it
      n = n.parentElement;
    }
    return null;
  }
  function scrimBehind(t) {
    // a translucent background on the text's own box or an ancestor between it and the image
    let n = t;
    while (n && n !== document.body) {
      for (const ps of ['::before', '::after']) { const pc = getComputedStyle(n, ps); if (pc.content !== 'none' && /absolute|fixed/.test(pc.position)) { const pb = parseColor(pc.backgroundColor); if (pb && pb[3] > 0.05 && pb[3] < 1) { pb[3] *= (+pc.opacity || 1); return pb; } } }   // a builder's section overlay
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
  const bgImgs = new Map();
  function bgImage(el) {
    const m = (css(el).backgroundImage || '').match(/url\(["']?([^"')]+)["']?\)/); if (!m) return null;
    let im = bgImgs.get(m[1]); if (!im) { im = new Image(); im.decoding = 'async'; im.onload = () => scanSoon(); im.src = m[1]; bgImgs.set(m[1], im); }
    return im.complete && im.naturalWidth ? im : null;
  }
  // where a CSS background image lands inside its box: background-size cover/contain/auto/px, background-position in % or px
  function sampleBg(el, t) {
    const im = bgImage(el); if (!im) return null;
    try {
      const c = css(el), br = el.getBoundingClientRect(), tr = t.getBoundingClientRect(); const iw = im.naturalWidth, ih = im.naturalHeight;
      const size = (c.backgroundSize || 'auto').split(' '); let s;
      if (size[0] === 'cover') s = Math.max(br.width / iw, br.height / ih); else if (size[0] === 'contain') s = Math.min(br.width / iw, br.height / ih);
      else if (/%$/.test(size[0])) s = br.width * parseFloat(size[0]) / 100 / iw; else if (/px$/.test(size[0])) s = parseFloat(size[0]) / iw; else s = 1;
      const rw = iw * s, rh = ih * s; const pos = (c.backgroundPosition || '50% 50%').split(/\s+/);
      const off = (v, room) => /%$/.test(v) ? room * parseFloat(v) / 100 : /px$/.test(v) ? parseFloat(v) : room / 2;
      const ox = off(pos[0] || '50%', br.width - rw), oy = off(pos[1] || '50%', br.height - rh);
      const x0 = clamp((tr.left - br.left - ox) / s, 0, iw), y0 = clamp((tr.top - br.top - oy) / s, 0, ih), x1 = clamp((tr.right - br.left - ox) / s, 0, iw), y1 = clamp((tr.bottom - br.top - oy) / s, 0, ih);
      const N = 8, cv = document.createElement('canvas'); cv.width = N; cv.height = N; const ctx = cv.getContext('2d');
      ctx.drawImage(im, x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0), 0, 0, N, N);
      const d = ctx.getImageData(0, 0, N, N).data; const patches = []; for (let i = 0; i < d.length; i += 4) patches.push([d[i], d[i + 1], d[i + 2], d[i + 3] / 255]); return patches;
    } catch (e) { return null; }   // cross-origin image: unmeasured, never guessed
  }
  function sampleImage(img, t) {
    if (img.tagName !== 'IMG') return /url\(/.test(css(img).backgroundImage) ? sampleBg(img, t) : null;
    if (!img.complete || !img.naturalWidth) return null;
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
      for (let i = 0; i < d.length; i += 4) patches.push([d[i], d[i + 1], d[i + 2], d[i + 3] / 255]);
      return patches;
    } catch (e) { return null; } // tainted canvas (file://) or cross-origin
  }
  function parseColor(s) { const m = (s || '').match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(parseFloat); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
  function lum([r, g, b]) { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
  function contrast(a, b) { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
  function rgb2hsl([r, g, b]) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; } return [h, s, l]; }
  function hsl2rgb([h, s, l]) { if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; } const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map(v => Math.round(v * 255)); }
  const hex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  // Nudge a colour's lightness, same hue and saturation, until it clears `need` against `against`. Returns null if it can't.
  function passingShade(color, against, need) {
    const [h, sat, l0] = rgb2hsl(color); const dir = lum(against) > 0.5 ? -1 : 1;   // light background: go darker; dark background: go lighter
    for (let l = l0; l >= 0 && l <= 1; l += dir * 0.02) { const c = hsl2rgb([h, sat, l]); if (contrast(c, against) >= need) return c; }
    const c = hsl2rgb([h, sat, dir < 0 ? 0 : 1]); return contrast(c, against) >= need ? c : null;
  }
  // Fix a plain-background contrast failure on `el` by moving ITS colour (or its own background, if it paints one) to the nearest passing shade.
  // Text over images is the scrim's job, not this.
  function fixContrast(el, shared) {
    if (imageBehind(el)) return null;
    const c = css(el); const fg = parseColor(c.color); if (!fg) return null;
    const own = parseColor(c.backgroundColor); const hasOwnBg = own && own[3] > 0.9;
    const bg = hasOwnBg ? own : solidBehind(el);
    const fs = px(c.fontSize), bold = px(c.fontWeight) >= 700; const P = state.F.protect || {};
    const need = (fs >= 24 || (bold && fs >= 18.66)) ? Math.min(3, P.minContrast || 4.5) : (P.minContrast || 4.5);
    const before = contrast(fg, bg); if (before >= need) return { already: true, ratio: before };
    const prop = hasOwnBg ? 'background-color' : 'color';
    let to = hasOwnBg ? passingShade(own, fg, need) : passingShade(fg, bg, need); if (!to) return null;
    let group = null;
    if (shared) { const k = hex(hasOwnBg ? own : fg); /* one colour, one fix, as a background or as text */ group = shared.get(k) || { to: null, fixes: [] }; shared.set(k, group);
      if (group.to && (hasOwnBg ? contrast(fg, group.to) : contrast(group.to, bg)) >= need) to = group.to;   // one colour, one fix
      else if (group.to) { group.to = to; group.fixes.forEach(f => f.reapply(to)); }   // this one needs it darker: bring the earlier ones along
      else group.to = to; }
    const prev = el.style.getPropertyValue(prop);
    el.style.setProperty(prop, hex(to), 'important');
    const after = hasOwnBg ? contrast(fg, to) : contrast(to, bg);
    const from = hex(hasOwnBg ? own : fg);
    record(el, 'type', { contrast: { prop, from, to: hex(to), before: +before.toFixed(1), after: +after.toFixed(1), min: need } }, `${prop === 'color' ? 'colour' : 'background'} ${from} → ${hex(to)} (contrast ${before.toFixed(1)} → ${after.toFixed(1)})`, 'contrast');
    if (group) { const fgC = fg, bgC = bg, ownBg = hasOwnBg, nd = need, bf = before;
      group.fixes.push({ reapply: t => { el.style.setProperty(prop, hex(t), 'important'); const af = ownBg ? contrast(fgC, t) : contrast(t, bgC); record(el, 'type', { contrast: { prop, from, to: hex(t), before: +bf.toFixed(1), after: +af.toFixed(1), min: nd } }, `${prop === 'color' ? 'colour' : 'background'} ${from} → ${hex(t)} (contrast ${bf.toFixed(1)} → ${af.toFixed(1)})`, 'contrast'); } }); }
    return { prop, from, to: hex(to), before, after, undo: () => { el.style.removeProperty(prop); if (prev) el.style.setProperty(prop, prev); unrecord(el, 'type', 'contrast'); } };
  }

  // ------------------------------------------------------------ HUD
  const hud = document.createElement('div'); hud.id = 'jig-hud';
  hud.innerHTML = `
    <header><b>jig <i>studio</i></b><small id="jig-bp"></small><button class="min" id="jig-min-btn" title="minimize">–</button></header>
    <div class="jigs">${JIGS.map(j => `<button data-jig-toggle="${j.id}" aria-pressed="false">${j.label}</button>`).join('')}</div>
    <div class="welcome" id="jig-welcome" hidden><b>Pink is what fails accessibility.</b> Switch on <i>images</i>, <i>type</i>, <i>buttons</i> or <i>spacing</i>, then drag or click anything outlined. Everything you do lands in one patch; <b>Copy patch</b> and hand it to your AI.</div>
    <div class="tools">
      <button id="jig-grid-btn" title="g">grid</button>
      <span class="devwrap"><button id="jig-device-btn" title="preview on a phone or tablet" aria-haspopup="menu" aria-expanded="false">device ▾</button>
      <div id="jig-device-menu" role="menu" hidden>${DEVICES.map(d => `<button role="menuitemradio" data-device="${d.id}"><span>${d.name}</span><small>${d.w}×${d.h}</small></button>`).join('')}<button role="menuitem" data-device="" class="back">back to desktop</button></div></span>
      <span class="spacer"></span>
      <button id="jig-adv-btn" class="ghost" title="foundation, columns, auto, rescan, reset">advanced</button>
    </div>
    <div class="advpanel">
      <div class="arow"><label>columns</label><div><select id="jig-cols-sel" title="grid columns"></select></div></div>
      <div class="arow"><label>auto fix</label><div><button id="jig-norm-btn" title="snap every size and space to the scales, and fix what protection flagged" aria-pressed="false">off</button><select id="jig-q-res" title="how many steps to snap to"><option value="32">light</option><option value="16" selected>medium</option><option value="8">strict</option></select></div></div>
      <div class="arow"><label>scales</label><div><button id="jig-found-btn">foundation</button><button id="jig-scan-btn">rescan</button><button id="jig-reset-btn">reset all</button></div></div>
      <div class="src" id="jig-src"></div>
    </div>
    <div class="list"><h6 class="fold" data-fold="ax" aria-expanded="false"><span>accessibility</span><em id="jig-ax-n">0</em></h6><div id="jig-ax" class="axr" hidden><div class="axh"><b id="jig-axr-n">0</b><span id="jig-axr-l">accessibility failures</span></div><div id="jig-axr-rules"></div><div class="axb"><button id="jig-axfix" title="fix the accessibility failures the jig knows how to fix; no other changes">Fix what I can</button><button id="jig-axdl" title="download a styled report you can share or print to PDF">Report</button><button id="jig-axmd" class="ghost" title="copy the same report as markdown, for a ticket">Markdown</button></div></div><h6 class="fold" data-fold="changes" aria-expanded="false"><span>changes</span><em id="jig-ch-n">0</em></h6><div id="jig-changes" hidden></div><h6 class="fold" data-fold="warn" aria-expanded="false"><span>notes</span><em id="jig-wn-n">0</em></h6><div id="jig-warn" hidden></div></div>
    <footer><button class="primary" id="jig-copy-btn">Copy patch</button><small id="jig-count"></small></footer>
    <div class="hint">page is inert while the jig is on · hold Alt to click through · Esc deselects</div>`;

  function renderHUD() {
    if (EMBED || !hud.isConnected || state.batch) return;
    const CAP = 150; const more = (box, n) => { if (n > 0) { const m = document.createElement('div'); m.className = 'empty'; m.textContent = `+ ${n} more in the patch`; box.appendChild(m); } };
    const ch = $('#jig-changes'), wn = $('#jig-warn');
    ch.innerHTML = ''; wn.innerHTML = '';
    if (!state.changes.size) ch.innerHTML = state.jigs.size ? '<div class="empty">Nothing changed yet. Hover anything outlined; drag, pinch, or click it.</div>' : '<div class="empty">Switch on a jig above. Only that kind of thing becomes adjustable, so the page stays readable.</div>';
    let shown = 0;
    for (const [k, c] of state.changes) {
      if (++shown > CAP) { more(ch, state.changes.size - CAP); break; }
      const row = document.createElement('div'); row.className = 'row';
      row.innerHTML = `<span class="n">${esc(c.name)}</span><span class="s">${esc(c.summary)}</span><span class="x" title="reset">×</span>`;
      row.querySelector('.x').onclick = e => { e.stopPropagation(); const el = $(c.el); if (el && el.__jigReset) el.__jigReset(); else state.changes.delete(k); renderHUD(); };
      row.onclick = () => { const el = $(c.el); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); select(el); } };
      ch.appendChild(row);
    }
    if (state.axFix && !state.normalize && (state.autoFixes || []).length) {
      const h = document.createElement('h6'); h.textContent = `ax fixes · ${state.autoFixes.length}`; ch.appendChild(h);
      state.autoFixes.slice(0, CAP).forEach(f => { const row = document.createElement('div'); row.className = 'row'; row.innerHTML = `<span class="n">${esc(nameOf(f.el))}</span><span class="s">${esc(f.what)}</span>`; ch.appendChild(row); });
    }
    if (state.normalize) {
      const g = normalizeGroups(); const h = document.createElement('h6'); h.textContent = `auto fix ${resName(state.normalizeRes)} · ${g.reduce((a, x) => a + x.els.length, 0)} snaps · ${(state.autoFixes || []).length} fixes`; ch.appendChild(h);
      (state.autoFixes || []).slice(0, CAP).forEach(f => { const row = document.createElement('div'); row.className = 'row'; row.innerHTML = `<span class="n">${esc(nameOf(f.el))}</span><span class="s">${esc(f.what)}</span>`; ch.appendChild(row); });
      g.slice(0, 12).forEach(x => { const row = document.createElement('div'); row.className = 'row'; row.innerHTML = `<span class="n">${esc(x.prop)}</span><span class="s">${x.from}px → ${x.to}px · ${x.els.length} element${x.els.length === 1 ? '' : 's'}</span>`; ch.appendChild(row); });
      if (g.length > 12) { const m = document.createElement('div'); m.className = 'empty'; m.textContent = `+ ${g.length - 12} more groups in the patch`; ch.appendChild(m); }
    }
    if (state.frame.changes.length) {
      const h = document.createElement('h6'); h.textContent = (state.frame.device || 'device') + ' changes'; ch.appendChild(h);
      state.frame.changes.forEach(c => { const row = document.createElement('div'); row.className = 'row'; row.innerHTML = `<span class="n">${esc(c.name)}</span><span class="s">${esc(c.summary)}</span>`; ch.appendChild(row); });
    }
    const inFrame = !!(state.device && deviceEl);
    if (inFrame) {
      // a device frame is open: its notes are the ones that matter; the desktop's come back when the frame closes
      const fw = state.frame.warnings || [];
      if (!fw.length) wn.innerHTML = `<div class="empty">No notes on ${esc(state.device.name)}.</div>`;
      fw.forEach(w => { const row = document.createElement('div'); row.className = 'row warn'; row.innerHTML = `<span class="n">${esc(w.name || w.kind)}</span><span class="s">${esc(w.msg)}</span>`;
        row.onclick = () => { const fr = $('iframe', deviceEl); if (fr && fr.contentWindow) fr.contentWindow.postMessage({ jig: 'reveal', el: w.el }, '*'); }; wn.appendChild(row); });
    } else {
      if (!state.warnings.length) wn.innerHTML = '<div class="empty">No notes. The page passes.</div>';
      const grp = new Map(); state.warnings.forEach(w => { const k = w.kind + '|' + w.msg.replace(/\d+(\.\d+)?/g, '#'); if (!grp.has(k)) grp.set(k, []); grp.get(k).push(w); });
      let rows = 0;
      for (const list of grp.values()) {
        if (++rows > CAP) { more(wn, grp.size - CAP); break; }
        const w = list[0]; let i = 0;
        const row = document.createElement('div'); row.className = 'row warn';
        row.innerHTML = list.length > 1 ? `<span class="n">${list.length} ×</span><span class="s">${esc(w.msg)} · click to step through</span>` : `<span class="n">${esc(nameOf(w.el))}</span><span class="s">${esc(w.msg)}</span>`;
        row.onclick = () => { const t = list[i++ % list.length].el; t.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (t.classList.contains('jig-el')) select(t); };
        wn.appendChild(row);
      }
    }
    const total = state.changes.size + state.frame.changes.length + (state.normalize ? state.normalize.length : 0);
    const nW = inFrame ? (state.frame.warnings || []).length : state.warnings.length;
    $('#jig-count').textContent = `${total} change${total === 1 ? '' : 's'}`;
    const chN = $('#jig-ch-n'), wnN = $('#jig-wn-n'); if (chN) chN.textContent = total; if (wnN) { wnN.textContent = nW; wnN.classList.toggle('warn', nW > 0); }
    if (!state.device) $('#jig-bp').textContent = `${state.bp} · ${window.innerWidth}px`;
    renderAXPanel();
    const F = state.F; const inf = F.mode === 'inferred' || F.type.inferred || F.buttons.inferred;
    $('#jig-src').textContent = `${INJECTED ? 'injected by bookmarklet · ' : ''}foundation: ${F.name} · ${state.foundationSource}${inf ? ` · ${F.type.steps.length} type steps, ${F.spacingSteps.length} spacing steps, ${F.buttons.sizes.length} button size${F.buttons.sizes.length === 1 ? '' : 's'} · proposed tokens ride in the patch` : ''}`;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ------------------------------------------------------------ patch
  // which CMS or builder made this page, so the patch can tell the AI where changes go (GIVE-THIS-TO-YOUR-AI.md, section 6)
  function detectPlatform() {
    const gen = ((document.querySelector('meta[name="generator" i]') || {}).content || '').trim();
    const has = sel => { try { return !!document.querySelector(sel); } catch (e) { return false; } };
    const g = re => re.test(gen);
    if (g(/^WordPress/i) || has('link[href*="/wp-content/"], script[src*="/wp-content/"], script[src*="/wp-includes/"]')) return gen && /^WordPress/i.test(gen) ? gen : 'WordPress';
    if (window.Shopify || has('link[href*="cdn.shopify.com"], script[src*="cdn.shopify.com"]')) return 'Shopify';
    if (g(/Wix\.com/i) || window.wixBiSession || has('script[src*="static.parastorage.com"]')) return 'Wix';
    if (window.Static && window.Static.SQUARESPACE_CONTEXT || has('script[src*="squarespace.com"], link[href*="squarespace.com"]')) return 'Squarespace';
    if (g(/^Webflow/i) || document.documentElement.hasAttribute('data-wf-site')) return 'Webflow';
    if (g(/^Joomla/i)) return gen;
    if (g(/^Drupal/i) || window.drupalSettings || has('script[data-drupal-selector]')) return gen && /^Drupal/i.test(gen) ? gen : 'Drupal';
    if (g(/^Ghost/i)) return gen;
    if (gen) return gen;   // some other builder that names itself (Tilda, Duda, Hugo, Framer…)
    return '';
  }
  function buildPatch() {
    const when = new Date(); const stamp = when.toISOString().slice(0, 16).replace('T', ' ');
    const lines = [`# jig patch · ${state.F.name} · ${location.pathname} · ${stamp}`, ''];
    { const pf = detectPlatform(); if (pf) lines.splice(1, 0, `platform: ${pf} · apply it the ${pf.split(' ')[0]} way (GIVE-THIS-TO-YOUR-AI.md, section 6)`); }
    const all = [...state.changes.values(), ...state.frame.changes];
    if (!all.length) lines.push('- (no changes)');
    // colour fixes share a rule on almost every site: one line per colour change, not one per link
    const cgrp = new Map(); const rest = [];
    all.forEach(c => { if (c.contrast && !c.step && !c.size) { const k = c.contrast.prop + c.contrast.from + c.contrast.to + c.bp; if (!cgrp.has(k)) cgrp.set(k, []); cgrp.get(k).push(c); } else rest.push(c); });
    { const sg = new Map(); rest.forEach(c => { const k = c.summary + '|' + c.bp; if (!sg.has(k)) sg.set(k, []); sg.get(k).push(c); });   // identical changes on many elements: one line
      sg.forEach(list => { const c = list[0]; const tag = c.bp !== 'desktop' ? ` (${c.device ? c.device + ', ' : ''}${c.bp})` : '';
        lines.push(list.length > 2 ? `- ${list.length} × ${c.summary}${tag} (first: ${c.name}; every selector is in the JSON)` : list.map(x => `- ${x.name}: ${x.summary}${tag}`).join('\n')); }); }
    cgrp.forEach(list => { const c = list[0], x = c.contrast; if (list.length === 1) lines.push(`- ${c.name}: ${c.summary}`); else lines.push(`- ${x.prop === 'color' ? 'colour' : 'background'} ${x.from} → ${x.to} on ${list.length} elements (contrast to ${Math.min(...list.map(l => l.contrast.after)).toFixed(1)}+; first: ${c.name}). Change the rule that sets ${x.from}, not each element.`); });
    if ((state.dismissedWarnings || []).length) lines.push('', `(${state.dismissedWarnings.length} finding${state.dismissedWarnings.length === 1 ? '' : 's'} dismissed by the reviewer on purpose; leave them as they are.)`);
    const warns = [...state.warnings.map(w => ({ kind: w.kind, el: selectorOf(w.el), name: nameOf(w.el), msg: w.msg, value: w.value, min: w.min })), ...state.frame.warnings.map(w => ({ ...w, msg: w.msg + ' (' + (state.frame.device || 'device') + ')' }))];
    if (warns.length) {
      lines.push('', `⚠ ${warns.length} note${warns.length === 1 ? '' : 's'} (accessibility):`);
      const grp = new Map(); warns.forEach(w => { const k = w.kind + '|' + w.msg.replace(/\d+(\.\d+)?/g, '#'); if (!grp.has(k)) grp.set(k, []); grp.get(k).push(w); });
      grp.forEach(list => { if (list.length === 1) lines.push(`- ${list[0].name}: ${list[0].msg}`); else lines.push(`- ${list.length} × ${list[0].msg}${/no accessible name/.test(list[0].msg) ? ' (first: ' + list[0].el + ')' : ''}`); });
    }
    const json = [];
    all.forEach(c => { const { name, summary, ...rest } = c; json.push(rest); });
    warns.forEach(w => json.push({ warn: w.kind, el: w.el, msg: w.msg, ...(w.value ? { value: w.value, min: w.min } : {}) }));
    if (state.axFix && !state.normalize && (state.autoFixes || []).length) { lines.push('', `# ax fixes · ${state.autoFixes.length}`, '', 'Accessibility failures fixed with "Fix what I can" (no other snapping); each is also listed under changes above with its values.', ''); state.autoFixes.forEach(f => lines.push(`- ${nameOf(f.el)}: ${f.what}`)); }
    if (state.normalize) {
      const g = normalizeGroups();
      const qs = quantizeScales(state.normalizeRes || '16');
      if ((state.autoFixes || []).length) { lines.push('', `# auto fixes · ${state.autoFixes.length}`, '', 'Protection failures fixed with the same controls a person would use; each is also listed under changes above with its values.', ''); { const g = new Map(); state.autoFixes.forEach(f => { const k = f.what.replace(/\(contrast [\d.]+ → [\d.]+\)/, '').trim(); if (!g.has(k)) g.set(k, []); g.get(k).push(f); }); g.forEach((l, k) => lines.push(l.length > 1 ? `- ${l.length} × ${k} (first: ${nameOf(l[0].el)})` : `- ${nameOf(l[0].el)}: ${l[0].what}`)); } }
      lines.push('', `# auto · ${resName(state.normalizeRes || '16')} · ${g.reduce((a, x) => a + x.els.length, 0)} snap${g.reduce((a, x) => a + x.els.length, 0) === 1 ? "" : "s"} in ${g.length} group${g.length === 1 ? "" : "s"}`, '', `Font sizes, paddings, margins and gaps snapped to the nearest step, like notes to a grid. Deliberately left alone: buttons and links (their padding is their tap target), images, the jig's own wrappers, margins set to auto, and any type snap that would have made a row wrap. Small text only ever rounds up; ties round up. Type steps: ${qs.typeSteps.join(', ')}px. Spacing steps: ${qs.spaceSteps.join(', ')}px. Apply as rule changes, not inline styles: find the rule that sets each value and change it; where several elements share a group they almost certainly share a rule.`, '');
      g.forEach(x => lines.push(`- ${x.prop}: ${x.from}px → ${x.to}px on ${x.els.length} element${x.els.length === 1 ? '' : 's'}`));
      g.forEach(x => json.push({ op: 'quantize', prop: x.prop, from: x.from, to: x.to, count: x.els.length, els: x.els.slice(0, 20), hints: x.hints.slice(0, 20), ...(x.els.length > 20 ? { more: x.els.length - 20 } : {}) }));   // hints: what each element says, so a selector that's hard to resolve can still be found
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
  // copy that survives sites whose policy blocks the async clipboard: fall back to execCommand, then to a selected box
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return 'ok'; } catch (e) {}
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    hud.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) {} ta.remove();
    if (ok) return 'ok';
    const box = document.createElement('textarea'); box.value = text; box.id = 'jig-copybox'; box.style.cssText = 'position:fixed;inset:16px;z-index:2147483647;width:min(720px,calc(100vw - 32px));height:60vh;font:12px ui-monospace,monospace;padding:12px;border:2px solid #3f6fff;border-radius:12px;background:#111;color:#eee';
    document.body.appendChild(box); box.focus(); box.select(); on(box, 'blur', () => box.remove()); on(box, 'keydown', e => { if (e.key === 'Escape') box.remove(); });
    return 'manual';
  }
  async function copyPatch() {
    const r = await copyText(buildPatch());
    flash(r === 'ok' ? 'Patch copied. Paste it to your AI.' : 'Selected; press ⌘C (this site blocks auto-copy).');
  }
  function flash(msg) { const b = $('#jig-copy-btn'); const t = b.textContent; b.textContent = msg; setTimeout(() => (b.textContent = t), 1800); }

  // ------------------------------------------------------------ ax report: what the scan found, as something a person can read, share and print
  // cat: wcag = a WCAG A/AA failure; practice = best practice or AAA; design = quality the eye notices. Only wcag counts toward the headline.
  const AX_RULES = {
    'no-name':         { t: 'Links and buttons with no name', ref: '4.1.2 Name, Role, Value', lvl: 'A', cat: 'wcag', auto: false, fix: 'Give each one visible text, an aria-label, or alt text on the image inside it. Screen readers announce these as just "link" or "button".' },
    'lang':            { t: 'Page language not set', ref: '3.1.1 Language of Page', lvl: 'A', cat: 'wcag', auto: false, fix: 'Add the language to the html element, for example <html lang="en">.' },
    'title':           { t: 'Page has no title', ref: '2.4.2 Page Titled', lvl: 'A', cat: 'wcag', auto: false, fix: 'Give every page a <title> that says what it is; it\'s the first thing a screen reader announces and the name of the tab.' },
    'label':           { t: 'Form fields with no label', ref: '1.3.1 Info and Relationships · 4.1.2', lvl: 'A', cat: 'wcag', auto: false, fix: 'Connect a visible <label for="…"> to each field, or an aria-label when there is truly no room. Placeholders vanish as you type; they aren\'t labels.' },
    'colour-link':     { t: 'Links marked by colour alone', ref: '1.4.1 Use of Color', lvl: 'A', cat: 'wcag', auto: true, fix: 'Underline links that sit inside running text. If you won\'t underline, make the link colour at least 3:1 against the surrounding words and add an underline on hover and focus.' },
    'alt':             { t: 'Missing or placeholder alt text', ref: '1.1.1 Non-text Content', lvl: 'A', cat: 'wcag', auto: false, fix: 'Describe what the image shows in a short phrase. Use alt="" for images that are purely decorative.' },
    'contrast':        { t: 'Text contrast too low', ref: '1.4.3 Contrast (Minimum)', lvl: 'AA', cat: 'wcag', auto: true, fix: 'Move the text colour (or its background) to a shade that reaches 4.5:1, or 3:1 for large text. Over photos, add a scrim or a tint behind the words.' },
    'busy-background': { t: 'Text over a busy image', ref: '1.4.3 Contrast (Minimum)', lvl: 'AA', cat: 'wcag', auto: true, fix: 'Add a scrim or text shadow, or move the words to a calmer part of the image.' },
    'tap-target':      { t: 'Tap targets too small', ref: '2.5.8 Target Size (Minimum)', lvl: 'AA', cat: 'wcag', auto: true, fix: 'Make every button and link at least 24 × 24px. 44px is the comfortable size on a phone.' },
    'text-over-image': { t: 'Text over an image (not measured)', ref: '1.4.3 Contrast (Minimum)', lvl: 'AA', cat: 'practice', auto: false, fix: 'The image is served from another domain, so its pixels couldn\'t be sampled. Check these by eye.' },
    'heading-order':   { t: 'Heading structure', ref: '1.3.1 Info and Relationships', lvl: 'best practice', cat: 'practice', auto: false, fix: 'Use one h1 per page and don\'t skip levels (an h2 followed by an h4).' },
    'h1-role':         { t: 'The h1 isn\'t the main headline', ref: '1.3.1 Info and Relationships', lvl: 'best practice', cat: 'practice', auto: false, fix: 'Make the page\'s main headline the h1. If the logo is the h1 on purpose, ignore this.' },
    'dup-link':        { t: 'Repeated links', ref: '2.4.4 Link Purpose', lvl: 'best practice', cat: 'practice', auto: false, fix: 'An image link that repeats the headline link beside it doubles every stop for keyboard and screen reader users. Add aria-hidden="true" tabindex="-1" to the image link.' },
    'vague-link':      { t: 'Link text that doesn\'t say where it goes', ref: '2.4.4 Link Purpose (In Context)', lvl: 'best practice', cat: 'practice', auto: false, fix: 'Say where the link goes ("Read the membership rules"), or add the context with aria-label or aria-describedby. Screen reader users often browse a list of links with no surrounding text.' },
    'empty-heading':   { t: 'Empty headings', ref: '2.4.6 Headings and Labels', lvl: 'best practice', cat: 'practice', auto: false, fix: 'Give the heading text or remove it; an empty heading is a dead stop for anyone navigating by headings.' },
    'measure':         { t: 'Lines too long to read comfortably', ref: '1.4.8 Visual Presentation', lvl: 'AAA', cat: 'practice', auto: true, fix: 'Cap text columns at about 65 to 75 characters per line (max-width: 68ch is a good start).' },
    'hierarchy':       { t: 'Headings that don\'t read as headings', ref: 'visual hierarchy', lvl: 'design', cat: 'design', auto: true, fix: 'A heading should be clearly larger than the body copy beside it (about 15% or more), or bold. An h2 shouldn\'t outsize the h1.' },
    'small-text':      { t: 'Body copy too small', ref: 'readability', lvl: 'design', cat: 'design', auto: true, fix: 'Set body copy at 14px or more; 16px is the usual default.' },
    'overflow':        { t: 'Clipped or overflowing text', ref: 'related: 1.4.10 Reflow', lvl: 'design', cat: 'design', auto: false, fix: 'Let the box grow with its text, or give it room to wrap. Clipped words are lost words.' },
    'button-wrap':     { t: 'Button labels that wrap', ref: 'design', lvl: 'design', cat: 'design', auto: true, fix: 'Shorten the label or give the button room; a two-line button reads as two buttons.' },
    'soft':            { t: 'Images shown larger than their pixels', ref: 'image quality', lvl: 'design', cat: 'design', auto: false, fix: 'Serve a larger file (or a srcset) so the image isn\'t upscaled and soft.' },
    'face':            { t: 'Faces cropped out', ref: 'image crop', lvl: 'design', cat: 'design', auto: true, fix: 'Re-centre the crop (object-position) on the face.' }
  };
  const AX_CATS = [['wcag', 'Accessibility failures (WCAG A/AA)'], ['practice', 'Best practice'], ['design', 'Design quality']];
  const ruleOf = k => AX_RULES[k] || { t: k, ref: '', lvl: '', cat: 'design', auto: false, fix: '' };
  const fileOf = u => { const f = (u || '').split('/').pop().split('?')[0]; try { return decodeURIComponent(f); } catch (e) { return f; } };
  function axSnippet(el) {
    if (!el) return ''; if (el === document.documentElement) return '';
    if (el.tagName === 'IMG') { const a = el.getAttribute('alt'); const f = fileOf(el.currentSrc || el.src); return (a ? 'alt "' + a.slice(0, 50) + '" · ' : '') + f.slice(0, 60); }
    const t = (el.innerText || el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
    if (t) return t.length > 80 ? t.slice(0, 79) + '…' : t;
    const img = el.querySelector && el.querySelector('img'); return img ? 'image: ' + fileOf(img.currentSrc || img.src).slice(0, 60) : '';
  }
  // findings are matched by element + rule (cheap); selectors and snippets are only worked out for what a report actually lists
  const AX_LIST_CAP = 50;
  const axKey = (el, kind) => { let m = axKey.ids.get(el); if (!m) { m = ++axKey.n; axKey.ids.set(el, m); } return kind + '|' + m; }; axKey.ids = new WeakMap(); axKey.n = 0;
  const axLite = w => ({ kind: w.kind, el: w.el, msg: w.msg });
  // the baseline is what the page had before anyone touched it; it keeps refreshing while the page settles, and freezes at the first change
  // dismissed findings: the reviewer looked and said "fine, ignore". Remembered per page in this browser, kept out of counts, pink and auto fix, and still listed in the report.
  const dismissKey = () => 'jig-dismissed:' + location.host + location.pathname;
  function loadDismissed() { if (!state.axDismissed) { try { state.axDismissed = new Set(JSON.parse(safeGet(dismissKey()) || '[]')); } catch (e) { state.axDismissed = new Set(); } } return state.axDismissed; }
  const findingId = w => w.kind + '|' + (w.el === document.documentElement ? 'html' : selectorOf(w.el));
  function setDismissed(w, on) { const D = loadDismissed(); const id = findingId(w); if (on) D.add(id); else D.delete(id); safeSet(dismissKey(), JSON.stringify(Array.from(D))); scanProtection(); renderHUD(); }
  function splitDismissed(W) {
    const D = loadDismissed(); state.dismissedWarnings = []; if (!D.size) return W;
    const kinds = new Set(Array.from(D).map(x => x.split('|')[0]));
    return W.filter(w => { if (!kinds.has(w.kind) || !w.el || !D.has(findingId(w))) return true; state.dismissedWarnings.push(w); return false; });
  }
  function axTrackBaseline() {
    const untouched = !state.changes.size && !state.normalize && !state.axFix && !state.frame.changes.length;
    if (untouched || !state.axBase) state.axBase = state.warnings.filter(w => w.el && w.el.isConnected).map(axLite);
  }
  function buildAXReport(detail) {
    const now = state.warnings.filter(w => w.el && w.el.isConnected).map(axLite);
    const nowKeys = new Map(now.map(f => [axKey(f.el, f.kind), f]));
    const dis = new Set((state.dismissedWarnings || []).map(w => axKey(w.el, w.kind)));
    const base = (state.axBase || now).filter(f => f.el && !dis.has(axKey(f.el, f.kind))); const baseKeys = new Set(base.map(f => axKey(f.el, f.kind)));
    const items = base.map(f => { const k = axKey(f.el, f.kind); return nowKeys.has(k) ? { ...nowKeys.get(k), status: 'open' } : { ...f, status: 'fixed' }; })
      .concat(now.filter(f => !baseKeys.has(axKey(f.el, f.kind))).map(f => ({ ...f, status: 'open', fresh: true })));
    const rules = [];
    Object.keys(AX_RULES).concat(Array.from(new Set(items.map(i => i.kind))).filter(k => !AX_RULES[k])).forEach(k => {
      const list = items.filter(i => i.kind === k); if (!list.length) return;
      if (detail) list.slice(0, AX_LIST_CAP).forEach(i => { i.sel = i.el === document.documentElement ? 'html' : selectorOf(i.el); i.snippet = axSnippet(i.el); });
      const r = ruleOf(k); rules.push({ kind: k, ...r, items: list, open: list.filter(i => i.status === 'open').length, fixed: list.filter(i => i.status === 'fixed').length });
    });
    let n = 0; rules.forEach(r => r.items.forEach(i => { i.n = ++n; }));   // one number per finding, the same on the page chips, in the panel and in the report
    const count = (cat, st) => rules.filter(r => r.cat === cat).reduce((a, r) => a + (st ? r[st] : r.items.length), 0);
    const frame = state.device && deviceEl ? { device: state.device.name, notes: (state.frame.warnings || []).map(w => ({ kind: w.kind, name: w.name || w.kind, msg: w.msg })) } : null;
    const F = state.F;
    return {
      title: (document.title || location.hostname).trim(), url: (() => { const u = new URL(location.href); u.searchParams.delete('jig'); if (u.hash === '#jig') u.hash = ''; return u.href; })(),
      host: location.hostname, platform: detectPlatform(), when: new Date(), viewport: `${window.innerWidth} × ${window.innerHeight}`, bp: state.bp, version: JIG_VERSION,
      foundation: `${F.name} (${state.foundationSource || F.mode || 'inferred'})`,
      rules, frame, dismissed: (state.dismissedWarnings || []).filter(w => w.el && w.el.isConnected).map(w => ({ kind: w.kind, t: ruleOf(w.kind).t, sel: w.el === document.documentElement ? 'html' : selectorOf(w.el), snippet: axSnippet(w.el), msg: w.msg })),
      totals: { wcag: count('wcag'), wcagOpen: count('wcag', 'open'), practice: count('practice'), design: count('design'), all: items.length, open: items.filter(i => i.status === 'open').length, fixed: items.filter(i => i.status === 'fixed').length },
      changed: state.changes.size + state.frame.changes.length > 0 || !!state.normalize || !!state.axFix
    };
  }
  const AX_METHOD = [
    'Checked in a live browser by Jig Studio. Contrast is measured from the rendered pixels, including text over photos (graded on the worst patch under the words), not read from the CSS.',
    'Covers what renders on this page at this viewport. Other pages, other screen sizes, closed menus and content behind interactions are not included.',
    'Not checked: ARIA validity, keyboard order, focus visibility, form labels and screen reader output. Pair this with axe DevTools and a keyboard pass.',
    'Automated checks catch part of the picture. A clean report is a good sign, not a conformance claim.'
  ];
  const fmtDate = d => d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  function axHeadline(R) {
    const T = R.totals;
    const main = T.wcag === 0 ? 'No WCAG A/AA failures found' : `${T.wcag} accessibility failure${T.wcag === 1 ? '' : 's'}`;
    const extra = T.practice + T.design ? ` · ${T.practice + T.design} more note${T.practice + T.design === 1 ? '' : 's'}` : '';
    const fixed = T.fixed ? ` · ${T.fixed} fixed in this session, ${T.open} still open` : '';
    return main + extra + fixed;
  }
  function reportMarkdown(R) {
    R = R || buildAXReport(true); const L = [];
    L.push(`# Accessibility report: ${R.title}`, '', `${R.url}  `, `${fmtDate(R.when)}${R.platform ? ' · ' + R.platform : ''} · viewport ${R.viewport} (${R.bp}) · Jig Studio ${R.version}`, '', `**${axHeadline(R)}**`, '');
    if (!R.rules.length) L.push('Nothing flagged on this page at this viewport.', '');
    else {
      L.push('| Rule | WCAG | Level | Found | Open | Jig can fix |', '|---|---|---|---:|---:|---|');
      R.rules.forEach(r => L.push(`| ${r.t} | ${r.ref} | ${r.lvl} | ${r.items.length} | ${r.open} | ${r.auto ? 'yes' : 'no'} |`)); L.push('');
      AX_CATS.forEach(([cat, label]) => {
        const rs = R.rules.filter(r => r.cat === cat); if (!rs.length) return;
        L.push(`## ${label}`, '');
        rs.forEach(r => {
          L.push(`### ${r.t} (${r.items.length})`, '', `${r.ref}${r.lvl && r.lvl !== r.ref ? ' · ' + r.lvl : ''}. ${r.fix}`, '');
          r.items.slice(0, AX_LIST_CAP).forEach(i => L.push(`- #${i.n} \`${i.sel}\`${i.snippet ? ' "' + i.snippet.replace(/"/g, "'") + '"' : ''}: ${i.msg}${i.status === 'fixed' ? ' (fixed)' : ''}`));
          if (r.items.length > AX_LIST_CAP) L.push(`- … and ${r.items.length - AX_LIST_CAP} more like these`);
          L.push('');
        });
      });
    }
    if (R.dismissed && R.dismissed.length) { L.push(`## Dismissed by the reviewer (${R.dismissed.length})`, '', 'Looked at and set aside on purpose; not counted above.', ''); R.dismissed.forEach(d => L.push(`- ${d.t}: \`${d.sel}\`${d.snippet ? ' "' + d.snippet.replace(/"/g, "'") + '"' : ''}: ${d.msg}`)); L.push(''); }
    if (R.frame && R.frame.notes.length) { L.push(`## Also seen on ${R.frame.device}`, ''); R.frame.notes.forEach(n => L.push(`- ${n.name}: ${n.msg}`)); L.push(''); }
    L.push('## How this was checked', ''); AX_METHOD.forEach(m => L.push(`- ${m}`));
    L.push('', `Audited with [Jig Studio](https://capybutz.com/) · foundation: ${R.foundation}`);
    return L.join('\n');
  }
  function reportHTML(R) {
    R = R || buildAXReport(true); const e = esc;
    const T = R.totals;
    const cards = [[T.wcag, 'WCAG A/AA failures', T.wcag ? 'bad' : 'ok'], [T.practice, 'best practice', ''], [T.design, 'design quality', ''], ...(T.fixed ? [[T.fixed, 'fixed in this session', 'ok']] : [])];
    const sum = R.rules.map(r => `<tr><td><a href="#r-${e(r.kind)}">${e(r.t)}</a></td><td>${e(r.ref)}</td><td><span class="lvl l-${e(r.cat)}">${e(r.lvl)}</span></td><td class="n">${r.items.length}</td><td class="n">${r.open}</td><td>${r.auto ? '<span class="tag auto">jig can fix</span>' : '<span class="tag">by hand</span>'}</td></tr>`).join('');
    const sections = AX_CATS.map(([cat, label]) => {
      const rs = R.rules.filter(r => r.cat === cat); if (!rs.length) return '';
      return `<h2>${e(label)}</h2>` + rs.map(r => `<section class="rule" id="r-${e(r.kind)}"><header><h3>${e(r.t)}</h3><span class="cnt">${r.items.length}</span></header>
        <p class="meta"><span class="lvl l-${e(r.cat)}">${e(r.lvl)}</span> ${e(r.ref)}${r.auto ? ' · <span class="tag auto">jig can fix</span>' : ''}</p><p class="fix">${e(r.fix)}</p>
        <ol>${r.items.slice(0, AX_LIST_CAP).map(i => `<li value="${i.n}" class="${i.status}"><div class="what"><code>${e(i.sel)}</code>${i.status === 'fixed' ? '<span class="tag ok">fixed</span>' : i.fresh ? '<span class="tag">new since load</span>' : ''}</div>${i.snippet ? `<div class="snip">${e(i.snippet)}</div>` : ''}<div class="msg">${e(i.msg)}</div></li>`).join('')}</ol>${r.items.length > AX_LIST_CAP ? `<p class="more">… and ${r.items.length - AX_LIST_CAP} more like these (${r.items.filter(i => i.status === 'open').length} open in total).</p>` : ''}</section>`).join('');
    }).join('');
    const dismissed = R.dismissed && R.dismissed.length ? `<h2>Dismissed by the reviewer (${R.dismissed.length})</h2><p class="more">Looked at and set aside on purpose; not counted above.</p><ul class="plain">${R.dismissed.map(d => `<li><b>${e(d.t)}</b>: <code>${e(d.sel)}</code>${d.snippet ? ` ${e(d.snippet)}` : ''}<div class="msg">${e(d.msg)}</div></li>`).join('')}</ul>` : '';
    const frame = R.frame && R.frame.notes.length ? `<h2>Also seen on ${e(R.frame.device)}</h2><ul class="plain">${R.frame.notes.map(n => `<li><b>${e(n.name)}</b>: ${e(n.msg)}</li>`).join('')}</ul>` : '';
    const patch = R.changed ? `<details class="patch"><summary>The fixes made in this session, as a jig patch</summary><p>Hand this to your AI or developer to make the changes permanent.</p><pre>${e(buildPatch())}</pre></details>` : '';
    const css = `
      :root{--bg:#0b0b0d;--panel:#13141a;--line:#262833;--ink:#dfe6ff;--mute:#9aa3b8;--blue:#3f6fff;--pink:#ff2d9b;--ok:#35c186;color-scheme:dark}
      *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
      main{max-width:920px;margin:0 auto;padding:48px 24px 64px}a{color:#8fb0ff}code{font:12.5px ui-monospace,SFMono-Regular,Menlo,monospace;color:#c9d4ff;word-break:break-all}
      .eyebrow{font:600 11px ui-monospace,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--pink)}
      h1{font-size:32px;line-height:1.15;margin:8px 0 6px;color:#fff;letter-spacing:-.01em}.sub{color:var(--mute);margin:0}.sub.url{word-break:break-all}.sub a{color:var(--mute)}
      .headline{margin:28px 0 8px;font-size:19px;color:#fff;font-weight:600}
      .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0 36px}
      .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px}.card b{display:block;font-size:30px;line-height:1.1;color:#fff}.card span{color:var(--mute);font-size:13px}
      .card.bad{border-color:var(--pink)}.card.bad b{color:var(--pink)}.card.ok b{color:var(--ok)}
      .tw{overflow-x:auto;margin:0 0 40px}table{width:100%;border-collapse:collapse;font-size:14px;margin:0}th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--mute);font-weight:500;font-size:12px;text-transform:uppercase;letter-spacing:.06em}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
      h2{font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:var(--mute);margin:44px 0 12px;padding-bottom:8px;border-bottom:1px solid var(--line)}
      .rule{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin:0 0 14px}.rule header,.rule .meta,.rule .fix,h2{break-after:avoid}
      .rule header{display:flex;justify-content:space-between;align-items:baseline;gap:12px}.rule h3{margin:0;font-size:18px;color:#fff}.cnt{font:700 14px ui-monospace,Menlo,monospace;color:var(--pink)}
      .meta{margin:4px 0 6px;color:var(--mute);font-size:13px}.fix{margin:0 0 12px}
      ol{margin:0;padding-left:38px}li{padding:8px 0;border-top:1px dashed var(--line);break-inside:avoid}li .what{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.snip{color:#fff;margin:2px 0}.msg{color:var(--mute);font-size:13.5px}
      li.fixed{opacity:.5}
      .tag{display:inline-block;font:600 10.5px ui-monospace,Menlo,monospace;letter-spacing:.04em;padding:2px 7px;border-radius:999px;border:1px solid var(--line);color:var(--mute);white-space:nowrap}.tag.auto{border-color:var(--blue);color:#8fb0ff}.tag.ok{border-color:var(--ok);color:var(--ok)}
      .lvl{display:inline-block;font:700 10.5px ui-monospace,Menlo,monospace;padding:2px 6px;border-radius:4px;background:#262833;color:#fff}.lvl.l-wcag{background:var(--pink)}
      .more{color:var(--mute);font-size:13.5px;margin:10px 0 0}.method{color:var(--mute);font-size:14px}.method li{border:0;padding:3px 0}.plain{padding-left:20px}.plain li{border:0;padding:3px 0}
      details.patch{margin:32px 0 0;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 18px}details.patch summary{cursor:pointer;color:#fff;font-weight:600}details.patch pre{white-space:pre-wrap;word-break:break-word;font:12px/1.5 ui-monospace,Menlo,monospace;color:#c9d4ff;max-height:480px;overflow:auto}
      footer{margin-top:48px;padding-top:16px;border-top:1px solid var(--line);color:var(--mute);font-size:13px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
      .clean{background:var(--panel);border:1px solid var(--ok);border-radius:12px;padding:18px 20px}
      @media print{:root{--bg:#fff;--panel:#fff;--line:#d9dbe3;--ink:#16171d;--mute:#5a6072;--blue:#2347c9;--pink:#c4106c;--ok:#167a50;color-scheme:light}
        body{font-size:11pt}main{padding:0;max-width:none}h1,.card b,.rule h3,.headline,.snip,details.patch summary{color:#000}code,details.patch pre{color:#1b2a6b}a{color:inherit;text-decoration:none}
        .rule,.card{border-color:#d9dbe3}details.patch{display:none}.lvl{background:none;border:1px solid #9a9fb0;color:#000}.lvl.l-wcag{border-color:#c4106c;color:#c4106c}.tag{border-color:#9a9fb0}@page{margin:16mm}}
      @media (max-width:560px){main{padding:28px 16px 48px}h1{font-size:26px}th:nth-child(2),td:nth-child(2),th:nth-child(5),td:nth-child(5){display:none}th,td{padding:8px 6px}.tag{white-space:normal}}@media (max-width:400px){th:nth-child(3),td:nth-child(3){display:none}}`;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Accessibility report · ${e(R.host)}</title><style>${css}</style></head><body><main>
      <div class="eyebrow">Accessibility report</div><h1>${e(R.title)}</h1><p class="sub url"><a href="${e(R.url)}">${e(R.url)}</a></p><p class="sub">${e(fmtDate(R.when))}${R.platform ? ' · ' + e(R.platform) : ''} · viewport ${e(R.viewport)} (${e(R.bp)})</p>
      <p class="headline">${e(axHeadline(R))}</p>
      <div class="cards">${cards.map(([n, l, c]) => `<div class="card ${c}"><b>${n}</b><span>${e(l)}</span></div>`).join('')}</div>
      ${R.rules.length ? `<div class="tw"><table><thead><tr><th>Rule</th><th>WCAG</th><th>Level</th><th class="n">Found</th><th class="n">Open</th><th>Fix</th></tr></thead><tbody>${sum}</tbody></table></div>${sections}` : '<div class="clean">Nothing flagged on this page at this viewport.</div>'}
      ${dismissed}
      ${frame}
      <h2>How this was checked</h2><ul class="method">${AX_METHOD.map(m => `<li>${e(m)}</li>`).join('')}</ul>
      ${patch}
      <footer><span>Audited with <a href="https://capybutz.com/">Jig Studio</a> ${e(R.version)}</span><span>foundation: ${e(R.foundation)}</span></footer>
    </main></body></html>`;
  }
  function downloadReport() {
    const R = buildAXReport(true); const html = reportHTML(R);
    const d = R.when; const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const name = `ax-report-${R.host.replace(/^www\./, '').replace(/[^a-z0-9.-]/gi, '-')}-${stamp}.html`;
    try {
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      const a = document.createElement('a'); a.href = url; a.download = name; a.style.display = 'none'; hud.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000); return name;
    } catch (err) {   // a policy that blocks blob downloads: open it in a tab instead, where save-as still works
      const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); return 'opened'; } return null;
    }
  }
  // "Fix what I can": auto's accessibility half on its own; no snapping. Undoable, and folded into auto if auto is turned on.
  function undoAutoFixes() { (state.autoFixes || []).slice().reverse().forEach(f => { if (f.undo) { f.undo(); unrecord(f.el, f.ctl || 'grid', f.sub); } else if (f.el.__jigReset) f.el.__jigReset(); }); state.autoFixes = []; }
  function fixAX(on) {
    if (state.normalize) return;   // auto already does this
    state.batch = true;
    if (on) { autoFixAX(); state.axFix = true; } else { undoAutoFixes(); state.axFix = false; }
    state.batch = false; scanProtection(); renderHUD(); postToParent();
  }
  // take the viewer to a finding: scroll it to the middle and pulse its outline and chip so it can't be missed
  function axJump(el) {
    if (!el || !el.isConnected) return;
    if (el === document.documentElement) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    $$('.jig-ax-focus').forEach(x => x.classList.remove('jig-ax-focus')); el.classList.add('jig-ax-focus');
    const tag = axTags && $$('.tag', axTags).find(t => t.__el === el); $$('.tag.focus', axTags || document).forEach(t => t.classList.remove('focus')); if (tag) tag.classList.add('focus');
    clearTimeout(axJump.t); axJump.t = setTimeout(() => { el.classList.remove('jig-ax-focus'); if (tag) tag.classList.remove('focus'); }, 2200);
  }
  function renderAXPanel() {
    const box = $('#jig-ax'); if (!box) return;
    const R = buildAXReport(); const T = R.totals;
    { const b = $('#jig-ax-n'); if (b) { b.textContent = T.wcagOpen; b.classList.toggle('warn', T.wcagOpen > 0); b.title = `${T.wcagOpen} WCAG failures open · ${T.practice + T.design} more notes`; } }
    $('#jig-axr-n').textContent = T.wcagOpen; $('#jig-axr-n').classList.toggle('ok', !T.wcagOpen);
    $('#jig-axr-l').textContent = (T.wcagOpen === 1 ? 'accessibility failure' : 'accessibility failures') + (T.practice + T.design ? ` · ${T.practice + T.design} more` : '') + (T.fixed ? ` · ${T.fixed} fixed` : '');
    const list = $('#jig-axr-rules'); list.innerHTML = '';
    state.axOpen = state.axOpen || new Set();
    R.rules.forEach(r => {
      const openNow = state.axOpen.has(r.kind);
      const row = document.createElement('div'); row.className = 'row axrow' + (r.open ? '' : ' done'); row.setAttribute('aria-expanded', openNow ? 'true' : 'false');
      row.innerHTML = `<span class="c ${r.cat}">${r.open}</span><span class="s">${esc(r.t)}<span class="tw">${openNow ? '▾' : '▸'}</span><small>${esc(r.ref)}${r.auto ? ' · auto fix' : ''}</small></span>`;
      row.onclick = () => { if (openNow) state.axOpen.delete(r.kind); else state.axOpen.add(r.kind); renderAXPanel(); };
      list.appendChild(row);
      if (!openNow) return;
      const box = document.createElement('div'); box.className = 'axitems';
      r.items.slice(0, AX_LIST_CAP).forEach(it => {
        const d = document.createElement('div'); d.className = 'axi ' + it.status; d.title = it.msg;
        const b = document.createElement('b'); b.textContent = '#' + it.n; const t = document.createElement('span'); t.textContent = (it.el === document.documentElement ? 'the page' : axSnippet(it.el) || nameOf(it.el)) + (it.status === 'fixed' ? ' (fixed)' : '');
        d.append(b, t); d.onclick = () => axJump(it.el);
        if (it.status === 'open') { const x = document.createElement('button'); x.className = 'ign'; x.type = 'button'; x.textContent = 'ignore'; x.title = 'dismiss this finding: out of the counts and auto fix, still listed in the report'; x.onclick = ev => { ev.stopPropagation(); setDismissed(it, true); }; d.append(x); }
        box.appendChild(d);
      });
      if (r.items.length > AX_LIST_CAP) { const m = document.createElement('div'); m.className = 'axi'; m.textContent = `+ ${r.items.length - AX_LIST_CAP} more in the report`; box.appendChild(m); }
      list.appendChild(box);
    });
    if (!R.rules.length) list.innerHTML = '<div class="empty">Nothing flagged on this page.</div>';
    const dis = state.dismissedWarnings || [];
    if (dis.length) {
      const h = document.createElement('div'); h.className = 'row axrow done'; const open = state.axShowDismissed;
      h.innerHTML = `<span class="c">${dis.length}</span><span class="s">dismissed<span class="tw">${open ? '▾' : '▸'}</span><small>out of the counts · still in the report</small></span>`;
      h.onclick = () => { state.axShowDismissed = !open; renderAXPanel(); }; list.appendChild(h);
      if (open) { const box = document.createElement('div'); box.className = 'axitems'; dis.forEach(w => { const d = document.createElement('div'); d.className = 'axi fixed'; const t = document.createElement('span'); t.textContent = ruleOf(w.kind).t + ': ' + (axSnippet(w.el) || nameOf(w.el)); const x = document.createElement('button'); x.className = 'ign'; x.type = 'button'; x.textContent = 'restore'; x.onclick = ev => { ev.stopPropagation(); setDismissed(w, false); }; d.append(t, x); box.appendChild(d); }); list.appendChild(box); }
    }
    const fb = $('#jig-axfix'); const can = R.rules.some(r => r.auto && r.open);
    fb.textContent = state.normalize ? 'fixed by auto fix' : state.axFix ? 'undo fixes' : 'Fix what I can'; fb.disabled = !!state.normalize || (!state.axFix && !can); fb.classList.toggle('on', !!state.axFix);
  }

  // ------------------------------------------------------------ normalize: snap the whole page to the scales
  function normalizePage(on) {
    if (!on) {
      state.batch = true;
      undoAutoFixes();   // fixes ran after the snaps, so they come off first
      (state.normalize || []).slice().reverse().forEach(n => { n.el.style.removeProperty(n.prop); if (n.prev) n.el.style.setProperty(n.prop, n.prev, n.prevP || ''); });   // reverse: an element snapped twice must end on its first value
      state.normalize = null; state.autoFixes = []; state.batch = false; { const nb = $('#jig-norm-btn'); if (nb) { nb.classList.remove('on'); nb.textContent = 'off'; nb.setAttribute('aria-pressed', 'false'); } } renderHUD(); postToParent(); scanSoon(); return;
    }
    state.batch = true;
    if (state.axFix) { undoAutoFixes(); state.axFix = false; }   // auto includes the ax fixes; start them over inside auto so its undo covers them
    const F = state.F; const out = [];
    const res = state.autoRes || ($('#jig-q-res') && $('#jig-q-res').value) || '16';
    const { typeSteps, spaceSteps } = quantizeScales(res);
    state.normalizeRes = res;
    // buttons are left to the button control (their padding IS their size); snapping them would shrink tap targets the scan then has to grow back
    const skipEl = el => el.closest('#jig-hud, .jig-tb, #jig-found, #jig-device, .jig-badge, #jig-axtags, #jig-grid, script, style, svg, ' + OFF) || el === document.body || el === document.documentElement || !visible(el) || el.dataset.jigCtl === 'button' || el.closest('.jig-el[data-jig-ctl="button"]') || srOnly(el);
    const autoMargin = (() => {   // margins authored as auto compute to px; snapping that number would break the layout
      const rules = []; for (const sh of Array.from(document.styleSheets)) { try { for (const r of Array.from(sh.cssRules || [])) if (r.style && /auto/.test(r.style.margin + r.style.marginTop + r.style.marginBottom + r.style.marginLeft + r.style.marginRight + r.style.marginBlock + r.style.marginInline)) rules.push(r); } catch (e) {} }
      return (el, prop) => { if (/auto/.test(el.style.getPropertyValue(prop) + el.style.margin)) return true; const side = prop.replace('margin-', ''); return rules.some(r => { try { if (!el.matches(r.selectorText)) return false; } catch (e) { return false; } const st = r.style; const v = st.getPropertyValue(prop) || ((side === 'top' || side === 'bottom') ? st.marginBlock : st.marginInline) || ''; if (/auto/.test(v)) return true; const m = (st.margin || '').split(/\s+/); if (!m[0]) return false; const idx = { top: 0, right: 1, bottom: m.length > 2 ? 2 : 0, left: m.length > 3 ? 3 : (m.length > 1 ? 1 : 0) }[side]; return /auto/.test(m[idx] || ''); }); };
    })();
    const snap = (el, prop, cur, steps, min, max) => {
      if (el.classList.contains('jig-scrim-panel') || el.classList.contains('jig-crop-box')) return;   // the jig's own wrappers are never the site's
      if (/^margin/.test(prop) && autoMargin(el, prop)) return;
      if (!(cur >= min && cur <= max)) return;
      let to = nearest(steps, cur);
      if (prop === 'font-size' && cur < 14 && to < cur) to = steps.find(x => x >= cur) || to;   // never shrink text that's already small
      if (prop === 'font-size') { const up = steps.find(x => x > cur), dn = steps.slice().reverse().find(x => x < cur); if (up != null && dn != null && Math.abs((up - cur) - (cur - dn)) < 0.01) to = up; }   // type ties round up, toward readable
      if (Math.abs(to - cur) < 0.1) return;   // sub-pixel drift counts; it's the most common kind
      out.push({ el, prop, from: Math.round(cur * 10) / 10, to, prev: el.style.getPropertyValue(prop) || '', prevP: el.style.getPropertyPriority(prop) });
      el.style.setProperty(prop, to + 'px', 'important');
    };
    // 1. type: elements with their own text (and their same-size riders, so headline links follow their headings)
    const texty = d => Array.from(d.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    const texts = $$('body *').filter(el => !skipEl(el) && texty(el));
    const rowsBefore = new Map(); texts.forEach(el => { const p = el.parentElement; if (p && !rowsBefore.has(p)) rowsBefore.set(p, p.getBoundingClientRect().height); });
    const typeStart = out.length;
    texts.forEach(el => snap(el, 'font-size', px(css(el).fontSize), typeSteps, 8, 200));
    // a snap that makes a row wrap (nine nav links that fit at 13px don't at 15px) made things worse: put that row back
    out.slice(typeStart).filter(n => n.prop === 'font-size' && n.to > n.from).map(n => n.el.parentElement).filter((p, i, a) => p && a.indexOf(p) === i).forEach(p => {
      const h0 = rowsBefore.get(p); const h1 = p.getBoundingClientRect().height; if (!h0 || h1 < h0 * 1.35 || h1 - h0 < 10) return;
      for (let i = out.length - 1; i >= typeStart; i--) { const n = out[i]; if (n.prop === 'font-size' && n.el.parentElement === p && n.to > n.from) { n.el.style.removeProperty('font-size'); if (n.prev) n.el.style.setProperty('font-size', n.prev); out.splice(i, 1); } }
    });
    // 2. space: paddings, margins, gaps on block-ish boxes (positive, px-sized; negative and huge values are layout, not rhythm)
    $$('body *').forEach(el => {
      if (skipEl(el)) return; const c = css(el); if (!/block|flex|grid|table|list-item/.test(c.display) || c.position === 'fixed') return;
      const interactive = /^(A|BUTTON|INPUT|SELECT|TEXTAREA|LABEL|SUMMARY)$/.test(el.tagName) || el.getAttribute('role') === 'button';
      (interactive ? ['margin-top', 'margin-bottom'] : ['padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'margin-top', 'margin-bottom']).forEach(prop => snap(el, prop, px(c[prop]), spaceSteps, 2, 160));
      if (/flex|grid/.test(c.display)) ['row-gap', 'column-gap'].forEach(prop => snap(el, prop, px(c[prop]), spaceSteps, 2, 160));
    });
    state.normalize = out; { const nb = $('#jig-norm-btn'); if (nb) { nb.classList.add('on'); nb.textContent = 'on'; nb.setAttribute('aria-pressed', 'true'); } }
    autoFixAX();
    autoHarmonizeButtons();
    autoAlignRows();
    const done = () => { state.batch = false; renderHUD(); postToParent(); scanSoon(); };
    return autoFocusImages().then(done, done);
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
      const fx = (sx / sw + 0.5) / N, fy = (sy / sw + 0.5) / N;
      // how tightly the strong edges cluster around that point: a subject is tight, a busy background is everywhere
      let spread = 0; top.forEach(([i, w]) => { const dx = (i % N + 0.5) / N - fx, dy = (Math.floor(i / N) + 0.5) / N - fy; spread += w * Math.hypot(dx, dy); }); spread /= sw;
      if (spread > 0.26) return null;   // detail is all over the frame; leave the crop alone
      return { fx, fy, how: 'detail centroid', spread };
    } catch (e) { return null; }   // tainted canvas
  }
  // Blocks that sit a few px off a column line get put back on it (the demo's nudged card row, a container with a stray margin).
  function autoAlignRows() {
    // "Off grid" means off from its neighbours: a block that sits a few px left or right of the edge its siblings share.
    // That's what a nudged card row looks like on any site, with or without a declared grid.
    const done = new Set();
    const blocks = $$('body *').filter(el => { if (el.closest('#jig-hud, .jig-tb, #jig-found, #jig-device, #jig-axtags, .jig-crop-box, .jig-scrim-panel') || !visible(el)) return false; const c = css(el); return /block|flex|grid|table/.test(c.display) && c.position !== 'fixed' && c.position !== 'absolute' && c.float === 'none'; });
    const byParent = new Map(); blocks.forEach(el => { const p0 = el.parentElement; if (!byParent.has(p0)) byParent.set(p0, []); byParent.get(p0).push(el); });
    byParent.forEach(kids => {
      if (kids.length < 3) return;
      const lefts = kids.map(k => Math.round(k.getBoundingClientRect().left - Math.min(0, px(css(k).marginLeft))));
      const counts = {}; lefts.forEach(l => counts[l] = (counts[l] || 0) + 1);
      const [edge, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]; if (n < 2 || n < kids.length / 2) return;   // no clear shared edge
      kids.forEach((el, i) => {
        const delta = lefts[i] - +edge; if (Math.abs(delta) < 1 || Math.abs(delta) > 16 || done.has(el)) return;
        if (el.getBoundingClientRect().width < 60) return;
        const cur = px(css(el).marginLeft); const before = el.style.getPropertyValue('margin-left');
        el.style.setProperty('margin-left', `${Math.round(cur - delta)}px`, 'important');
        if (Math.abs(el.getBoundingClientRect().left - Math.min(0, px(css(el).marginLeft)) - +edge) > 1 && Math.abs(el.getBoundingClientRect().left - +edge) > 1) { el.style.removeProperty('margin-left'); if (before) el.style.setProperty('margin-left', before); return; }
        done.add(el);
        state.autoFixes.push({ el, ctl: 'grid', what: `back in line (was ${Math.round(delta)}px off the edge its neighbours share)`, undo: () => { el.style.removeProperty('margin-left'); if (before) el.style.setProperty('margin-left', before); } });
        record(el, 'grid', { marginLeft: Math.round(cur - delta), wasOffBy: Math.round(delta) }, `inline offset ${Math.round(cur)}px → ${Math.round(cur - delta)}px (in line with its neighbours)`);
      });
    });
  }
  // Buttons that sit together share a size. The group's size is the primary's (or the most common); the others step to it.
  function autoHarmonizeButtons() {
    const groups = new Map();
    $$('.jig-el[data-jig-ctl="button"]').forEach(b => { if (!b.offsetParent || !b.__jigSizeIndex) return; const k = b.parentElement; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(b); });
    const min = (state.F.protect || {}).minTapTarget || 24;
    groups.forEach(list => {
      if (list.length < 2) return;
      const idx = list.map(b => b.__jigSizeIndex()); if (new Set(idx).size === 1) return;
      const primary = list.find(b => /primary/.test(b.__jigVariant()));
      let target;
      if (primary) target = primary.__jigSizeIndex();
      else { const counts = {}; idx.forEach(i => counts[i] = (counts[i] || 0) + 1); target = +Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a - b)[0]; }
      const tok = state.F.buttons.sizes[target].token || state.F.buttons.sizes[target];
      list.forEach(b => {
        const was = b.__jigSizeIndex(); let guard = 0;
        while (b.__jigSizeIndex() !== target && guard++ < 6) { if (!b.__jigStepSize(b.__jigSizeIndex() < target ? 1 : -1)) break; }
        while (b.getBoundingClientRect().height < min - 0.5 && b.__jigStepSize(1)) {}   // never below the tap target
        if (b.__jigSizeIndex() !== was) state.autoFixes.push({ el: b, what: `size ${was > target ? '−' : '+'}${Math.abs(target - was)} to ${tok} (matches the buttons beside it)` });
      });
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
    const seen = new Set(); const ids = new WeakMap(); let nid = 0; const key = (el, k) => { if (!ids.has(el)) ids.set(el, ++nid); return k + ':' + ids.get(el); };
    // text over an image the scrims couldn't fix (or that the jig didn't wire): a tint behind the words, as light as passes; dark tint for light text, light for dark
    const tintFallback = w => {
            let el = w.el; while (el.parentElement && /^inline/.test(css(el).display) && !/^(A|BUTTON)$/.test(el.tagName) && el.parentElement !== document.body && !el.parentElement.querySelector('img, picture, video')) el = el.parentElement;
            if (seen.has(key(el, 'tint'))) return false; seen.add(key(el, 'tint'));
            const fg = parseColor(css(el).color) || [255, 255, 255, 1]; const light = lum(fg) > 0.4; const rgb = light ? '10,10,12' : '255,255,255';
            const keep = ['background-color', 'padding', 'border-radius', 'box-decoration-break', '-webkit-box-decoration-break'].map(k => [k, el.style.getPropertyValue(k)]);
            const undo = () => keep.forEach(([k, v]) => { el.style.removeProperty(k); if (v) el.style.setProperty(k, v); });
            let passed = null, last = null;
            for (const a of [0.45, 0.6, 0.75]) {
              el.style.setProperty('background-color', `rgba(${rgb},${a})`, 'important'); el.style.setProperty('border-radius', '4px', 'important');
              if (!px(css(el).paddingLeft)) el.style.setProperty('padding', '.1em .3em', 'important');
              el.style.setProperty('box-decoration-break', 'clone', 'important'); el.style.setProperty('-webkit-box-decoration-break', 'clone', 'important');
              scanProtection(); last = a;
              if (!state.warnings.some(x => (el === x.el || el.contains(x.el)) && /contrast|busy|text-over/.test(x.kind))) { passed = a; break; }
            }
            const unsampled = w.kind === 'text-over-image' && /could not be sampled/.test(w.msg);
            if (passed != null || unsampled) {
              const a = passed != null ? passed : 0.6; if (passed == null) { el.style.setProperty('background-color', `rgba(${rgb},${a})`, 'important'); }
              record(el, 'text', { scrim: 'tint', tint: `rgba(${rgb},${a})`, verified: passed != null }, `tint behind text rgba(${rgb},${a})${passed != null ? '' : ' (image not sampleable; unverified)'}`, 'tint');
              state.autoFixes.push({ el, ctl: 'text', sub: 'tint', what: `tint behind text, ${Math.round(a * 100)}%${passed != null ? ' (now passes)' : ' (unverified: image not sampleable)'}`, undo }); 
              return true;
            } else { undo(); scanProtection(); return false; }
    };
    // a photo section that already has a dark overlay (a builder's ::before layer): darken that overlay before putting anything behind the words
    const ovRules = state.ovRules || (state.ovRules = new Map());
    const ovSheet = () => { let el = document.getElementById('jig-ov-style'); if (!el) { el = document.createElement('style'); el.id = 'jig-ov-style'; document.head.appendChild(el); } el.textContent = Array.from(ovRules.values()).join('\n'); };
    const overlayFix = w => {
      let n = w.el, host = null, ps = null, base = null;
      while (n && n !== document.body && !host) { for (const p of ['::before', '::after']) { const pc = getComputedStyle(n, p); if (pc.content !== 'none' && /absolute|fixed/.test(pc.position)) { const pb = parseColor(pc.backgroundColor); if (pb && pb[3] > 0.05 && pb[3] < 1) { host = n; ps = p; base = pb; break; } } } if (!host) n = n.parentElement; }
      if (!host) return { found: false };
      if (seen.has(key(host, 'overlay'))) return { found: true, passed: !!host.__jigOvPassed };
      seen.add(key(host, 'overlay'));
      const id = 'o' + (ovRules.size + 1) + '-' + Math.random().toString(36).slice(2, 6); host.setAttribute('data-jig-ov', id);
      const a0 = Math.round(base[3] * 100) / 100; const rgb = base.slice(0, 3).map(Math.round).join(',');
      const failing = () => state.warnings.filter(x => host.contains(x.el) && /contrast|busy|text-over/.test(x.kind));
      const before = failing().length; let a = a0, passed = false;
      for (let step = Math.round((a0 + 0.1) * 10) / 10; step <= 0.6 + 1e-9; step = Math.round((step + 0.1) * 10) / 10) {
        ovRules.set(id, `[data-jig-ov="${id}"]${ps}{background-color:rgba(${rgb},${step}) !important}`); ovSheet(); scanProtection(); a = step;
        if (!failing().length) { passed = true; break; }
      }
      if (failing().length >= before) { ovRules.delete(id); ovSheet(); host.removeAttribute('data-jig-ov'); scanProtection(); return { found: true, passed: false, changed: false }; }   // darker didn't help: leave the overlay alone
      host.__jigOvPassed = passed;
      record(host, 'text', { overlay: { pseudo: ps, color: `rgb(${rgb})`, from: a0, to: a } }, `overlay ${ps} ${Math.round(a0 * 100)}% → ${Math.round(a * 100)}% (darkens the photo behind the text)`, 'overlay');
      state.autoFixes.push({ el: host, ctl: 'text', sub: 'overlay', what: `photo overlay ${Math.round(a0 * 100)}% → ${Math.round(a * 100)}%${passed ? ' (text on it now passes)' : ' (helps; some text still short)'}`, undo: () => { ovRules.delete(id); ovSheet(); host.removeAttribute('data-jig-ov'); delete host.__jigOvPassed; } });
      return { found: true, passed, changed: true };
    };
    const isLarge = el => { const fs = px(css(el).fontSize), b = px(css(el).fontWeight) >= 700; return fs >= 24 || (b && fs >= 18.66); };
    const shadeFor = new Map();   // source colour → shade chosen; every later element with that colour reuses it if it passes there too
    for (let pass = 0; pass < 4; pass++) {
      let did = false;
      for (const w of state.warnings.slice()) {
        const plain = w.kind === 'contrast' && /on background/.test(w.msg);
        if (!plain && (w.kind === 'contrast' || w.kind === 'busy-background' || w.kind === 'text-over-image')) {
          const ov = w.el.closest('.jig-el[data-jig-ctl="text"]');
          if (!ov || !ov.__jigSetScrim) {
            const o = overlayFix(w); if (o.changed) did = true;
            if (o.found && (o.passed || !state.warnings.some(x => x.el === w.el && /contrast|busy|text-over/.test(x.kind)))) continue;
            if (isLarge(w.el)) continue;   // a headline never gets a tint box; if the overlay couldn't carry it, it stays a note
            if (tintFallback(w)) did = true; continue;
          }
          if (seen.has(key(ov, 'scrim'))) continue;
          seen.add(key(ov, 'scrim'));
          for (const sc of ['gradient', 'tint', 'glass']) {
            ov.__jigSetScrim(sc); scanProtection();
            if (!state.warnings.some(x => ov.contains(x.el) && /contrast|busy|text-over/.test(x.kind))) { state.autoFixes.push({ el: ov, what: `scrim ${sc} (text over image now passes)` }); did = true; break; }
            if (sc === 'glass') { ov.__jigSetScrim('none'); scanProtection(); if (tintFallback(w)) did = true; else { ov.__jigSetScrim('glass'); state.autoFixes.push({ el: ov, what: 'scrim glass (best effort; still short of AA)' }); } }
          }
        }
        if (plain && !seen.has(key(w.el, w.kind))) {
          seen.add(key(w.el, w.kind)); const r = fixContrast(w.el, shadeFor);
          if (r && !r.already) { state.autoFixes.push({ el: w.el, ctl: 'type', sub: 'contrast', get what() { const c = (state.changes.get(keyOf(this.el, 'type') + '::contrast') || {}).contrast; return c ? `${c.prop === 'color' ? 'colour' : 'background'} ${c.from} → ${c.to} (contrast ${c.before} → ${c.after})` : `${r.prop} ${r.from} → ${r.to}`; }, undo: r.undo }); did = true; }
        }
        if (w.kind === 'small-text' && !w.el.__jigStepType && !seen.has(key(w.el, w.kind))) {
          // not wired as a type target (a span, an inline-styled div): set it straight to the first ramp step that clears the floor
          seen.add(key(w.el, w.kind)); const steps = ((state.F.type && state.F.type.steps) || []).map(x => x.px).filter(v => v >= w.min).sort((a, b) => a - b);
          const to = steps[0] || w.min; const el = w.el; const prev = el.style.getPropertyValue('font-size'); const prevP = el.style.getPropertyPriority('font-size'); const from = px(css(el).fontSize);
          el.style.setProperty('font-size', to + 'px', 'important');
          const stepTok = ((state.F.type && state.F.type.steps) || []).find(x => x.px === to);
          record(el, 'type', { from: Math.round(from), to: stepTok ? stepTok.token : to + 'px', px: to, ...(stepTok && stepTok.var ? { var: stepTok.var } : { inferred: true }) }, `font-size ${r1(from)}px → ${to}px (body copy floor)`);
          state.autoFixes.push({ el, ctl: 'type', what: `font-size ${r1(from)} → ${to}px (body copy floor)`, undo: () => { el.style.removeProperty('font-size'); if (prev) el.style.setProperty('font-size', prev, prevP); } }); did = true;
        }
        if (w.kind === 'small-text' && !w.el.__jigStepType && !seen.has(key(w.el, w.kind))) {
          seen.add(key(w.el, w.kind)); const steps = ((state.F.type && state.F.type.steps) || []).map(x => x.px).filter(v => v >= w.min).sort((a, b) => a - b);
          const to = steps[0] || w.min; const el = w.el; const prev = el.style.getPropertyValue('font-size'); const prevP = el.style.getPropertyPriority('font-size'); const from = px(css(el).fontSize);
          el.style.setProperty('font-size', to + 'px', 'important');
          const stepTok = ((state.F.type && state.F.type.steps) || []).find(x => x.px === to);
          record(el, 'type', { from: Math.round(from), to: stepTok ? stepTok.token : to + 'px', px: to, ...(stepTok && stepTok.var ? { var: stepTok.var } : { inferred: true }) }, `font-size ${r1(from)}px → ${to}px (body copy floor)`);
          state.autoFixes.push({ el, ctl: 'type', what: `font-size ${r1(from)} → ${to}px (body copy floor)`, undo: () => { el.style.removeProperty('font-size'); if (prev) el.style.setProperty('font-size', prev, prevP); } }); did = true;
        }
        if (w.kind === 'small-text' && w.el.__jigStepType && !seen.has(key(w.el, w.kind))) {
          seen.add(key(w.el, w.kind)); let steps = 0; while (steps < 3 && px(css(w.el).fontSize) < w.min - 0.5) { const b0 = px(css(w.el).fontSize); w.el.__jigStepType(1); if (px(css(w.el).fontSize) <= b0 + 0.1) break; steps++; }
          if (steps) { state.autoFixes.push({ el: w.el, what: `ramp +${steps} (body copy now ${r1(px(css(w.el).fontSize))}px)` }); did = true; }
        }
        if (w.kind === 'colour-link' && !seen.has(key(w.el, w.kind))) {
          // a link told apart by colour alone gets a shape: a light pill in its own colour family (underlining is the strict alternative)
          seen.add(key(w.el, w.kind)); const el = w.el; const fg = parseColor(css(el).color) || [0, 0, 0, 1]; const under = solidBehind(el.parentElement || el);
          const tint = lum(under) > 0.5 ? `rgba(${fg.slice(0, 3).map(Math.round).join(',')},0.12)` : 'rgba(255,255,255,0.16)';
          const keep = ['background-color', 'padding', 'border-radius', 'box-decoration-break', '-webkit-box-decoration-break'].map(k => [k, el.style.getPropertyValue(k), el.style.getPropertyPriority(k)]);
          el.style.setProperty('background-color', tint, 'important'); el.style.setProperty('padding', '.05em .35em', 'important'); el.style.setProperty('border-radius', '.3em', 'important'); el.style.setProperty('box-decoration-break', 'clone', 'important'); el.style.setProperty('-webkit-box-decoration-break', 'clone', 'important');
          record(el, 'text', { chip: tint }, `link chip ${tint} (marks the link by shape, not colour alone; an underline also works)`, 'chip');
          state.autoFixes.push({ el, ctl: 'text', sub: 'chip', what: 'link chip (shape, not colour alone)', undo: () => keep.forEach(([k, v, pr]) => { el.style.removeProperty(k); if (v) el.style.setProperty(k, v, pr); }) }); did = true;
        }
        if (w.kind === 'measure' && w.long && !w.el.__jigSetMaxCols && !seen.has(key(w.el, w.kind))) {
          seen.add(key(w.el, w.kind)); let el = w.el; while (el.parentElement && /^inline/.test(css(el).display) && el.parentElement !== document.body) el = el.parentElement;   // max-width does nothing on an inline span: cap its block
          if (seen.has(key(el, 'measure-cap'))) continue; seen.add(key(el, 'measure-cap')); const prev = el.style.getPropertyValue('max-width');
          el.style.setProperty('max-width', '68ch', 'important');
          record(el, 'type', { maxWidth: '68ch', wasCpl: Math.round(w.cpl) }, `max-width 68ch (measure was ~${Math.round(w.cpl)} characters)`, 'measure');
          state.autoFixes.push({ el, ctl: 'type', sub: 'measure', what: `max-width 68ch (measure was ~${Math.round(w.cpl)} characters)`, undo: () => { el.style.removeProperty('max-width'); if (prev) el.style.setProperty('max-width', prev); } }); did = true;
        }
        if (w.kind === 'measure' && w.long && w.el.__jigSetMaxCols && !seen.has(key(w.el, w.kind))) {
          seen.add(key(w.el, w.kind)); const G = state.F.grid; const colW = w.el.getBoundingClientRect().width / Math.max(1, Math.round(w.el.getBoundingClientRect().width / colWidth(w.el.parentElement || document.body)));
          const want = clamp(Math.round((70 * px(css(w.el).fontSize) * 0.5 + G.gutter) / (colWidth(w.el.parentElement || document.body))), 2, G.columns);
          w.el.__jigSetMaxCols(want); state.autoFixes.push({ el: w.el, what: `max-width ${want} cols (measure was ~${Math.round(w.cpl)} characters)` }); did = true;
        }
        if (w.kind === 'tap-target' && w.narrow && w.el.__jigStepSize && !seen.has(key(w.el, w.kind))) {
          seen.add(key(w.el, w.kind)); let steps = 0; const min = (state.F.protect || {}).minTapTarget || 24;
          while (steps < 2 && w.el.getBoundingClientRect().width < min - 0.5 && w.el.__jigStepSize(1)) steps++;
          if (steps) { state.autoFixes.push({ el: w.el, what: `size +${steps} (tap target now ${Math.round(w.el.getBoundingClientRect().width)}px wide)` }); did = true; }
        }
        if (w.kind === 'button-wrap' && !seen.has(key(w.el, w.kind))) {
          // a wrapped label: step the size down only if that keeps the tap target; otherwise keep the size and stop the wrap
          seen.add(key(w.el, w.kind)); const el = w.el; const minTap = (state.F.protect || {}).minTapTarget || 24;
          const lines = () => { const rg = document.createRange(); rg.selectNodeContents(el); return new Set(Array.from(rg.getClientRects()).filter(q => q.width > 1).map(q => Math.round(q.top / 4))).size; };
          const grown = seen.has(key(el, 'tap-target')) || seen.has(key(el, 'tap-min'));
          let steps = 0;
          if (!grown && el.__jigStepSize) { while (steps < 2 && lines() > 1 && el.__jigStepSize(-1)) { steps++; if (el.getBoundingClientRect().height < minTap - 0.5) { el.__jigStepSize(1); steps--; break; } } }
          if (lines() <= 1 && steps) { state.autoFixes.push({ el, what: `size −${steps} (label on one line)` }); did = true; }
          else {
            while (steps-- > 0) el.__jigStepSize(1);
            const prev = el.style.getPropertyValue('white-space'); el.style.setProperty('white-space', 'nowrap', 'important');
            const par = el.parentElement, r = el.getBoundingClientRect(), pr = par ? par.getBoundingClientRect() : null;
            if (lines() <= 1 && (!pr || r.right <= pr.right + 1)) {
              record(el, 'button', { whiteSpace: 'nowrap' }, 'white-space nowrap (label on one line)', 'nowrap');
              state.autoFixes.push({ el, ctl: 'button', sub: 'nowrap', what: 'white-space nowrap (label on one line, size kept)', undo: () => { el.style.removeProperty('white-space'); if (prev) el.style.setProperty('white-space', prev); } }); did = true;
            } else { el.style.removeProperty('white-space'); if (prev) el.style.setProperty('white-space', prev); }   // no room: leave the note for a person
          }
        }
        if (w.kind === 'dup-link' && !seen.has(key(w.el, w.kind))) {
          seen.add(key(w.el, w.kind)); const el = w.el; const pa = el.getAttribute('aria-hidden'), pt = el.getAttribute('tabindex');
          el.setAttribute('aria-hidden', 'true'); el.setAttribute('tabindex', '-1');
          record(el, 'a11y', { ariaHidden: 'true', tabindex: '-1', reason: 'duplicate of the headline link' }, 'aria-hidden="true" tabindex="-1" (duplicate of the headline link)', 'dup');
          state.autoFixes.push({ el, ctl: 'a11y', sub: 'dup', what: 'aria-hidden + tabindex -1 (image link duplicates the headline link)', undo: () => { pa == null ? el.removeAttribute('aria-hidden') : el.setAttribute('aria-hidden', pa); pt == null ? el.removeAttribute('tabindex') : el.setAttribute('tabindex', pt); } }); did = true;
        }
        if (w.kind === 'face' && w.el.__jigSetFocal && w.el.__jigFace && !seen.has(key(w.el, w.kind))) {
          seen.add(key(w.el, w.kind)); if (w.el.__jigSetFocal(w.el.__jigFace.fx, w.el.__jigFace.fy)) { state.autoFixes.push({ el: w.el, what: 'crop re-centred on the face' }); did = true; }
        }
        if (w.kind === 'tap-target' && !w.narrow && w.el.__jigStepSize && !seen.has(key(w.el, w.kind))) {
          seen.add(key(w.el, w.kind)); let steps = 0;
          while (steps < 2 && w.el.getBoundingClientRect().height < ((state.F.protect || {}).minTapTarget || 24) - 0.5 && w.el.__jigStepSize(1)) steps++;
          if (steps) { state.autoFixes.push({ el: w.el, what: `size +${steps} (tap target now ${Math.round(w.el.getBoundingClientRect().height)}px)` }); did = true; }
        }
        if (w.kind === 'tap-target' && !seen.has(key(w.el, 'tap-min'))) {
          // still short (no bigger size in the system, or not a wired button): give it the height directly, label centred
          const min = (state.F.protect || {}).minTapTarget || 24; const el = w.el; const r0 = el.getBoundingClientRect();
          if ((w.narrow ? r0.width : r0.height) < min - 0.5) {
            seen.add(key(el, 'tap-min')); const prop = w.narrow ? 'min-width' : 'min-height'; const prev = el.style.getPropertyValue(prop); const prevD = el.style.getPropertyValue('display');
            const cs = css(el); const pad = cs.boxSizing === 'border-box' ? 0 : (w.narrow ? px(cs.paddingLeft) + px(cs.paddingRight) + px(cs.borderLeftWidth) + px(cs.borderRightWidth) : px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth));
            el.style.setProperty(prop, Math.max(0, min - pad) + 'px', 'important');   // the box lands on 44px outside, padding included
            if (!/flex|grid/.test(css(el).display)) { el.style.setProperty('display', css(el).display === 'block' ? 'flex' : 'inline-flex', 'important'); el.style.setProperty('align-items', 'center', 'important'); el.style.setProperty('justify-content', 'center', 'important'); }
            record(el, 'button', { [w.narrow ? 'minWidth' : 'minHeight']: min }, `${prop} ${min}px (tap target)`, 'tap');
            state.autoFixes.push({ el, ctl: 'button', sub: 'tap', what: `${prop} ${min}px (tap target was ${Math.round(w.narrow ? r0.width : r0.height)}px)`, undo: () => { ['min-height', 'min-width', 'display', 'align-items', 'justify-content'].forEach(k => el.style.removeProperty(k)); if (prev) el.style.setProperty(prop, prev); if (prevD) el.style.setProperty('display', prevD); } }); did = true;
          }
        }
        if (w.kind === 'hierarchy' && w.el.__jigStepType && !seen.has(key(w.el, w.kind))) {
          seen.add(key(w.el, w.kind)); let steps = 0;
          if (w.small) {
            const reads = () => { const f = px(css(w.el).fontSize), bold = px(css(w.el).fontWeight) >= 600; return f > w.bodyPx + 0.5 && (f >= w.bodyPx * 1.15 - 0.01 || bold); };
            while (steps < 3 && !reads()) { const before = px(css(w.el).fontSize); w.el.__jigStepType(1); if (px(css(w.el).fontSize) <= before + 0.1) break; steps++; }
            if (steps) { state.autoFixes.push({ el: w.el, what: `ramp +${steps} (now larger than body copy)` }); did = true; }
          } else {
            const h1 = $$('h1').find(h => h.offsetParent); const h1px = h1 ? px(css(h1).fontSize) : 0;
            while (steps < 3 && px(css(w.el).fontSize) > h1px + 0.5) { w.el.__jigStepType(-1); steps++; }
            if (steps) { state.autoFixes.push({ el: w.el, what: `ramp -${steps} (now ≤ h1)` }); did = true; }
          }
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
    // a snap a later fix replaced (a heading stepped up, a button resized) is no longer what the page shows; leave it out of the patch
    (state.normalize || []).filter(n => n.el.isConnected && Math.abs(px(css(n.el).getPropertyValue(n.prop)) - n.to) < 0.6).forEach(n => { const k = `${n.prop}|${n.from}|${n.to}`; const e = g.get(k) || { prop: n.prop, from: n.from, to: n.to, els: [], hints: [] }; e.els.push(selectorOf(n.el)); e.hints.push(nameOf(n.el)); g.set(k, e); });
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
      if (b.id === 'jf-copy') { readBack(); copyText(JSON.stringify(exportFoundation(), null, 2)).then(r => flashBtn(b, r === 'ok' ? 'Copied' : 'Selected; press ⌘C')); }
      if (b.id === 'jf-reinfer') { try { localStorage.removeItem('__jig-foundation:' + location.host); } catch (x) {} state.F = inferFromPage(); state.foundationSource = 'inferred from this page'; rewire(); renderFoundationPanel(); }
    };
  }
  function flashBtn(b, msg) { const t = b.textContent; b.textContent = msg; setTimeout(() => (b.textContent = t), 1600); }
  function exportFoundation() {
    const F = state.F; const A = autoScale(); const steps = A ? A.type : (F.type.steps || []);
    const G = F.grid.desktop ? { ...F.grid.desktop, maxWidth: F.grid.maxWidth, phone: { columns: F.grid.columns, gutter: F.grid.gutter, margin: F.grid.margin } } : { columns: F.grid.columns, gutter: F.grid.gutter, margin: F.grid.margin, maxWidth: F.grid.maxWidth, phone: F.grid.phone || { columns: 4, gutter: 16, margin: 16 } };
    return { name: F.name, version: 1, grid: G, breakpoints: F.breakpoints || DEFAULT_FOUNDATION.breakpoints,
      spacing: (A ? A.space : (F.spacingSteps || [])).map(x => x.px), type: { ramp: steps.map(x => x.token), sizes: Object.fromEntries(steps.map(x => [x.token, x.px])) },
      buttons: F.buttons.mode === 'measured' ? { sizes: F.buttons.sizes.map(x => x.token), variants: F.buttons.variants.map(x => x.token), classPrefix: 'btn-', measured: { sizes: F.buttons.sizes, variants: F.buttons.variants } } : F.buttons, protect: F.protect };
  }

  // ------------------------------------------------------------ device preview
  let deviceEl = null;
  function openDevice(id) {
    hud.classList.add('jig-frame');
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
        if (w && !w.__jig && !w.__jigLoading && SCRIPT_SRC) { const sc = w.document.createElement('script'); sc.src = SCRIPT_SRC; sc.dataset.jigInjected = '1'; w.document.body.appendChild(sc); }
      } catch (e) {}
      if (state.grid) setTimeout(() => fr.contentWindow && fr.contentWindow.postMessage({ jig: 'grid', on: true }, '*'), 600);
      // the frame starts where the desktop is: desktop changes replay silently, auto runs at the same strength if it's on
      let tries = 0; const catchUp = () => { let w; try { w = fr.contentWindow; } catch (x) { return; } if (!w) return; if (w.__jig) { w.postMessage({ jig: 'replay', changes: Array.from(state.changes.values()).filter(c => !c.device), auto: state.normalize ? (state.autoRes || $('#jig-q-res').value) : null }, '*'); } else if (tries++ < 50) setTimeout(catchUp, 150); };
      setTimeout(catchUp, 150);
    };
    const fit = () => { const sh = $('.shell', deviceEl); const sc = Math.min(1, (window.innerHeight - 90) / (d.h + 28), (window.innerWidth - 400) / (d.w + 28)); sh.style.transform = `scale(${sc})`; };
    fit(); on(window, 'resize', fit);
    gridEl.hidden = true; $('#jig-bp').textContent = `${d.name} · ${d.w}px`; syncDeviceBtn(); paintAX(); renderHUD();
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
    hud.classList.remove('jig-frame');
    if (deviceEl) { deviceEl.remove(); deviceEl = null; }
    state.device = null; syncDeviceBtn(); state.frame.warnings = []; paintAX();
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
    state.bp = dev ? dev.bp : (window.innerWidth <= 640 ? 'phone' : 'desktop');   // the same line the phone drawer uses; a 440px iPhone is a phone
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
      on(window, 'message', e => { if (e.data && e.data.jig === 'reveal') { const el = $(e.data.el); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (el.classList.contains('jig-el') && el.classList.contains('jig-active')) select(el); } } });
      on(window, 'message', async e => {
        if (!e.data || e.data.jig !== 'replay') return;
        state.replaying = true;
        try {
          (e.data.changes || []).forEach(applyChange);
          if (e.data.auto) { state.autoRes = e.data.auto; await normalizePage(true); }
        } finally { state.replaying = false; }
        scanProtection(); postToParent();
      });
      on(window, 'message', e => { if (e.data && e.data.jig === 'grid') { if (e.data.columns) { state.F.grid.columns = e.data.columns; if (state.grid) drawGrid(); } toggleGrid(!!e.data.on); } });
      // same rule as the desktop: never wait on lazy images (they never load until scrolled), never more than 2.5s
      window.__jig = { state, patch: buildPatch, scan: scanProtection, Controls, embed: true };   // up first, so the desktop can replay into us while images load
      const imgs0 = $$('img').filter(i => !i.complete && i.loading !== 'lazy' && i.getBoundingClientRect().top < window.innerHeight * 1.5);
      await Promise.race([Promise.all(imgs0.map(i => new Promise(r => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }))), new Promise(r => setTimeout(r, 2500))]);
      scanProtection(); postToParent();
      if (document.readyState !== 'complete') on(window, 'load', scanSoon);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(scanSoon);
      return;
    }
    document.body.append(hud);
    on(window, 'message', e => { if (e.data && e.data.jig === 'frame') { state.frame = { changes: e.data.changes || [], warnings: e.data.warnings || [], device: e.data.device, bp: e.data.bp }; renderHUD(); } });
    $('#jig-min-btn').onclick = e => { e.stopPropagation(); hud.classList.toggle('jig-collapsed'); $('#jig-min-btn').textContent = hud.classList.contains('jig-collapsed') ? '+' : '–'; };
    // changes / notes fold shut by default; the state is remembered for the session
    $$('h6.fold', hud).forEach(h => { const body = $('#jig-' + h.dataset.fold); const key = 'jig-fold-' + h.dataset.fold; const open = safeGet(key) === '1'; body.hidden = !open; h.setAttribute('aria-expanded', open ? 'true' : 'false');
      h.onclick = () => { const o = body.hidden; body.hidden = !o; h.setAttribute('aria-expanded', o ? 'true' : 'false'); safeSet(key, o ? '1' : '0'); }; });
    const devBtn = $('#jig-device-btn'), devMenu = $('#jig-device-menu');
    const showDevMenu = show => { devMenu.hidden = !show; devBtn.setAttribute('aria-expanded', show ? 'true' : 'false'); };
    devBtn.onclick = e => { e.stopPropagation(); showDevMenu(devMenu.hidden); };
    $$('[data-device]', devMenu).forEach(m => m.onclick = e => { e.stopPropagation(); showDevMenu(false); if (m.dataset.device) openDevice(m.dataset.device); else closeDevice(); });
    on(document, 'pointerdown', e => { if (!devMenu.hidden && !e.target.closest('.devwrap')) showDevMenu(false); }, true);
    // on a real phone the device previews make no sense: you're already holding one
    { const coarse = window.matchMedia && matchMedia('(hover: none) and (pointer: coarse)').matches; if (state.bp === 'phone' || coarse && Math.min(screen.width, screen.height) <= 600) $('.devwrap', hud).hidden = true; }
    syncDeviceBtn();
    let firstRun = false;
    try { const saved = safeGet('jig-jigs:' + location.host); firstRun = !saved; (saved ? JSON.parse(saved) : ['ax']).forEach(id => state.jigs.add(id)); } catch (e) { state.jigs.add('ax'); }
    const welcome = $('#jig-welcome'); if (welcome) welcome.hidden = !firstRun;
    const applyJigs = () => {
      $$('[data-jig-toggle]', hud).forEach(b => { const on = state.jigs.has(b.dataset.jigToggle); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      $$('.jig-el').forEach(el => { const on = state.jigs.has(groupOf(el.dataset.jigCtl)); el.classList.toggle('jig-active', on); if (!on && el === state.selected) { el.classList.remove('jig-selected'); state.selected = null; toolbar.hidden = true; } });
      safeSet('jig-jigs:' + location.host, JSON.stringify(Array.from(state.jigs)));
      const fr = deviceEl && $('iframe', deviceEl); if (fr && fr.contentWindow) fr.contentWindow.postMessage({ jig: 'jigs', jigs: Array.from(state.jigs) }, '*');
      paintAX(); renderHUD();
    };
    $$('[data-jig-toggle]', hud).forEach(b => b.onclick = () => { const id = b.dataset.jigToggle; if (state.jigs.has(id)) state.jigs.delete(id); else state.jigs.add(id); if (welcome && id !== 'ax') welcome.hidden = true; applyJigs(); });
    applyJigs();
    $('#jig-grid-btn').onclick = () => toggleGrid();
    const setAdv = on => { hud.classList.toggle('jig-advanced', on); $('#jig-adv-btn').classList.toggle('on', on); safeSet('jig-advanced', on ? '1' : '0'); };
    setAdv(safeGet('jig-advanced') === '1');
    $('#jig-adv-btn').onclick = () => setAdv(!hud.classList.contains('jig-advanced'));
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
    $('#jig-norm-btn').onclick = () => {   // auto can take a few seconds on huge pages: say so, and let the label paint before the work starts
      const nb = $('#jig-norm-btn'); if (nb.dataset.busy) return; nb.dataset.busy = '1'; const label = nb.textContent; nb.textContent = 'working…';
      setTimeout(() => { Promise.resolve().then(() => normalizePage(!state.normalize)).finally(() => { nb.textContent = state.normalize ? 'on' : 'off'; delete nb.dataset.busy; }); }, 30);
    };
    $('#jig-q-res').onchange = () => { if (state.normalize) { normalizePage(false); normalizePage(true); } };
    if (state.F.mode && state.F.mode !== 'inferred') $('#jig-q-res').value = '32';   // the site has tokens: light = its own steps; medium/strict stay on offer
    $('#jig-reset-btn').onclick = () => { if (state.axFix) fixAX(false); normalizePage(false); $$('.jig-el').forEach(el => el.__jigReset && el.__jigReset()); state.changes.clear(); state.frame = { changes: [], warnings: [] }; closeDevice(); scanProtection(); };
    $('#jig-copy-btn').onclick = copyPatch;
    $('#jig-axfix').onclick = () => { const b = $('#jig-axfix'); if (b.dataset.busy) return; b.dataset.busy = '1'; b.textContent = 'working…'; setTimeout(() => { try { fixAX(!state.axFix); } finally { delete b.dataset.busy; renderAXPanel(); } }, 30); };
    $('#jig-axdl').onclick = () => { const r = downloadReport(); const b = $('#jig-axdl'); const t = b.textContent; b.textContent = r ? 'Downloaded' : 'Blocked here'; setTimeout(() => (b.textContent = t), 1600); };
    $('#jig-axmd').onclick = async () => { const r = await copyText(reportMarkdown()); const b = $('#jig-axmd'); const t = b.textContent; b.textContent = r === 'ok' ? 'Copied' : 'Press ⌘C'; setTimeout(() => (b.textContent = t), 1600); };

    // HUD drag
    let d = null; const hdr = $('header', hud); const grip = $('.hint', hud);
    // the panel can be dragged by its title bar or by the hint strip at the bottom, and its title bar never leaves the screen
    const keepOnScreen = (left, top) => { const r = hud.getBoundingClientRect(); hud.style.left = `${clamp(left, 80 - r.width, window.innerWidth - 80)}px`; hud.style.top = `${clamp(top, 0, Math.max(0, window.innerHeight - 44))}px`; hud.style.right = 'auto'; };
    [hdr, grip].forEach(h => {
      if (!h) return;
      on(h, 'pointerdown', e => { if (e.target.closest('.min')) return; d = { x: e.clientX - hud.offsetLeft, y: e.clientY - hud.offsetTop, sx: e.clientX, sy: e.clientY }; h.setPointerCapture(e.pointerId); });
      on(h, 'pointermove', e => { if (!d || window.innerWidth <= 640) return; keepOnScreen(e.clientX - d.x, e.clientY - d.y); });
      on(h, 'pointerup', e => { if (e.target.closest('.min')) { d = null; return; } const moved = d && (Math.abs(e.clientX - d.sx) > 4 || Math.abs(e.clientY - d.sy) > 4); d = null; if (h === hdr && window.innerWidth <= 640 && !moved) hud.classList.toggle('jig-collapsed'); });
    });
    on(window, 'resize', () => { if (window.innerWidth > 640 && hud.style.top) keepOnScreen(hud.offsetLeft, hud.offsetTop); });
    if (window.innerWidth <= 640) hud.classList.add('jig-collapsed');
    // first scan once visible images are in; lazy images below the fold never load until scrolled, so never wait on them, and never wait more than 2.5s
    const wn0 = $('#jig-wn-n'); if (wn0) { wn0.textContent = '…'; wn0.title = 'scanning'; }
    const imgs = $$('img').filter(i => !i.complete && i.loading !== 'lazy' && i.getBoundingClientRect().top < window.innerHeight * 1.5);
    await Promise.race([Promise.all(imgs.map(i => new Promise(r => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }))), new Promise(r => setTimeout(r, 2500))]);
    scanProtection(); if (wn0) wn0.title = '';
    // pages keep settling (web fonts, late scripts, ads, lazy sections): rescan quietly while they do, for the first 20s
    if (document.readyState !== 'complete') on(window, 'load', scanSoon);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(scanSoon);
    const t0 = Date.now(); let settles = 0;
    const mo = new MutationObserver(ms => {
      if (Date.now() - t0 > 20000 || settles >= 4 || state.lastScanMs > 250) { mo.disconnect(); return; }   // busy pages (ads, carousels) don't get to keep the jig rescanning
      if (!scanTimer && ms.some(m => !(m.target.closest && m.target.closest('#jig-hud, #jig-axtags, #jig-device, .jig-tb, #jig-found, .jig-scrim-panel')) && Array.from(m.addedNodes).some(n => n.nodeType === 1 && !(n.id || '').startsWith('jig-') && !(n.className && String(n.className).includes('jig-'))))) { settles++; scanSoon(); }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    window.__jig = { state, patch: buildPatch, scan: scanProtection, Controls, report: buildAXReport, reportHTML, reportMarkdown, fixAX, get gridDebug() { return gridDebug; } };   // gridDebug: what the grid measuring saw
    console.log('%cjig studio%c ready · ' + $$('.jig-el').length + ' elements · foundation ' + state.F.name, 'color:#3f6fff;font-weight:700', '');
  }
  function r1(v) { return Math.round(v * 10) / 10; }
  function r2(v) { return Math.round(v * 100) / 100; }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
