const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2] || '/tmp/claude-0/-home-claude/900e9517-47da-544c-9e1e-0e004e3d7d68/scratchpad/shots';
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const errs = [];
  // 1. render sweep (no jig)
  for (const [w, h] of [[1920, 1080], [1440, 900], [1366, 768], [1280, 800]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    page.on('pageerror', e => errs.push(`${w}: ${e.message}`));
    await page.goto('http://localhost:8765/demo/index.html', { waitUntil: 'networkidle' });
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    console.log(`${w}x${h}: scrollWidth=${sw}${sw > w ? '  <-- OVERFLOW' : ''}`);
    await page.screenshot({ path: `${OUT}/plain-${w}.png` });
    await page.close();
  }
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await phone.goto('http://localhost:8765/demo/index.html', { waitUntil: 'networkidle' });
  const psw = await phone.evaluate(() => document.documentElement.scrollWidth);
  console.log(`390: scrollWidth=${psw}${psw > 390 ? '  <-- OVERFLOW' : ''}`);
  await phone.screenshot({ path: `${OUT}/plain-390.png`, fullPage: true });
  await phone.close();

  // 2. jig mode
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => errs.push('jig: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto('http://localhost:8765/demo/index.html?jig', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__jig);
  await page.evaluate(() => document.querySelectorAll('[data-jig-toggle]').forEach(b => { if (!b.classList.contains('on')) b.click(); }));
  const info = await page.evaluate(() => ({
    els: document.querySelectorAll('.jig-el').length,
    foundation: window.__jig.state.F.name, src: window.__jig.state.foundationSource,
    warnings: window.__jig.state.warnings.map(w => w.msg)
  }));
  console.log('jig:', JSON.stringify(info, null, 1));
  await page.screenshot({ path: `${OUT}/jig-initial.png` });

  // exercise controls
  // crop: drag hero image down
  const img = page.locator('[data-jig-name="Hero image"]');
  const b = await img.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 160, { steps: 8 }); await page.mouse.up();
  // heading: click title, press −
  await page.locator('[data-jig-name="Meet the herd title"]').click();
  await page.locator('.jig-tb button', { hasText: '−' }).click();
  // button: click Membership CTA, press + twice
  await page.locator('[data-jig-name="Membership CTA"]').click();
  await page.locator('.jig-tb button', { hasText: '+' }).first().click();
  await page.locator('.jig-tb button', { hasText: '+' }).first().click();
  // section spacing
  await page.locator('[data-jig-name="Meet the herd section"]').click({ position: { x: 10, y: 5 } });
  await page.locator('.jig-tb button', { hasText: '+' }).first().click();
  // grid nudge to 0
  await page.locator('[data-jig-name="Card row"]').scrollIntoViewIfNeeded();
  const cr = await page.locator('[data-jig-name="Card row"]').boundingBox();
  await page.mouse.click(cr.x + cr.width * 0.25 + 1, cr.y + 10); // in the gutter between card 1 and 2
  await page.locator('.jig-tb button', { hasText: '0' }).click();
  // text anchor: drag banner copy to bottom-left
  const txt = page.locator('[data-jig-name="Habitat banner copy"]');
  await txt.scrollIntoViewIfNeeded();
  const tb = await txt.boundingBox();
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await page.mouse.down(); await page.mouse.move(tb.x + 40, tb.y + tb.height - 20, { steps: 6 }); await page.mouse.up();
  await page.evaluate(() => window.__jig.scan());
  await page.evaluate(() => document.getElementById('jig-grid-btn').click());
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/jig-after.png` });
  const patch = await page.evaluate(() => window.__jig.patch());
  console.log('\n----- PATCH -----\n' + patch);
  console.log('\nerrors:', errs.length ? errs : 'none');
  await browser.close();
})();
