import { Gamepad2, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Skeleton } from '../atoms';
import { DetailSection, ExternalLinks } from '../molecules';
import { usePlayerVoice } from '@/hooks/queries';
import { voiceGroups } from '@/lib/playerVoice';

const ICONS = {
  likes: { Icon: ThumbsUp, tone: 'text-fit-yes' },
  complaints: { Icon: ThumbsDown, tone: 'text-fit-no' },
} as const;

/** Rail block: what Steam players like and complain about, written by an LLM from their reviews. */
export function PlayerVoice({ igdbId }: { igdbId: number }) {
  const { data, waiting } = usePlayerVoice(igdbId);
  if (waiting) return <Skeleton className="h-32 w-full" aria-busy />;
  if (!data?.voice) return null;
  const { voice, steamReviewsUrl } = data;
  return (
    <DetailSection title="What players say">
      <div className="flex flex-col gap-3">
        {voiceGroups(voice).map((g) => {
          const { Icon, tone } = ICONS[g.kind];
          return (
            <div key={g.kind} className="flex flex-col gap-1.5">
              <span className="text-xs text-fg-subtle">{g.label}</span>
              <ul className="flex flex-col gap-1.5">
                {g.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-fg">
                    <Icon
                      size={14}
                      strokeWidth={1.75}
                      aria-hidden
                      className={`mt-0.5 shrink-0 ${tone}`}
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {voice.deck ? (
          <div className="flex items-start gap-2 rounded-md border border-line bg-surface-1 px-3 py-2 text-sm text-fg-muted">
            <Gamepad2 size={14} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
            <span>
              <span className="text-fg-subtle">On Steam Deck: </span>
              {voice.deck}
            </span>
          </div>
        ) : null}
        <p className="text-xs text-fg-subtle">AI summary of Steam reviews</p>
        {steamReviewsUrl ? (
          <ExternalLinks links={[{ label: 'Read Steam reviews', url: steamReviewsUrl }]} />
        ) : null}
      </div>
    </DetailSection>
  );
}
