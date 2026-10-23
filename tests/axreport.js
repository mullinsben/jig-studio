// AX report: panel counts, fix-what-I-can + undo, baseline/fixed status, HTML + markdown outputs, auto folding in the ax fixes
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT || '/tmp/claude-0/qa';
(async () => { const b = await chromium.launch();
  for (const [name, path] of [['capybutz', '/demo/index.html'], ['dave', '/demo/legacy/index.html']]) {
    const c = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:8765' + path + '?jig'); await p.waitForFunction(() => window.__jig && window.__jig.report && document.querySelector('#jig-wn-n').textContent !== '…', null, { timeout: 20000 }); await p.waitForTimeout(1500);
    const ax = await p.evaluate(() => { if (!__jig.state.jigs.has('ax')) document.querySelector('[data-jig-toggle="ax"]').click(); const R = __jig.report(); return { panelHidden: document.querySelector('#jig-axr').hidden, panelN: document.querySelector('#jig-axr-n').textContent, label: document.querySelector('#jig-axr-l').textContent, notes: __jig.state.warnings.length, totals: R.totals, rules: R.rules.map(r => `${r.open}/${r.items.length} ${r.kind}`), fixBtn: document.querySelector('#jig-axfix').textContent + (document.querySelector('#jig-axfix').disabled ? ' (disabled)' : '') }; });
    console.log(`\n== ${name}`, JSON.stringify(ax, null, 1));
    const t0 = Date.now(); await p.click('#jig-axfix'); await p.waitForTimeout(800);
    const after = await p.evaluate(() => { const R = __jig.report(); return { ms: 0, totals: R.totals, rules: R.rules.map(r => `${r.open}/${r.items.length} ${r.kind}`), fixes: __jig.state.autoFixes.length, changes: __jig.state.changes.size, btn: document.querySelector('#jig-axfix').textContent, patchHasAx: /# ax fixes/.test(__jig.patch()) }; });
    after.ms = Date.now() - t0; console.log('after fix', JSON.stringify(after, null, 1));
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#jig-axdl')]); const f = `${OUT}/${name}-report.html`; await dl.saveAs(f); console.log('download', dl.suggestedFilename(), fs.statSync(f).size, 'bytes');
    const md = await p.evaluate(() => __jig.reportMarkdown()); fs.writeFileSync(`${OUT}/${name}-report.md`, md); console.log('md lines', md.split('\n').length);
    await p.click('#jig-axfix'); await p.waitForTimeout(800);
    console.log('undo', JSON.stringify(await p.evaluate(() => ({ totals: __jig.report().totals, fixes: __jig.state.autoFixes.length, changes: __jig.state.changes.size, axFix: __jig.state.axFix, btn: document.querySelector('#jig-axfix').textContent }))));
    // fix, then auto: auto must take over the fixes and its undo must restore the page
    await p.click('#jig-axfix'); await p.waitForTimeout(600); await p.evaluate(() => document.querySelector('#jig-adv-btn').click()); await p.click('#jig-norm-btn'); await p.waitForFunction(() => !document.querySelector('#jig-norm-btn').dataset.busy, null, { timeout: 60000 }); await p.waitForTimeout(900);
    console.log('fix→auto', JSON.stringify(await p.evaluate(() => ({ axFix: __jig.state.axFix, normalize: !!__jig.state.normalize, fixes: __jig.state.autoFixes.length, btn: document.querySelector('#jig-axfix').textContent, open: __jig.report().totals.open }))));
    await p.click('#jig-norm-btn'); await p.waitForFunction(() => !document.querySelector('#jig-norm-btn').dataset.busy, null, { timeout: 60000 }); await p.waitForTimeout(900);
    console.log('auto off', JSON.stringify(await p.evaluate(() => ({ fixes: __jig.state.autoFixes.length, changes: __jig.state.changes.size, open: __jig.report().totals.open, notes: __jig.state.warnings.length }))));
    await p.screenshot({ path: `${OUT}/${name}-hud.png` });
    if (errs.length) console.log('ERRORS', errs);
    // render the report on screen and in print
    const r = await c.newPage(); await r.setViewportSize({ width: 1200, height: 900 }); await r.goto('file://' + f); await r.screenshot({ path: `${OUT}/${name}-report.png`, fullPage: true });
    await r.emulateMedia({ media: 'print' }); await r.screenshot({ path: `${OUT}/${name}-report-print.png`, fullPage: true }); await r.pdf({ path: `${OUT}/${name}-report.pdf`, format: 'Letter' });
    await r.setViewportSize({ width: 390, height: 844 }); await r.emulateMedia({ media: 'screen' }); console.log('report overflow at 390:', await r.evaluate(() => document.documentElement.scrollWidth - innerWidth));
    await c.close();
  }
  await b.close(); })();
