const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/demo/legacy/?jig'); await p.waitForTimeout(1500);
  const lefts = () => p.evaluate(() => ['#hero', '.col.left', '#hero .caption', '#content'].map(s => Math.round(document.querySelector(s).getBoundingClientRect().left)));
  const before = await lefts();
  await p.evaluate(() => { document.getElementById('jig-q-res').value = '8'; });
  await p.click('#jig-adv-btn'); await p.click('#jig-norm-btn'); await p.waitForTimeout(3500);
  console.log('lefts before/after', before, await lefts());
  const patch = await p.evaluate(() => window.__jig.patch());
  const human = patch.split('\n---')[0];
  console.log(human.split('\n').filter(l => /Facebook|in line|on grid|^# auto|font-size: 17/.test(l)).join('\n'));
  console.log('header:', patch.split('\n')[0]);
  console.log('notes left:', await p.evaluate(() => window.__jig.state.warnings.map(w => w.kind + ' ' + (w.el.className || w.el.tagName))));
  console.log('errors', errs); await b.close();
})();
