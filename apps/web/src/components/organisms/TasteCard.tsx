import type { Ref } from 'react';
import { motion } from 'motion/react';
import { Star } from 'lucide-react';
import type { TasteSummary } from '@perch/core/browser';
import { Cover, HudChip, Logo, Reveal, StatTile, TasteBar } from '../atoms';
import { TasteCollage } from '../molecules';
import { useReduced } from '@/hooks/useMotionPrefs';
import { accentStyle } from '@/lib/accent';
import { formatHours, platformLabel, shareLabel, statusTiles } from '@/lib/tasteCard';

/** Reveal steps on the card: the page waits this many before the PNG is ready. */
export const TASTE_CARD_STEPS = 10;

/**
 * The shareable card: a trading card in the accent of the most-played cover, with the cover
 * collage, playstyle, stats and platform split. Everything on it reveals in a stagger.
 */
export function TasteCard({ summary, ref }: { summary: TasteSummary; ref?: Ref<HTMLElement> }) {
  const reduced = useReduced();
  const { mostPlayed, playstyle } = summary;
  const statuses = statusTiles(summary.statusCounts);
  return (
    <article
      ref={ref}
      aria-label="Your taste card"
      style={accentStyle(mostPlayed?.accent)}
      className="relative isolate flex w-full max-w-sm flex-col gap-4 overflow-hidden rounded-2xl border border-line-strong bg-linear-to-b from-accent-wash via-surface-1 to-ground p-4 shadow-glow"
    >
      {!reduced && (
        <motion.div
          aria-hidden
          data-export-skip
          className="pointer-events-none absolute inset-y-0 -left-1/2 z-10 w-1/2 -skew-x-12 bg-linear-to-r from-transparent via-accent-soft to-transparent"
          initial={{ x: '0%' }}
          animate={{ x: '400%' }}
          transition={{ duration: 1.6, delay: 0.8, ease: 'easeInOut' }}
        />
      )}
      <Reveal index={0} className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 font-hud text-xs text-fg">
          <Logo aria-hidden className="size-5" />
          Perch
        </span>
        <span className="font-hud text-2xs text-fg-subtle">Taste card</span>
      </Reveal>

      <TasteCollage covers={summary.covers} />

      <Reveal index={2} className="flex flex-col gap-2">
        <h2 className="font-title text-display-md text-fg">{playstyle?.label}</h2>
        {playstyle && playstyle.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {playstyle.tags.map((t) => (
              <HudChip key={t} label={t} tone="unknown" plain />
            ))}
          </div>
        )}
      </Reveal>

      <Reveal index={3} className="grid grid-cols-2 gap-4">
        <StatTile label="Games">{summary.gameCount.toLocaleString('en-US')}</StatTile>
        <StatTile label="Hours">{formatHours(summary.totalHours)}</StatTile>
      </Reveal>

      {summary.topTastes.length > 0 && (
        <Reveal index={4} className="flex flex-col gap-2">
          <h3 className="font-hud text-2xs text-fg-subtle">Top tastes</h3>
          {summary.topTastes.map((t, i) => (
            <TasteBar key={`${t.kind}-${t.name}`} name={t.name} weight={t.weight} index={4 + i} />
          ))}
        </Reveal>
      )}

      {mostPlayed && (
        <Reveal index={5} className="flex items-center gap-3">
          <Cover
            src={mostPlayed.coverUrl}
            alt=""
            label={mostPlayed.name}
            className="w-12 shrink-0 shadow-glow"
          />
          <div className="flex min-w-0 flex-col">
            <span className="font-hud text-2xs text-fg-subtle">Most played</span>
            <span className="truncate font-title text-lg text-fg">{mostPlayed.name}</span>
            <span className="text-sm text-fg-muted tabular-nums">
              {formatHours(mostPlayed.hours)} hours
            </span>
          </div>
        </Reveal>
      )}

      <Reveal index={6} className="flex flex-wrap gap-1.5">
        {statuses.map((s) => (
          <HudChip key={s.status} label={`${s.count} ${s.label}`} tone="unknown" plain />
        ))}
      </Reveal>

      {summary.platforms.length > 0 && (
        <Reveal index={7} className="flex flex-col gap-2">
          <div
            role="img"
            aria-label={summary.platforms
              .map((p) => `${platformLabel(p.platform)} ${shareLabel(p.share)}`)
              .join(', ')}
            className="flex h-1.5 gap-0.5 overflow-hidden rounded-sm"
          >
            {summary.platforms.map((p, i) => (
              <div
                key={p.platform}
                className="h-full bg-accent"
                style={{ flexGrow: p.share, opacity: 1 - i * 0.22 }}
              />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-fg-muted">
            {summary.platforms.map((p) => (
              <li key={p.platform}>
                {platformLabel(p.platform)}{' '}
                <span className="tabular-nums">{shareLabel(p.share)}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      )}

      {summary.topRated.length > 0 && (
        <Reveal index={8} className="flex flex-col gap-1">
          <h3 className="font-hud text-2xs text-fg-subtle">Top rated</h3>
          {summary.topRated.map((g) => (
            <div key={g.igdbId} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-fg">{g.name}</span>
              <span className="inline-flex shrink-0 text-accent">
                {Array.from({ length: g.rating }, (_, i) => (
                  <Star key={i} size={12} className="fill-current" aria-hidden />
                ))}
                <span className="sr-only">{g.rating} of 5</span>
              </span>
            </div>
          ))}
        </Reveal>
      )}
    </article>
  );
}
