const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const [url, vw] of [['http://localhost:8765/demo/?jig', 1440], ['http://localhost:8765/demo/?jig', 390], ['http://localhost:8765/demo/legacy/?jig', 1440], ['http://localhost:8765/demo/legacy/?jig', 390]]) {
    const p = await b.newPage({ viewport: { width: vw, height: 900 } });
    await p.goto(url); await p.waitForTimeout(1500);
    console.log(url, vw, await p.evaluate(() => window.__jig.state.warnings.map(w => w.kind + ' | ' + (w.el.id || w.el.className || w.el.tagName) + ' | ' + w.msg)));
    await p.close();
  }
  await b.close();
})();
