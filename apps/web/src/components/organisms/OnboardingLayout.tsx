import type { ReactNode } from 'react';
import { StepIndicator } from '../molecules';
import type { Step } from '@/lib/onboarding';

export interface OnboardingLayoutProps {
  step: Step;
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function OnboardingLayout({ step, title, subtitle, children }: OnboardingLayoutProps) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 bg-ground p-6">
      <header className="flex items-center justify-between gap-4 pt-2">
        <p className="text-lg font-semibold tracking-display text-fg">Perch</p>
        <StepIndicator current={step} />
      </header>
      <section className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-display text-fg">{title}</h1>
        <p className="text-base text-fg-muted">{subtitle}</p>
      </section>
      {children}
    </main>
  );
}
