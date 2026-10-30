# Tests

Headless Playwright (Chromium), no framework. `npm test` runs the must-pass suite; the GitHub Action runs the same on every PR.

```bash
npm install                      # playwright + sharp
npx playwright install chromium  # once
npm test                         # everything in tests/run.js, ~10 minutes
node tests/run.js zeropixel      # a subset: scripts whose names start with the arguments
node tests/serve.js              # just the servers, to open fixtures in a browser
```

## What runs

`run.js` lists the suite, with one line per script on what it guards and the lines it must print. In short:

| script | guards |
| --- | --- |
| `zeropixel.js` | loading `?jig` changes no pixel until someone touches something; screenshots with/without the jig, red diffs in `zeropixel-out/` on failure; takes real URLs too |
| `zerochange-probe.js` | the same rule at the DOM level, pasteable into any live site's console (not run by the suite; used by hand on real sites) |
| `layers.js` + `layers.html` | the 14 ways builders put text over a picture, all measured, two true failures still caught |
| `tokens.js` + `tokens/` | design systems load from a URL in every format, names survive rewire and reload, the menu, the `?tokens=` link |
| `selectors.js` + `deepcards.html` | every patch selector names exactly one element, including on repeated card markup |
| `bigpage.js` + `bigpage.html` | Fix what I can on a huge page with unreadable photos: under a second, no guesses |
| `cors.js` | cross-origin photos measured when the CDN allows CORS; honest notes when it doesn't |
| `axreport.js` | the report: fix, undo, auto, narrow viewports |
| `jigtest.js`, `legacysweep.js` | render sweeps (1920/1440/1366/1280/390) and every control on both demos |
| `cfix.js`, `newrules.js`, `tint.js`, `iconbg.js`, `builder.js`, `overlay-header.js`, `rules1.js`, `dismiss.js` | one regression each, named for the bug or rule |
| `wrap.js`, `replay.js`, `framefix.js`, `phone.js`, `benpatch.js`, `legpatch.js` | wrappers, device frames, the phone sheet, patch shape |

## Servers

`serve.js` starts two: the repo root on **8765** (demo at `/demo/`, legacy at `/demo/legacy/`, fixtures under `/tests/`) and `tests/foreign/` on **8777** with CORS headers, as a CDN would send. The foreign pages are captures of real sites that don't ship the jig; 8777 serves `/jig.js` from the repo root so they load the build under test. `--no-cors` shows the refusing-CDN case.

## Adding a test

Write a script that opens a fixture with `?jig`, reads `window.__jig.state` (or `window.__jig.patch()`), and prints what it found. Add it to `SUITE` in `run.js` with the lines it must print and must not print. Add any new fixture page to the corpus in `zeropixel.js` so loading the jig on it is proven harmless.

`dev/` holds development scratch scripts: handy, unmaintained, not run.
