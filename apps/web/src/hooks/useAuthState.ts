import { authClient } from '@/lib/auth-client';
import type { AuthState } from '@/lib/guard';

export function useAuthState(): AuthState {
  const { data, isPending } = authClient.useSession();
  if (isPending) return 'loading';
  return data ? 'in' : 'out';
}
