const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/demo/?jig'); await p.waitForTimeout(1500);
  const hs = () => p.evaluate(() => Array.from(document.querySelectorAll('.hero-actions .btn')).map(e => e.className.replace(/jig-\S+/g, '').trim() + ' ' + Math.round(e.getBoundingClientRect().height)));
  console.log('before', await hs());
  await p.click('#jig-adv-btn'); await p.click('#jig-norm-btn'); await p.waitForTimeout(2500);
  console.log('auto on', await hs(), await p.evaluate(() => window.__jig.state.autoFixes.map(f => f.what).filter(w => /size/.test(w))));
  await p.click('#jig-norm-btn'); await p.waitForTimeout(800);
  console.log('auto off', await hs(), 'changes', await p.evaluate(() => window.__jig.state.changes.size));
  console.log('errors', errs); await b.close();
})();
