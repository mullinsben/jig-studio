// AX rules batch 1 (lang, title, labels, colour-only links, vague links, empty headings): positives on tests/rules1.html, no new notes on the demos. mr/gw3/blog lines need the 8777 foreign server.
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch();
 for (const u of ['http://localhost:8765/tests/rules1.html?jig', 'http://localhost:8765/demo/?jig', 'http://localhost:8765/demo/legacy/?jig', 'http://localhost:8777/mr.html?jig', 'http://localhost:8777/gw3.html?jig', 'http://localhost:8777/blog.html?jig']) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(u); await p.waitForFunction(() => window.__jig && window.__jig.report && document.querySelector('#jig-wn-n').textContent !== '…', null, { timeout: 30000 }); await p.waitForTimeout(800);
  const r = await p.evaluate(() => { const K = ['lang', 'title', 'label', 'colour-link', 'vague-link', 'empty-heading']; return __jig.state.warnings.filter(w => K.includes(w.kind)).map(w => w.kind + ' · ' + (w.el.textContent || w.el.outerHTML).trim().replace(/\s+/g, ' ').slice(0, 40) + ' · ' + w.msg.slice(0, 70)); });
  console.log('\n' + u.split('/').slice(3).join('/'), r.length, errs.length ? 'ERR ' + errs : ''); r.slice(0, 14).forEach(x => console.log('  ', x));
  await p.close(); }
 await b.close(); })();
