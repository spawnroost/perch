import { useState } from 'react';
import { Notice } from '../atoms';
import { ActionForm, FormField } from '../molecules';
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

  return (
    <ActionForm
      onSubmit={(data) => void run(String(data.get('email')))}
      submitLabel="Send reset link"
      pending={pending}
      error={error}
    >
      <FormField label="Email" name="email" type="email" autoComplete="email" required />
    </ActionForm>
  );
}
