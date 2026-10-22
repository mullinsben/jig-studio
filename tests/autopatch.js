const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/demo/?jig'); await p.waitForTimeout(1500);
  console.log('strength default', await p.evaluate(() => document.getElementById('jig-q-res').value));
  await p.click('#jig-adv-btn'); await p.click('#jig-norm-btn'); await p.waitForTimeout(3000);
  const patch = await p.evaluate(() => window.__jig.patch());
  console.log(patch.split('\n---')[0]);
  console.log('errors', errs); await b.close();
})();
