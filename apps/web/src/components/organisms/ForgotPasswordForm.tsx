import { useState, type FormEvent } from 'react';
import { Button, Notice } from '../atoms';
import { FormField } from '../molecules';
import { useAction } from '@/hooks/useAction';
import { appUrl, authClient, unwrapAuth } from '@/lib/auth-client';

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { run, pending, error } = useAction(async (email: string) => {
    unwrapAuth(
      await authClient.requestPasswordReset({ email, redirectTo: appUrl('/reset-password') }),
    );
    setSentTo(email);
  });

  if (sentTo) {
    return (
      <Notice tone="success">If an account exists for {sentTo}, a reset link is on its way.</Notice>
    );
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void run(String(new FormData(e.currentTarget).get('email')));
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormField label="Email" name="email" type="email" autoComplete="email" required />
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" variant="primary" loading={pending}>
        Send reset link
      </Button>
    </form>
  );
}
