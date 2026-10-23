// Transparent header overlaid on a coloured hero (the colour is a neighbour, not a parent): white nav must measure against the hero, never get recoloured.
// Long measure: the cap goes on the whole text column, not just the paragraph that tripped it.
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/tests/overlay-header.html?jig'); await p.waitForFunction(() => window.__jig && document.querySelector('#jig-wn-n').textContent !== '…'); await p.waitForTimeout(800);
  console.log('notes', await p.evaluate(() => __jig.state.warnings.map(w => w.kind + ' · ' + w.el.textContent.trim().slice(0, 24) + ' · ' + w.msg.slice(0, 50))));
  await p.evaluate(() => document.querySelector('#jig-adv-btn').click()); await p.click('#jig-norm-btn'); await p.waitForFunction(() => !document.querySelector('#jig-norm-btn').dataset.busy, null, { timeout: 30000 }); await p.waitForTimeout(400);
  console.log('after auto fix', await p.evaluate(() => ({ navColour: getComputedStyle(document.querySelector('header nav a')).color, widths: ['p1', 'p2', 'p3'].map(id => Math.round(document.getElementById(id).getBoundingClientRect().width)), fixes: __jig.state.autoFixes.map(f => f.what.slice(0, 60)) })));
  if (errs.length) console.log('ERR', errs); await b.close(); })();
