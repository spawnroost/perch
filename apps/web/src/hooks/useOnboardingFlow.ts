import { useState } from 'react';
import { advance, back, canAdvance, skipDevices, type Step } from '@/lib/onboarding';
import { useDevices, useLibrary } from './queries';

export function useOnboardingFlow() {
  const [step, setStep] = useState<Step>('games');
  const games = useLibrary().data?.length ?? 0;
  const devices = useDevices().data?.length ?? 0;
  const counts = { games, devices };

  return {
    step,
    counts,
    canAdvance: canAdvance(step, counts),
    next: () => setStep((s) => advance(s, counts)),
    back: () => setStep(back),
    skipDevices: () => setStep(skipDevices),
  };
}
