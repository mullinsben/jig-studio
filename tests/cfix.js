const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/demo/legacy/?jig'); await p.waitForTimeout(1500);
  const notes = () => p.evaluate(() => window.__jig.state.warnings.map(w => w.kind));
  console.log('before', (await notes()).length, await notes());
  await p.click('#jig-adv-btn'); await p.click('#jig-norm-btn'); await p.waitForTimeout(2500);
  console.log('after auto', (await notes()).length, await notes());
  console.log('fixes', await p.evaluate(() => window.__jig.state.autoFixes.map(f => f.what)));
  console.log('fine colour now', await p.evaluate(() => getComputedStyle(document.querySelector('.fine')).color), 'button bg now', await p.evaluate(() => getComputedStyle(document.querySelector('.button')).backgroundColor));
  await p.screenshot({ path: 'cfix.png' });
  await p.click('#jig-norm-btn'); await p.waitForTimeout(1200);
  console.log('after off', (await notes()).length, await p.evaluate(() => getComputedStyle(document.querySelector('.fine')).color), await p.evaluate(() => window.__jig.state.changes.size));
  // manual aa button on the demo
  await p.goto('http://localhost:8765/demo/?jig'); await p.waitForTimeout(1200); await p.click('[data-jig-toggle="text"]');
  await p.locator('[data-jig-name="Meet the herd title"]').click(); console.log('toolbar', await p.evaluate(() => document.querySelector('.jig-tb').textContent));
  await p.locator('.jig-tb button', { hasText: 'aa' }).click(); await p.waitForTimeout(200); console.log('badge', await p.evaluate(() => document.querySelector('.jig-badge').textContent));
  console.log('errors', errs); await b.close();
})();
