const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/demo/legacy/?jig'); await p.waitForTimeout(1500); await p.click('[data-jig-toggle="text"]');
  console.log('caption ctl', await p.evaluate(() => { const c = document.querySelector('#hero .caption'); return { ctl: c.dataset.jigCtl, small: c.querySelector('small').dataset.jigCtl }; }));
  await p.locator('#hero .caption').click({ position: { x: 20, y: 10 } }); await p.waitForTimeout(200);
  console.log('caption toolbar', await p.evaluate(() => document.querySelector('.jig-tb').textContent));
  await p.locator('#hero .caption small').click(); await p.waitForTimeout(200);
  console.log('small toolbar', await p.evaluate(() => document.querySelector('.jig-tb').textContent));
  await p.locator('.jig-tb button', { hasText: '◐' }).click(); await p.waitForTimeout(400);
  console.log('after ◐', await p.evaluate(() => ({ tb: document.querySelector('.jig-tb').textContent, bg: document.querySelector('#hero .caption').style.background.slice(0, 40), changes: [...window.__jig.state.changes.values()].map(c => c.summary) })));
  // the demo banner: inner h2 should also carry the scrim button
  await p.goto('http://localhost:8765/demo/?jig'); await p.waitForTimeout(1200); await p.click('[data-jig-toggle="text"]');
  await p.locator('[data-jig-name="Habitat banner title"]').click(); console.log('demo h2 toolbar', await p.evaluate(() => document.querySelector('.jig-tb').textContent));
  console.log('errors', errs); await b.close();
})();
