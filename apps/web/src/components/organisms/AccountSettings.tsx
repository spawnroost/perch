import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Button, Notice } from '../atoms';
import { ActionForm, FormField } from '../molecules';
import { useAction } from '@/hooks/useAction';
import { useSignOut } from '@/hooks/useSignOut';
import { authClient, unwrapAuth } from '@/lib/auth-client';

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface-1 p-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-fg">{title}</h2>
        {description && <p className="text-sm text-fg-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function ChangePassword() {
  const [done, setDone] = useState(false);
  const { run, pending, error } = useAction(
    async (currentPassword: string, newPassword: string) => {
      setDone(false);
      unwrapAuth(
        await authClient.changePassword({
          currentPassword,
          newPassword,
          revokeOtherSessions: true,
        }),
      );
      setDone(true);
    },
  );
  return (
    <Section title="Password" description="Other devices are signed out when you change it.">
      <ActionForm
        onSubmit={(data) => void run(String(data.get('current')), String(data.get('next')))}
        submitLabel="Change password"
        pending={pending}
        error={error}
        after={done && <Notice tone="success">Password changed.</Notice>}
      >
        <FormField
          label="Current password"
          name="current"
          type="password"
          autoComplete="current-password"
          required
        />
        <FormField
          label="New password"
          name="next"
          type="password"
          autoComplete="new-password"
          minLength={8}
          hint="At least 8 characters."
          required
        />
      </ActionForm>
    </Section>
  );
}

function DeleteAccount() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const { run, pending, error } = useAction(async (password: string) => {
    unwrapAuth(await authClient.deleteUser({ password }));
    queryClient.clear();
    await navigate('/login', { replace: true });
  });
  return (
    <Section
      title="Delete account"
      description="Removes your library, devices, feedback and picks for good."
    >
      {confirming ? (
        <ActionForm
          onSubmit={(data) => void run(String(data.get('password')))}
          submitLabel="Delete my account"
          pending={pending}
          error={error}
          after={
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep my account
            </Button>
          }
        >
          <FormField
            label="Confirm with your password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </ActionForm>
      ) : (
        <Button variant="danger" className="w-fit" onClick={() => setConfirming(true)}>
          Delete account
        </Button>
      )}
    </Section>
  );
}

export function AccountSettings() {
  const { data } = authClient.useSession();
  const signOut = useSignOut();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-display text-fg">Account</h1>
        <p className="text-sm text-fg-muted">{data ? data.user.email : 'Signed in'}</p>
      </div>
      <ChangePassword />
      <Section title="Sign out">
        {signOut.error && <Notice tone="error">{signOut.error}</Notice>}
        <Button
          variant="secondary"
          className="w-fit"
          loading={signOut.pending}
          onClick={() => void signOut.run()}
        >
          Sign out
        </Button>
      </Section>
      <DeleteAccount />
    </div>
  );
}
