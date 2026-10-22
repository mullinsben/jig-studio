const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push('parent: ' + e.message));
  await p.goto('http://localhost:8765/demo/?jig'); await p.waitForTimeout(1200);
  await p.click('[data-jig-toggle="text"]'); await p.click('[data-jig-toggle="buttons"]');
  await p.click('#jig-device-btn'); await p.click('#jig-device-menu [data-device="iphone-15-pro"]');
  await p.waitForFunction(() => { const f = document.querySelector('#jig-device iframe'); return f && f.contentWindow && f.contentWindow.__jig; }); await p.waitForTimeout(1500);
  const fr = p.frames().find(f => f.url().includes('embed')); fr.on && 0;
  const st = () => fr.evaluate(() => ({ containers: document.querySelectorAll('#jig-axtags').length, warnings: window.__jig.state.warnings.map(w => w.kind), chips: Array.from(document.querySelectorAll('#jig-axtags .tag')).map(t => t.textContent), h2: getComputedStyle(document.querySelector('[data-jig-name="Meet the herd title"]')).fontSize }));
  console.log('frame start', await st());
  await fr.evaluate(() => { const h = document.querySelector('[data-jig-name="Meet the herd title"]'); h.scrollIntoView(); h.__jigStepType(-1); }); await p.waitForTimeout(900);
  console.log('after −', await st());
  console.log('errors', errs); await b.close();
})();
