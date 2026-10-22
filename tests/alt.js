const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8777/'); await p.evaluate(() => { const s = document.createElement('script'); s.src = 'http://localhost:8765/jig.js?v=' + Date.now(); s.setAttribute('data-jig-injected', '1'); document.body.appendChild(s); }); await p.waitForFunction(() => window.__jig); await p.waitForTimeout(1200);
  console.log('foreign:', await p.evaluate(() => ({ axOn: document.querySelector('[data-jig-toggle="ax"]').classList.contains('on'), pink: document.querySelectorAll('.jig-ax').length, notes: Array.from(document.querySelectorAll('#jig-warn .row')).map(r => r.textContent).filter(t => /alt/.test(t)), folded: document.getElementById('jig-warn').hidden, count: document.getElementById('jig-wn-n').textContent })));
  await p.click('h6.fold[data-fold="warn"]'); console.log('after click folded:', await p.evaluate(() => document.getElementById('jig-warn').hidden));
  await p.goto('http://localhost:8765/demo/?jig'); await p.waitForTimeout(1200);
  console.log('demo:', await p.evaluate(() => ({ axOn: document.querySelector('[data-jig-toggle="ax"]').classList.contains('on'), pink: document.querySelectorAll('.jig-ax').length, alt: Array.from(document.querySelectorAll('#jig-warn .row')).filter(r => /alt/.test(r.textContent)).length })));
  await p.screenshot({ path: 'alt.png' });
  console.log('errors', errs); await b.close();
})();
