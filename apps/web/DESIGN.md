---
name: Perch
description: A console-launcher game recommender. Dark ink-violet base, box-art covers, a per-game accent that tints each subtree, and device fit shown as HUD chips.
colors:
  ground: 'oklch(0.13 0.018 285)'
  surface-1: 'oklch(0.17 0.02 285)'
  surface-2: 'oklch(0.21 0.022 285)'
  surface-3: 'oklch(0.26 0.024 285)'
  surface-4: 'oklch(0.31 0.026 285)'
  scrim: 'oklch(0.09 0.015 285 / 0.78)'
  line: 'oklch(1 0 0 / 0.08)'
  line-strong: 'oklch(1 0 0 / 0.16)'
  edge: 'oklch(1 0 0 / 0.1)'
  fg: 'oklch(0.97 0.005 285)'
  fg-muted: 'oklch(0.78 0.012 285)'
  fg-subtle: 'oklch(0.66 0.014 285)'
  on-accent: 'oklch(0.16 0.03 285)'
  accent-default: 'oklch(0.7 0.17 262)'
  fit-yes: 'oklch(0.8 0.15 155)'
  fit-low: 'oklch(0.84 0.14 85)'
  fit-no: 'oklch(0.72 0.17 355)'
  fit-unknown: 'oklch(0.7 0.012 285)'
  device-pc: 'oklch(0.42 0.14 262)'
  device-mac: 'oklch(0.45 0.05 285)'
  device-handheld: 'oklch(0.45 0.14 200)'
  device-console: 'oklch(0.45 0.17 330)'
typography:
  display-xl:
    {
      fontFamily: 'Archivo Variable, Inter Variable, sans-serif',
      fontSize: '5.5rem',
      fontWeight: 800,
      lineHeight: 0.92,
      letterSpacing: '-0.025em',
    }
  display-lg:
    {
      fontFamily: 'Archivo Variable, Inter Variable, sans-serif',
      fontSize: '3.75rem',
      fontWeight: 800,
      lineHeight: 0.95,
      letterSpacing: '-0.025em',
    }
  display-md:
    {
      fontFamily: 'Archivo Variable, Inter Variable, sans-serif',
      fontSize: '2.5rem',
      fontWeight: 800,
      lineHeight: 1,
      letterSpacing: '-0.025em',
    }
  display-sm:
    {
      fontFamily: 'Archivo Variable, Inter Variable, sans-serif',
      fontSize: '1.75rem',
      fontWeight: 800,
      lineHeight: 1.05,
      letterSpacing: '-0.025em',
    }
  headline:
    {
      fontFamily: 'Inter Variable, system-ui, sans-serif',
      fontSize: '1.5rem',
      fontWeight: 600,
      lineHeight: '2rem',
    }
  title:
    {
      fontFamily: 'Inter Variable, system-ui, sans-serif',
      fontSize: '1rem',
      fontWeight: 600,
      lineHeight: '1.5rem',
    }
  body:
    {
      fontFamily: 'Inter Variable, system-ui, sans-serif',
      fontSize: '0.875rem',
      fontWeight: 400,
      lineHeight: '1.375rem',
    }
  label:
    {
      fontFamily: 'Inter Variable, system-ui, sans-serif',
      fontSize: '0.8125rem',
      fontWeight: 500,
      lineHeight: '1.25rem',
    }
  hud:
    {
      fontFamily: 'Archivo Variable, sans-serif',
      fontSize: '0.6875rem',
      fontWeight: 700,
      lineHeight: '1rem',
      letterSpacing: '0.08em',
    }
rounded:
  sm: '0.375rem'
  md: '0.5rem'
  lg: '0.75rem'
  xl: '1rem'
  2xl: '1.5rem'
spacing:
  unit: '0.25rem'
  gutter: '2rem'
  rail: '26rem'
components:
  button-primary:
    {
      backgroundColor: '{colors.accent-default}',
      textColor: '{colors.on-accent}',
      rounded: '{rounded.md}',
      height: '2rem',
      padding: '0 0.75rem',
    }
  button-secondary:
    {
      backgroundColor: '{colors.surface-2}',
      textColor: '{colors.fg}',
      rounded: '{rounded.md}',
      height: '2rem',
      padding: '0 0.75rem',
    }
  card: { backgroundColor: '{colors.surface-1}', rounded: '{rounded.lg}' }
  cover: { backgroundColor: '{colors.surface-2}', rounded: '{rounded.md}' }
  hud-chip: { rounded: '{rounded.sm}', height: '1.25rem', padding: '0 0.375rem' }
