import { Link } from 'react-router';
import { AuthLayout, ForgotPasswordForm } from '@/components/organisms';

export function ForgotPasswordPage() {
  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We will email you a link to choose a new one."
      footer={
        <Link to="/login" className="text-fg underline underline-offset-4">
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
