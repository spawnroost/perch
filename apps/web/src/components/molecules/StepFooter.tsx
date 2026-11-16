import type { ReactNode } from 'react';
import { Button } from '../atoms';

export interface StepFooterProps {
  onBack?: () => void;
  onSkip?: () => void;
  skipLabel?: string;
  onNext: () => void;
  nextLabel: ReactNode;
  nextDisabled?: boolean;
}

export function StepFooter({
  onBack,
  onSkip,
  skipLabel = 'Skip',
  onNext,
  nextLabel,
  nextDisabled,
}: StepFooterProps) {
  return (
    <div className="flex items-center gap-2 pt-2">
      {onBack && (
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      )}
      <div className="flex-1" />
      {onSkip && (
        <Button variant="ghost" onClick={onSkip}>
          {skipLabel}
        </Button>
      )}
      <Button variant="primary" onClick={onNext} disabled={nextDisabled}>
        {nextLabel}
      </Button>
    </div>
  );
}