---

# Design System: Perch

## Overview

**Creative North Star: "The Console Launcher"**

A dark ink-violet stage where box art is the light source. A full-bleed hero of the top pick, shelves of tall 3:4 covers, and a per-game accent that recolours buttons, rings, glows and selection inside whatever subtree sets it. Titles are heavy, slightly condensed Archivo; everything else is dense Inter at a 14px base. Gamy and alive, but original: no real console's UI, icons or sounds.

**Key Characteristics:**

- Dark only (`color-scheme: dark`); depth comes from five tonal steps plus a top-edge highlight, not borders alone.
- Colour is carried by the game (runtime `--accent`) and by fit states; chrome stays neutral.
- Motion is part of the product (tilt, glow, card-to-detail expand) and always degrades under reduced motion.
- Fit status is never colour alone: chip = hue + icon + label.

## Colors

All values are in `src/styles/tokens.css` (`@theme`; Tailwind palette is reset, so only these exist).

- **Neutrals:** `ground` (page), `surface-1..4` (each step = one elevation), `scrim` (overlay backdrop). Hairlines `line`, `line-strong`, `edge` (top highlight).
- **Text:** `fg`, `fg-muted` (>=7:1), `fg-subtle` (>=4.5:1) on ground and surface-2.
- **Accent (runtime):** `--accent` is a registered `<color>` property (default `accent-default`, a blue-violet) set per subtree via `accentStyle(hex)` in `src/lib/accent.ts` (validates hex, else falls back). It intentionally varies per game; non-game pages use the default. Derived helpers on every element: `accent` (clamped to L .66-.86, chroma lifted toward .12, capped .24), `accent-hover`, `accent-press`, `accent-soft` (16%), `accent-tint` (50%), `accent-wash` (22%), plus ring/glow at 60/65%. `on-accent` is always the dark ink.
- **Fit states:** `fit-yes`, `fit-low`, `fit-no`, `fit-unknown`, each with a `-soft` 14% background (unknown: 7% white).
- **Device banners:** `device-{pc,mac,handheld,console}` with `-end` gradient stop; dark enough for light chips.

## Typography

- **UI:** Inter Variable (`font-sans`), base `text-base` 14px/22px. Ramp: `2xs` 11, `xs` 12, `sm` 13, `base` 14, `lg` 16, `xl` 20, `2xl` 24, `3xl` 32.
- **Display:** Archivo Variable (width axis 62-125%). `text-display-sm/md/lg/xl` = 28/40/60/88px, never above 6rem. Utility `font-title`: weight 800, stretch 92%, tracking `-0.025em`, balanced wrap. Used for hero and page titles.
- **HUD:** utility `font-hud`: Archivo 700, stretch 110%, uppercase, tracking `0.08em`; for chips and shelf headings.
- Mono: `font-mono` system stack (little used).

## Layout

- 4px spacing grid (`--spacing: 0.25rem`).
- `layoutKind(pathname)` in `src/lib/layout.ts`: `edge` for `/`, `/games/:id`, `/library`, `/devices` (main is `max-w-none`; sections pad with `px-gutter`); `narrow` for everything else (forms, auth, onboarding: `max-w-3xl p-6`). The nav bar is always edge (`h-12`, `px-gutter`, sticky).
- `--spacing-gutter: 2rem` is shared by nav, hero, shelves, detail and devices so left edges align. It is a single value, not responsive (mobile uses the same 2rem).
- Game detail: two columns at `lg`, `minmax(0,1fr)` plus `--container-rail` (26rem), gaps 12/8.
- Shelf cards: `w-40` (`lg:w-56`) from `lib/cardWidth.ts`; shelf scroller is horizontal, snap-proximity, with a mask edge fade (`shelf-fade`, 3rem) and `--perspective-shelf: 900px` for tilt.

## Elevation & Depth

Tonal layering plus a lit top edge. Every shadow starts with `inset 0 1px 0 var(--edge)`.

