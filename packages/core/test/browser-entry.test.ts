import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const FORBIDDEN = /^(postgres|node:|@perch\/db$|drizzle-orm\/(postgres-js|pg-core))/;
// Static imports/exports only; `import type` is erased and `import('x')` is not scanned.
const SPEC_RE =
  /(?:^|\n)\s*(?:import|export)\s+(?!type\b)[^'"]*?from\s+['"]([^'"]+)['"]|(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;

function specifiers(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(SPEC_RE)].map((m) => (m[1] ?? m[2])!);
}

function walk(entry: string, seen = new Map<string, string[]>()): string[] {
  const bad: string[] = [];
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.set(file, []);
    for (const spec of specifiers(file)) {
      if (FORBIDDEN.test(spec)) bad.push(`${file.replace(SRC, 'src')} -> ${spec}`);
      else if (spec.startsWith('.')) {
        const ts = resolve(dirname(file), spec.replace(/\.js$/, '.ts'));
        if (existsSync(ts)) stack.push(ts);
      }
    }
  }
  return bad;
}

describe('@perch/core/browser', () => {
  it('has no static import chain to postgres, node:* or the db package root', () => {
    expect(walk(resolve(SRC, 'browser.ts'))).toEqual([]);
  });
});
