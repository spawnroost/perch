import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button, Notice } from '../atoms';
import { useAction } from '@/hooks/useAction';
import { appUrl, authClient, unwrapAuth } from '@/lib/auth-client';

export function VerifyEmailNotice() {
  const [params] = useSearchParams();
  const email = params.get('email');
  const [resent, setResent] = useState(false);
  const { run, pending, error } = useAction(async () => {
    if (!email) return;
    unwrapAuth(await authClient.sendVerificationEmail({ email, callbackURL: appUrl('/') }));
    setResent(true);
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-muted">
        {email ? (
          <>
            We sent a confirmation link to <span className="text-fg">{email}</span>. Open it to
            finish creating your account.
          </>
        ) : (
          'Open the confirmation link we emailed you to finish creating your account.'
        )}
      </p>
      {resent && <Notice tone="success">Sent again. Check your inbox.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {email && (
        <Button variant="secondary" loading={pending} onClick={() => void run()}>
          Resend email
        </Button>
      )}
      <Button asChild variant="link" className="self-center text-sm">
        <Link to="/login">Back to sign in</Link>
      </Button>
    </div>
  );
}
