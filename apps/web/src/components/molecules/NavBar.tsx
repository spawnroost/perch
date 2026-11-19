import { NavLink } from 'react-router';
import { cn } from '@/lib/cn';

const NAV_ITEMS = [
  { to: '/', label: 'For you', end: true },
  { to: '/browse', label: 'Browse', end: false },
  { to: '/library', label: 'Library', end: false },
  { to: '/devices', label: 'Devices', end: false },
] as const;

export function NavBar({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Main"
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 flex items-center justify-around gap-1 border-t border-line bg-ground px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]',
        'sm:static sm:justify-start sm:border-0 sm:bg-transparent sm:p-0',
        className,
      )}
    >
      {NAV_ITEMS.map(({ to, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'inline-flex h-10 flex-1 items-center justify-center rounded-sm px-2.5 text-sm font-medium sm:h-7 sm:flex-none transition-colors duration-fast ease-out hover:text-fg',
              isActive ? 'bg-surface-3 text-fg' : 'text-fg-muted',
            )
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
