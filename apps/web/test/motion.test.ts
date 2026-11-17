import { describe, expect, it } from 'vitest';
import { SPRINGS, TILT_MAX_DEG, resolveSpring, tiltFromPointer } from '@/lib/motion';

const RECT = { left: 100, top: 200, width: 200, height: 300 };

describe('resolveSpring', () => {
  it('returns the named spring when motion is allowed', () => {
    expect(resolveSpring('expand', false)).toEqual({ type: 'spring', ...SPRINGS.expand });
  });

  it('collapses to an instant tween under reduced motion', () => {
    expect(resolveSpring('expand', true)).toEqual({ type: 'tween', duration: 0 });
    expect(resolveSpring('snap', true)).toEqual({ type: 'tween', duration: 0 });
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
