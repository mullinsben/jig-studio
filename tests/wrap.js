const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/demo/legacy/?jig'); await p.waitForTimeout(1500); await p.click('[data-jig-toggle="images"]');
  const sel = 'img[src*="banner-board"]';
  console.log('wrapped', await p.evaluate(s => { const i = document.querySelector(s); return { wrap: i.parentElement.className, siblingsInWrap: i.parentElement.children.length, residentsWrapped: !!document.querySelector('.residents img').closest('.jig-crop-box') }; }, sel));
  const el = p.locator(sel); await el.scrollIntoViewIfNeeded(); await el.click(); await p.locator('.jig-tb button', { hasText: '+' }).first().click(); await p.locator('.jig-tb button', { hasText: '+' }).first().click(); await p.waitForTimeout(300);
  const r0 = await el.boundingBox(); const txt = await p.locator('img[src*="banner-board"] + *, .jig-crop-box + p').first().boundingBox().catch(() => null);
  console.log('zoomed');
  // does the paragraph under the photo still get hit by a click (i.e. not covered)?
  await p.evaluate(() => document.querySelector('.jig-crop-box').scrollIntoView({ block: 'center' })); await p.waitForTimeout(200);
  const hit = await p.evaluate(() => { const pEl = document.querySelector('.jig-crop-box').nextElementSibling; const rr = pEl.getBoundingClientRect(); const t = document.elementFromPoint(rr.left + 20, rr.top + 8); return !t ? 'null' : (t === pEl || pEl.contains(t)) ? 'paragraph' : t.tagName + '.' + t.className; });
  console.log('element under paragraph point:', hit);
  await p.screenshot({ path: 'wrap.png', clip: { x: 0, y: 250, width: 1280, height: 420 } });
  // unwire via rewire: foundation apply path
  await b.close(); console.log('errors', errs);
})();
