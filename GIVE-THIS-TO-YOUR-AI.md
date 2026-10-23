# Jig Studio: instructions for the AI applying patches

You are receiving this file because a person uses **Jig Studio** on their website. Read it once; it tells you what a jig patch is, how to apply one, and what to do first on a site that has never been jigged.

Jig Studio is a small script (`jig.js`) that runs on the live page when `?jig` is in the URL. The person drags, pinches, and steps things on the page; the jig emits a **patch**. You apply the patch to the source. You never need to run the jig yourself.

## 1. The patch

A patch has two halves separated by `---`:

```
# jig patch · <foundation name> · <page path> · <timestamp>

- Hero image: crop moved to 50% 77%
- Meet the herd title: ramp 3xl → 2xl (-1)
- Adopt CTA: size sm → lg

⚠ 1 note (accessibility):
- p "No road in. The trees are…": contrast 3.6 over image, min 4.5

---
[
  { "el": "[data-jig-name=\"Hero image\"]", "ctl": "crop", "bp": "desktop", "objectPosition": "50% 77%" },
  { "el": "[data-jig-name=\"Meet the herd title\"]", "ctl": "type", "bp": "desktop", "from": "3xl", "to": "2xl", "step": -1 },
  { "el": "[data-jig-name=\"Adopt CTA\"]", "ctl": "button", "bp": "desktop", "size": "lg" },
  { "warn": "contrast", "el": "section#habitat p", "msg": "contrast 3.6 over image, min 4.5", "value": 3.6, "min": 4.5 }
]
```

The top half is for the human approving the change. The bottom half is for you. They say the same thing; if they ever disagree, the JSON wins.

Each JSON entry has:

