import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/cn';

describe('cn', () => {
  it('resolves conflicting custom shadow tokens', () => {
    expect(cn('shadow-raised', 'shadow-none')).toBe('shadow-none');
    expect(cn('shadow-raised', 'shadow-overlay')).toBe('shadow-overlay');
  });

  it('resolves conflicting custom duration tokens', () => {
    expect(cn('duration-fast', 'duration-base')).toBe('duration-base');
  });

  it('resolves conflicting custom tracking tokens', () => {
    expect(cn('tracking-tight', 'tracking-display')).toBe('tracking-display');
  });

  it('keeps custom colour and shadow utilities together', () => {
    expect(cn('text-fg', 'text-fg-muted')).toBe('text-fg-muted');
    expect(cn('text-sm', 'text-fg')).toBe('text-sm text-fg');
    expect(cn('shadow-raised', 'shadow-accent')).toBe('shadow-raised shadow-accent');
  });

  it('keeps the new display sizes, faces and accent colours apart from their neighbours', () => {
    expect(cn('text-display-md', 'text-display-lg')).toBe('text-display-lg');
    expect(cn('text-display-lg', 'text-accent')).toBe('text-display-lg text-accent');
    expect(cn('font-display', 'font-semibold')).toBe('font-display font-semibold');
    expect(cn('shadow-card', 'shadow-glow')).toBe('shadow-glow');
    expect(cn('bg-accent', 'bg-accent-soft')).toBe('bg-accent-soft');
    expect(cn('duration-base', 'duration-hero')).toBe('duration-hero');
  });
});
