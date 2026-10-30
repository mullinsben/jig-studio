# Contributing to Jig Studio

Thanks for being here. Jig Studio is one file (`jig.js`) that measures a website against its design system, lets a person fix what's off by hand or automatically, and hands the result to an AI as a patch. It's small on purpose and we'd like to keep it that way.

## The three rules

Every change is held to these. They're the product.

1. **Loading the jig changes nothing.** `?jig` on a page must not move a pixel until someone touches something. `tests/zeropixel.js` screenshots pages with and without the jig and fails on any difference outside the jig's own UI. If your change needs to wrap, reposition or restyle a page element to work, do it at the moment of interaction, not at load.
2. **Never guess; say so.** When the jig can't measure something (a photo on a CDN that refuses CORS, a background it can't see), it writes a note: "couldn't tell, check by eye." It does not apply a fix it can't verify. A confident wrong answer is worse than an honest blank.
3. **Nudge within the system, never invent.** The jig moves things along scales it was given or inferred: a type step, a spacing step, a button size. It does not produce values that aren't on a scale. If the system has no step that works, that's a note, not a fix.

A fourth, softer one: **the patch is for a human and an AI.** Every line should read as something a reviewer would write, with the value and the reason. "ramp md → lg (+1) (now larger than body copy)", not "font-size: 17px".

## What we're looking for

- **Accessibility rules.** The best first contribution. Each rule is self-contained: a registry entry, a scan, a fixture page, a line in the report. See below.
- **Real-site bugs.** The jig runs on pages nobody designed it for; the bugs are in the gap between our fixtures and the web. A bug report with a URL and the patch the jig produced is gold.
- **Text-over-image techniques we missed.** `tests/layers.html` catalogues 14 ways builders put words over pictures. If you've seen a 15th, add the case.
- **Design-token formats.** The loader reads W3C tokens, Tokens Studio, Style Dictionary and CSS variables. If your tool exports something else, open an issue with a sample file.

Things we'll say no to, kindly: a colour picker, free-form positioning, anything that writes to a site, features that only work with a backend. The scope is "measure, nudge, report, patch".

## Running the tests

```bash
npm install                      # playwright + sharp
npx playwright install chromium  # once
npm test                         # the must-pass suite, ~10 minutes
node tests/run.js tokens layers  # a subset: scripts whose names start with these
node tests/serve.js              # just the servers (8765 repo, 8777 "foreign" pages), to poke at fixtures by hand
```

`tests/run.js` lists the suite with what each script guards. Scripts under `tests/dev/` are development scratch: useful, not maintained, not run.

A pull request must pass `npm test`. The GitHub Action runs it on every PR.

## Adding an accessibility rule

Four places, all in `jig.js` unless noted:

1. **The registry** (`AX_RULES`): a key, a title, the WCAG reference and level (`A`, `AA`, `best practice`, or `design`), the category (`wcag`, `practice`, `design`), whether auto can fix it, and one plain-English sentence on how to fix it by hand. The category decides where it appears: `wcag` rules count toward the headline number and are what **Fix what I can** touches; the others are notes.
2. **The scan** (`scanNow`, or `gradeText` for anything about text and what's behind it): push `{ kind, el, msg }` for each finding. Measure the rendered page, not the CSS. Skip the jig's own UI (`JIG_UI`) and anything not on the page (`onPage`, `srOnly`).
3. **A fixture**: a small HTML page under `tests/` with at least one true positive and, more importantly, the near-misses that must *not* fire. False positives are what make auditors stop trusting a tool. Add the page to `tests/zeropixel.js`'s corpus so loading the jig on it is proven harmless.
4. **A test**: a script that opens the fixture with `?jig`, reads `window.__jig.state.warnings`, and asserts counts by kind. Add it to `SUITE` in `tests/run.js` with the lines it must print.

If auto can fix the rule, the fix goes in `autoFixAX` and must verify itself against the element it changed (`textFails(el)`), record its change (`record(...)`) so it lands in the patch, and push an undo onto `state.autoFixes` so **undo fixes** restores the page exactly. `tests/zeropixel.js` proves the load; `tests/axreport.js` proves fix/undo round-trips.

## House style

- One file, no build step, no dependencies on the page. The jig has to work pasted into a 2008 Blogger template.
- Plain English in comments and in everything the person reads. Say the thing; no jargon where a sentence will do.
- Comments explain why, usually with the site that taught us: "an inline `<img>` at `width:100%` inside a shrink-wrapped box falls back to natural size (Cliff Mass lost 107px of page that way)".
- Every string a person sees is a sentence a careful reviewer would write. No em-dashes anywhere in copy; use a semicolon or a full stop.
- Everything the jig puts on the page carries a `jig-` prefix (classes, ids, data attributes) so a site's own CSS and ad blockers leave it alone, and so the scans can skip it.
- Measure the rendered page (`getComputedStyle`, `getBoundingClientRect`, canvas sampling), not the stylesheet. Sites lie in their CSS; they can't lie on screen.

## Pull requests

- One change per PR, with the fixture and test that prove it.
- Describe the behaviour before and after in a sentence each, and name the site or situation that motivated it.
- `npm test` green. If you had to change an expectation in `tests/run.js`, say why in the PR.
- Maintainers review for the three rules first, code second. Expect questions about what happens on a page you didn't think of; that's the whole game.

## Reporting a bug

Open an issue with the page URL (or a reduced HTML file if the page is private), what the jig did (paste the patch, or the report's markdown), and what you expected. Screenshots help; the patch helps more.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be kind, be specific, assume good faith.

## Licence and the name

The code is MIT; use it, fork it, ship it. "Jig Studio" is the name of this project; if you fork, please pick another name so people know which one they're looking at.
