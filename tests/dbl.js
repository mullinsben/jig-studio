const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://localhost:8766/lab/capybutz/?jig'); await p.waitForTimeout(1200);
  await p.click('[data-jig-toggle="spacing"]');
  await p.click('#jig-device-btn'); await p.click('#jig-device-menu [data-device="iphone-se"]'); await p.waitForTimeout(2500);
  const fr = p.frames().find(f => f.url().includes('embed'));
  console.log('frame url', fr.url());
  const sec = fr.locator('[data-jig-name="Meet the herd section"]');
  await sec.scrollIntoViewIfNeeded(); await sec.click({ position: { x: 10, y: 5 } }); await fr.waitForTimeout(300);
  await fr.locator('.jig-tb button', { hasText: '+' }).first().click(); await fr.waitForTimeout(300);
  console.log(await fr.evaluate(() => ({ tbs: document.querySelectorAll('.jig-tb').length, shown: Array.from(document.querySelectorAll('.jig-tb:not([hidden])')).map(t => t.textContent), scripts: document.querySelectorAll('script[src*="jig.js"]').length })));
  // now turn the spacing jig off from the parent
  await p.click('[data-jig-toggle="spacing"]'); await p.waitForTimeout(400);
  console.log('after off', await fr.evaluate(() => ({ shown: Array.from(document.querySelectorAll('.jig-tb:not([hidden])')).map(t => t.textContent), badge: !document.querySelector('.jig-badge').hidden })));
  await b.close();
})();
