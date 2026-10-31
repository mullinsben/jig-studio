# Jig Studio · status · 2026-10-29

Read this first in a new session. Memory has the decisions; this has the state.

## What it is
One script (`jig.js`). `?jig` on any URL makes the page adjustable (crop, type, buttons, spacing, text placement with scrims), scans it for accessibility failures (the **ax** pill, on by default, paints them pink), fixes what it can (**auto**), and emits a patch (markdown + JSON) that a human approves and an AI applies using `GIVE-THIS-TO-YOUR-AI.md`. Works on sites with tokens, with CSS vars, or with nothing (it infers a foundation); works on sites that don't have it via the bookmarklet.

## Where things are
- Repo: `github.com/mullinsben/jig-studio` (private). Folder: `~/Documents/Claude/Projects/Fun with AI/jig-studio`. Ben pushes from his terminal; Claude writes files and hands over the commands.
- Live: `benjaminmullins.tv/lab/jig-studio` is the write-up (`site/lab/jig-studio.html`, noindex while private). `benjaminmullins.tv/lab/capybutz/` is the demo (`site/lab/capybutz/`), `/legacy/` is Dave's 2016 site, `bookmarklet.html` and the hosted `jig.js` live beside it. Site git root is `site/`. Cloudflare Pages deploys on push.
- `jig.js` is copied into both repos by hand. Edit the jig-studio copy, then sync to `site/lab/capybutz/jig.js`.
- Tests: `tests/` (see its README). Three local servers: 8765 (this repo), 8766 (site checkout), 8777 (a foreign page).

## The demo (Capybutz)
A kibbutz of thirty-one capybaras around a hot spring in the Olympics, members only, six-month wait, run by a duck named David who identifies as a capybara. Written in the herd's first person, with contractions. Seven sins stay broken on purpose: David's card cropped to one wing, h2 bigger than h1, four member names set like body copy, tiny primary CTA next to a huge secondary, card row 14px off grid, banner copy over the pale part of a photo, a puppy with `alt="IMG_4471.jpg"`. Reginald's herd photo is slightly off (zoom 1.3, hat clipped), not numbered. Don't fix the sins; Ben decided against it ("too nice"). Membership buttons mailto Ben with subject "Capybutz membership application".

## HUD
Pills: images · type · buttons · spacing · ax (ax on by default; first visit shows a one-card welcome). grid, device (button + menu, "back to desktop"), advanced drawer (columns, auto + strength light/medium/strict, foundation panel, rescan, reset). Changes and notes lists fold shut with count badges. Copy patch.

## Scan rules (all paint pink, ride in the patch as notes)
contrast (pixel-sampled, worst 10% patch, scrims/blur modelled, large-text 3:1) · tap target height and width · alt missing or filename · heading order, >1 h1, h2 > h1, heading not reading as one next to its body copy · body copy < 14px · measure > ~90 cpl · text overflow/clipped · button label wraps · link/button with no accessible name · image upscaled past native px ("soft") · detected face outside crop · busy background under text.

