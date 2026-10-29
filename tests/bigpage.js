// Fix what I can on a big page with many unreadable (cross-origin) photos: must not freeze the tab, must not ship guesses
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://localhost:8765/tests/bigpage.html?jig'); await p.waitForSelector('#jig-hud'); await p.waitForTimeout(2500);
  const r = await p.evaluate(async () => {
    const t = performance.now(); let clicks = 0;
    const open = () => { const f = document.querySelector('[data-fold="ax"]'); if (f && f.getAttribute('aria-expanded') !== 'true') f.click(); };
    open();
    for (; clicks < 6; clicks++) { const b = document.getElementById('jig-axfix'); if (!/Fix/.test(b.textContent) || b.disabled) break; b.click(); await new Promise(r => setTimeout(r, 200)); while (document.getElementById('jig-axfix').dataset.busy) await new Promise(r => setTimeout(r, 50)); }
    return { ms: Math.round(performance.now() - t), clicks, fixes: window.__jig && window.__jig.state ? window.__jig.state.autoFixes.length : null, label: document.getElementById('jig-axfix').textContent, lastScanMs: Math.round(window.__jig && window.__jig.state ? window.__jig.state.lastScanMs : -1) };
  });
  console.log(r);
  const patch = await p.evaluate(() => window.__jig.patch());
  const txt = typeof patch === 'string' ? patch : JSON.stringify(patch);
  console.log('unverified tints in patch:', (txt.match(/unverified/g) || []).length, '· tap fixes:', (txt.match(/tap target/g) || []).length, '· contrast fixes:', (txt.match(/contrast \d/g) || []).length);
  await b.close();
})();