- `shadow-raised` (cards, secondary buttons, covers), `shadow-card`, `shadow-lift` (hover lift), `shadow-overlay` (sheets, menus).
- `shadow-glow` and `shadow-cover-glow` are tinted by the game's accent (hover/focus on cards; detail hero cover halo).
- Shadows are soft blurred offsets; no hard offset shadows.

## Shapes

`rounded-sm` 6 (chips, badges, link focus), `md` 8 (buttons, inputs, covers), `lg` 12 (cards), `xl` 16 (bottom sheet top), `2xl` 24. Covers are `aspect-3/4`. Hairline `border-line` on surfaces. Focus: 2px `accent-ui` outline, 2px offset.

## Components

Atoms: `Button` (primary accent fill / secondary / ghost / danger / link; sm 28, md 32px high), `Card` (surface-1, pressable variant with accent ring), `Cover` (3:4 art with gamepad placeholder), `HudChip` (fit chip yes/low/no/unknown, 20px, icon + label), `Badge` (neutral/accent/fit), `Input`, `Textarea`, `Select`, `Label`, `Kbd`, `Notice`, `SectionHeading`, `Tabs`, `Sheet` (Radix, right, bottom or `palette`: full screen on mobile, centred from sm; used by global search), `Skeleton` (shimmer).
Molecules: `GameCard` (tilting cover, meta, single chip row), `GameResultCard`, `Hero` (full-bleed blurred top-pick art, `font-title`, overlay slot), `Shelf` (titled scroller with arrow controls), `NavBar`, `FitChips`, `FitRow`, `FitDetailRow`, `PickRow`, `DeviceCard`, `DevicePresetCard`, `FeedbackActions`, `LibraryControls`, `ImportRowItem`, `FormField`, `SelectField`, `ActionForm`, `StepIndicator`, `StepFooter`, `LoadError`, `ConnectorsComingSoon`.
Organisms: `AppLayout`, `AuthLayout`, `OnboardingLayout`, `ForYou` (hero + shelves), `GameDetail`, `LibraryView`, `LibraryEntryEditor`, `DevicesView`, `DeviceAdder`, `PcDeviceForm`, `GameSearchAdd`, `ImportList`, onboarding steps (`GamesStep`, `DevicesStep`, `PicksStep`), auth forms, `AccountMenu`, `AccountSettings`.

## Motion

- Springs (`src/lib/motion.ts`, via `useLauncherSpring`): `expand` 260/30 (card to detail shared layout), `snap` 520/38 (chips, focus travel), `hero` 120/22 (hero art and accent crossfade), `tilt` 300/30. Damping ratio kept >= 0.7. Tilt max 8deg, lift 6px.
- CSS tokens: `--duration-fast/base/slow/hero` 120/200/320/640ms; `--ease-out` (expo-out), `--ease-in-out`, `--ease-spring` (linear() settle). Ambient: `mosaic-drift` 40s, `hero-drift` 36s, `shimmer` 1.6s.
- Fades: `fadeTransition` 200ms base, 150 cards-return, 120 reduced. Hero art rests at scale 1.08.
- Reduced motion (`useReduced` / `prefers-reduced-motion`): springs resolve to instant, tilt is flat, cover `layoutId` is unset (no shared-element flight), hero is opacity-only at 120ms, CSS animations/transitions collapse to 0.01ms, no parallax. Shared `layoutId` is unique per game id (`firstOfEach`).

## Do's and Don'ts

**Do**

- Use tokens through Tailwind utilities (`bg-surface-2`, `text-fg-muted`, `rounded-md`, `px-gutter`); raw values live only in `tokens.css`.
- Set `--accent` on the subtree that belongs to a game; use `accent-*` utilities so children follow.
- Pair every fit colour with an icon and a label.
- Use `font-title` for titles and `font-hud` for HUD labels only.
- Gate every transform animation behind `useReduced`.

**Don't**

- Don't add a second accent hue or hard-code a game colour in chrome.
- Don't use hard offset shadows, pure black/white surfaces, or borders as the only depth.
- Don't exceed `text-display-xl` or use display faces for body copy.
- Don't copy a real console's UI, layout, icons or sounds.
- Don't put cards in a narrow column on edge routes; edge routes align to the gutter.
