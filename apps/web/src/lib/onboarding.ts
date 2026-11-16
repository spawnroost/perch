/** Onboarding step logic. Counts come from server data (library, devices), not local state. */

export const STEPS = ['games', 'devices', 'picks'] as const;
export type Step = (typeof STEPS)[number];

export interface Counts {
  games: number;
  devices: number;
}

export const stepIndex = (step: Step): number => STEPS.indexOf(step);

export function canAdvance(step: Step, counts: Counts): boolean {
  if (step === 'games') return counts.games > 0;
  if (step === 'devices') return counts.devices > 0;
  return false;
}

export function advance(step: Step, counts: Counts): Step {
  if (!canAdvance(step, counts)) return step;
  return STEPS[stepIndex(step) + 1] ?? step;
}

export function back(step: Step): Step {
  return STEPS[Math.max(0, stepIndex(step) - 1)] ?? step;
}

/** Picks work without devices (no fit filtering), so the devices step can be skipped. */
export function skipDevices(step: Step): Step {
  return step === 'devices' ? 'picks' : step;
}

const MAX_HOURS = 1_000_000;

/** Quick hours input: `undefined` for blank, `null` for invalid, otherwise the number. */
export function parseHours(input: string): number | undefined | null {
  const text = input.trim().replace(',', '.');
  if (text === '') return undefined;
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const hours = Number(text);
  return hours <= MAX_HOURS ? hours : null;
}
