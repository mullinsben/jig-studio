// The text-over-background catalogue: 14 ways sites put text on photos, overlays and gradients.
// "pass" cases must not be flagged as contrast failures (and must never be recoloured); "fail" cases must be flagged over the image/gradient.
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/tests/layers.html?jig'); await p.waitForFunction(() => window.__jig && document.querySelector('#jig-wn-n').textContent !== '…'); await p.waitForTimeout(2500);
  await p.evaluate(() => __jig.scan());
  const r = await p.evaluate(() => [...document.querySelectorAll('[data-expect]')].map(c => { const t = c.querySelector('.t'); const ws = __jig.state.warnings.filter(w => w.el === t && /contrast|busy|text-over/.test(w.kind)); return { name: t.textContent, expect: c.dataset.expect, got: ws.map(w => w.kind + ': ' + w.msg.slice(0, 56)) }; }));
  let ok = 0; r.forEach(x => { const flagged = x.got.some(g => /^contrast|^busy/.test(g)); const unmeasured = x.got.some(g => /^text-over/.test(g)); const plain = x.got.some(g => /on background/.test(g)); const good = x.expect === 'pass' ? !flagged : (flagged && !plain); if (good) ok++; console.log((good ? 'OK  ' : 'BAD ') + x.name.padEnd(42) + ' expect ' + x.expect + ' · ' + (x.got.join(' | ') || 'no note') + (unmeasured && x.expect === 'pass' ? '  (unmeasured)' : '')); });
  console.log(`${ok}/${r.length} cases right`);
  console.log('logo + plain img', await p.evaluate(() => ({ logoFit: getComputedStyle(document.querySelector('#logo-test img')).objectFit, logoWired: document.querySelector('#logo-test img').classList.contains('jig-el'), plainFit: getComputedStyle(document.querySelector('#plain-fill')).objectFit })), '(want contain, false, fill: the plain one is 240x200 vs a 16:9 picture, so forcing cover would crop it)');
  if (errs.length) console.log('ERR', errs); await b.close(); })();
