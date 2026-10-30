# Changelog

All notable changes to Jig Studio. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [semver](https://semver.org/).

## [Unreleased]

Next up, in order:
- Colour tokens: contrast fixes pick the nearest passing token (`var(--ink-900)`) instead of a computed shade, and a design note lists off-palette colours with counts and the nearest token.
- A WordPress plugin that installs the loader in one click.
- A browser extension (bundled `jig.js`, `activeTab`), so photos on CDNs that refuse CORS can be measured and strict-CSP sites can be audited.
- Sitemap-wide inference and report.

## [0.1.0] - 2026-10-29

First public release. One file, `jig.js`, with no dependencies on the page.

### The jig
- `?jig` on any URL of a site that has the loader makes the page adjustable: crop (pan, zoom, subject focus), type (ramp steps, grid placement, scrims over images), buttons (size, variant), spacing (section padding), text placement. Nothing changes at load; every change is undoable; everything lands in one patch.
- Four jigs, off by default, remembered per site: images, type, buttons, spacing. A fifth, **ax**, paints accessibility failures pink and is on by default.
- Device frames (iPhone, Pixel, Galaxy, iPad) that start from the desktop's current state; changes made in a frame are tagged with the device.
- A phone mode ("check and nudge"): a slim bar with a findings sheet; crops and type steps still work.
- The page is inert while the jig is on (Alt-click to click through), including on sites that catch clicks at the window.

### The foundation
- Loads a design system from a URL (`data-foundation` on the script tag, `<meta name="jig-foundation">`, the **design system** button, or `?jig&tokens=URL`): W3C design tokens JSON (Figma Variables, Tokens Studio, Style Dictionary), a CSS file of `:root` variables, or `jig.foundation.json`. Names are kept; the patch speaks the site's tokens.
- Falls back to the site's own `:root` custom properties, then to inference: the page is measured, clustered and snapped into a type ramp, spacing scale, button sizes and variants, and a grid, labelled as inferred and proposed in the patch as a `:root` block and foundation file.
- A foundation panel to rename, retune, add or remove steps, set the grid, apply live, remember per site, copy as JSON.

### Accessibility
- Rules: contrast measured from rendered pixels (including text over photos, graded on the worst patch, with scrims, overlays, filters, gradients, parallax and video understood; 14 layering techniques catalogued), busy backgrounds, tap targets, alt text, links and buttons with no name, page language, page title, form labels, colour-only links, vague link text, empty headings, heading order, duplicate image links, plus design notes: hierarchy, small text, long measure, clipped text, wrapping button labels, soft images, faces cropped out.
- A report: panel grouped by rule with WCAG references and numbered findings (the numbers match the chips on the page), a styled single-file HTML download with a print stylesheet, and markdown for tickets. Findings can be dismissed and stay dismissed; the report lists them.
- **Fix what I can**: WCAG A/AA failures only, fixed with the same controls a person would use; never applies a fix it can't verify; re-measures only what it changed; hands control back after a few seconds on huge pages ("Fix more").
- Cross-origin photos are re-requested with CORS so they can be measured when the CDN allows it; when it doesn't, the finding says so plainly.

### Auto fix
- One toggle, three strengths (light: the page's own steps; medium: a modular scale; strict: four of everything). Snaps font sizes, paddings, margins and gaps to the scales; fixes what protection flagged (overlay darkening first, then scrims, then tints; never tints a headline; never recolours text on a photo); brings button groups to one size; re-centres crops on their subject; puts rows back on the grid. The patch lists snaps grouped by rule so an AI changes rules, not elements.

### The patch
- Markdown for a human (what changed and why, grouped) plus JSON for an AI, with a selector that names exactly one element, the control, the breakpoint, and the values as tokens where the site has them. Names the platform (WordPress, Shopify, Squarespace, Wix, Webflow, Blogger and others) so the AI applies it the platform's way. `GIVE-THIS-TO-YOUR-AI.md` is the instruction set.

### Install
- A loader snippet that does nothing until `?jig` is in the URL (no download for normal visitors), a plain script tag, CMS notes for the main platforms, and a bookmarklet for sites that don't have it.

### Tests
- `npm test` runs the must-pass suite: a zero-pixel check (loading the jig changes nothing), a DOM-level probe that runs on live sites, the layering catalogue, selector uniqueness, a huge-page timing fixture, CORS both ways, the design-token loader across formats, and the regression scripts behind every bug fixed on a real site.

[Unreleased]: https://github.com/mullinsben/jig-studio/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/mullinsben/jig-studio/releases/tag/v0.1.0
