import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button, Notice } from '../atoms';
import { FormField } from '../molecules';
import { useAction } from '@/hooks/useAction';
import { appUrl, authClient, unwrapAuth } from '@/lib/auth-client';

export function SignupForm() {
  const navigate = useNavigate();
  const { run, pending, error } = useAction(
    async (name: string, email: string, password: string) => {
      unwrapAuth(
        await authClient.signUp.email({ name, email, password, callbackURL: appUrl('/') }),
      );
      await navigate(`/verify-email?email=${encodeURIComponent(email)}`);
    },
  );

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    void run(String(data.get('name')), String(data.get('email')), String(data.get('password')));
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormField label="Name" name="name" autoComplete="name" required />
      <FormField label="Email" name="email" type="email" autoComplete="email" required />
      <FormField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        hint="At least 8 characters."
        required
      />
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" variant="primary" loading={pending}>
        Create account
      </Button>
    </form>
  );
}