| key | meaning |
| --- | --- |
| `el` | A CSS selector for the element, as the jig could best name it. Prefer `data-jig-name` or `id`; fall back to the structural selector. |
| `ctl` | Which control produced it: `crop`, `size` (an image's box width in columns), `type` (any text element; `heading` is an older alias), `text`, `button`, `spacing`, `grid`, or `foundation` (a change to the foundation itself, e.g. the grid column count). The grid can be 2 to 16 columns; the patch header's foundation tells you which. |
| `bp` | Breakpoint the person was on: `desktop` or `phone`. A change scoped to `phone` goes inside the site's phone media query, never in the base rule. |
| `warn` | Present instead of `ctl` on protection warnings. Warnings are advisory; the approver decides. Do not silently "fix" a warning unless the person asks. |

## 2. How to apply each control

The rule for all of them: **edit tokens and classes, never write pixel values.** The site has a foundation (`jig.foundation.json`) and its CSS exposes custom properties and classes that match. Use those names.

| `ctl` | fields | what to change in source |
| --- | --- | --- |
| `crop` | `objectPosition` (or `backgroundPosition`), optional `zoom` | Set `object-position` (or `background-position`) on that element in the stylesheet or inline style. If `zoom` is present, apply `transform: scale(zoom)` with `transform-origin` equal to the position, and make sure the container has `overflow: hidden`. |
| `size` | `widthCols`, `widthPx`, `box` | The image's box was resized to N grid columns. Set the width on `box` when present (the wrapper that holds only this image), else on the image; prefer a column span or percentage in the site's grid vocabulary over the px. |
| `type` (alias `heading`) | `from`, `to`, `step`, optional `contrast` | Change the element's font size to `var(--text-<to>)`. Applies to any text element: headings, paragraphs, captions, eyebrows, list items. If the element had an inline font-size override that caused the problem, remove the override instead of adding another. `contrast` is a colour fix: `{ prop, from, to, before, after, min }` where `prop` is `color` or `background-color` and `to` is the nearest shade of the same hue that passes. This is the one place the jig touches colour. Map `to` onto the site's palette: if a token is within a hair of it, use the token; if the site's token itself fails everywhere it's used, change the token; otherwise add a `-strong` / `-text` variant of the token rather than a one-off hex. |
| `text` | `anchor`, `col`, `offsetCols`, `offsetY`, `maxWidthCols`, `scrim` | Text only ever moves to the grid. For copy overlaid on an image: `anchor` is the vertical band (`top`, `center`, `bottom`) and `col` is the 1-based grid column its left edge sits on, inside the container's padding; `offsetY` is a spacing-scale nudge inward from that band's edge. Implement as `justify-content` for the band plus a `translate`/`margin-left` of `(col - 1)` column widths for the panel. For in-flow text: `offsetCols` shifts the element right by N columns and `offsetY` by a spacing token (`var(--space-N)`); `maxWidthCols` caps width at N columns. `scrim` is `gradient`, `tint`, or `glass`; see below. Two text fixes come from auto: `maxWidth` (e.g. `68ch`) caps a line that runs too long; set it on that element's rule. `scrim: tint` with a `tint` value (e.g. `rgba(10,10,12,0.6)`) is a tint behind the words themselves: apply that exact colour as the background of the text's rule (with `box-decoration-break: clone` and a little padding if it's inline); don't swap in the standard `.scrim-tint` alpha, the jig picked the lightest value that passes. |
| `a11y` | `ariaHidden`, `tabindex`, `reason` | Markup-only accessibility fix, no visual change. `reason: duplicate of the headline link` means a thumbnail link points at the same page as the headline link beside it: add `aria-hidden="true" tabindex="-1"` to the thumbnail link in the template that renders the card (one change fixes every card), or merge the two into one link. |

Scrims (content protection for text over images). Implement each as a class on the site, then apply the class; don't inline the styles:

```css
/* gradient: fades from the anchored edge; direction follows the anchor (bottom-left → "to top") */
.scrim-gradient { background: linear-gradient(to top, rgba(0,0,0,.62), rgba(0,0,0,0) 65%); }
/* tint: a flat translucent panel that hugs the text */
.scrim-tint > .scrim-panel { background: rgba(10,10,12,.48); padding: 20px 24px; border-radius: 12px; }
/* glass: tint plus blur; blur is GPU-heavy, so turn it off on small screens */
.scrim-glass > .scrim-panel { background: rgba(10,10,12,.32); backdrop-filter: blur(14px) saturate(1.2); -webkit-backdrop-filter: blur(14px) saturate(1.2); padding: 20px 24px; border-radius: 14px; border: 1px solid rgba(255,255,255,.14); }
@media (max-width: 900px) { .scrim-glass > .scrim-panel { backdrop-filter: none; -webkit-backdrop-filter: none; background: rgba(10,10,12,.55); } }
```

`tint` and `glass` need the overlay's children wrapped in a `.scrim-panel` so the panel hugs the text instead of covering the whole image; the jig does that wrap in the browser, you do it in source.
| `button` | `size`, `variant`, `height` | Swap the size class (`btn-sm` → `btn-lg`) and/or variant class using the foundation's `classPrefix`. Only the keys present changed. On an inferred site there are no classes yet: `height` plus the measured padding/font in the proposed foundation's `buttons.measured` tell you what the size means; create the classes, then apply them. Auto may also send `minHeight` / `minWidth` (a tap-target floor: add `min-height` to the button rule, keeping the label centred) and `whiteSpace: nowrap` (the label wrapped after the button grew; keep it on one line). |
| `spacing` | `paddingY` | Set the section's `padding-block` to `var(--space-<paddingY>)`. |
| `grid` | `marginLeft`, `wasOffBy` | The block sat `wasOffBy` px off a grid column line; usually auto found it. Find whatever offset was pushing it off (a stray margin, a padding on the wrong element) and remove that, rather than adding a compensating `margin-left` on top. |

Prefer the smallest correct edit. If the site has a token or class for the value, use it; if the value matches the default, delete the override; if neither is possible, say so and write the literal value with a comment.

After applying, re-run whatever the site uses to build, and tell the person which files you touched, one line per file.

## 3. Warnings

Protection warnings come from a light accessibility scan the jig runs on the whole page in jig mode:

- `alt`: an image with no `alt` attribute, or a filename/placeholder alt. Write real alt text from the image and its context; use `alt=""` only when the image is decorative
- `contrast`: text against its sampled background, WCAG AA (4.5, or 3 for large text)
- `tap-target`: interactive element shorter than the foundation's `minTapTarget` (24px by default, WCAG 2.2 AA; a foundation may ask for 44, the AAA / Apple guideline)
- `heading-order`: a heading level is skipped (h2 → h4)
- `hierarchy`: an h2 renders larger than the page's h1, or a heading renders no larger (or barely larger and not bold) than the body copy beside it
- `small-text`: body copy under 14px
- `measure`: a paragraph running past ~90 characters a line; cap its width (the jig proposes `maxWidthCols`)
- `overflow`: text spilling out of, or clipped by, its box
- `button-wrap`: a button label wrapping to two lines
- `no-name`: a link or button with no text, alt, or aria-label
- `soft`: an image rendered larger than its native pixels; serve a larger asset or shrink the box
- `face`: a detected face outside the crop
- `text-over-image`: text on an image whose pixels couldn't be sampled (usually `file://`)

Surface them to the person with the patch. Offer a fix for each; apply only what they approve.

## 4. First visit to a site with no foundation

Good news first: the jig already did the measuring. When a patch ends with a `# proposed tokens` section, it contains a `:root` block and a `jig.foundation.json` inferred from the rendered page (or read from the site's own CSS variables), with comments on every value that was collapsed. Review that proposal with the person, adjust names or steps they disagree with, then commit both files. Changes in such a patch carry `"inferred": true` and a `px` value; apply the px now, and switch to the token once the foundation is committed.

If you're setting a site up by hand instead:

If the site has no `jig.foundation.json`, the jig runs on a built-in default and labels itself `inferred`. The person may ask you to set the site up. Do this:

1. **Find the design system.** Look for CSS custom properties on `:root` (`--space-*`, `--text-*`, `--radius-*`), a Tailwind config, a W3C design tokens JSON, or a Figma variables export. That is the source of truth.
2. **Generate `jig.foundation.json`** from it. Match the schema in the README: `grid`, `breakpoints`, `spacing`, `type.ramp`, `type.headings`, `buttons`, `protect`. Reuse the system's own names.
3. **If there is no system**, sample the site: collect every font-size, padding, margin, gap, and radius in use; cluster near-duplicates (14/15/16 → 16); snap to a clean scale; name them `--space-N` and `--text-<step>`; emit a `:root` block plus the foundation file; list what you collapsed so the person can review. This is a design-debt audit as much as a setup step; say so.
4. **Name the targets.** The jig finds images, text, buttons, sections, and overlays on its own. Add `data-jig-name` to the ones the person will talk about most so patches read well ("Hero image" beats `section:nth-of-type(1) > div > img`). Use `data-jig="off"` on anything that must stay untouchable, and `data-jig="grid"` on a row that should sit on the columns.
5. **Load the script** once, at the end of `<body>`: `<script src="/jig.js" data-foundation="/jig.foundation.json"></script>`. It does nothing unless `?jig` is in the URL, so it is safe on production.
6. **Report connection issues.** Tell the person about anything that will stop the jig working: images served cross-origin without CORS (contrast can't be sampled), headings without tokens, buttons that don't follow a class convention, a CSS-in-JS setup where tokens don't surface as custom properties.

## 5. Auto

A patch may carry `# ax fixes` instead: the person pressed **Fix what I can**, which is the accessibility half of auto with no snapping. Treat it exactly like `# auto fixes` below. A patch may carry `# auto fixes` and `# auto` sections. `# auto fixes` lists what the jig fixed with its own controls (a scrim, a button size step, a ramp step, a block moved back onto a column line, an image crop re-centred on its subject); each also appears under changes with its values, so apply them like any other change. `# auto` means the person pressed **auto fix** and the jig snapped every font-size, padding, margin, and gap on the page to the nearest step of a scale. The header names the strength (light = the page's own steps, medium = a canonical modular scale, strict = four sizes and four spaces) and lists the exact type and spacing steps used; treat those steps as the tokens to define. The JSON entries look like `{ "op": "quantize", "prop": "font-size", "from": 13, "to": 12, "count": 10, "els": [...] }`. Apply these as **rule changes, not inline styles**: elements in one group almost always share a CSS rule; find that rule and change the value once. Where the group's selectors clearly span unrelated rules, change each rule. Never paste 94 inline styles. If a snap looks wrong for a specific element (a deliberate one-off), leave it and say so.

Each `quantize` entry lists `els` (selectors) and `hints` (what each element says, in the same order). Apply every element in the group: if a selector is hard to resolve against the source, find the element by its hint. A group usually maps to one rule; where an element sets the value inline (a `style=""` attribute), change it there too, or nothing changes on the page.

## 6. Sites on a CMS or builder

If the patch has a `platform:` line, or you can tell from the site, there may be no source code to edit. Don't hand the person a diff they have no file to put it in. Split the patch into three kinds of change and put each where that platform keeps it:

1. **Looks** (crops, sizes, spacing, scrims, tints, contrast shades, tap targets, max-widths, grid offsets): one block of CSS.
2. **Tokens** (the `# proposed tokens` section, or `quantize` steps): the platform's own design settings where it has them; otherwise CSS custom properties in the same CSS block.
3. **Content** (alt text, link wording, form labels, heading levels, `lang`, the page title, duplicate links): edits made in the page or media editor, by a person, one by one.

Reply in this shape, every time:

- **Paste this CSS** into *(the exact place below)*. One block, with a comment above each rule naming the patch entry it comes from.
- **Design settings**: the token changes, written for the platform's settings screen or file (below).
- **Content to edit, page by page**: a checklist naming the page, the element (use its text so it can be found by eye, plus its #number from the AX report if there is one), and the new value. Write the real alt text and link wording; don't leave "add alt text" as a task.
- **Can't do here**: anything this platform won't allow, said plainly, with the closest workaround.

**Selectors.** Patch selectors come from the live page. On WordPress, Shopify, Webflow, Joomla, Drupal and Ghost the classes come from the theme and are stable: use them. On Wix and Squarespace, many class names are generated and change when the site is re-published: prefer ids, `data-` attributes, Squarespace block ids (`#block-…`) and section ids, and say which rules may need checking after the next publish.

**Where things go, by platform:**

| Platform | CSS goes in | Tokens go in | Content edits | Watch out for |
| --- | --- | --- | --- | --- |
| **WordPress** (block theme) | Site Editor → Styles → Additional CSS | `theme.json`: `settings.typography.fontSizes`, `settings.spacing.spacingSizes` (child theme) | Page/post editor; alt text in the Media Library and on the image block | A page builder (Elementor, Divi) may set inline sizes that beat theme CSS; target the builder's own classes |
| **WordPress** (classic theme) | Appearance → Customize → Additional CSS | `:root` custom properties in Additional CSS, or a child theme's `style.css` | Same as above | Caching plugins: tell them to clear the cache |
| **Shopify** | Online Store → Themes → Customize → Theme settings → Custom CSS (or a section's Custom CSS) | Theme settings (typography, spacing) where the theme offers them; otherwise `:root` properties in Custom CSS | Products/pages/blog in the admin; image alt text on each media item | Custom CSS fields have a size limit; for long patches use a `jig-fixes.css` asset in Edit code and include it in `theme.liquid` |
| **Wix** | Wix Studio: the site's global CSS (Code panel). Wix Editor: no site CSS; turn each look change into editor steps (select element → Design) | Site Styles / theme (text themes, colours) | In the editor; alt text in each image's settings | Generated classes; many looks must be done in the editor, not CSS |
| **Squarespace** | Website → Website Tools → Custom CSS (7.1) | Site Styles (fonts, sizes, spacing) | In the page editor; alt text in each image block's settings | Generated classes; prefer block and section ids |
| **Webflow** | Site Settings → Custom Code → Head code, inside a `<style>` tag (or better: make the change on the class in the Designer) | Variables panel (sizes, spacing) | Designer and CMS collections; alt text in each image's settings and the Assets panel | Custom code only runs on the published site, not in the Designer |
| **Joomla** | The template's `user.css` (Cassiopeia: System → Site Templates → Cassiopeia → `media/templates/site/cassiopeia/css/user.css`) | `:root` properties in `user.css` | Articles in the editor; alt text in the image fields | Overrides in other templates differ; name the template |
| **Drupal** | The theme's CSS (sub-theme), or a CSS-injection module like Asset Injector | Sub-theme CSS custom properties | Content editor; alt text on media entities | Clear the Drupal cache after CSS changes |
| **Ghost** | Settings → Code injection → Site header, inside a `<style>` tag | `:root` properties in the same block, or the theme's `--` variables | The post editor; alt text on each image card | Theme updates don't touch code injection, so it survives upgrades |
| **Anything else** with a "custom code" or "custom CSS" box (Tilda, Duda, Framer, Carrd, GoDaddy) | That box, inside `<style>` if it only takes HTML | `:root` properties in the same block | The builder's editor | Say what you couldn't map |

If a change can only be made by hand in an editor (most content edits, and looks on builders without CSS), list the steps precisely enough that a non-designer can follow them.

## 7. Things not to do

- Don't apply a patch to a different page than the one in its header.
- Don't invent values that aren't in the foundation; ask.
- Don't touch colour beyond what a `contrast` entry asks for. The jig emits colour only as a contrast fix, and only as the nearest passing shade of the same hue.
- Don't "improve" things the patch didn't mention.
