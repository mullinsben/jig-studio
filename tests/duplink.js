const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1414, height: 900 } }); p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://localhost:8777/gwdup.html?jig'); await p.waitForFunction(() => window.__jig && document.querySelector('#jig-wn-n').textContent !== '…');
console.log('before', JSON.stringify(await p.evaluate(() => { const m = {}; __jig.state.warnings.forEach(w => m[w.kind] = (m[w.kind] || 0) + 1); return m; })), JSON.stringify(await p.evaluate(() => __jig.gridDebug && { top: __jig.gridDebug.top, W: __jig.gridDebug.W })));
await p.click('#jig-adv-btn'); await p.click('#jig-norm-btn'); await p.waitForTimeout(1500);
console.log('after', JSON.stringify(await p.evaluate(() => ({ kinds: (() => { const m = {}; __jig.state.warnings.forEach(w => m[w.kind] = (m[w.kind] || 0) + 1); return m; })(), hidden: document.querySelectorAll('a[aria-hidden="true"][tabindex="-1"]').length }))));
const t = await p.evaluate(() => __jig.patch()); console.log(t.split('\n').filter(l => /aria-hidden|×/.test(l)).slice(0, 4).join('\n'));
await b.close(); })();
