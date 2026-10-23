# Jig Studio

Drag, pinch, and adjust presentation on the live site. Copy the patch. Let your AI apply it.

Jig Studio is a single script you add to any website. Put `?jig` on the URL and the page becomes adjustable: photo crops drag, headings step up and down the type ramp, buttons cycle through the system's sizes and variants, sections step along the spacing scale, overlaid copy snaps to a nine-point anchor, and a grid overlay shows what's off. A HUD lists every change and every accessibility warning, and **Copy patch** puts a human-readable, AI-applicable patch on the clipboard.

The jig never writes to your site. It proposes. Approval is reading the patch and saying yes.

Non-designers get to fix what looks wrong without opening a design tool. Designers get a faster loop than mockup, handoff, wait, review.

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
| The card row is nudged off the grid | press **auto**; anything a few px off a column line goes back on it |
| White copy over the palest part of the banner; contrast fails | drag the copy to a darker corner |
| Section padding is 24 / 48 / 16 | click a section, step its padding |
| A puppy's alt text is `IMG_4471.jpg` | the **ax** pill shows it pink; the patch carries the note for your AI to write real alt text |

Press **Copy patch**. Paste it to your AI along with [`GIVE-THIS-TO-YOUR-AI.md`](GIVE-THIS-TO-YOUR-AI.md).

## Try it on a site with no design system

`demo/legacy/` is the same kibbutz as Dave built it in 2016: inline styles, fourteen font sizes, paddings chosen by dice, buttons that are links with a background color. Open <http://localhost:8000/demo/legacy/?jig>. The jig finds no foundation, measures the page, and manufactures one: a type ramp, a spacing scale, button sizes and variants, a grid. Every control works against those inferred scales, and **Copy patch** appends a proposed `:root` block and `jig.foundation.json` the site could adopt, with a note on every value it collapsed.

## How the jig decides what it can edit

It looks for a source of truth in this order and stops at the first hit:

1. `jig.foundation.json` (or an inline `#jig-foundation` script)
2. CSS custom properties on `:root` named like `--space-*`, `--spacing-*`, `--text-*`, `--font-size-*`
3. Nothing to read: it measures the rendered page, clusters near values, snaps to clean scales, and labels the result `inferred`

Either way, "editable" means "has a scale to move along." The HUD says which source it's using, and inferred changes carry their px in the patch so the approver can tell them apart.

## Use it on a site you don't own

`bookmarklet.html` gives you a "🦆 Jig this page" button for your bookmarks bar. Click it on any page: the hosted `jig.js` is injected, the jig turns on, nothing is written to the page. Infer, drag, copy the patch, send the patch to whoever owns the site. Sites with a strict Content-Security-Policy will block the injection (the button tells you); an extension is the way past that, and it's on the list.

## Install on your site

1. Copy `jig.js`. A `jig.foundation.json` is optional: without one the jig reads your CSS variables or infers scales from the page, and the patch proposes a foundation file you can commit.
2. Optionally name things. The jig finds cover-cropped images, all text, buttons, sections, and image overlays by itself; names just make the patch read better:

```html
<img src="hero.jpg" data-jig-name="Hero image">
<h1 data-jig-name="Hero headline">…</h1>
<div class="cards" data-jig="grid" data-jig-name="Card row">…</div>   <!-- grid is opt-in -->
<aside data-jig="off">…</aside>                                       <!-- leave this alone -->
```

3. Load the script once, at the end of `<body>`:

```html
<script src="/jig.js" data-foundation="/jig.foundation.json"></script>
```

It is inert without `?jig` in the URL, so it is fine on production. "It's just a jig."

## Controls

Everything below is found automatically; `data-jig="<control>"` forces one, `data-jig="off"` excludes an element and its children.

| control | gesture | emits |
| --- | --- | --- |
| `crop` | drag to pan; click for −/+ zoom, arrow buttons, and w−/w+ to resize the image's box in grid columns; ⌘/Ctrl + wheel or pinch to zoom; arrow keys nudge (Shift = 5%). Plain `<img>` tags are upgraded to `object-fit: cover` in jig mode so they crop too | `objectPosition`, `zoom`, `objectFit`, `widthCols` |
| `type` | click any text, then − / +; or ⌘/Ctrl + wheel; **aa** fixes contrast | ramp step, e.g. `3xl → 2xl`; works on headings, body, captions, eyebrows; `contrast` carries the colour change |
| `text` | drag; it only lands on grid columns (the grid shows itself while you drag). Overlays also pick a top/center/bottom band; ⌘/Ctrl + wheel sets max-width in columns; click for the scrim picker (gradient / tint / glass) | `anchor`, `col`, `offsetCols`, `offsetY`, `maxWidthCols`, `scrim` |
| `button` | click, then − / + for size, ◐ for variant | `size`, `variant` |
| `section` | click, then − / + | `paddingY` on the spacing scale |
| `grid` | not a toggle: **auto** finds blocks sitting a few px off a column line and puts them back; `data-jig="grid"` opts a row into − / 0 / + by hand | `marginLeft` |

Nothing is live until you switch a jig on. The HUD's top row has five press-state toggles, **images · type · buttons · spacing · ax** (type covers the ramp, placement to the grid, and scrims; **ax** is on by default and paints everything that fails protection pink, with a chip saying why; the notes list jumps to each one); only the active kinds get outlines and respond to the mouse, so a busy page stays readable while you work on one thing. The choice is remembered per site. Protection scans everything regardless.

HUD: **grid** (or press **g**) with a column picker (2 to 16), **foundation** (inspect and edit the scales the jig is using: rename or retune steps, add or remove them, set the grid; apply live, remember for this site, copy as `jig.foundation.json`, or re-infer), **auto** with a strength picker (one click snaps every font-size, padding, margin, and gap on the page to the nearest step and then fixes what protection flagged: scrims escalate gradient → tint → glass until text over an image passes, short buttons step up to 44px, buttons that sit together are brought to one size (the primary's), an h2 that outgrew the h1 steps down, blocks sitting up to 16px off a column line go back on the grid, images re-centre on their subject (faces where the browser can detect them, otherwise the densest detail), and text that fails contrast on a plain background moves to the nearest passing shade of the same hue (a button that paints its own background darkens the background instead). Alt text is the one thing left as a note; nothing on the page can know what the picture is. Strength: light uses the page's own steps (its tokens, or the inferred scales) and just removes drift; it's the default on a site that has tokens; medium uses a 1.25 modular scale off the body size (8 sizes) and a 4 to 96 ladder (9 spaces); strict is four sizes and four spaces, the brutal setting; the patch lists the snaps grouped by rule so the AI changes CSS rules, not elements), **rescan** protection, a **device** button (iPhone 15 Pro, iPhone SE, Pixel 8, Galaxy S24, iPad Mini; opens the page in a true-size frame that starts from the desktop's current state (your changes and auto carry over; only placement stays per breakpoint), the button shows which device is live, and "back to desktop" or Esc closes it; changes made there land in the same patch tagged with the device), **reset all**, **Copy patch**. The HUD drags by its header, minimizes with –, and resizes from its corner. Esc deselects. Click × on any change to undo just that one.

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

They're listed in the HUD under **notes** and included in the patch. They never block a change; the approver decides.

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

## Status

v0. Works on static sites and anything that exposes tokens as CSS custom properties. Not yet: color, new components, layout changes, a visual approval UI. Those are on purpose; the jig stays small.

MIT. Capybara photos in the demo are from the author's own collection.
