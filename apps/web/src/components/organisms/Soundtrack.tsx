import type { SoundtrackResponse } from '@perch/core/browser';
import { DetailSection, ExternalLinks, TrackRow } from '../molecules';
import { Skeleton } from '../atoms';
import { useSoundtrack } from '@/hooks/queries';
import { usePreviewPlayer } from '@/hooks/usePreviewPlayer';
import { formatTrackTime, playableTracks } from '@/lib/soundtrack';

function Album({ soundtrack }: { soundtrack: NonNullable<SoundtrackResponse['soundtrack']> }) {
  const { playingUrl, toggle } = usePreviewPlayer();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {soundtrack.artworkUrl ? (
          <img
            src={soundtrack.artworkUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-16 shrink-0 rounded-md border border-line bg-surface-2 object-cover shadow-raised"
          />
        ) : null}
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm text-fg">{soundtrack.albumName}</span>
          <span className="truncate text-xs text-fg-subtle">{soundtrack.artist}</span>
        </div>
      </div>
      <ul className="flex flex-col">
        {playableTracks(soundtrack.tracks).map((t) => (
          <TrackRow
            key={`${t.disc}-${t.number}`}
            number={t.number}
            name={t.name}
            time={formatTrackTime(t.durationMs)}
            playable={t.preview !== null}
            playing={t.preview !== null && playingUrl === t.preview}
            onToggle={() => t.preview && toggle(t.preview)}
          />
        ))}
      </ul>
    </div>
  );
}

/** Rail block with the game's soundtrack: album, 30 s previews and where to hear it in full. */
export function Soundtrack({ igdbId }: { igdbId: number }) {
  const { data, isPending } = useSoundtrack(igdbId);
  if (isPending) return <Skeleton className="h-24 w-full" aria-busy />;
  if (!data) return null;
  const { soundtrack, links } = data;
  const open = [
    { label: 'Apple Music', url: links.appleMusic },
    { label: 'Spotify', url: links.spotify },
    { label: 'YouTube', url: links.youtube },
  ];
  return (
    <DetailSection title="Soundtrack">
      {soundtrack ? <Album key={igdbId} soundtrack={soundtrack} /> : null}
      <ExternalLinks links={open} />
    </DetailSection>
  );
}
