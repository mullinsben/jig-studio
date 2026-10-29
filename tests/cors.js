// Cross-origin photos: with a CDN that allows CORS the jig must measure text over them; without it, they stay honest notes.
// Run with tests/cors-server.py on 8777 (CORS) and again with `python3 -m http.server 8777` from /tmp/foreign (no CORS).
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://localhost:8765/tests/bigpage.html?jig'); await p.waitForSelector('#jig-hud'); await p.waitForTimeout(4500);
  const r = await p.evaluate(() => { const W = window.__jig.state.warnings; const by = {}; W.forEach(w => by[w.kind] = (by[w.kind] || 0) + 1); return by; });
  const cors = await p.evaluate(async () => { try { const i = new Image(); i.crossOrigin = 'anonymous'; await new Promise((res, rej) => { i.onload = res; i.onerror = rej; i.src = 'http://localhost:8777/far.jpg?probe'; }); return true; } catch (e) { return false; } });
  console.log(cors ? 'CDN allows CORS:' : 'CDN refuses CORS:', JSON.stringify(r));
  const unread = r['text-over-image'] || 0;
  if (cors && unread) console.log('FAIL: pictures were readable but', unread, 'stayed unmeasured');
  if (!cors && unread !== 80) console.log('FAIL: expected 80 unmeasured notes, got', unread);
  await b.close();
})();
