const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://localhost:8777/icon.html?jig'); await p.waitForFunction(() => window.__jig && document.querySelector('#jig-wn-n').textContent !== '…');
console.log('notes', JSON.stringify(await p.evaluate(() => __jig.state.warnings.map(w => w.kind + ': ' + w.msg.slice(0, 50)))));
await b.close(); })();
