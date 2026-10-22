const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://localhost:8765/demo/legacy/?jig'); await p.waitForTimeout(1500);
  await p.click('#jig-adv-btn'); await p.click('#jig-norm-btn'); await p.waitForTimeout(3000);
  console.log(await p.evaluate(() => window.__jig.state.warnings.map(w => w.kind + ' | ' + (w.el.className || w.el.tagName) + ' | ' + w.msg + ' | ' + (w.el.textContent || '').trim().slice(0, 30))));
  await b.close();
})();
