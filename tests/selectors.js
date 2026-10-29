// every selector in a patch must name exactly one element, even on a page of identical cards (styled-components style)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  for (const u of ['tests/deepcards.html', 'tests/bigpage.html', 'demo/legacy/', 'demo/']) {
    await p.goto('http://localhost:8765/' + u + '?jig'); await p.waitForSelector('#jig-hud'); await p.waitForTimeout(2000);
    const r = await p.evaluate(() => {
      const patch = window.__jig.patch(); const txt = typeof patch === 'string' ? patch : JSON.stringify(patch);
      const i = txt.indexOf('\n---\n['); const j = txt.lastIndexOf('\n]'); const json = i < 0 ? [] : JSON.parse(txt.slice(i + 5, j + 2));
      // the patch targets the site's own markup: take the jig's wrappers out before checking
      document.querySelectorAll('.jig-scrim-panel, .jig-crop-box').forEach(w => { while (w.firstChild) w.parentNode.insertBefore(w.firstChild, w); w.remove(); });
      const sels = json.map(e => e.el).filter(Boolean); const bad = [], dup = {};
      sels.forEach(s => { dup[s] = (dup[s] || 0) + 1; let n = -1; try { n = document.querySelectorAll(s).length; } catch (e) {} if (n !== 1) bad.push(s + ' → ' + n); });
      return { entries: sels.length, notUnique: bad.slice(0, 5), repeated: Object.values(dup).filter(v => v > 1).length, longest: Math.max(0, ...sels.map(s => s.split(' > ').length)) };
    });
    console.log(u, JSON.stringify(r));
  }
  await b.close();
})();
