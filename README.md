# Jig Studio

Drag, pinch, and adjust presentation on the live site. Copy the patch. Let your AI apply it.

Jig Studio is a single script you add to any website. Put `?jig` on the URL and the page becomes adjustable: photo crops drag, headings step up and down the type ramp, buttons cycle through the system's sizes and variants, sections step along the spacing scale, overlaid copy snaps to a nine-point anchor, and a grid overlay shows what's off. A HUD lists every change and every accessibility warning, and **Copy patch** puts a human-readable, AI-applicable patch on the clipboard.

The jig never writes to your site. It proposes. Approval is reading the patch and saying yes.

Non-designers get to fix what looks wrong without opening a design tool. Designers get a faster loop than mockup, handoff, wait, review.

## Install on your site

Paste this once, at the end of `<body>` (or in `<head>`; either works):

```html
<script>
  /* Jig Studio: does nothing until someone adds ?jig to the URL */
  (function () {
    var on = /[?&]jig(=|&|$)/.test(location.search) || location.hash === '#jig';
    try { on = on || localStorage.getItem('__jig') === '1'; } catch (e) {}
    if (!on) return;
    var s = document.createElement('script');
    s.src = '/jig.js';                                          // where you put jig.js
    s.setAttribute('data-foundation', '/tokens.json');          // optional: your design system (see below)
    document.head.appendChild(s);
  })();
</script>
```

Then add `?jig` to any URL on your site. Normal visitors never download `jig.js`; it only loads when the URL asks for it, so it's safe on production. "It's just a jig."

1. **Put `jig.js` on your site** (copy it next to your pages) and point `s.src` at it. Until the repo is public and has a versioned CDN URL, self-hosting is the way.
2. **Point it at your design system, if you have one.** `data-foundation` takes a URL; the jig works out what's there and uses it as the scales it may move along, with your names. It reads any of:
   - **W3C design tokens JSON** (`$value` / `$type`): what Figma Variables, Tokens Studio and Style Dictionary export. Aliases like `{font.size.lg}` resolve; composite typography tokens contribute their `fontSize`.
   - **A CSS file** of `:root { --vars }` (a `tokens.css`, a `theme.css`).
   - **`jig.foundation.json`**, the jig's own file (schema below).

   Font sizes become the type ramp, spacing tokens the spacing scale; grid, radius and breakpoints come along when present. Everything else in the file (colours, shadows) is ignored for now. A type change then lands in the patch as `font-size-lg → font-size-xl` with the variable name, so whoever applies it writes `var(--font-size-xl)`, not `20px`. The URL can be on another domain if that server sends CORS headers (GitHub raw and most CDNs do).

   Can't edit the script tag (a CMS manages it)? `<meta name="jig-foundation" content="https://…/tokens.json">` anywhere in `<head>` does the same. To try one without installing anything, click **design system ▾** in the jig and paste the URL (remembered for that site), or put it in the address bar: `yoursite.com/?jig&tokens=https://…/tokens.json`. One link shows anyone their site measured against your system.

   **No design system?** Drop the line. The jig reads your CSS custom properties, or measures the page and infers scales, and the patch proposes a `jig.foundation.json` you can commit.
3. **Naming things is optional too.** The jig finds cover-cropped images, all text, buttons, sections and image overlays by itself; names just make the patch read better:

```html
<img src="hero.jpg" data-jig-name="Hero image">
<h1 data-jig-name="Hero headline">…</h1>
<div class="cards" data-jig="grid" data-jig-name="Card row">…</div>   <!-- grid is opt-in -->
<aside data-jig="off">…</aside>                                       <!-- leave this alone -->
```

Prefer a plain tag? `<script src="/jig.js" data-foundation="/jig.foundation.json"></script>` also works and also stays inert without `?jig`, but every visitor downloads the script.

### On a CMS or site builder

Paste the same loader wherever your platform takes site-wide code. On hosted builders you can't upload a `.js` file of your own, so point `s.src` at the hosted copy, `https://capybutz.com/jig.js` for now (a versioned CDN link replaces it at launch), and drop the `data-foundation` line.

| Platform | Paste the loader in | `jig.js` lives | Notes |
| --- | --- | --- | --- |
| **WordPress** | A header/footer code plugin (WPCode, "Footer" box), or your child theme's footer | Your child theme folder (the Media Library refuses `.js`), or the hosted copy | `?jig` works on any page, logged in or not |
| **Shopify** | Online Store → Themes → Edit code → `layout/theme.liquid`, just before `</body>` | Upload to Assets and use `s.src = '{{ "jig.js" \| asset_url }}'` | Test on a duplicate theme first if you like |
| **Wix** | Settings → Custom Code → Add Custom Code → All pages → Body – end | Hosted copy | Needs a published site with a connected domain |
| **Squarespace** | Website Tools → Code Injection → Footer | Hosted copy | Code Injection needs Core or higher (legacy: Business or higher) |
| **Webflow** | Site Settings → Custom Code → Footer code, then publish | Hosted copy | Needs a paid site plan; runs on the published site, not in the Designer |
| **Joomla** | The template's `index.php` just before `</body>`, or a Custom module set to "prepare content: no" | The template's `js` folder | |
| **Drupal** | The theme's `html.html.twig`, or a JS-injection module like Asset Injector | The theme folder | Clear the cache after |
| **Ghost** | Settings → Code injection → Site footer | Hosted copy, or theme assets | |

