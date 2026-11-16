import type { ReactNode } from 'react';
import { Card } from '../atoms';

export interface AuthLayoutProps {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-ground p-6">
      <p className="text-lg font-semibold tracking-display text-fg">Perch</p>
      <Card className="flex w-full max-w-sm flex-col gap-5 p-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
          {subtitle && <p className="text-sm text-fg-muted">{subtitle}</p>}
        </header>
        {children}
      </Card>
      {footer && <p className="text-sm text-fg-muted">{footer}</p>}
    </main>
  );
}
