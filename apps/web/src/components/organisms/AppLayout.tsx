import { Link, Outlet, useLocation } from 'react-router';
import { NavBar } from '../molecules';
import { AccountMenu } from './AccountMenu';
import { cn } from '@/lib/cn';
import { isFullBleedPath } from '@/lib/layout';

/** Shell for signed-in pages: top bar with navigation and the account menu. */
export function AppLayout() {
  const fullBleed = isFullBleedPath(useLocation().pathname);
  return (
    <div className="min-h-dvh bg-ground">
      <header className="sticky top-0 z-10 border-b border-line bg-ground">
        <div
          className={cn(
            'mx-auto flex h-12 w-full items-center justify-between gap-4 px-6',
            fullBleed ? 'max-w-6xl' : 'max-w-3xl',
          )}
        >
          <div className="flex items-center gap-4">
            <Link to="/" className="rounded-sm text-lg font-semibold tracking-display text-fg">
              Perch
            </Link>
            <NavBar />
          </div>
          <AccountMenu />
        </div>
      </header>
      <main
        className={cn(
          'mx-auto flex w-full flex-col gap-4',
          fullBleed ? 'max-w-none' : 'max-w-3xl p-6',
        )}
      >
        <Outlet />
      </main>
    </div>
  );
}
