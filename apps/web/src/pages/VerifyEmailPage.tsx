import { AuthLayout, VerifyEmailNotice } from '@/components/organisms';

export function VerifyEmailPage() {
  return (
    <AuthLayout title="Check your email">
      <VerifyEmailNotice />
    </AuthLayout>
  );
}
