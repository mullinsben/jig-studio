const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/demo/?jig'); await p.waitForTimeout(1200);
  await p.click('[data-jig-toggle="ax"]'); await p.waitForTimeout(600);
  console.log(await p.evaluate(() => ({ pink: document.querySelectorAll('.jig-ax').length, tags: Array.from(document.querySelectorAll('#jig-axtags .tag')).map(t => t.textContent), warnings: window.__jig ? undefined : null })));
  await p.screenshot({ path: 'ax.png', fullPage: false });
  await p.click('[data-jig-toggle="ax"]'); await p.waitForTimeout(300);
  console.log('off:', await p.evaluate(() => ({ pink: document.querySelectorAll('.jig-ax').length, tags: document.querySelectorAll('#jig-axtags .tag').length })));
  console.log('errors', errs); await b.close();
})();
