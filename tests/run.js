// The must-pass suite: `npm test`. Starts the servers, runs each script, judges it by exit code plus the lines it
// has to print (and must not print), and exits non-zero if anything failed. Add a script here when it guards a
// behaviour that has broken before.
const { spawn } = require('child_process'); const path = require('path'); const { start } = require('./serve');
const SUITE = [
  // [script, must match (regexes, all), must not match (regexes, any), note]
  ['zeropixel.js', [/zero pixels changed everywhere/], [], 'loading ?jig changes no pixel until someone touches something'],
  ['tokens.js', [], [/^FAIL/m], 'design systems load from a URL: W3C tokens, Tokens Studio, CSS vars, FC; names survive reload'],
  ['layers.js', [/14\/14 cases right/], [], 'the 14 ways builders put text over a picture are all measured'],
  ['selectors.js', [], [/"notUnique":\[(?!\])/], 'every patch selector names exactly one element'],
  ['bigpage.js', [/unverified tints in patch: 0/], [], 'Fix what I can on a huge page: fast, no guesses'],
  ['cors.js', [/CDN allows CORS/], [/^FAIL/m], 'cross-origin photos are measured when the CDN allows it'],
  ['axreport.js', [/auto off \{"fixes":0,"changes":0/, /report overflow at 390: 0/], [], 'the AX report: fix, undo, auto, narrow viewports'],
  ['jigtest.js', [/errors: none/], [/OVERFLOW/], 'the render sweep and every control on the demo'],
  ['legacysweep.js', [/errors: none/], [/OVERFLOW/], 'the same sweep on the 2016 site'],
  ['cfix.js', [/errors \[\]/], [], 'auto on the legacy site, and auto-off restores everything'],
  ['builder.js', [/patchHasOverlay: true/, /auto off overlay rgba\(0, 0, 0, 0\.3\) 0/], [], 'page-builder hero: darken the existing overlay, never recolour text on a photo'],
  ['rules1.js', [/rules1\.html\?jig 8/, /mr\.html\?jig 0/, /gw3\.html\?jig 0/, /blog\.html\?jig 0/], [], 'AX rules batch 1: positives on the fixture, none on real-site captures'],
  ['tint.js', [/now passes/, /undo rgba\(0, 0, 0, 0\) \/ rgba\(0, 0, 0, 0\)/], [], 'tint behind text over a photo, verified, undone cleanly'],
  ['iconbg.js', [/notes \[\]/], [], 'an icon on a background image is not text over an image'],
  ['newrules.js', [/errors \[\]/], [], 'heading/body, small text, measure, soft'],
  ['wrap.js', [/element under paragraph point: paragraph/, /errors \[\]/], [], 'a zoomed image never paints over the text below it'],
  ['replay.js', [/errors \[\]/], [], 'a device frame inherits desktop changes'],
  ['phone.js', [/page scrolls true/], [], 'the phone sheet: slim bar, no device menu, the page still scrolls'],
  ['dismiss.js', [/pinkOnVague: true/], [], 'dismissed findings stay dismissed and are listed in the report'],
  ['overlay-header.js', [/navColour: 'rgb\(255, 255, 255\)'/, /fixes: \[\]/], [], 'white nav over a hero behind a transparent header is left alone'],
  ['framefix.js', [/errors \[\]/], [], 'one jig per frame; chips repaint'],
  ['benpatch.js', [/errors \[\]/], [], 'patch selectors and auto skips on the demo'],
  ['legpatch.js', [/# auto · medium/], [], 'the legacy patch renders'],
];
(async () => {
  const root = path.resolve(__dirname, '..');
  const servers = await Promise.all([start(root, 8765), start(path.join(__dirname, 'foreign'), 8777, { cors: true, jigRoot: root })]);
  const only = process.argv.slice(2);
  let failed = 0; const t0 = Date.now();
  for (const [script, must, mustNot, note] of SUITE) {
    if (only.length && !only.some(o => script.startsWith(o))) continue;
    const started = Date.now();
    // async, not spawnSync: the servers live in this process and have to keep answering while the test runs
    const r = await new Promise(done => {
      let out = ''; const child = spawn(process.execPath, [path.join(__dirname, script)], { env: process.env });
      child.stdout.on('data', d => out += d); child.stderr.on('data', d => out += d);
      const timer = setTimeout(() => { child.kill('SIGKILL'); out += '\n[timed out after 7 minutes]'; }, 420000);
      child.on('close', status => { clearTimeout(timer); done({ status, out }); });
      child.on('error', e => { clearTimeout(timer); done({ status: -1, out: out + '\n' + e.message }); });
    });
    const out = r.out;
    const missing = must.filter(re => !re.test(out)); const bad = mustNot.filter(re => re.test(out));
    const ok = r.status === 0 && !missing.length && !bad.length;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${script.padEnd(20)} ${((Date.now() - started) / 1000).toFixed(1).padStart(6)}s  ${note}`);
    if (!ok) {
      if (r.status !== 0) console.log(`       exit ${r.status}`);
      missing.forEach(re => console.log(`       expected to see ${re}`)); bad.forEach(re => console.log(`       must not see ${re}`));
      console.log(out.trim().split('\n').slice(-12).map(l => '       | ' + l.slice(0, 160)).join('\n'));
    }
  }
  servers.forEach(s => s.close());
  console.log(`\n${failed ? failed + ' failed' : 'all passed'} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  process.exit(failed ? 1 : 0);
})();
