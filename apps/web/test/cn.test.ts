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
    expect(cn('shadow-raised', 'shadow-coral')).toBe('shadow-raised shadow-coral');
  });
});
