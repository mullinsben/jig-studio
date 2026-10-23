const { chromium } = require('playwright');
(async () => { const b = await chromium.launch();
for (const [u, sel] of [['mr2.html', '.card'], ['mr3.html', '.r3 .card, .r2 .card'], ['gw.html', 'article']]) { const p = await b.newPage({ viewport: { width: 1414, height: 900 } }); p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://localhost:8777/' + u + '?jig'); await p.waitForFunction(() => window.__jig && document.querySelector('#jig-wn-n').textContent !== '…');
await p.click('#jig-grid-btn'); await p.waitForTimeout(300);
console.log(u, JSON.stringify(await p.evaluate(sel => { const G = __jig.state.F.grid; const ls = [...document.querySelectorAll('#jig-grid .cols i')].map(i => [i.getBoundingClientRect().left, i.getBoundingClientRect().right]);
  const lines = ls.flat(); const ed = [...document.querySelectorAll(sel)].flatMap(c => [c.getBoundingClientRect().left, c.getBoundingClientRect().right]);
  return { cols: G.columns, gutter: G.gutter, from: Math.round(ls[0][0]), to: Math.round(ls[ls.length-1][1]), cardEdgesOn: ed.filter(x => lines.some(l => Math.abs(l - x) <= 2)).length + '/' + ed.length }; }, sel))); await p.close(); }
await b.close(); })();
