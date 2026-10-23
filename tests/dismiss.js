// Dismissing a finding: leaves counts, pink and auto fix; survives a reload; listed in the report; restorable. Colour-only links get a chip from auto fix.
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const open = async () => { await p.goto('http://localhost:8765/tests/rules1.html?jig'); await p.waitForFunction(() => window.__jig && document.querySelector('#jig-wn-n').textContent !== '…'); await p.waitForTimeout(600); await p.evaluate(() => { if (!__jig.state.jigs.has('ax')) document.querySelector('[data-jig-toggle="ax"]').click(); if (document.querySelector('#jig-ax').hidden) document.querySelector('h6[data-fold="ax"]').click(); }); };
  const st = () => p.evaluate(() => ({ n: __jig.state.warnings.length, dismissed: (__jig.state.dismissedWarnings || []).length, kinds: __jig.state.warnings.map(w => w.kind).join(','), pinkOnVague: [...document.querySelectorAll('a')].find(a => /^Read more$/.test(a.textContent) && !a.getAttribute('aria-label')).classList.contains('jig-ax') }));
  await open(); console.log('start  ', await st());
  // expand "vague link" rule and ignore its finding
  await p.evaluate(() => [...document.querySelectorAll('#jig-axr-rules .axrow')].find(r => /where it goes/.test(r.textContent)).click());
  await p.evaluate(() => document.querySelector('#jig-axr-rules .axi .ign').click()); await p.waitForTimeout(300);
  console.log('ignored', await st());
  await open(); console.log('reload ', await st());
  const md = await p.evaluate(() => __jig.reportMarkdown()); console.log('report section:', md.split('\n').filter(l => /Dismissed by the reviewer|vague|doesn't say where/.test(l)));
  console.log('patch line:', (await p.evaluate(() => __jig.patch())).split('\n').find(l => /dismissed by the reviewer/.test(l)));
  // auto fix: chips on colour-only links
  await p.evaluate(() => document.querySelector('#jig-adv-btn').click()); await p.click('#jig-norm-btn'); await p.waitForFunction(() => !document.querySelector('#jig-norm-btn').dataset.busy, null, { timeout: 30000 }); await p.waitForTimeout(400);
  console.log('auto fix', await p.evaluate(() => ({ chips: [...document.querySelectorAll('a')].filter(a => a.style.backgroundColor).map(a => a.textContent + ' ' + a.style.backgroundColor), colourLinksLeft: __jig.state.warnings.filter(w => w.kind === 'colour-link').length, fixes: __jig.state.autoFixes.map(f => f.what) })));
  await p.click('#jig-norm-btn'); await p.waitForFunction(() => !document.querySelector('#jig-norm-btn').dataset.busy, null, { timeout: 30000 }); await p.waitForTimeout(300);
  console.log('auto off chips', await p.evaluate(() => [...document.querySelectorAll('a')].filter(a => a.style.backgroundColor).length));
  // restore
  await p.evaluate(() => { const r = [...document.querySelectorAll('#jig-axr-rules .axrow')].find(r => /dismissed/.test(r.textContent)); r.click(); });
  await p.evaluate(() => document.querySelector('#jig-axr-rules .axi.fixed .ign').click()); await p.waitForTimeout(300);
  console.log('restored', await st());
  if (errs.length) console.log('ERR', errs); await b.close(); })();
