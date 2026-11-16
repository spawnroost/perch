import { AuthLayout, ResetPasswordForm } from '@/components/organisms';

export function ResetPasswordPage() {
  return (
    <AuthLayout title="Choose a new password">
      <ResetPasswordForm />
    </AuthLayout>
  );
}
