const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/demo/?jig'); await p.waitForTimeout(1200);
  const kinds = () => p.evaluate(() => window.__jig.state.warnings.map(w => w.kind + (w.msg.includes('wide') ? '(wide)' : '')));
  // make trouble: shrink body copy, widen a paragraph to the full grid, zoom an image hard, step a button down until its label wraps
  await p.evaluate(() => {
    const p1 = document.querySelector('.herd-intro p'); for (let i = 0; i < 2; i++) p1.__jigStepType(-1);
    const wide = document.querySelector('#adopt > .container > p'); wide.__jigSetMaxCols && wide.__jigSetMaxCols(12); wide.style.maxWidth = 'none';
    const img = document.querySelector('[data-jig-name="Hero image"]'); img.__jigSetCrop(50, 50, 3.2);
  });
  await p.waitForTimeout(900); console.log('after trouble', await kinds());
  await p.click('#jig-adv-btn'); await p.click('#jig-norm-btn'); await p.waitForTimeout(3000);
  console.log('after auto', await kinds(), await p.evaluate(() => window.__jig.state.autoFixes.map(f => f.what).filter(w => /body copy|max-width|wide|label|face/.test(w))));
  console.log('errors', errs); await b.close();
})();
