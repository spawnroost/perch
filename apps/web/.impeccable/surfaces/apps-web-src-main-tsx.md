---
version: 1
slug: 'apps-web-src-main-tsx'
primary_target: 'apps/web/src/main.tsx'
related_targets: []
---

# Perch web app (all signed-in screens)

Scope: apps/web app shell, onboarding, For you, per-device feeds, Library, Devices, Game detail. Mode: Experience on For you, per-device feeds and Game detail (the art leads); Operate on Library, Devices, onboarding and settings (scan and act, the chrome stays quiet).
Job: pick what to play next on a given device, trust it runs, act in seconds (keyboard-first).

## Direction contract

THESIS: A console launcher for your own library: the top pick fills the screen, the rest sit on shelves of box art, and every card already says whether it runs on the device in your hand. Refuses the Raycast-style flat list and the store grid of equal cards with star ratings.
OWN-WORLD: Dark ink-violet base (ground plus four surfaces) so key art and per-game colour carry the screen. Each game sets a runtime --accent (from its art, with a fallback) that tints the hero wash, the card glow, primary actions and focus, clamped legible on dark. Titles in Archivo Variable, heavy and slightly condensed; UI in Inter; HUD labels small, wide, uppercase. Fit states (runs / runs on low / won't run / Deck verified, playable) keep their own hue family as HUD chips, always label plus icon. Depth from offset soft shadows and a top-edge highlight; glow is tinted by the game and offset, never a flat halo.
STORY: The visitor lands on the hero (blurred key art in the game's colour, title, one-line reason, fit chips per device, Play and Save). Below, shelves of tall 3:4 cards scroll sideways; a card tilts and glows on hover or focus; opening one springs it from the card into the detail (shared layout), and closing springs it back.
FIRST VIEWPORT: Slim top bar (logo, device switcher, command field). Full-bleed hero with the top pick. First shelf peeking in at the bottom edge: cards at 3:4, accent glow on the focused one, fit chip row on each.
FORM: Console launcher (set by user 2026-11-17, replacing Raycast). Signature move: hero plus shelf plus HUD fit chips, with the spring card-to-detail expand. Motion: springs from lib/motion.ts (expand, snap, hero, tilt), CSS durations 120/200/320/640 ms, exponential ease-out; tilt max 8 degrees; reduced motion turns springs into instant changes and removes tilt, parallax and the hero crossfade.
ORIGINALITY: no real console's UI. No XMB-style waves, no tile-and-ribbon home, no console logos, glyph sets or sounds. The look comes from Perch's own tokens.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
