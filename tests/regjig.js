const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/demo/?jig'); await p.waitForTimeout(1200); await p.click('[data-jig-toggle="images"]');
  const el = p.locator('[data-jig-name="Herd photo: Reginald"]'); await el.scrollIntoViewIfNeeded(); const r = await el.boundingBox();
  await p.mouse.move(r.x + r.width / 2, r.y + 100); await p.mouse.down(); await p.mouse.move(r.x + r.width / 2, r.y + 160, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(200);
  console.log('after drag', await p.evaluate(() => { const e = document.querySelector('[data-jig-name="Herd photo: Reginald"]'); return { op: e.style.objectPosition, tr: e.style.transform, change: [...window.__jig.state.changes.values()].map(c => c.summary) }; }));
  await p.click('#jig-adv-btn'); await p.click('#jig-reset-btn'); await p.waitForTimeout(300);
  console.log('after reset', await p.evaluate(() => { const e = document.querySelector('[data-jig-name="Herd photo: Reginald"]'); return { op: e.style.objectPosition, tr: e.style.transform }; }));
  console.log('errors', errs); await b.close();
})();
