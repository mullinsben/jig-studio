const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const w of [1920, 1440, 1366, 1280, 390]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } }); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/googletag|gtag|TUNNEL/.test(m.text())) errs.push(m.text()); });
    await p.goto('http://localhost:8766/lab/capybutz.html'); await p.waitForTimeout(800);
    const r = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, imgs: Array.from(document.images).filter(i => !i.complete || i.naturalWidth === 0).map(i => i.getAttribute('src')), links: Array.from(document.querySelectorAll('a[href]')).map(a => a.getAttribute('href')).filter(h => !/^(#|http|mailto)/.test(h)) }));
    console.log(w, r.sw > r.cw ? 'OVERFLOW ' + r.sw : 'ok', 'broken imgs', r.imgs, 'errors', errs);
    if (w === 1440) { await p.screenshot({ path: 'lab1440.png', fullPage: true }); console.log('links', [...new Set(r.links)]); }
    if (w === 390) await p.screenshot({ path: 'lab390.png', fullPage: true });
    await p.close();
  }
  await b.close();
})();
