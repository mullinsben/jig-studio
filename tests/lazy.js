const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto('http://localhost:8777/lazy.html?jig'); await p.waitForFunction(() => window.__jig, null, { timeout: 8000 });
  await p.waitForTimeout(800);
  const r = await p.evaluate(() => ({ n: __jig.state.warnings.length, kinds: __jig.state.warnings.map(w => w.kind + ':' + (w.el.className || w.el.tagName)), badge: document.querySelector('#jig-wn-n').textContent }));
  console.log('first scan', JSON.stringify(r));
  await p.click('#jig-adv-btn'); await p.click('#jig-norm-btn'); await p.waitForTimeout(1500);
  const r2 = await p.evaluate(() => ({ n: __jig.state.warnings.length, kinds: __jig.state.warnings.map(w => w.kind + ':' + (w.el.className || w.el.tagName)), fixes: __jig.state.autoFixes.map(f => f.what), btnH: document.querySelector('.btn').getBoundingClientRect().height, sumW: getComputedStyle(document.querySelector('.summary')).maxWidth, h2: 0 }));
  console.log('after auto', JSON.stringify(r2, null, 1));
  const patch = await p.evaluate(() => __jig.patch().human || __jig.patch()); console.log(String(typeof patch === 'string' ? patch : JSON.stringify(patch)).slice(0, 900));
  await b.close();
})();
