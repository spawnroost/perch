import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button, Notice } from '../atoms';
import { ActionForm, FormField } from '../molecules';
import { useAction } from '@/hooks/useAction';
import { authClient, unwrapAuth } from '@/lib/auth-client';

export function ResetPasswordForm() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');
  const { run, pending, error } = useAction(async (newPassword: string) => {
    if (!token) throw new Error('This reset link is missing its token.');
    unwrapAuth(await authClient.resetPassword({ newPassword, token }));
    await navigate('/login?reset=1');
  });

  if (!token || params.has('error')) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="error">This reset link is invalid or has expired.</Notice>
        <Button asChild variant="secondary">
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  return (
    <ActionForm
      onSubmit={(data) => void run(String(data.get('password')))}
      submitLabel="Update password"
      pending={pending}
      error={error}
    >
      <FormField
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        hint="At least 8 characters."
        required
      />
    </ActionForm>
  );
}
