const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/demo/?jig'); await p.waitForTimeout(1000);
  await p.click('[data-jig-toggle="text"]');
  const box = async () => p.evaluate(() => { const r = s => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), Math.round((b.left + b.right) / 2)]; }; return { panel: r('.banner-copy .jig-scrim-panel'), h2: r('.banner-copy h2'), p: r('.banner-copy p'), img: r('.banner img') }; });
  console.log('none', await box());
  await p.evaluate(() => document.querySelector('[data-jig-name="Habitat banner copy"]').__jigSetScrim('glass')); await p.waitForTimeout(200);
  console.log('glass', await box());
  const el = await p.locator('.banner').boundingBox(); await p.screenshot({ path: 'scrimc.png', clip: el });
  console.log('errors', errs); await b.close();
})();
