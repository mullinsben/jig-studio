// a site that points at its design system (data-foundation=URL) gets its own type ramp and spacing scale, by name
const { chromium } = require('playwright');
const want = {
  'page-json': { type: ['font-size-xs', 'font-size-sm', 'font-size-base', 'font-size-lg', 'font-size-xl', 'font-size-2xl', 'font-size-3xl'], typePx: [12, 14, 16, 20, 24, 32, 48], space: [4, 8, 12, 16, 24, 32, 48, 64], grid: { columns: 12, gutter: 24 } },
  'page-studio': { type: ['global-fontsizes-caption', 'global-fontsizes-body', 'global-fontsizes-h3', 'global-fontsizes-h2', 'global-fontsizes-h1', 'global-typography-hero'], typePx: [12, 16, 20, 28, 40, 56], space: [4, 8, 16, 24, 40] },
  'page-css': { type: ['font-size-100', 'font-size-200', 'font-size-300', 'font-size-400', 'font-size-500', 'font-size-600'], typePx: [12, 14, 16, 20, 25, 31], space: [4, 8, 16, 24, 40] },
};
(async () => {
  const b = await chromium.launch(); let bad = 0;
  for (const [pg, w] of Object.entries(want)) {
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(`http://localhost:8765/tests/tokens/${pg}.html?jig`); await p.waitForSelector('#jig-hud'); await p.waitForTimeout(1200);
    const r = await p.evaluate(() => { const F = window.__jig.state.F; return { mode: F.mode, name: F.name, src: document.getElementById('jig-src').textContent, type: F.type.steps.map(x => x.token), typePx: F.type.steps.map(x => x.px), vars: F.type.steps.map(x => x.var), space: F.spacingSteps.map(x => x.px), spaceTok: F.spacingSteps.map(x => x.token), grid: { columns: F.grid.columns, gutter: F.grid.gutter }, radius: F.radius, bp: F.breakpoints, patch: window.__jig.patch().split('\n').filter(l => /^foundation:/.test(l))[0] }; });
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const ok = r.mode === 'tokens' && eq(r.type, w.type) && eq(r.typePx, w.typePx) && eq(r.space, w.space) && (!w.grid || (r.grid.columns === w.grid.columns && r.grid.gutter === w.grid.gutter)) && !errs.length;
    if (!ok) bad++;
    console.log(ok ? 'OK  ' : 'FAIL', pg, JSON.stringify({ mode: r.mode, name: r.name, type: r.type, typePx: r.typePx, space: r.space, spaceTok: r.spaceTok, grid: r.grid, radius: r.radius, bp: r.bp }), errs);
    if (pg === 'page-json') console.log('   hud:', r.src, '\n   patch:', r.patch, '\n   vars:', r.vars.slice(0, 3).join(', '));
    await p.close();
  }
  // a bad URL: the jig falls back and says so
  { const p = await b.newPage(); await p.goto('http://localhost:8765/tests/tokens/page-bad.html?jig'); await p.waitForSelector('#jig-hud'); await p.waitForTimeout(800);
    const r = await p.evaluate(() => ({ mode: window.__jig.state.F.mode, src: document.getElementById('jig-src').textContent })); const ok = /failed/.test(r.src) && r.mode !== 'tokens'; if (!ok) bad++; console.log(ok ? 'OK  ' : 'FAIL', 'bad url →', r.mode, '·', r.src.slice(0, 170)); await p.close(); }
  // a type step on a tokens page lands in the patch as the site's own token
  { const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); await p.goto('http://localhost:8765/tests/tokens/page-json.html?jig'); await p.waitForSelector('#jig-hud'); await p.waitForTimeout(800);
    await p.click('[data-jig-toggle="text"]'); await p.click('h2'); await p.waitForTimeout(200); await p.locator('.jig-tb button', { hasText: '+' }).first().click(); await p.waitForTimeout(300);
    const e = await p.evaluate(() => { const t = window.__jig.patch(); const i = t.indexOf('\n---\n['); const j = t.lastIndexOf('\n]'); return JSON.parse(t.slice(i + 5, j + 2)).find(x => x.ctl === 'type'); });
    const ok = e && e.from === 'font-size-xl' && e.to === 'font-size-2xl' && e.var === '--font-size-2xl' && e.px === 32; if (!ok) bad++; console.log(ok ? 'OK  ' : 'FAIL', 'type step in patch →', JSON.stringify(e)); await p.close(); }
  // the Foundation panel's Load button: load another file, and it survives a reload (saved for the site)
  { const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); await p.goto('http://localhost:8765/tests/tokens/page-json.html?jig'); await p.waitForSelector('#jig-hud'); await p.waitForTimeout(800);
    await p.evaluate(() => { document.getElementById('jig-adv-btn').click(); document.getElementById('jig-found-btn').click(); });
    await p.waitForSelector('#jf-url'); await p.fill('#jf-url', 'tokens-studio.json'); await p.click('#jf-load'); await p.waitForTimeout(1200);
    const a = await p.evaluate(() => ({ mode: window.__jig.state.F.mode, name: window.__jig.state.F.name, first: window.__jig.state.F.type.steps[0].token }));
    await p.reload(); await p.waitForSelector('#jig-hud'); await p.waitForTimeout(800);
    const r = await p.evaluate(() => ({ mode: window.__jig.state.F.mode, name: window.__jig.state.F.name, first: window.__jig.state.F.type.steps[0].token, src: document.getElementById('jig-src').textContent.slice(0, 90) }));
    const ok = a.name === 'tokens-studio' && r.mode === 'tokens' && r.first === 'global-fontsizes-caption'; if (!ok) bad++; console.log(ok ? 'OK  ' : 'FAIL', 'panel load + reload →', JSON.stringify({ a, r }));
    await p.evaluate(() => localStorage.removeItem('__jig-foundation:' + location.host)); await p.close(); }
  await b.close(); process.exit(bad ? 1 : 0);
})();
