// Zero-pixel check: loading the jig must not change the page until someone touches it.
//
// For every page, at desktop and phone width:
//   1. screenshot it twice with jig.js blocked; pixels that differ between those two are
//      the page's own motion (carousels, ads, clocks) and are ignored
//   2. load it with ?jig (the jig injected if the page doesn't ship it), wait for the scan,
//      hide the jig's own floating UI (HUD, chips, grid, badges) and screenshot again
//   3. any other pixel that changed is a failure, and a diff image is saved showing where
//
// Usage:
//   node tests/zeropixel.js                       built-in local corpus (needs the 8765 server)
//   node tests/zeropixel.js --jig path/to/jig.js  test another build
//   node tests/zeropixel.js https://site.com ...  test real sites (needs a network that reaches them)
//   node tests/zeropixel.js --list sites.txt      one URL per line
//
// Exit code 1 if any page fails, so it can gate a push.
const { chromium } = require('playwright');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let jigPath = path.join(__dirname, '..', 'jig.js');
const urls = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--jig') jigPath = args[++i];
  else if (args[i] === '--list') urls.push(...fs.readFileSync(args[++i], 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#')));
  else urls.push(args[i]);
}
const LOCAL = 'http://localhost:8765/';
if (!urls.length) urls.push(...[
  'demo/', 'demo/legacy/', 'tests/layers.html', 'tests/builder.html', 'tests/overlay-header.html', 'tests/rules1.html',
].map(u => LOCAL + u));

const JIG = fs.readFileSync(jigPath, 'utf8');
const OUT = path.join(__dirname, 'zeropixel-out');
fs.mkdirSync(OUT, { recursive: true });

// the jig's own floating UI: allowed to appear, so hidden before the screenshot
const UI = '#jig-hud, #jig-grid, .jig-badge, .jig-tb, #jig-axtags, #jig-found, #jig-device, #jig-welcome, #jig-warn';
const VIEWS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
];
const TOL = 24;          // per-channel difference that counts as changed (antialiasing stays under this)
const ALLOW = 40;        // changed pixels tolerated per page before it fails (a stray subpixel edge)

async function shot(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const buf = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
  const { data, info } = await sharp(buf).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  return { buf, data, w: info.width, h: info.height };
}
const settle = page => page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}).then(() => page.waitForTimeout(900));
const withJig = u => { const x = new URL(u); x.searchParams.set('jig', ''); return x.toString().replace('jig=', 'jig'); };

