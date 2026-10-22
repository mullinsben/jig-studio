const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://localhost:8765/demo/legacy/?jig'); await p.waitForTimeout(1500);
  await p.click('[data-jig-toggle="buttons"]');
  await p.locator('.button2').first().click(); await p.waitForTimeout(150);
  console.log(await p.evaluate(() => { const s = window.__jig.state.selected; return { sel: s.tagName + '.' + s.className, text: s.textContent.trim().slice(0, 30), chips: Array.from(document.querySelectorAll('.jig-tb .chip')).map(c => c.textContent), h0: s.__jigH0 }; }));
  await b.close();
})();
