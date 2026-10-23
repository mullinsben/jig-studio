const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [w,h,q] of [[1440,900,''],[390,844,''],[1440,900,'?jig'],[390,844,'?jig']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    p.on('pageerror', e => errs.push(w+q+': '+e.message)); p.on('console', m => { if (m.type()==='error') errs.push('console '+w+q+': '+m.text()); });
    await p.goto('http://localhost:8765/demo/'+q, { waitUntil: 'networkidle' });
    const r = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, hint: getComputedStyle(document.querySelector('.jig-hint')).display, jig: !!window.__jig, bp: window.__jig && window.__jig.state.bp, warn: window.__jig && window.__jig.state.warnings.length }));
    console.log(w, q||'(plain)', r);
    await p.screenshot({ path: `/tmp/claude-0/-home-claude/900e9517-47da-544c-9e1e-0e004e3d7d68/scratchpad/shots/site-${w}${q?'-jig':''}.png`, fullPage: w===390 });
    await p.close();
  }
  console.log('errors:', errs.length ? errs : 'none'); await b.close();
})();
