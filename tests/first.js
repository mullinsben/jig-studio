const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/demo/?jig'); await p.waitForTimeout(1200);
  console.log('first open:', await p.evaluate(() => ({ welcome: !document.getElementById('jig-welcome').hidden, axOn: document.querySelector('[data-jig-toggle="ax"]').classList.contains('on'), hudH: document.getElementById('jig-hud').offsetHeight })));
  await p.screenshot({ path: 'first.png', clip: { x: 1040, y: 0, width: 400, height: 420 } });
  await p.click('[data-jig-toggle="images"]');
  console.log('after toggle:', await p.evaluate(() => ({ welcome: !document.getElementById('jig-welcome').hidden })));
  await p.reload(); await p.waitForTimeout(1000);
  console.log('second open:', await p.evaluate(() => ({ welcome: !document.getElementById('jig-welcome').hidden, jigs: Array.from(document.querySelectorAll('[data-jig-toggle].on')).map(b => b.textContent) })));
  console.log('errors', errs); await b.close();
})();
