const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1414, height: 900 } });
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://localhost:8777/mr2.html?jig'); await p.waitForFunction(() => window.__jig && document.querySelector('#jig-wn-n').textContent !== '…');
await p.click('#jig-grid-btn'); await p.waitForTimeout(300);
console.log(JSON.stringify(await p.evaluate(() => { const G = __jig.state.F.grid; const ls = [...document.querySelectorAll('#jig-grid .cols i')].map(i => [Math.round(i.getBoundingClientRect().left), Math.round(i.getBoundingClientRect().right)]);
  const cards = [...document.querySelectorAll('.row:first-child .card')].map(c => [Math.round(c.getBoundingClientRect().left), Math.round(c.getBoundingClientRect().right)]);
  const lines = new Set(ls.flat()); return { cols: G.columns, gutter: G.gutter, maxWidth: G.maxWidth, first: ls[0], last: ls[ls.length - 1], cards, cardEdgesOnLines: cards.flat().map(x => [...lines].some(l => Math.abs(l - x) <= 1)) }; })));
await b.close(); })();
