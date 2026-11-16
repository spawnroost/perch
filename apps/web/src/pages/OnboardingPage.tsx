import { useNavigate } from 'react-router';
import { DevicesStep, GamesStep, OnboardingLayout, PicksStep } from '@/components/organisms';
import { StepFooter } from '@/components/molecules';
import { useOnboardingFlow } from '@/hooks/useOnboardingFlow';

export function OnboardingPage() {
  const navigate = useNavigate();
  const flow = useOnboardingFlow();

  if (flow.step === 'games') {
    return (
      <OnboardingLayout
        step="games"
        title="What have you played?"
        subtitle="Add a few games you know well. Your own playtime is the signal."
      >
        <GamesStep />
        <StepFooter onNext={flow.next} nextLabel="Continue" nextDisabled={!flow.canAdvance} />
      </OnboardingLayout>
    );
  }

  if (flow.step === 'devices') {
    return (
      <OnboardingLayout
        step="devices"
        title="Where do you play?"
        subtitle="Perch only picks games your devices can run."
      >
        <DevicesStep />
        <StepFooter
          onBack={flow.back}
          onSkip={flow.skipDevices}
          skipLabel="Skip for now"
          onNext={flow.next}
          nextLabel="Continue"
          nextDisabled={!flow.canAdvance}
        />
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout
      step="picks"
      title="Your first picks"
      subtitle="Ranked from your library, checked against each device."
    >
      <PicksStep />
      <StepFooter onBack={flow.back} onNext={() => void navigate('/')} nextLabel="Finish" />
    </OnboardingLayout>
  );
}
