const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/demo/?jig'); await p.waitForTimeout(1500);
  // reproduce Ben's session: scrim tint by hand, then auto
  await p.evaluate(() => document.querySelector('[data-jig-name="Habitat banner copy"]').__jigSetScrim('tint'));
  await p.click('#jig-adv-btn'); await p.click('#jig-norm-btn'); await p.waitForTimeout(3000);
  const patch = await p.evaluate(() => window.__jig.patch());
  const human = patch.split('\n---')[0]; console.log(human.slice(human.indexOf('# auto ·')));
  const json = JSON.parse(patch.split('\n---\n')[1].split('\n# ')[0]);
  console.log('selectors sample', json.filter(j => j.ctl || j.op).slice(0, 14).map(j => j.el || (j.els && j.els[0])));
  console.log('guestbook footers still auto-bottomed:', await p.evaluate(() => Array.from(document.querySelectorAll('.quotes footer')).map(f => Math.round(f.getBoundingClientRect().bottom - f.closest('blockquote').getBoundingClientRect().bottom))));
  console.log('errors', errs); await b.close();
})();
