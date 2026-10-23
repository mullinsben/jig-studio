const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:8766/lab/capybutz/legacy/index.html?jig', { waitUntil: 'networkidle' }); await p.waitForFunction(() => window.__jig && document.querySelector('#jig-wn-n').textContent !== '…');
await p.click('#jig-adv-btn'); await p.click('#jig-norm-btn'); await p.waitForTimeout(2500);
const t = await p.evaluate(() => __jig.patch());
console.log(t.split('\n').filter(l => /nav|caption|tint|scrim|Home|hero/i.test(l)).slice(0, 30).join('\n'));
console.log('nav font after auto:', await p.evaluate(() => getComputedStyle(document.querySelector('#nav a')).fontSize + ' lines ' + new Set([...document.querySelectorAll('#nav a')].map(a => Math.round(a.getBoundingClientRect().top))).size));
await b.close(); })();
