---
version: 1
slug: 'apps-web-src-main-tsx'
primary_target: 'apps/web/src/main.tsx'
related_targets: []
---

# Perch web app (all signed-in screens)

Scope: apps/web app shell, onboarding, For you, per-device feeds, Library, Devices, Game detail. Mode: Operate.
Job: pick what to play next on a given device, trust it runs, act in seconds (keyboard-first).

## Direction contract

THESIS: A midnight command-center for your games: every pick is a row you can read, judge and act on from the keyboard. Refuses the store-shelf grid of equal cover cards with star ratings.
OWN-WORLD: Blue-black midnight ground stepping up in three cool surfaces, hairline borders lit from the top edge, one coral accent reserved for the primary action, selection and focus. Fit states (runs / runs on low / won't run / Deck verified, playable) are their own hue family, always with label and icon. Inter UI type, tabular numerals for hours and specs, Kbd hints beside actions.
STORY: The visitor sees picks ranked for the device in front of them, reads why in one line, sees the fit row, and plays, saves or dismisses without leaving the list.
FIRST VIEWPORT: Left rail (For you, per-device feeds, Library, Devices). Top: device switcher + command field (⌘K). Main: ranked list rows: cover thumb, title, one-line reason, fit row, HLTB hours; primary coral action on the focused row only.
FORM: Raycast (pinned by user 2026-11-16; no roll). Signature move: the fit row, one compact chip per owned device, inline on every pick. Seed key: pinned-raycast.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
