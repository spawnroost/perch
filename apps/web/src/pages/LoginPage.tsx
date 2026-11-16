import { Link } from 'react-router';
import { AuthLayout, LoginForm } from '@/components/organisms';

export function LoginPage() {
  return (
    <AuthLayout
      title="Sign in"
      subtitle="Pick up where you left off."
      footer={
        <>
          New to Perch?{' '}
          <Link to="/signup" className="text-fg underline underline-offset-4">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthLayout>
  );
}
