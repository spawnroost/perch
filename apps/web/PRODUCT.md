# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Players who own games across several platforms and devices (gaming PC/laptop, Steam Deck, PS5,
Xbox, Switch). Their job: decide what to play next, and know it will actually run on the device in
front of them. The builder is user #1 (GTX 1660 Ti laptop, Steam Deck, PS5). Public multi-user app.

## Product Purpose

Perch recommends games from your own taste (what you played last and longest, plus feedback),
filtered to games that exist on your devices and that your hardware can run. Success: the first
picks feel obviously right, each with a believable one-line reason, and nothing shown fails to run.

## Positioning

Taste built from real playtime and recency, combined with a per-device will-it-run check
(green / runs-on-low / hidden for PC, Deck Verified/Playable) and a one-line reason per pick
("because you put 40 h into Hades"). Store recommenders don't know your other platforms or hardware.

## Operating Context

- Onboarding: add games (search + quick hours, or list import) → add devices (presets, or PC with
  GPU/CPU/RAM; browser hints from WebGL renderer and deviceMemory) → first picks.
- Screens: For you, per-device feeds, Library, Devices, Game detail (why, will-it-run per device,
  Deck badge, HowLongToBeat), Session mode ("40 min, 55% battery, on Deck").
- Feedback: thumbs up / down, played it, not interested; retunes the profile.

## Capabilities and Constraints

- Stack: React 19 + Vite web app in a pnpm monorepo; Hono API with session auth; logic in packages/core.
- Metadata from IGDB; PC requirements from Steam; Deck compatibility from Steam; HLTB optional.
- Launch free-only: manual library + import, tag-based reasons, up to 2 devices, will-it-run + Deck,
  feedback. Pro later: platform sync, LLM reasons, session mode, unlimited devices, taste API.
- Undecided: Pro pricing; Xbox/PSN sync timing.
- Movies are out of scope (a taste profile API serves cinedeck later).

## Brand Commitments

- Name: Perch. Domain: perch.spawnroost.com.
- Look: a console launcher. Full-bleed hero of the top pick's key art, shelves of tall box-art cards,
  per-game accent colour, device fit as HUD chips, a bold display face for titles, dark base.
  Gamy and alive, but an original look: never copy a real console's UI, layout, icons or sounds.
  Replaces the earlier Raycast-style list look (rejected 2026-11-17 as bland).
- Motion is part of the product (tilt, glow, spring expand from card to detail) and always respects
  prefers-reduced-motion.

## Evidence on Hand

- Real data: the builder's own library and devices. No testimonials, users, press, or benchmarks
  exist; do not fabricate any.
- Game cover art comes from IGDB.

## Product Principles

1. Never recommend what you can't play: device and hardware fit are part of every pick.
2. Every pick explains itself in one line.
3. Your own playtime is the signal; few questions, quick input.
4. Fast to scan, fast to act: keyboard-first (arrows move across shelves, Enter opens).

## Accessibility & Inclusion

WCAG 2.2 AA. Full keyboard operation. Will-it-run status never conveyed by colour alone (label + icon).
