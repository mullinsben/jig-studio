const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push('parent: ' + e.message));
  await p.goto('http://localhost:8765/demo/?jig'); await p.waitForTimeout(1200);
  for (const t of ['images', 'text', 'buttons']) await p.click(`[data-jig-toggle="${t}"]`);
  // desktop: fix the CTA by hand, then run auto
  await p.locator('[data-jig-name="Membership CTA"]').click(); await p.locator('.jig-tb button', { hasText: '+' }).first().click();
  await p.click('#jig-adv-btn'); await p.click('#jig-norm-btn'); await p.waitForTimeout(2500);
  const desk = await p.evaluate(() => ({ changes: window.__jig.state.changes.size, notes: window.__jig.state.warnings.map(w => w.kind) }));
  console.log('desktop', desk);
  await p.click('#jig-device-btn'); await p.click('#jig-device-menu [data-device="iphone-15-pro"]');
  await p.waitForFunction(() => { const f = document.querySelector('#jig-device iframe'); return f && f.contentWindow && f.contentWindow.__jig; }); await p.waitForTimeout(3500);
  const fr = p.frames().find(f => f.url().includes('embed'));
  console.log('frame', await fr.evaluate(() => ({ cta: Math.round(document.querySelector('[data-jig-name="Membership CTA"]').getBoundingClientRect().height), h2: getComputedStyle(document.querySelector('[data-jig-name="Meet the herd title"]')).fontSize, scrim: document.querySelector('[data-jig-name="Habitat banner copy"] .jig-scrim-panel').style.cssText.slice(0, 30), notes: window.__jig.state.warnings.map(w => w.kind), ownChanges: window.__jig.state.changes.size, chips: document.querySelectorAll('#jig-axtags .tag').length })));
  console.log('patch frame section present?', (await p.evaluate(() => window.__jig.patch())).includes('iphone'));
  console.log('errors', errs); await b.close();
})();
