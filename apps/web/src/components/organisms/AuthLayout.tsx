import type { ReactNode } from 'react';
import { Card, Logo } from '../atoms';
import { cn } from '@/lib/cn';
import { AUTH_COVER_IDS, coverUrl, mosaicColumns } from '@/lib/authMosaic';

export interface AuthLayoutProps {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

const COLUMNS = mosaicColumns(AUTH_COVER_IDS, 6, 4);

/** Decorative, public cover art (no session needed): blurred, tinted, and still under reduced motion. */
function CoverMosaic() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-ground">
      <div className="absolute -inset-12 grid grid-cols-6 gap-4 blur-hero">
        {COLUMNS.map((ids, col) => (
          <div
            key={col}
            className={cn(
              'flex flex-col gap-4 motion-safe:animate-mosaic-drift',
              col % 2 === 1 && 'motion-safe:[animation-direction:alternate-reverse]',
            )}
          >
            {ids.map((id, row) => (
              <img
                key={row}
                src={coverUrl(id)}
                alt=""
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="aspect-3/4 w-full rounded-lg object-cover"
              />
            ))}
          </div>
        ))}
      </div>
      <div className="absolute inset-0 bg-ground/70" />
      <div className="absolute inset-0 bg-linear-to-b from-accent-wash to-ground" />
    </div>
  );
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <CoverMosaic />
      <p className="relative flex items-center gap-2.5 font-title text-2xl text-fg">
        <Logo aria-hidden className="size-9" />
        Perch
      </p>
      <Card className="relative flex w-full max-w-sm flex-col gap-5 bg-surface-1/85 p-6 shadow-overlay backdrop-blur-md">
        <header className="flex flex-col gap-1">
          <h1 className="font-title text-2xl text-fg">{title}</h1>
          {subtitle && <p className="text-sm text-fg-muted">{subtitle}</p>}
        </header>
        {children}
      </Card>
      {footer && <p className="relative text-sm text-fg-muted">{footer}</p>}
    </main>
  );
}