async function run(browser, url, view) {
  const ctx = await browser.newContext({ viewport: view.viewport, isMobile: !!view.isMobile, hasTouch: !!view.hasTouch, deviceScaleFactor: view.deviceScaleFactor || 1, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  // the jig never loads during the baseline; during the jig pass, every request for it gets this build
  let jigOn = false;
  await ctx.route(/\/jig\.js(\?|$)/, r => jigOn ? r.fulfill({ body: JIG, contentType: 'application/javascript' }) : r.abort());
  await ctx.addInitScript(() => { try { localStorage.removeItem('__jig'); } catch (e) {} });
  const errs = [];
  page.on('pageerror', e => jigOn && errs.push(String(e.message).slice(0, 160)));

  await page.goto(url, { waitUntil: 'load', timeout: 30000 }); await settle(page);
  const a = await shot(page);
  await page.reload({ waitUntil: 'load' }); await settle(page);
  const b = await shot(page);

  jigOn = true;
  await page.goto(withJig(url), { waitUntil: 'load', timeout: 30000 }); await settle(page);
  // a page without the loader gets the jig the way the bookmarklet does it
  if (!(await page.evaluate(() => !!window.__jig || !!window.__jigLoading))) {
    await page.addScriptTag({ content: JIG }).catch(e => errs.push('inject: ' + e.message));
  }
  await page.waitForFunction(() => !!document.getElementById('jig-hud') || !!document.querySelector('.jig-tb'), null, { timeout: 15000 }).catch(() => errs.push('jig never booted'));
  await page.waitForTimeout(2500);   // first scan, chips, protection pass
  await page.addStyleTag({ content: `${UI} { visibility: hidden !important; }` });
  // the jig's highlights live on the page's own elements (pink AX outlines, dashed jig outlines): take them off
  // by class, so anything still different is the jig changing the page itself
  await page.evaluate(() => document.querySelectorAll('.jig-ax, .jig-ax-focus, .jig-active, .jig-selected, .jig-scanning').forEach(el => el.classList.remove('jig-ax', 'jig-ax-focus', 'jig-active', 'jig-selected', 'jig-scanning')));
  await page.waitForTimeout(150);
  const c = await shot(page);
  await ctx.close();

  const slug = url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '').slice(0, 60) + '-' + view.name;
  if (c.w !== a.w || c.h !== a.h) {
    fs.writeFileSync(path.join(OUT, slug + '-before.png'), a.buf); fs.writeFileSync(path.join(OUT, slug + '-jig.png'), c.buf);
    return { slug, fail: true, why: `page size changed ${a.w}×${a.h} → ${c.w}×${c.h}`, errs };
  }
  // noise mask: anything the page changed on its own, grown by 3px to swallow edges
  const W = a.w, H = a.h, n = W * H;
  const moved = new Uint8Array(n);
  const near = (p, q, i) => Math.abs(p[i] - q[i]) <= TOL && Math.abs(p[i + 1] - q[i + 1]) <= TOL && Math.abs(p[i + 2] - q[i + 2]) <= TOL;
  for (let k = 0; k < n; k++) if (!near(a.data, b.data, k * 4)) moved[k] = 1;
  const noise = new Uint8Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (moved[y * W + x]) {
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < H && xx >= 0 && xx < W) noise[yy * W + xx] = 1; }
  }
  let changed = 0, noisy = 0, box = [W, H, 0, 0];
  const diff = Buffer.from(a.data);
  for (let k = 0; k < n; k++) {
    const i = k * 4;
    // fade the page so the red stands out
    diff[i] = 255 - (255 - diff[i]) * 0.25; diff[i + 1] = 255 - (255 - diff[i + 1]) * 0.25; diff[i + 2] = 255 - (255 - diff[i + 2]) * 0.25;
    if (noise[k]) { noisy++; continue; }
    if (!near(a.data, c.data, i)) {
      changed++; diff[i] = 230; diff[i + 1] = 0; diff[i + 2] = 60;
      const x = k % W, y = (k / W) | 0; box = [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)];
    }
  }
  const fail = changed > ALLOW;
  if (fail) {
    await sharp(diff, { raw: { width: W, height: H, channels: 4 } }).png().toFile(path.join(OUT, slug + '-diff.png'));
    fs.writeFileSync(path.join(OUT, slug + '-before.png'), a.buf); fs.writeFileSync(path.join(OUT, slug + '-jig.png'), c.buf);
  }
  return { slug, fail, changed, noisy: +(noisy / n * 100).toFixed(1), box: changed ? `x${box[0]}-${box[2]} y${box[1]}-${box[3]}` : '', errs };
}

(async () => {
  const browser = await chromium.launch();
  let bad = 0;
  for (const url of urls) for (const view of VIEWS) {
    let r;
    try { r = await run(browser, url, view); } catch (e) { r = { slug: url + ' ' + view.name, fail: true, why: 'crashed: ' + e.message.split('\n')[0] }; }
    if (r.fail) bad++;
    const tail = r.why || `${r.changed}px changed${r.box ? ' at ' + r.box : ''}${r.noisy ? `, ${r.noisy}% of the page moves on its own and was ignored` : ''}`;
    console.log(`${r.fail ? 'FAIL' : 'ok  '} ${r.slug}: ${tail}${r.errs && r.errs.length ? ' · errors: ' + r.errs.join(' | ') : ''}`);
  }
  await browser.close();
  console.log(bad ? `\n${bad} failed; diffs in tests/zeropixel-out/ (red = pixels the jig changed)` : '\nzero pixels changed everywhere');
  process.exit(bad ? 1 : 0);
})();
