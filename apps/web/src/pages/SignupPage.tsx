import { Link } from 'react-router';
import { AuthLayout, SignupForm, SteamAuthOptions } from '@/components/organisms';

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
        </>
      }
    >
      <SignupForm />
      <SteamAuthOptions />
    </AuthLayout>
  );
}
