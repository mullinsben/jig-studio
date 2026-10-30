const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://localhost:8765/demo/legacy/?jig'); await p.waitForTimeout(1500);
  console.log(await p.evaluate(() => { const t = document.querySelector('.tagline'); const c = getComputedStyle(t); return { color: c.color, fs: c.fontSize, style: c.fontStyle, warned: window.__jig.state.warnings.filter(w => w.el === t).map(w => w.msg), kids: Array.from(t.childNodes).map(n => n.nodeType) }; }));
  await b.close();
})();
