const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const url of ['http://localhost:8765/demo/?jig', 'http://localhost:8765/demo/legacy/?jig']) {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await p.goto(url); await p.waitForTimeout(1500);
    const before = await p.evaluate(() => Array.from(document.querySelectorAll('.jig-el[data-jig-ctl="button"]')).map(e => e.textContent.trim().slice(0, 22) + ' ' + Math.round(e.getBoundingClientRect().height)));
    await p.click('#jig-adv-btn'); await p.click('#jig-norm-btn'); await p.waitForTimeout(2500);
    const after = await p.evaluate(() => Array.from(document.querySelectorAll('.jig-el[data-jig-ctl="button"]')).map(e => e.textContent.trim().slice(0, 22) + ' ' + Math.round(e.getBoundingClientRect().height)));
    console.log(url, '\n before', before, '\n after ', after, '\n fixes', await p.evaluate(() => window.__jig.state.autoFixes.map(f => f.what).filter(w => /size|tap/.test(w))), '\n notes', await p.evaluate(() => window.__jig.state.warnings.filter(w => w.kind === 'tap-target').map(w => w.msg)));
    await p.close();
  }
  await b.close();
})();
