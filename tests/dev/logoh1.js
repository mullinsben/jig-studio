const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://localhost:8777/logoh1.html?jig'); await p.waitForFunction(() => window.__jig && document.querySelector('#jig-wn-n').textContent !== '…');
console.log('before', JSON.stringify(await p.evaluate(() => __jig.state.warnings.map(w => w.kind + ': ' + w.msg.slice(0, 90)))));
await p.click('#jig-adv-btn'); await p.click('#jig-norm-btn'); await p.waitForTimeout(1500);
console.log('h2 sizes after auto', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('h2')].map(h => getComputedStyle(h).fontSize))));
await b.close(); })();
