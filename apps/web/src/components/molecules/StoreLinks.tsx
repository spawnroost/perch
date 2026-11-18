import { ExternalLink, Gamepad2, Monitor, Smartphone, type LucideIcon } from 'lucide-react';
import { Button } from '../atoms';
import { storeLabel } from '@/lib/gameFacts';
import type { GameDetailResponse } from '@perch/core';

type Store = GameDetailResponse['facts']['stores'][number];
type StoreId = Store['store'];

/** Generic platform glyphs; no brand logos. */
const STORE_ICON: Record<StoreId, LucideIcon> = {
  steam: Monitor,
  gog: Monitor,
  epic: Monitor,
  itch: Monitor,
  playstation: Gamepad2,
  xbox: Gamepad2,
  nintendo: Gamepad2,
  'app-store': Smartphone,
  'google-play': Smartphone,
};

export interface StoreLinksProps {
  /** Store links already vetted as http(s), in display order. */
  stores: readonly Store[];
  /** Quieter text links (reviews, discussion). */
  links: ReadonlyArray<{ label: string; url: string }>;
}

/** Store buttons plus quieter text links; every link opens externally. */
export function StoreLinks({ stores, links }: StoreLinksProps) {
  return (
    <div className="flex flex-col gap-3">
      {stores.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {stores.map((s) => {
            const Icon = STORE_ICON[s.store];
            return (
              <li key={`${s.store} ${s.url}`}>
                <Button asChild variant="secondary">
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    <Icon size={14} strokeWidth={1.75} aria-hidden />
                    {storeLabel(s.store)}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {links.length > 0 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {links.map((l) => (
            <li key={l.url}>
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-sm text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline"
              >
                {l.label}
                <ExternalLink size={12} strokeWidth={1.75} aria-hidden />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
