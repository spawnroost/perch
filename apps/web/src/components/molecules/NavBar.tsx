import { NavLink } from 'react-router';
import { cn } from '@/lib/cn';

const NAV_ITEMS = [
  { to: '/', label: 'For you', end: true },
  { to: '/library', label: 'Library', end: false },
  { to: '/devices', label: 'Devices', end: false },
] as const;

export function NavBar() {
  return (
    <nav aria-label="Main" className="flex items-center gap-1">
      {NAV_ITEMS.map(({ to, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'inline-flex h-7 items-center rounded-sm px-2.5 text-sm font-medium transition-colors duration-fast ease-out hover:text-fg',
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
