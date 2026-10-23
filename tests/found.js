const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs=[]; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/demo/legacy/?jig', { waitUntil: 'networkidle' }); await p.waitForFunction(() => window.__jig);
  await p.click('#jig-adv-btn'); await p.click('#jig-found-btn');
  console.log('rows:', await p.evaluate(() => ({ type: document.querySelectorAll('#jf-type .frow').length, space: document.querySelectorAll('#jf-space .frow').length })));
  // rename md->body, bump 3xl to 32, remove the 2px spacing step, set 8 columns, apply
  await p.fill('#jf-type .frow:nth-of-type(2) input[data-f="token"]', 'body');
  await p.fill('#jf-type .frow:last-of-type input[data-f="px"]', '32');
  await p.click('#jf-space button[data-del="space:0"]');
  await p.fill('input[data-g="columns"]', '8');
  await p.click('#jf-apply');
  console.log('after apply:', await p.evaluate(() => ({ ramp: window.__jig.state.F.type.steps.map(s => s.token + ':' + s.px), space: window.__jig.state.F.spacingSteps.map(s => s.px), cols: window.__jig.state.F.grid.columns, els: document.querySelectorAll('.jig-el').length })));
  // use the renamed step
  await p.click('[data-jig-toggle="text"]'); await p.locator('#header h1').click(); await p.locator('.jig-tb button', { hasText: '−' }).first().click({ force: true });
  await p.click('#jf-remember');
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForFunction(() => window.__jig);
  console.log('after reload:', await p.evaluate(() => ({ src: window.__jig.state.foundationSource, ramp: window.__jig.state.F.type.steps.map(s => s.token + ':' + s.px) })));
  await p.click('#jig-found-btn'); await p.screenshot({ path: '/tmp/claude-0/-home-claude/900e9517-47da-544c-9e1e-0e004e3d7d68/scratchpad/shots/foundation-panel.png' });
  const patch = await p.evaluate(() => window.__jig.patch()); console.log(patch.slice(patch.indexOf('# proposed'), patch.indexOf('# proposed') + 420));
  console.log('errors', errs); await b.close();
})();
