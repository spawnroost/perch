import { Link, Outlet } from 'react-router';
import { NavBar } from '../molecules';
import { AccountMenu } from './AccountMenu';

/** Shell for signed-in pages: top bar with navigation and the account menu. */
export function AppLayout() {
  return (
    <div className="min-h-dvh bg-ground">
      <header className="sticky top-0 z-10 border-b border-line bg-ground">
        <div className="mx-auto flex h-12 w-full max-w-3xl items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-4">
            <Link to="/" className="rounded-sm text-lg font-semibold tracking-display text-fg">
              Perch
            </Link>
            <NavBar />
          </div>
          <AccountMenu />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
        <Outlet />
      </main>
    </div>
  );
}
