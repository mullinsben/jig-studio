const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); p.on('pageerror', e => console.log('ERR', e.stack)); p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await p.goto('http://localhost:8765/demo/legacy/index.html?jig', { waitUntil: 'networkidle' }); await p.waitForFunction(() => window.__jig && document.querySelector('#jig-wn-n').textContent !== '…');
await p.click('#jig-adv-btn'); await p.click('#jig-norm-btn'); await p.waitForTimeout(2500);
console.log(await p.evaluate(() => ({ apply: getComputedStyle(document.querySelector('a.button')).backgroundColor, price: getComputedStyle(document.querySelector('.price')).color, big: getComputedStyle(document.querySelector('.bigbutton')).backgroundColor, notes: __jig.state.warnings.map(w => w.kind).join(',') })));
const t = await p.evaluate(() => __jig.patch()); console.log(t.split('\n').filter(l => /d9772a/i.test(l)).slice(0, 4).join('\n'));
await b.close(); })();
