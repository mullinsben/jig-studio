const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://localhost:8777/lazy.html?jig'); await p.waitForFunction(() => window.__jig && document.querySelector('#jig-wn-n').textContent !== '…');
await p.click('#jig-device-btn'); await p.click('[data-device]:not([data-device=""])'); await p.waitForTimeout(4500);
console.log(JSON.stringify(await p.evaluate(() => ({ frameWarnings: (__jig.state.frame.warnings || []).length, kinds: (__jig.state.frame.warnings || []).map(w => w.kind), badge: document.querySelector('#jig-wn-n').textContent, frameJig: !!document.querySelector('#jig-device iframe').contentWindow.__jig }))));
await b.close(); })();
