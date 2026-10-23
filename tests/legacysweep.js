const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [w, h, q] of [[1920,1080,''],[1440,900,''],[1366,768,''],[1280,800,''],[390,844,''],[1440,900,'?jig'],[390,844,'?jig']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    p.on('pageerror', e => errs.push(w + q + ': ' + e.message));
    await p.goto('http://localhost:8765/demo/legacy/' + q, { waitUntil: 'networkidle' });
    if (q) await p.waitForFunction(() => window.__jig);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    console.log(w, q || '(plain)', 'scrollWidth=' + sw + (sw > w ? '  <-- OVERFLOW' : ''));
    if (w === 390 && q) await p.screenshot({ path: '/tmp/claude-0/-home-claude/900e9517-47da-544c-9e1e-0e004e3d7d68/scratchpad/shots/legacy-390.png' });
    await p.close();
  }
  console.log('errors:', errs.length ? errs : 'none'); await b.close();
})();
