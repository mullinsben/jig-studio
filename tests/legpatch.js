const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://localhost:8765/demo/legacy/?jig'); await p.waitForTimeout(1500);
  await p.click('#jig-adv-btn'); await p.click('#jig-norm-btn'); await p.waitForTimeout(3000);
  const patch = await p.evaluate(() => window.__jig.patch());
  const json = JSON.parse(patch.split('\n---\n')[1].split('\n# ')[0]);
  const sels = json.flatMap(j => j.el ? [j.el] : (j.els || [])).slice(0, 18);
  console.log(sels.map(s => s + '  ⇒ ' + 0).join('\n'));
  console.log('unique?', await p.evaluate(ss => ss.map(s => { try { return document.querySelectorAll(s).length; } catch (e) { return 'bad'; } }), sels));
  console.log(patch.split('\n')[0], '|', patch.match(/# auto · [^\n]*/)[0]);
  await b.close();
})();
