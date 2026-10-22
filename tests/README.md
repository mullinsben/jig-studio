# Headless tests (Playwright, Chromium)

These are the scripts used during development. They are not a suite yet; each one prints what it checks and `errors [...]` at the end. Zero errors and no `OVERFLOW` lines is a pass.

## Servers

Three static servers, started from the repo and the site checkout:

```bash
# this repo (demo + legacy at /demo/ and /demo/legacy/)
(cd jig-studio && python3 -m http.server 8765 &)
# the benjaminmullins.tv checkout (site/ is the git root); Capybutz lives at /lab/capybutz/
(cd Benjaminmullins.tv/site && python3 -m http.server 8766 &)
# a synthetic "foreign" page with no jig installed, for bookmarklet injection tests (make any index.html)
(cd some-foreign-page && python3 -m http.server 8777 &)
```

`npm i -g playwright && npx playwright install chromium` once; the scripts `require('playwright')` globally.

## The ones to run before handing anything back

| script | what it covers |
| --- | --- |
| `jigtest.js` | the render sweep (1920/1440/1366/1280/390, overflow check) plus every control on the demo; the baseline |
| `legacysweep.js` | the same sweep on the 2016 site |
| `notes.js` | lists every protection note on both sites at 1440 and 390; eyeball for new false positives |
| `autopatch.js` | runs auto on Capybutz and prints the human half of the patch; should read like a reviewer wrote it |
| `cfix.js` | auto on the legacy site: notes should fall to alt + soft, and auto-off must restore everything |
| `replay.js` | opens an iPhone frame after desktop changes + auto; the frame must inherit them with zero own changes |
| `framefix.js` | one jig per frame (containers: 1), chips repaint after a type step |
| `harm.js` | button groups share a size under auto; off restores sm/lg |
| `first.js` | first-open welcome card appears once, remembered jigs persist |
| `smallh.js`, `newrules.js` | provoke the heading/body, small text, measure, soft rules and let auto fix them |
| `wrap.js`, `scr.js`, `faq4.js` | Dave's-site regressions: crop box wrapping, overlay scrims on captions, inner button selection |
| `devmenu.js`, `dbl.js`, `focus.js` | device button state, frame deselect on jig-off, frame owns the grid |
| `labsweep.js` | the write-up page at five widths |

`found.js` exercises the foundation panel (advanced → foundation) on the legacy site.
