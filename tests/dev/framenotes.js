const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/demo/legacy/?jig'); await p.waitForTimeout(1500);
  const st = () => p.evaluate(() => ({ deskChips: document.querySelectorAll('#jig-axtags .tag').length, deskPink: document.querySelectorAll('.jig-ax').length, rows: Array.from(document.querySelectorAll('#jig-warn .row')).map(r => r.textContent.slice(0, 50)), badge: document.getElementById('jig-wn-n').textContent }));
  console.log('desktop', await st());
  await p.click('#jig-device-btn'); await p.click('#jig-device-menu [data-device="iphone-15-pro"]');
  await p.waitForFunction(() => { const f = document.querySelector('#jig-device iframe'); return f && f.contentWindow && f.contentWindow.__jig; }); await p.waitForTimeout(2500);
  const fr = p.frames().find(f => f.url().includes('embed'));
  console.log('frame open', await st(), 'frame chips', await fr.evaluate(() => document.querySelectorAll('#jig-axtags .tag').length));
  await p.click('#jig-device-btn'); await p.click('#jig-device-menu .back'); await p.waitForTimeout(600);
  console.log('closed', await st());
  console.log('errors', errs); await b.close();
})();
