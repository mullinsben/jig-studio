const { chromium } = require('playwright');
(async () => { const b = await chromium.launch();
for (const u of ['mr3.html', 'gw.html']) { const p = await b.newPage({ viewport: { width: 1414, height: 900 } }); p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://localhost:8777/' + u + '?jig'); await p.waitForFunction(() => window.__jig && document.querySelector('#jig-wn-n').textContent !== '…');
await p.click('#jig-grid-btn'); await p.waitForTimeout(300);
console.log(u, JSON.stringify(await p.evaluate(() => ({ meta: document.querySelector('#jig-grid .gmeta').textContent, off: [...document.querySelectorAll('#jig-grid .offgrid')].map(o => o.textContent + ' @' + o.style.top) }))));
await p.screenshot({ path: '/tmp/claude-0/-home-claude/900e9517-47da-544c-9e1e-0e004e3d7d68/scratchpad/' + u + '.png' }); await p.close(); }
await b.close(); })();
