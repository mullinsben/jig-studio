const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/demo/?jig'); await p.waitForTimeout(1200);
  const notes = () => p.evaluate(() => window.__jig.state.warnings.filter(w => w.kind === 'hierarchy').map(w => w.msg));
  console.log('start', await notes());
  await p.evaluate(() => { const h = document.querySelector('[data-jig-name="Meet the herd title"]'); for (let i = 0; i < 4; i++) h.__jigStepType(-1); }); await p.waitForTimeout(700);
  console.log('after shrinking h2 to', await p.evaluate(() => getComputedStyle(document.querySelector('[data-jig-name="Meet the herd title"]')).fontSize), await notes());
  await p.click('#jig-adv-btn'); await p.click('#jig-norm-btn'); await p.waitForTimeout(2500);
  console.log('after auto', await p.evaluate(() => getComputedStyle(document.querySelector('[data-jig-name="Meet the herd title"]')).fontSize), await notes(), await p.evaluate(() => window.__jig.state.autoFixes.map(f => f.what).filter(w => /ramp/.test(w))));
  console.log('errors', errs); await b.close();
})();
