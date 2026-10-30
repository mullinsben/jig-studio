const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const out = {};
for (const f of ['index.html', 'index-ai2.html']) { const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/demo/legacy/' + f + '?jig', { waitUntil: 'networkidle' }); await p.waitForFunction(() => window.__jig && document.querySelector('#jig-wn-n').textContent !== '…');
  await p.waitForTimeout(500);
  out[f] = await p.evaluate(() => ({ foundation: __jig.state.F.name + ' (' + __jig.state.F.mode + ')', notes: __jig.state.warnings.map(w => w.kind + ': ' + w.msg.slice(0, 70)), navLines: new Set([...document.querySelectorAll('#nav a')].map(a => Math.round(a.getBoundingClientRect().top))).size, h: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth }));
  out[f].errs = errs;
  await p.screenshot({ path: '/tmp/claude-0/-home-claude/900e9517-47da-544c-9e1e-0e004e3d7d68/scratchpad/rt-' + f + '.png', fullPage: false }); await p.close(); }
for (const [w, h] of [[1920,1080],[1366,768],[390,844]]) { const p = await b.newPage({ viewport: { width: w, height: h } }); await p.goto('http://localhost:8765/demo/legacy/index-ai2.html', { waitUntil: 'networkidle' }); const sw = await p.evaluate(() => document.documentElement.scrollWidth); console.log(w, 'scrollWidth', sw, sw > w ? 'OVERFLOW' : 'ok'); await p.close(); }
console.log(JSON.stringify(out, null, 1)); await b.close(); })();
