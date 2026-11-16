import { z } from 'zod';

export function formatError(e: unknown): string {
  if (e instanceof z.ZodError) {
    return e.issues.map((i) => [i.path.join('.'), i.message].filter(Boolean).join(': ')).join('; ');
  }
  return e instanceof Error ? e.message : String(e);
}
