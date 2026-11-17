import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Button, Notice } from '../atoms';
import { ActionForm, FormField, SteamSignInButton } from '../molecules';
import { accountSubtitle, canUnlinkSteam } from '@perch/core';
import { useAccount, useUnlinkSteam } from '@/hooks/queries';
import { useSteamError } from '@/hooks/useSteamError';
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
        onSubmit={(data, form) =>
          void run(String(data.get('current')), String(data.get('next'))).then(
            (ok) => ok && form.reset(),
          )
        }
        onChange={() => setDone(false)}
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

function SteamLink() {
  const account = useAccount();
  const unlink = useUnlinkSteam();
  const steamError = useSteamError();
  const data = account.data;
  const linked = Boolean(data?.steamId);
  const unlinkError = unlink.error instanceof Error ? unlink.error.message : null;
  return (
    <Section
      title="Steam"
      description={
        linked
          ? `Linked to Steam account ${data?.steamId}.`
          : 'Link Steam to sign in with it and pull in your library.'
      }
    >
      {(steamError ?? unlinkError) && <Notice tone="error">{steamError ?? unlinkError}</Notice>}
      {data &&
        (linked ? (
          canUnlinkSteam(data) ? (
            <Button
              variant="secondary"
              className="w-fit"
              loading={unlink.isPending}
              onClick={() => unlink.mutate()}
            >
              Unlink Steam
            </Button>
          ) : (
            <p className="text-sm text-fg-muted">Steam is your only sign-in method.</p>
          )
        ) : (
          <div className="w-fit">
            <SteamSignInButton mode="link">Link Steam</SteamSignInButton>
          </div>
        ))}
    </Section>
  );
}

function DeleteAccount({ hasPassword }: { hasPassword: boolean }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const { run, pending, error } = useAction(async (password: string) => {
    // Steam-only users have no password: better-auth then needs a fresh session instead.
    const result = await authClient.deleteUser(hasPassword ? { password } : {});
    if (!hasPassword && result.error)
      throw new Error('Your session is too old. Sign out, sign in with Steam again, then retry.');
    unwrapAuth(result);
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
          onSubmit={(data) => void run(String(data.get('password') ?? ''))}
          submitLabel="Delete my account"
          pending={pending}
          error={error}
          after={
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep my account
            </Button>
          }
        >
          {hasPassword && (
            <FormField
              label="Confirm with your password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          )}
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
  const { data: account } = useAccount();
  const email = data?.user.email;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-display text-fg">Account</h1>
        <p className="text-sm text-fg-muted">{accountSubtitle(email, account?.steamId)}</p>
      </div>
      {account?.hasPassword !== false && <ChangePassword />}
      <SteamLink />
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
      <DeleteAccount hasPassword={account?.hasPassword !== false} />
    </div>
  );
}
