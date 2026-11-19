import { Link, Outlet, useLocation } from 'react-router';
import { Logo } from '../atoms';
import { NavBar } from '../molecules';
import { AccountMenu } from './AccountMenu';
import { GlobalSearch } from './GlobalSearch';
import { cn } from '@/lib/cn';
import { layoutKind } from '@/lib/layout';

/** Shell for signed-in pages: top bar with navigation and the account menu. */
export function AppLayout() {
  const kind = layoutKind(useLocation().pathname);
  return (
    <div className="min-h-dvh bg-ground pb-14 sm:pb-0">
      <header className="sticky top-0 z-30 border-b border-line bg-ground">
        <div className="flex w-full flex-wrap items-center gap-x-4 px-gutter py-2 sm:h-12 sm:flex-nowrap sm:py-0">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-sm text-lg font-semibold tracking-display text-fg"
          >
            <Logo aria-hidden className="size-6" />
            Perch
          </Link>
          {/* Phones: the nav is a tab bar pinned to the bottom of the screen. */}
          <NavBar />
          <div className="ml-auto flex items-center gap-2">
            <GlobalSearch />
            <AccountMenu />
          </div>
        </div>
      </header>
      <main
        className={cn(
          'mx-auto flex w-full flex-col gap-4',
          kind === 'narrow' ? 'max-w-3xl p-4 sm:p-6' : 'max-w-none',
        )}
      >
        <Outlet />
      </main>
    </div>
  );
}
