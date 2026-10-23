const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://localhost:8777/inl.html?jig'); await p.waitForFunction(() => window.__jig && document.querySelector('#jig-wn-n').textContent !== '…');
console.log('before', await p.evaluate(() => __jig.state.warnings.map(w => w.kind).join(',')));
await p.click('#jig-adv-btn'); await p.click('#jig-norm-btn'); await p.waitForTimeout(1500);
console.log('after', await p.evaluate(() => __jig.state.warnings.map(w => w.kind).join(',') + ' | body max-width ' + getComputedStyle(document.querySelector('.body')).maxWidth));
await b.close(); })();
