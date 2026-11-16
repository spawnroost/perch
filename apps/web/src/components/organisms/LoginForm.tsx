import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button, Notice } from '../atoms';
import { FormField } from '../molecules';
import { useAction } from '@/hooks/useAction';
import { authClient } from '@/lib/auth-client';

const EMAIL_NOT_VERIFIED = 403;

export function LoginForm() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { run, pending, error } = useAction(async (email: string, password: string) => {
    const { error: authError } = await authClient.signIn.email({ email, password });
    if (authError?.status === EMAIL_NOT_VERIFIED) {
      await navigate(`/verify-email?email=${encodeURIComponent(email)}`);
      return;
    }
    if (authError) throw new Error(authError.message || 'Could not sign in. Try again.');
    // The route guard sends the user on to onboarding or home once the session lands.
    await navigate('/');
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    void run(String(data.get('email')), String(data.get('password')));
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {params.has('reset') && <Notice tone="success">Password updated. Sign in with it.</Notice>}
      <FormField label="Email" name="email" type="email" autoComplete="email" required />
      <FormField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" variant="primary" loading={pending}>
        Sign in
      </Button>
      <Button asChild variant="link" className="self-center text-sm">
        <Link to="/forgot-password">Forgot password?</Link>
      </Button>
    </form>
  );
}
