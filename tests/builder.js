// Page-builder heroes (Bold/Elementor/Divi): the photo is an absolute layer BESIDE the content and the section has an opaque colour + ::before overlay.
// The jig must grade the text against the photo (not the section colour) and must never "fix" it by recolouring the text.
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/tests/builder.html?jig'); await p.waitForFunction(() => window.__jig && document.querySelector('#jig-wn-n').textContent !== '…'); await p.waitForTimeout(2000);
  const r = await p.evaluate(() => __jig.state.warnings.map(w => w.kind + ' · ' + w.el.textContent.trim().slice(0, 30) + ' · ' + w.msg.slice(0, 70)));
  console.log('notes', r);
  const fix = await p.evaluate(() => { const h = document.querySelector('.port h1'); const before = getComputedStyle(h).color; if (h.__jigFixContrast) h.__jigFixContrast(); return { before, after: getComputedStyle(h).color }; });
  console.log('aa on hero h1', fix, fix.before === fix.after ? 'OK (refused)' : 'BAD (recoloured)');
  await p.evaluate(() => document.querySelector('#jig-adv-btn').click()); await p.click('#jig-norm-btn'); await p.waitForFunction(() => !document.querySelector('#jig-norm-btn').dataset.busy, null, { timeout: 30000 }); await p.waitForTimeout(500);
  console.log('auto fix', await p.evaluate(() => ({ heroColour: getComputedStyle(document.querySelector('.port h1')).color, plainColour: getComputedStyle(document.querySelector('.plain p')).color, fixes: __jig.state.autoFixes.map(f => f.what.slice(0, 60)) })));
  if (errs.length) console.log('ERR', errs); await b.close(); })();