## Auto (one toggle)
Snaps font-size/padding/margin/gap to a scale (light = the page's own steps; default on tokened sites) and then fixes: scrims escalate until text over images passes; short/narrow buttons step up; button groups share a size; headings step to read as headings; small body copy steps up; long measures get capped; rows nudged off the edge their siblings share go back in line (neighbour consensus, not invented grid lines); plain-background contrast failures move to the nearest passing shade of the same hue (the one colour change the jig makes; also the **aa** button on every text toolbar); crops re-centre only when the subject is out of frame. Alt text is the one note it never fixes. Auto-off restores everything.

## Device frames
While a frame is open it owns the view: grid, pink chips and the notes list all switch to the device; the desktop's come back on close. Frames start from the desktop's current state (desktop changes replay silently; auto reruns at the same strength; text placement stays per breakpoint). Frame owns the grid while open. One jig per frame (there used to be two).

## Open list
1. QA passes on real sites via the bookmarklet (GeekWire, MusicRadar) with this build; the inference path changed a lot today.
2. One end-to-end patch round trip through a fresh AI session against the Capybutz source.
3. **AX report view** (agreed, next build): when only ax is on, the panel shows notes grouped by rule with WCAG refs and counts, a headline number, click-to-walk; "Fix what I can" (auto's AX half, no snapping); "Copy report" (markdown). Then rule batches: focus visible, unlabeled inputs, vague link text, html lang, colour-only links, target spacing, 200% zoom, reduced motion. Stays one tool; the ax pill is the entry.
4. Parked: elements colliding after a move; phone-specific checks (horizontal overflow created in a frame); sitemap crawler for inference; extension past CSP; "see it fixed" /after/ page.
5. Going public: README from a clean clone, CHANGELOG, v0.1.0 tag, repo public, drop noindex on both lab URLs, sitemap, OG card. Make the write-up real once the tool settles.

## Ben's standing rules for this project
No em-dashes (semicolons). Contractions in copy. Headless sweep before handing back. Edit in place, tell him to refresh. Keep the demo broken. Always update memory when assumptions change.

## Oct 22 2026, evening session (Opus)

Done and pushed:
- First scan no longer hangs on lazy images (desktop and device frames); "…" badge while scanning; settle rescans capped.
- Auto: batched rendering (no freezes on huge pages), "working…" label; type snaps that make a row wrap are undone; small text only rounds up; type ties round up.
- AX: tap targets default to WCAG 2.2 AA (24px; a foundation can ask for 44); duplicate image links fixed with aria-hidden + tabindex -1; logo/hidden h1 gets one h1-role note instead of shrinking every headline; tint fallback for text over images (45/60/75%, "unverified" when the image can't be sampled); icons, side images and solid backgrounds no longer count as text-over-image; measure cap goes on the block when text is inline.
- Grid: measured from content (gap pairs, sqrt-weighted, ≥2 gaps per candidate, 3 exact gaps counts as measured, repeated structure wins near-ties, simplest grid after that); extent from full-width rows; types: column, modular (equal-size modules on a row rhythm), hierarchical (regions ranked by size), assumed; off-grid sections outlined; __jig.gridDebug readout; tests/realfit.js replays live-captured gaps (GeekWire 12/30, Ars 3/20).
- Buttons: variant switch makes a true twin (colour incl. contrast fix, weight, border); one colour one fix across text and background.
- Patch: identical changes grouped; selectors prefer sibling-unique classes; snap groups carry text hints; one type scale when auto snapped (medium/strict); auto section says what it skipped; jig adopts a site's own .scrim-panel instead of wrapping it.
- GIVE-THIS-TO-YOUR-AI.md: a11y ctl, tint/maxWidth/minHeight/whiteSpace fields, 24px bar, quantize hints.
- Round trips: two fresh incognito AIs applied Dave's legacy patch. Round 2 had nothing to reconcile; 32 notes → 4 (2 expected + 2 misses caused by sibling-count selectors, since fixed).
- Bookmarklet is "🦆 Jig this page".

Sweep notes: GOV.UK and Stripe block injection (CSP) → browser extension matters. Stale tests to fix: scr.js, scrimc.js (predate second banner and scrim panels).

Next: optional round 3 round trip; AX report as a "copy as report" mode on the copy button; section grids for hierarchical pages; extension.

## Oct 23 2026 (Opus)

Context: capybutz.com is live on its own (Cloudflare Worker, repo mullinsben/capybutz.com, own GA property G-LTJ20HD0VD); the .tv copy is gone and /lab/capybutz/* 301s to capybutz.com. The primary use case is installing the jig on your own site; the bookmarklet is the demo, zero-setup use on your own site, and an audit tool on anyone else's (the jig never writes to a site either way).

Positioning (Ben's draft reasons to believe): 1) 80% to 100% faster; 2) an AX tool you can use on any website to audit and publish findings; 3) fixes design and tech debt by inferring tokens for non-token sites (wording to massage).

Done:
- **AX report.** The ax pill opens a panel: headline WCAG A/AA count, rule rows with WCAG refs (click to walk), **Fix what I can** (auto's AX half, no snapping, undoable, folds into auto), **Download report** (single-file styled HTML; print stylesheet = the PDF), **Copy markdown**. Rules are tagged wcag / best practice / design; only wcag counts in the headline. Findings compare against the page as it opened (baseline freezes at the first change), so reports read "found / fixed / open". Lists cap at 50 per rule; counts are complete. Selectors and snippets are only computed for what a report lists.
- Real phones hide the device menu (it was meant to already, but `all: revert` beat the `.devwrap` rule; landscape phones also slipped past the width check).
- **Undo bugs fixed (these predate today):** type reset wiped a site's own inline font-size (the demo h3s' `var(--text-md)`), so auto-off left headings changed; auto-off now undoes fixes before snaps, and both in reverse order (an element snapped then fixed came back at the snapped size); undo keeps `!important` priority. Capybutz 8 → 1 → 8 and Dave 32 → 2 → 32 with styles byte-identical after Fix-what-I-can undo.
- Perf: on a 3,000-failure page, scan went from 6.2s to 0.45s (the baseline had been computing every selector on every scan).
- **AX rules batch 1:** page `lang` (3.1.1), page `<title>` (2.4.2), unlabeled form fields (1.3.1/4.1.2), colour-only links in running text (1.4.1, under 3:1 vs surrounding text with no underline/border/weight/style cue), vague link text and empty headings (best practice). Page-level findings don't paint pink. Dave's 2016 site now also notes its missing `lang` (true, and period-appropriate). Fixture: `tests/rules1.html`, checked by `tests/rules1.js`.
- Tests: `tests/axreport.js` (panel, fix/undo, fix→auto→off, download, markdown, print PDF, 390px report). Tests that pointed at the old .tv checkout (8766/lab/capybutz) now use the repo demo on 8765. `roundtrip.js`/`roundtrip2.js` need the AI round-trip files (index-ai*.html) that lived on the old .tv copy; they're gone, so those two can't run until we keep round-trip output in the repo.

Open:
1. Install path: a tiny inline loader that only fetches jig.js when `?jig` is present (today every visitor downloads ~200KB of inert script); then a clean install test from the README; then open capybutz.com/?jig on a phone. README should lead with install.
2. Hosting jig.js for other people's installs: capybutz.com/jig.js works today; jsDelivr from GitHub once the repo is public.
3. AX rule batch 2: focus visible (needs programmatic focus; careful on real sites: menus open, pages scroll), target spacing, 200% zoom reflow, reduced motion, autoplaying media.
4. Report v2 ideas: element screenshots, device-frame findings as their own section (today a short list), a sitemap-wide report.
5. Real-site QA of the report needs this build hosted (push capybutz.com) since the container can't reach outside sites.

## Oct 24 to 29 2026 (Fable)
Theme: stop the whack-a-mole. Rule adopted: **loading `?jig` changes nothing on the page until someone touches it.** Two checks enforce it:
- `tests/zeropixel.js`: screenshots a page twice without the jig (the page's own motion is masked), then with it (jig UI and highlight classes hidden); any other changed pixel fails, diff images land in `tests/zeropixel-out/`. Takes real URLs on a machine that can reach them. Corpus: demo, legacy, layers, builder, overlay-header, rules1, inline-img, bigpage. Catches the Oct 23 logo bug when it's put back.
- `tests/zerochange-probe.js`: the same idea at the DOM level (rects + rendering styles of every element), pasteable into any site's console or run through a browser tool. Used on GeekWire, Engadget, Choober Doobers, Three Seasons and Cliff Mass with the live build: it found the two load-time changes below.
Fixed from real-site patches (Cliff Mass, Engadget, ESD, AP News, Capybutz):
- the crop control set `overflow:hidden` on every image's parent at load (could clip badges/menus) and wrapped images in the clip box at load (an inline `<img>` at `width:100%` fell back to natural size; Cliff Mass lost 107px of page). Both now happen at the first zoom only; the wrap is pinned to the image's pre-wrap size if wrapping would change it, and waits until a drag gesture ends (a DOM move mid-gesture eats the click).
- the scrim panel hugged the words (`fit-content`) even with no scrim on; now only with a scrim (`.jig-on`).
- Fix what I can shipped unverified tints behind text over images it couldn't read (AP: 33 of them) and tried three tint strengths with a full-page rescan each (AP: 189 scans; Chrome's "unresponsive" dialog). Unreadable images now stay notes and cost no scans; fixes verify themselves by re-grading only their own element (`gradeText` / `textFails`, split out of the scan); a 3.5s budget hands control back with the button reading **Fix more**. 200 fixes on `tests/bigpage.html` take ~0.5s.
- Fix what I can is WCAG A/AA only (plus dup-link's aria-only fix); hierarchy / small text / wrapping buttons stay with auto fix. Cliff Mass had +3-step heading bumps labelled as accessibility fixes.
- the overflow rule measured off-canvas menus (Engadget: 38 "8px past its box" in a hidden nav) and padded children; it now requires the element to be on the page (`onPage`) and measures the text range itself.
- `readRootVars` took any `--text-*` variable as a type size (Engadget: `--text-body-family: 10px`, `--text-header-height: 216px`); now only length values, names not about family/weight/height/etc., and at least half the ramp must appear as rendered font sizes, else it falls back to inference.
- "serve over http to enable" wording replaced: the image is served from another domain, so the browser hides its pixels.
- click blocker listens on window (Wired swallows document-level clicks; still unconfirmed there, the pane can't open wired.com).
Open from these sessions: Wired "advanced" button (need Ben's console output); the tap-target fix on AP stepped buttons md → xl (49px), check the inferred button scale; ESD left two 2.9:1 contrasts unfixed (why?); Ben wants the jig to **load someone's design system** (tokens file) and infer from it; real-site zero-pixel runs from Ben's terminal (needs `npm i playwright sharp` in the repo).

### Oct 29, later: load a design system (Ben: "MAKE IT EASY. Point to a URL")
`data-foundation="<url>"` on the script tag (or `<meta name="jig-foundation" content="<url>">`, or advanced → foundation → "load a design system") now accepts, detected from content: W3C design tokens JSON (Figma Variables / Tokens Studio / Style Dictionary; `$value`/`value`, aliases, `{value, unit}`, composite typography → fontSize), a CSS file of `:root` vars, or `jig.foundation.json`. Font-size tokens → type ramp, spacing → spacing scale, plus grid/radius/breakpoints when present; names are kept and type/spacing patch entries carry them (`from/to` = token names, `var` = `--token`). `F.mode = 'tokens'`, `F.source`, `F.tokenCounts`; the patch header says where the tokens came from and there is no "proposed tokens" block. A failed URL falls back to the usual ladder and the HUD source line says why. Saved per site via the panel. `scalesFromVars()` is the shared picker behind the `:root` reader and the CSS-file path. Fixtures in `tests/tokens/`, test `tests/tokens.js`.
Hosting decision: installs load from jsDelivr pinned to a tag once the repo is public (`cdn.jsdelivr.net/gh/mullinsben/jig-studio@v0.1.1/jig.js`); capybutz.com/jig.js is the interim host only.
HUD cleanup (Oct 29, late): **design system ▾** sits on the main row (grid · device · design system · advanced) and opens an inline panel: what's loaded (name + source), one URL field + Load, *edit scales* (the foundation panel), *measure this page instead*. `?jig&tokens=<url>` (or `&foundation=`) loads a system on arrival and wins over the saved one. The welcome card is two lines, plus "No design system found… paste its URL" when inferring. Advanced is columns / auto fix / rescan / reset; the mono source line is hidden (still filled for tests). The foundation panel is edit-only (no load field, no re-infer). Phone hides the panel like the rest of the tools.

## Oct 29 2026, evening: launch hygiene (feature freeze for v0.1)
Ben: the tool is "very solid as-is"; freeze features, move to launch. Governance: MIT + light contributor model; Ben reviews PRs; CI gates them.
- `npm test` → `tests/run.js`: starts the servers itself (`tests/serve.js`: repo on 8765, `tests/foreign/` on 8777 with CORS and `/jig.js` mapped to the repo build), runs the suite, judges each script by exit code plus must-print / must-not-print lines, prints a table, exits non-zero on failure. `package.json` added (devDependencies playwright, sharp).
- Tests folder tidied: the suite scripts and fixtures at the top level; `tests/foreign/` (captures of real sites with no jig) now in the repo; 49 scratch scripts and the screenshots in `tests/dev/` (unmaintained, not run; shots gitignored). `tests/README.md` rewritten.
- `CONTRIBUTING.md` (the three rules: nothing changes at load; never guess, say so; nudge within the system; plus how to add an AX rule, house style, PR expectations), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `CHANGELOG.md` (0.1.0 + what's next), README: "What it doesn't do" + Contributing + Status, name note for forks.
- `.github/`: `workflows/test.yml` (npm ci, playwright chromium, npm test, uploads zero-pixel diffs on failure), issue templates (bug, rule), PR template. The bridge can't write `.github`, so these went to Ben as a zip to drop in.
Left before flipping public: Ben adds `.github/`, pushes; clean install by a stranger from the README; builder-platform QA (Squarespace / Wix / Shopify); tag v0.1.0; move the install URL to jsDelivr; restore the lab card; write-up.
