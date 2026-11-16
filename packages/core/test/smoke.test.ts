import { expect, test } from 'vitest';
import { PROJECT_NAME } from '../src/index.js';

test('core is wired up', () => {
  expect(PROJECT_NAME).toBe('perch');
});
