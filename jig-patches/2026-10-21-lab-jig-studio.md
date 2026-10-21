# jig patch · capy-co · /lab/jig-studio/ · 2026-10-21 23:06

- Hero image: crop moved to 50% 62.8%
- Adopt CTA: size sm → md
- Herd photo: Marigold: crop moved to 50% 100%
- Meet the herd section: padding 24 → 32
- Meet the herd link: size lg → md
- Habitat banner copy: moved: anchor top-left
- Plan a visit CTA: size md → lg

---
[
  { "el": "[data-jig-name=\"Hero image\"]", "ctl": "crop", "bp": "desktop", "objectPosition": "50% 62.8%" },
  { "el": "[data-jig-name=\"Adopt CTA\"]", "ctl": "button", "bp": "desktop", "size": "md" },
  { "el": "[data-jig-name=\"Herd photo: Marigold\"]", "ctl": "crop", "bp": "desktop", "objectPosition": "50% 100%" },
  { "el": "#herd", "ctl": "spacing", "bp": "desktop", "paddingY": 32 },
  { "el": "[data-jig-name=\"Meet the herd link\"]", "ctl": "button", "bp": "desktop", "size": "md" },
  { "el": "[data-jig-name=\"Habitat banner copy\"]", "ctl": "text", "bp": "desktop", "anchor": "top-left" },
  { "el": "[data-jig-name=\"Plan a visit CTA\"]", "ctl": "button", "bp": "desktop", "size": "lg" }
]

Applied 2026-10-21 to demo/index.html (and the site copy at benjaminmullins.tv/lab/jig-studio/).
