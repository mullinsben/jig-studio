// Phone check-and-nudge: slim bar by default, tap/swipe opens a findings sheet, no desktop tools, page still scrolls, no jig pinch.
const { chromium, devices } = require('playwright');
(async () => { const b = await chromium.launch(); const c = await b.newContext({ ...devices['iPhone 15 Pro Max'] }); const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/demo/legacy/?jig'); await p.waitForFunction(() => window.__jig && document.querySelector('#jig-wn-n').textContent !== '…'); await p.waitForTimeout(800);
  const st = () => p.evaluate(() => { const h = document.querySelector('#jig-hud'); const r = h.getBoundingClientRect(); const vis = s => { const e = h.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; }; return { bp: __jig.state.bp, coarse: matchMedia('(hover: none) and (pointer: coarse)').matches, collapsed: h.classList.contains('jig-collapsed'), heightPct: Math.round(r.height / innerHeight * 100), bottom: Math.round(innerHeight - r.bottom), count: h.querySelector('#jig-ph-n').textContent, pills: vis('.jigs'), list: vis('.list'), tools: vis('.tools'), footer: vis('footer'), hint: vis('.hint') }; });
  console.log('start  ', await st());
  await p.tap('#jig-hud header b'); await p.waitForTimeout(200); console.log('tap    ', await st());
  // swipe down on the header closes
  const hb = await p.locator('#jig-hud header').boundingBox();
  await p.evaluate(({ x, y }) => { const h = document.querySelector('#jig-hud header'); const ev = (t, yy) => h.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: x, clientY: yy, pointerId: 7, pointerType: 'touch' })); ev('pointerdown', y); ev('pointermove', y + 40); ev('pointerup', y + 60); }, { x: hb.x + 100, y: hb.y + 10 });
  await p.waitForTimeout(150); console.log('swipe↓ ', await st());
  await p.evaluate(({ x, y }) => { const h = document.querySelector('#jig-hud header'); const ev = (t, yy) => h.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: x, clientY: yy, pointerId: 8, pointerType: 'touch' })); ev('pointerdown', y); ev('pointermove', y - 40); ev('pointerup', y - 60); }, { x: hb.x + 100, y: hb.y + 10 });
  await p.waitForTimeout(150); console.log('swipe↑ ', await st());
  // page still scrolls with the sheet open
  const y0 = await p.evaluate(() => scrollY); await p.evaluate(() => window.scrollBy(0, 400)); console.log('page scrolls', (await p.evaluate(() => scrollY)) > y0);
  await p.screenshot({ path: '/tmp/claude-0/qa/phone-open.png' });
  await p.tap('#jig-hud header b'); await p.waitForTimeout(150); await p.screenshot({ path: '/tmp/claude-0/qa/phone-closed.png' });
  if (errs.length) console.log('ERR', errs); await b.close(); })();
