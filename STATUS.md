# Jig Studio · status · 2026-10-22 (end of day)

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
Snaps font-size/padding/margin/gap to a scale (light = the page's own steps; default on tokened sites) and then fixes: scrims escalate until text over images passes; short/narrow buttons step up; button groups share a size; headings step to read as headings; small body copy steps up; long measures get capped; off-grid rows go back on; plain-background contrast failures move to the nearest passing shade of the same hue (the one colour change the jig makes; also the **aa** button on every text toolbar); crops re-centre only when the subject is out of frame. Alt text is the one note it never fixes. Auto-off restores everything.

## Device frames
Start from the desktop's current state (desktop changes replay silently; auto reruns at the same strength; text placement stays per breakpoint). Frame owns the grid while open. One jig per frame (there used to be two).

## Open list
1. QA passes on real sites via the bookmarklet (GeekWire, MusicRadar) with this build; the inference path changed a lot today.
2. One end-to-end patch round trip through a fresh AI session against the Capybutz source.
3. **AX report view** (agreed, next build): when only ax is on, the panel shows notes grouped by rule with WCAG refs and counts, a headline number, click-to-walk; "Fix what I can" (auto's AX half, no snapping); "Copy report" (markdown). Then rule batches: focus visible, unlabeled inputs, vague link text, html lang, colour-only links, target spacing, 200% zoom, reduced motion. Stays one tool; the ax pill is the entry.
4. Parked: elements colliding after a move; phone-specific checks (horizontal overflow created in a frame); sitemap crawler for inference; extension past CSP; "see it fixed" /after/ page.
5. Going public: README from a clean clone, CHANGELOG, v0.1.0 tag, repo public, drop noindex on both lab URLs, sitemap, OG card. Make the write-up real once the tool settles.

## Ben's standing rules for this project
No em-dashes (semicolons). Contractions in copy. Headless sweep before handing back. Edit in place, tell him to refresh. Keep the demo broken. Always update memory when assumptions change.
