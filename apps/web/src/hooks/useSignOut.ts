import { useQueryClient } from '@tanstack/react-query';
import { useAction } from './useAction';
import { authClient, unwrapAuth } from '@/lib/auth-client';

/** Sign out and drop the previous user's cache; the route guard then sends us to login. */
export function useSignOut() {
  const queryClient = useQueryClient();
  return useAction(async () => {
    unwrapAuth(await authClient.signOut());
    queryClient.clear();
  });
}
