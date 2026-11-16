import { Navigate, Outlet, useLocation } from 'react-router';
import { Button, Notice, Skeleton } from '@/components/atoms';
import { useLibrary } from '@/hooks/queries';
import { useAuthState } from '@/hooks/useAuthState';
import { decideRoute } from '@/lib/guard';

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ground">
      <Skeleton className="h-8 w-40" />
    </div>
  );
}

/** Layout route: signed-out users go to login, users with an empty library go to onboarding. */
export function RouteGuard() {
  const { pathname } = useLocation();
  const auth = useAuthState();
  const library = useLibrary(auth === 'in');
  const hasLibrary = library.data ? library.data.length > 0 : undefined;

  if (auth === 'in' && library.isError && pathname !== '/onboarding') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ground p-6">
        <Notice tone="error">{library.error.message}</Notice>
        <Button onClick={() => void library.refetch()}>Try again</Button>
      </div>
    );
  }

  const decision = decideRoute({ auth, hasLibrary, path: pathname });
  if (decision.kind === 'wait') return <Splash />;
  if (decision.kind === 'redirect') return <Navigate to={decision.to} replace />;
  return <Outlet />;
}
