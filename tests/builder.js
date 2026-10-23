// Page-builder pages (Bold/Elementor/Divi): photo layers beside the content, ::before overlays, transparent PNG backgrounds.
// Hero: graded against the photo, never recoloured; auto fix darkens the existing overlay, never tint boxes on the headline.
// Footer: a transparent PNG over a light colour must not read as black (dark text there passes).
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/tests/builder.html?jig'); await p.waitForFunction(() => window.__jig && document.querySelector('#jig-wn-n').textContent !== '…'); await p.waitForTimeout(2000);
  console.log('notes', await p.evaluate(() => __jig.state.warnings.map(w => w.kind + ' · ' + w.el.textContent.trim().slice(0, 30) + ' · ' + w.msg.slice(0, 60))));
  const fix = await p.evaluate(() => { const h = document.querySelector('.port h1'); const before = getComputedStyle(h).color; if (h.__jigFixContrast) h.__jigFixContrast(); return before === getComputedStyle(h).color ? 'OK (aa refused on photo)' : 'BAD (recoloured)'; }); console.log(fix);
  await p.evaluate(() => document.querySelector('#jig-adv-btn').click()); await p.click('#jig-norm-btn'); await p.waitForFunction(() => !document.querySelector('#jig-norm-btn').dataset.busy, null, { timeout: 30000 }); await p.waitForTimeout(500);
  console.log('auto fix', await p.evaluate(() => ({ overlay: getComputedStyle(document.querySelector('.sec'), '::before').backgroundColor, tintsOnHero: [...document.querySelectorAll('.port *')].filter(e => /rgba\(10, 10, 12/.test(e.style.backgroundColor)).map(e => e.tagName), heroNotes: __jig.state.warnings.filter(w => w.el.closest('.port')).map(w => w.kind + ' ' + w.msg.slice(0, 40)), fixes: __jig.state.autoFixes.map(f => f.what.slice(0, 70)), patchHasOverlay: /"overlay": \{/.test(__jig.patch()) })));
  await p.click('#jig-norm-btn'); await p.waitForFunction(() => !document.querySelector('#jig-norm-btn').dataset.busy, null, { timeout: 30000 }); await p.waitForTimeout(400);
  console.log('auto off overlay', await p.evaluate(() => getComputedStyle(document.querySelector('.sec'), '::before').backgroundColor), await p.evaluate(() => __jig.state.changes.size));
  if (errs.length) console.log('ERR', errs); await b.close(); })();
