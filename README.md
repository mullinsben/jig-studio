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

Open <http://localhost:8000/demo/>. Six things are deliberately wrong. Then open <http://localhost:8000/demo/?jig> and fix them:

| What's wrong | Fix it with |
| --- | --- |
| The hero capybara has no head | drag the hero image |
| "Meet the herd" is bigger than the h1; the names look like body copy | click a heading, press − / + |
| The primary CTA is tiny next to a huge secondary | click a button, step its size |
| The card row is nudged off the grid | press **g** for the grid, click the row, press **0** |
| White copy over the palest part of the banner; contrast fails | drag the copy to a darker corner |
| Section padding is 24 / 48 / 16 | click a section, step its padding |

Press **Copy patch**. Paste it to your AI along with [`GIVE-THIS-TO-YOUR-AI.md`](GIVE-THIS-TO-YOUR-AI.md).

## Install on your site

1. Copy `jig.js` and write a `jig.foundation.json` (or let your AI generate one from your design system; the handoff file explains how).
2. Mark the things you want adjustable:

```html
<img src="hero.jpg" data-jig="crop" data-jig-name="Hero image">
<h1 data-jig="heading" data-jig-name="Hero headline">…</h1>
<a class="btn btn-primary btn-md" data-jig="button" data-jig-name="Signup CTA">…</a>
<section data-jig="section" data-jig-name="Pricing">…</section>
<div class="overlay-copy" data-jig="text" data-jig-name="Banner copy">…</div>
<div class="cards" data-jig="grid" data-jig-name="Card row">…</div>
```

3. Load the script once, at the end of `<body>`:

```html
<script src="/jig.js" data-foundation="/jig.foundation.json"></script>
```

It is inert without `?jig` in the URL, so it is fine on production. "It's just a jig."

## Controls

| `data-jig` | gesture | emits |
| --- | --- | --- |
| `crop` | drag to pan; ⌘/Ctrl + wheel (trackpad pinch) to zoom | `objectPosition`, `zoom` |
| `heading` | click, then − / +; or ⌘/Ctrl + wheel | ramp step, e.g. `3xl → 2xl` |
| `text` | drag to a nine-point anchor (overlays) or along columns (in flow); ⌘/Ctrl + wheel sets max-width in columns | `anchor`, `offsetCols`, `offsetY`, `maxWidthCols` |
| `button` | click, then − / + for size, ◐ for variant | `size`, `variant` |
| `section` | click, then − / + | `paddingY` on the spacing scale |
| `grid` | click, then − / 0 / + | `marginLeft` |

HUD: **grid** (or press **g**), **rescan** protection, **phone preview** (opens the page at the phone breakpoint; changes made there are tagged `bp: phone`), **reset all**, **Copy patch**. Esc deselects. Click × on any change to undo just that one.

## Protection

Every time jig mode opens, and after every change, the whole page is scanned:

- contrast against the sampled background (WCAG AA; large text gets the 3:1 rule)
- tap targets under the foundation's `minTapTarget`
- skipped heading levels
- an h2 that renders larger than the h1
- text over an image that couldn't be sampled

Warnings are listed in the HUD and included in the patch. They never block a change; the approver decides.

## Foundation file

`jig.foundation.json` tells the jig what scales it may move along. The jig never invents a value that isn't here.

```json
{
  "name": "capy-co",
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
# jig patch · capy-co · /demo/index.html · 2026-10-21 15:44

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
