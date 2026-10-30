const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/demo/?jig'); await p.waitForTimeout(1000);
  const st = () => p.evaluate(() => ({ btn: document.querySelector('#jig-device-btn').textContent, on: document.querySelector('#jig-device-btn').classList.contains('on'), menu: !document.querySelector('#jig-device-menu').hidden, checked: (document.querySelector('#jig-device-menu .on') || {}).textContent, back: !(document.querySelector('#jig-device-menu .back').hidden), frame: !!document.querySelector('#jig-device iframe') }));
  console.log('start', await st());
  await p.click('#jig-device-btn'); console.log('menu open', await st());
  await p.click('#jig-device-menu [data-device="iphone-15-pro"]'); await p.waitForTimeout(1500); console.log('iphone', await st());
  await p.click('#jig-device-btn'); await p.screenshot({ path: 'devmenu.png' }); console.log('reopen', await st());
  await p.click('#jig-device-menu [data-device="pixel-8"]'); await p.waitForTimeout(1200); console.log('pixel', await st());
  await p.click('#jig-device-btn'); await p.click('#jig-device-menu .back'); await p.waitForTimeout(300); console.log('back', await st());
  await p.click('#jig-device-btn'); await p.mouse.click(300, 600); console.log('outside click closes menu', await st());
  console.log('errors', errs); await b.close();
})();
