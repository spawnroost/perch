import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../atoms';
import { useAction } from '@/hooks/useAction';
import { authClient, unwrapAuth } from '@/lib/auth-client';

/** Placeholder landing until the For you screens (step 5). */
export function SignedInHome() {
  const queryClient = useQueryClient();
  const { data } = authClient.useSession();
  const signOut = useAction(async () => {
    unwrapAuth(await authClient.signOut());
    // Drop the previous user's library, devices and picks; the route guard then sends us to login.
    queryClient.clear();
  });

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ground p-6">
      <h1 className="text-2xl font-semibold tracking-display text-fg">You are set up</h1>
      <p className="text-base text-fg-muted">Signed in as {data?.user.email}.</p>
      <Button variant="secondary" loading={signOut.pending} onClick={() => void signOut.run()}>
        Sign out
      </Button>
    </main>
  );
}
