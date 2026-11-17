import { describe, expect, it } from 'vitest';
import {
  SPRINGS,
  TILT_MAX_DEG,
  coverLayoutId,
  FADE_MS,
  fadeTransition,
  heroImageMotion,
  HERO_SCALE,
  firstOfEach,
  resolveSpring,
  tiltFromPointer,
} from '@/lib/motion';

const RECT = { left: 100, top: 200, width: 200, height: 300 };

describe('resolveSpring', () => {
  it('returns the named spring when motion is allowed', () => {
    expect(resolveSpring('expand', false)).toEqual({ type: 'spring', ...SPRINGS.expand });
  });

  it('collapses to an instant tween under reduced motion', () => {
    expect(resolveSpring('expand', true)).toEqual({ type: 'tween', duration: 0 });
    expect(resolveSpring('snap', true)).toEqual({ type: 'tween', duration: 0 });
  });

  it('returns the same object on every call', () => {
    expect(resolveSpring('hero', false)).toBe(resolveSpring('hero', false));
    expect(resolveSpring('hero', true)).toBe(resolveSpring('snap', true));
  });

  it('keeps every spring critically sane (positive, damped)', () => {
    for (const s of Object.values(SPRINGS)) {
      expect(s.stiffness).toBeGreaterThan(0);
      expect(s.damping).toBeGreaterThan(0);
      expect(s.mass).toBeGreaterThan(0);
      // Damping ratio under 1 would wobble; launcher springs settle without overshoot ringing.
      expect(s.damping / (2 * Math.sqrt(s.stiffness * s.mass))).toBeGreaterThanOrEqual(0.7);
    }
  });
});

describe('tiltFromPointer', () => {
  it('is flat at the centre of the card', () => {
    expect(tiltFromPointer(200, 350, RECT, false)).toEqual({ rotateX: 0, rotateY: 0 });
  });

  it('tilts toward the pointer at the edges, capped at the maximum', () => {
    const right = tiltFromPointer(300, 350, RECT, false);
    expect(right.rotateY).toBeCloseTo(TILT_MAX_DEG);
    expect(right.rotateX).toBeCloseTo(0);
    const top = tiltFromPointer(200, 200, RECT, false);
    expect(top.rotateX).toBeCloseTo(TILT_MAX_DEG);
  });

  it('clamps a pointer outside the card', () => {
    expect(tiltFromPointer(9999, 350, RECT, false).rotateY).toBeCloseTo(TILT_MAX_DEG);
    expect(tiltFromPointer(-9999, 350, RECT, false).rotateY).toBeCloseTo(-TILT_MAX_DEG);
  });

  it('returns no tilt for reduced motion or an empty rect', () => {
    expect(tiltFromPointer(300, 200, RECT, true)).toEqual({ rotateX: 0, rotateY: 0 });
    expect(tiltFromPointer(1, 1, { left: 0, top: 0, width: 0, height: 0 }, false)).toEqual({
      rotateX: 0,
      rotateY: 0,
    });
  });
});

describe('coverLayoutId', () => {
  it('is stable per game and unset when reduced', () => {
    expect(coverLayoutId(42, false)).toBe('cover-42');
    expect(coverLayoutId(42, true)).toBeUndefined();
  });

  it('is unset when suppressed (history back lands without a flight)', () => {
    expect(coverLayoutId(42, false, true)).toBeUndefined();
    expect(coverLayoutId(42, false, false)).toBe('cover-42');
  });
});

describe('fadeTransition', () => {
  it('is an opacity-friendly tween in seconds, shorter under reduced motion', () => {
    expect(fadeTransition(false)).toEqual({ type: 'tween', duration: FADE_MS.base / 1000 });
    expect(fadeTransition(true)).toEqual({ type: 'tween', duration: FADE_MS.reduced / 1000 });
    expect(fadeTransition(false, FADE_MS.cards).duration).toBeCloseTo(0.15);
  });

  it('returns shared objects', () => {
    expect(fadeTransition(false)).toBe(fadeTransition(false));
    expect(fadeTransition(true)).toBe(fadeTransition(true));
  });
});

describe('heroImageMotion', () => {
  it('fades and settles the scale with a tween when motion is allowed', () => {
    const m = heroImageMotion(false);
    expect(m.initial.opacity).toBe(0);
    expect(m.initial.scale).toBeGreaterThan(HERO_SCALE);
    expect(m.animate).toEqual({ opacity: 1, scale: HERO_SCALE });
    expect(m.exit).toEqual({ opacity: 0 });
    expect(m.transition.type).toBe('tween');
  });

  it('is opacity only under reduced motion (scale held constant, no transform animation)', () => {
    const m = heroImageMotion(true);
    expect(m.initial.scale).toBe(HERO_SCALE);
    expect(m.animate.scale).toBe(HERO_SCALE);
    expect(m.transition.duration).toBeCloseTo(FADE_MS.reduced / 1000);
  });
});

describe('firstOfEach', () => {
  it('keeps the first item per id so shared-element ids stay unique', () => {
    const items = [
      { id: 1, tag: 'pc' },
      { id: 2, tag: 'pc' },
      { id: 1, tag: 'ps5' },
    ];
    expect(firstOfEach(items, (i) => i.id)).toEqual(new Set([items[0], items[1]]));
  });
});
