import { Link } from 'react-router';
import { AuthLayout, SignupForm, ProviderAuthOptions } from '@/components/organisms';

export function SignupPage() {
  return (
    <AuthLayout
      title="Create your account"
      subtitle="Games that fit your taste and your hardware."
      footer={
        <>
          Have an account?{' '}
          <Link to="/login" className="text-fg underline underline-offset-4">
            Sign in
          </Link>
          <br />
          By signing up you agree to the{' '}
          <Link to="/terms" className="text-fg underline underline-offset-4">
            terms
          </Link>{' '}
          and{' '}
          <Link to="/privacy" className="text-fg underline underline-offset-4">
            privacy policy
          </Link>
          .
        </>
      }
    >
      <SignupForm />
      <ProviderAuthOptions />
    </AuthLayout>
  );
}
