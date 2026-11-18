import { Gamepad2, Monitor, Smartphone, type LucideIcon } from 'lucide-react';
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

/** Store buttons in the given order; every link opens externally. */
export function StoreLinks({ stores }: { stores: readonly Store[] }) {
  return (
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
  );
}