Anything else with a "custom code" box (Tilda, Duda, Framer, Carrd) works the same way. The patch says which platform it came from, and [`GIVE-THIS-TO-YOUR-AI.md`](GIVE-THIS-TO-YOUR-AI.md) tells your AI how to turn it into that platform's terms: one CSS block for the right box, design-setting changes, and a page-by-page list of content edits.

The jig never changes your site. You drag, it writes a patch; **Copy patch**, hand it to your AI with [`GIVE-THIS-TO-YOUR-AI.md`](GIVE-THIS-TO-YOUR-AI.md), and the AI (or you) makes the change in your code.

## Try it without installing

[capybutz.com/bookmarklet.html](https://capybutz.com/bookmarklet.html) (or `bookmarklet.html` here) gives you a "🦆 Jig this page" button for your bookmarks bar. Click it on any page: the hosted `jig.js` is injected, the jig turns on, nothing is written to the page. Infer, drag, copy the patch, send the patch to whoever owns the site. Sites with a strict Content-Security-Policy will block the injection (the button tells you); an extension is the way past that, and it's on the list.

The bookmarklet is the zero-setup way to try the jig on your own site (copy the patch, hand it to your AI with your code), and an audit tool on anyone else's: turn on **ax** and download the report.

## Try the demo

```bash
git clone <this repo>
cd jig-studio
python3 -m http.server 8000      # any static server; file:// blocks image sampling
```

Open <http://localhost:8000/demo/>. Seven things are deliberately wrong. Then open <http://localhost:8000/demo/?jig> and fix them:

| What's wrong | Fix it with |
| --- | --- |
| David's card shows a wing and very little David | drag the duck |
| "Meet the herd" is bigger than the h1; the names look like body copy | click any text, press − / + |
| The membership CTA is tiny next to a huge secondary | click a button, step its size |
| The card row is nudged off the grid | press **auto fix**; anything a few px off a column line goes back on it |
| White copy over the palest part of the banner; contrast fails | drag the copy to a darker corner |
| Section padding is 24 / 48 / 16 | click a section, step its padding |
| A puppy's alt text is `IMG_4471.jpg` | the **ax** pill shows it pink; the patch carries the note for your AI to write real alt text |

Press **Copy patch**. Paste it to your AI along with [`GIVE-THIS-TO-YOUR-AI.md`](GIVE-THIS-TO-YOUR-AI.md).

## Try it on a site with no design system

`demo/legacy/` is the same kibbutz as Dave built it in 2016: inline styles, fourteen font sizes, paddings chosen by dice, buttons that are links with a background color. Open <http://localhost:8000/demo/legacy/?jig>. The jig finds no foundation, measures the page, and manufactures one: a type ramp, a spacing scale, button sizes and variants, a grid. Every control works against those inferred scales, and **Copy patch** appends a proposed `:root` block and `jig.foundation.json` the site could adopt, with a note on every value it collapsed.

## How the jig decides what it can edit

It looks for a source of truth in this order and stops at the first hit:

1. the URL in `data-foundation` / `<meta name="jig-foundation">`: design tokens JSON, a CSS tokens file, or `jig.foundation.json` (or an inline `#jig-foundation` script); else `jig.foundation.json` beside the page
2. CSS custom properties on `:root` named like `--space-*`, `--spacing-*`, `--text-*`, `--font-size-*`
3. Nothing to read: it measures the rendered page, clusters near values, snaps to clean scales, and labels the result `inferred`

Either way, "editable" means "has a scale to move along." The HUD says which source it's using, and inferred changes carry their px in the patch so the approver can tell them apart.

## Controls

Everything below is found automatically; `data-jig="<control>"` forces one, `data-jig="off"` excludes an element and its children.

| control | gesture | emits |
| --- | --- | --- |
| `crop` | drag to pan; click for −/+ zoom, arrow buttons, and w−/w+ to resize the image's box in grid columns; ⌘/Ctrl + wheel or pinch to zoom; arrow keys nudge (Shift = 5%). Plain `<img>` tags are upgraded to `object-fit: cover` in jig mode so they crop too | `objectPosition`, `zoom`, `objectFit`, `widthCols` |
| `type` | click any text, then − / +; or ⌘/Ctrl + wheel; **aa** fixes contrast | ramp step, e.g. `3xl → 2xl`; works on headings, body, captions, eyebrows; `contrast` carries the colour change |
| `text` | drag; it only lands on grid columns (the grid shows itself while you drag). Overlays also pick a top/center/bottom band; ⌘/Ctrl + wheel sets max-width in columns; click for the scrim picker (gradient / tint / glass) | `anchor`, `col`, `offsetCols`, `offsetY`, `maxWidthCols`, `scrim` |
| `button` | click, then − / + for size, ◐ for variant | `size`, `variant` |
| `section` | click, then − / + | `paddingY` on the spacing scale |
| `grid` | not a toggle: **auto fix** finds blocks sitting a few px off a column line and puts them back; `data-jig="grid"` opts a row into − / 0 / + by hand | `marginLeft` |

Nothing is live until you switch a jig on. The HUD's top row has five press-state toggles, **images · type · buttons · spacing · ax** (type covers the ramp, placement to the grid, and scrims; **ax** is on by default and paints everything that fails protection pink, with a chip saying why; the notes list jumps to each one); only the active kinds get outlines and respond to the mouse, so a busy page stays readable while you work on one thing. The choice is remembered per site. Protection scans everything regardless.

HUD: **grid** (or press **g**) with a column picker (2 to 16), **design system** (what the jig is measuring against and where it came from; paste a URL to load another; *edit scales* opens the foundation panel to rename or retune steps, add or remove them, set the grid, apply live, remember for this site, copy as `jig.foundation.json`; *measure this page instead* goes back to inference), **auto fix** with a strength picker (one click snaps every font-size, padding, margin, and gap on the page to the nearest step and then fixes what protection flagged: scrims escalate gradient → tint → glass until text over an image passes, short buttons step up to 44px, buttons that sit together are brought to one size (the primary's), an h2 that outgrew the h1 steps down, blocks sitting up to 16px off a column line go back on the grid, images re-centre on their subject (faces where the browser can detect them, otherwise the densest detail), and text that fails contrast on a plain background moves to the nearest passing shade of the same hue (a button that paints its own background darkens the background instead). Alt text is the one thing left as a note; nothing on the page can know what the picture is. Strength: light uses the page's own steps (its tokens, or the inferred scales) and just removes drift; it's the default on a site that has tokens; medium uses a 1.25 modular scale off the body size (8 sizes) and a 4 to 96 ladder (9 spaces); strict is four sizes and four spaces, the brutal setting; the patch lists the snaps grouped by rule so the AI changes CSS rules, not elements), **rescan** protection, a **device** button (iPhone 15 Pro, iPhone SE, Pixel 8, Galaxy S24, iPad Mini; opens the page in a true-size frame that starts from the desktop's current state (your changes and auto carry over; only placement stays per breakpoint), the button shows which device is live, and "back to desktop" or Esc closes it; changes made there land in the same patch tagged with the device), **reset all**, **Copy patch**. The HUD drags by its header, minimizes with –, and resizes from its corner. Esc deselects. Click × on any change to undo just that one.

## Protection

Every time jig mode opens, and after every change, the whole page is scanned:

- images with no `alt` attribute, or alt text that is a filename or placeholder (`alt=""` is accepted as decorative)
- contrast against the sampled background (WCAG AA; large text gets the 3:1 rule)
- tap targets under the foundation's `minTapTarget`
- skipped heading levels
- an h2 that renders larger than the h1, and any heading that doesn't read as one next to its own body copy (no larger, or barely larger and not bold)
- body copy under 14px, and paragraphs running past ~90 characters a line
- text spilling out of or clipped by its box
- button labels that wrap, tap targets too narrow, links and buttons with no accessible name
- more than one h1
- images rendered past their native pixels (soft), and a detected face the crop leaves out
- text over an image that couldn't be sampled
- no `lang` on `<html>`, no `<title>`
- form fields with no label (a placeholder isn't one)
- links inside running text told apart by colour alone (no underline and under 3:1 against the words around them)
- link text that doesn't say where it goes ("read more", "click here") and empty headings

They're listed in the HUD under **notes** and included in the patch. They never block a change; the approver decides.

## Accessibility report

Turn on the **ax** pill and the HUD shows the scan as a report: a headline count of WCAG A/AA failures, one row per rule with its WCAG reference (click a row to walk its elements), and three buttons:

- **Fix what I can**: the accessibility half of auto on its own (contrast shades, overlays, scrims and tints, link chips, tap target sizes, heading steps, small body copy), with no snapping. Press again to undo. The fixes land in the patch like any other change.
- **Download report**: one self-contained HTML file, dark on screen and clean on paper; print it to get the PDF. Header with the URL, date and viewport; a summary table by rule; findings grouped as *Accessibility failures (WCAG A/AA)*, *Best practice* and *Design quality*, each with the selector, the text it's about, the measured value against the requirement, and whether the jig can fix it; a "how this was checked" section. If you fixed things in the session, fixed findings are marked and the patch rides along at the bottom.
- **Copy markdown**: the same report for a ticket, an issue or Slack.

Findings are compared against what the page had when the jig opened, so a report after fixing reads "20 found, 18 fixed, 2 open." Long rules list their first 50 findings; the counts are always complete.

What it is and isn't: contrast is measured from rendered pixels (text over photos included), which most checkers can't do. It does not validate ARIA, keyboard order, focus visibility or screen reader output; pair it with axe DevTools and a keyboard pass. A clean report is a good sign, not a conformance claim.

## Foundation file

`jig.foundation.json` tells the jig what scales it may move along. The jig never invents a value that isn't here.

```json
{
  "name": "capybutz",
  "grid": { "columns": 12, "gutter": 24, "margin": 32, "maxWidth": 1200 },
  "breakpoints": { "phone": 390, "desktop": 1440 },
  "spacing": [4, 8, 12, 16, 24, 32, 48, 64, 96],
  "type": { "ramp": ["xs","sm","md","lg","xl","2xl","3xl"], "headings": { "h1": "3xl", "h2": "2xl", "h3": "xl" } },
  "buttons": { "sizes": ["sm","md","lg"], "variants": ["primary","secondary","ghost"], "classPrefix": "btn-" },
  "protect": { "safeInset": 24, "minContrast": 4.5, "minTapTarget": 44, "textOverImage": "warn" }
}
```

Your CSS exposes the same names: `--space-24`, `--text-xl`, `.btn-lg`, `.btn-primary`. The jig reads the file; your AI edits the CSS. The foundation can be generated from CSS custom properties, a Tailwind config, W3C design tokens, or a Figma variables export; and when a site has none of those, from the live page itself (see the handoff file, section 4).

You can also inline it: `<script type="application/json" id="jig-foundation">{…}</script>`.

## The patch

```
# jig patch · capybutz · /demo/index.html · 2026-10-21 15:44

- Hero image: crop moved to 50% 77%
- Adopt CTA: size sm → lg
- Card row: inline offset 14px → 0px (on grid)

---
[
  { "el": "[data-jig-name=\"Hero image\"]", "ctl": "crop", "bp": "desktop", "objectPosition": "50% 77%" },
  { "el": "[data-jig-name=\"Adopt CTA\"]",  "ctl": "button", "bp": "desktop", "size": "lg" },
  { "el": "[data-jig-name=\"Card row\"]",   "ctl": "grid",   "bp": "desktop", "marginLeft": 0 }
]
```

Top half for the person approving. Bottom half for the AI applying. If you want a paper trail, save patches to `jig-patches/<date>-<page>.md` in your repo; the format is already a markdown file.

## What it doesn't do (yet, or on purpose)

- **It never writes to your site.** Every change is a proposal in the patch; you, or your AI, apply it in the code. That's the design, not a gap.
- **Colour tokens are read but not yet used.** A loaded design system contributes its type ramp, spacing, grid, radius and breakpoints. Contrast fixes still move text to the nearest passing shade of the same hue rather than to a token in your palette. That's the first item on the list after 0.1.
- **Photos on CDNs that refuse CORS can't be measured.** The jig re-requests cross-origin images with CORS and most CDNs allow it; when one doesn't, text over that photo is a note ("check by eye"), never a guess. A browser extension would close this; it's on the roadmap.
- **Sites with a strict Content Security Policy block the bookmarklet.** Install the loader instead (your own script is allowed), or allow the CDN that hosts `jig.js`.
- **Automated checks are part of the picture.** The jig measures what renders on this page at this viewport. ARIA validity, keyboard order, focus visibility and screen-reader output are not checked; pair it with axe DevTools and a keyboard pass. A clean report is a good sign, not a conformance claim.
- **Inference is a reading, not a decision.** On a site with no tokens the scales are measured and clustered; review them in the foundation panel before you commit the proposal.

## Contributing

Bugs, rules and layering techniques are the contributions we want most; see [CONTRIBUTING.md](CONTRIBUTING.md) for the three rules every change is held to, how to add an accessibility rule, and how to run `npm test`. This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).

## Status

v0.1.0, the first public release; see [CHANGELOG.md](CHANGELOG.md). Works on static sites, sites with tokens as CSS custom properties or a tokens file, and sites with nothing (inferred). Tested on WordPress, Blogger and large news sites; see `tests/` for what's proven.

MIT. "Jig Studio" is this project's name; forks, please choose your own. Capybara photos in the demo are from the author's own collection.
