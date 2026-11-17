import type { ReactNode } from 'react';
import { accentStyle } from '@/lib/accent';
import { ArrowRight, Search, Trash2 } from 'lucide-react';
import type { DeckCategory, FitStatus } from '@perch/core';
import {
  Badge,
  Button,
  Card,
  DeckBadge,
  DeviceArt,
  FitBadge,
  HudChip,
  Input,
  Kbd,
  Sheet,
  SheetContent,
  SheetTrigger,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/atoms';
import { GameCard, Hero, Shelf } from '@/components/molecules';
import { DEVICE_ART_TYPES } from '@/lib/devices';

// Stand-ins for the accent hex the API returns per game.
const ACCENTS = ['#8a3b2c', '#2c6f8a', '#6b8a2c'];
const FIT: FitStatus[] = ['green', 'yellow', 'hidden', 'unknown'];
const DECK: DeckCategory[] = ['verified', 'playable', 'unsupported', 'unknown'];

// Placeholder art: an SVG gradient in the given hex, so the showcase needs no network.
function art(hex: string, w: number, h: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hex}"/><stop offset="1" stop-color="#14101f"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const GAMES = [
  { title: 'Hades II', accent: '#8a3b2c' },
  { title: 'Hollow Knight: Silksong', accent: '#2c6f8a' },
  { title: 'Stardew Valley', accent: '#6b8a2c' },
  { title: 'Celeste', accent: '#7a3b8a' },
  { title: 'Disco Elysium', accent: '#8a6b2c' },
  { title: 'Outer Wilds', accent: '#2c8a6b' },
  { title: 'Balatro', accent: '#8a2c4f' },
  { title: 'Dave the Diver', accent: '#2c4f8a' },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-hud text-2xs text-fg-subtle">{title}</h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}

// Temporary: atom gallery for visual review.
export function Showcase() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-8">
      <h1 className="font-title text-display-md">Perch atoms</h1>

      <Section title="Per-game accent (set --accent on a subtree)">
        {ACCENTS.map((accent) => (
          <div
            key={accent}
            style={accentStyle(accent)}
            className="flex flex-col gap-3 rounded-xl border border-line bg-surface-1 p-4 shadow-card transition-shadow duration-base ease-out hover:shadow-glow"
          >
            <p className="font-title text-display-sm text-fg">Hades II</p>
            <div className="flex items-center gap-2">
              <Button variant="primary">Play</Button>
              <Badge tone="accent">Playing</Badge>
              <span className="size-3 rounded-full bg-accent-tint" aria-hidden />
            </div>
          </div>
        ))}
        <Card className="p-4 text-sm text-fg-muted">Fallback accent (no --accent set)</Card>
      </Section>

      <Section title="Button variants">
        <Button variant="primary" kbd="↵">
          Primary
        </Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">
          <Trash2 size={14} strokeWidth={1.75} aria-hidden />
          Danger
        </Button>
        <Button variant="link">Link</Button>
      </Section>

      <Section title="Button sizes and states">
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="icon" aria-label="Search">
          <Search size={16} strokeWidth={1.75} aria-hidden />
        </Button>
        <Button variant="primary" loading>
          Loading
        </Button>
        <Button variant="primary" disabled>
          Disabled
        </Button>
        <Button variant="secondary" disabled>
          Disabled
        </Button>
        <Button asChild variant="secondary">
          <a href="#next">
            As link
            <ArrowRight size={14} strokeWidth={1.75} aria-hidden />
          </a>
        </Button>
      </Section>

      <Section title="Input">
        <Input placeholder="Plain" className="w-56" />
        <Input
          placeholder="Search games"
          icon={<Search size={14} strokeWidth={1.75} />}
          className="w-56"
        />
        <Input defaultValue="bad value" aria-invalid className="w-56" />
        <Input placeholder="Disabled" disabled className="w-56" />
      </Section>

      <Section title="Kbd">
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
        <Kbd>Esc</Kbd>
      </Section>

      <Section title="Badge">
        <Badge>Neutral</Badge>
        <Badge tone="accent">Accent</Badge>
      </Section>

      <Section title="Fit badges">
        {FIT.map((s) => (
          <FitBadge key={s} status={s} />
        ))}
      </Section>

      <Section title="Deck badges">
        {DECK.map((c) => (
          <DeckBadge key={c} category={c} />
        ))}
      </Section>

      <Section title="Card">
        <Card className="w-56 p-3 text-sm">Static card</Card>
        <Card interactive className="w-56 p-3 text-sm">
          Interactive card
        </Card>
        <Card interactive pressed className="w-56 p-3 text-sm">
          Selected card
        </Card>
      </Section>

      <Section title="Tabs">
        <Tabs defaultValue="library">
          <TabsList>
            <TabsTrigger value="library">Library</TabsTrigger>
            <TabsTrigger value="wishlist">Wishlist</TabsTrigger>
            <TabsTrigger value="devices">Devices</TabsTrigger>
          </TabsList>
          <TabsContent value="library" className="text-sm text-fg-muted">
            Library panel
          </TabsContent>
          <TabsContent value="wishlist" className="text-sm text-fg-muted">
            Wishlist panel
          </TabsContent>
          <TabsContent value="devices" className="text-sm text-fg-muted">
            Devices panel
          </TabsContent>
        </Tabs>
      </Section>

      <Section title="Skeleton">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-10 w-10 rounded-lg" />
      </Section>

      <Section title="HUD chips">
        <HudChip label="Steam Deck" tone="yes" />
        <HudChip label="Laptop" tone="low" />
        <HudChip label="Switch" tone="no" />
        <HudChip label="Desktop" tone="unknown" />
      </Section>

      <Section title="Game cards (hover to tilt, Tab to focus)">
        <GameCard
          className="w-40"
          title="Hades II"
          accent="#8a3b2c"
          coverUrl={art('#8a3b2c', 264, 352)}
          coverUrlSmall={art('#8a3b2c', 90, 120)}
          chips={[
            { label: 'Deck', tone: 'yes' },
            { label: 'Laptop', tone: 'low' },
          ]}
          layoutId="showcase-hades"
        />
        <GameCard
          className="w-40"
          title="No art yet"
          accent="#2c6f8a"
          chips={[{ label: 'Deck', tone: 'unknown' }]}
        />
        <GameCard
          className="w-40"
          title="No accent, no chips"
          coverUrl={art('#3b3b8a', 264, 352)}
        />
        <GameCard className="w-40" title="Loading" skeleton />
      </Section>

      <Section title="Hero">
        <div className="w-full">
          <Hero
            title="Hades II"
            accent="#8a3b2c"
            heroUrl={art('#8a3b2c', 1280, 720)}
            meta={
              <>
                <HudChip label="Deck" tone="yes" />
                <span className="text-sm">2025 · Action roguelike</span>
              </>
            }
            actions={
              <>
                <Button variant="primary">Play</Button>
                <Button variant="secondary">Add to wishlist</Button>
              </>
            }
          />
        </div>
        <div className="w-full">
          <Hero
            title="No hero art"
            accent="#2c6f8a"
            meta={<span className="text-sm">Fallback wash</span>}
          />
        </div>
      </Section>

      <Section title="Shelf (arrow keys move focus, Home/End jump)">
        <Shelf title="Playable now" controls className="w-full">
          {GAMES.map((g) => (
            <GameCard
              key={g.title}
              className="w-40"
              title={g.title}
              accent={g.accent}
              coverUrl={art(g.accent, 264, 352)}
              coverUrlSmall={art(g.accent, 90, 120)}
              chips={[{ label: 'Deck', tone: 'yes' }]}
            />
          ))}
        </Shelf>
        <Shelf title="Loading" className="w-full">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <GameCard key={i} className="w-40" title="" skeleton />
          ))}
        </Shelf>
      </Section>

      <Section title="Device art (banner illustrations)">
        <div data-testid="device-art-row" className="grid w-full grid-cols-3 gap-3">
          {DEVICE_ART_TYPES.map((type) => (
            <figure
              key={type}
              className="flex flex-col items-center gap-1 rounded-lg bg-linear-to-br from-device-handheld to-device-console-end p-2"
            >
              <DeviceArt type={type} className="h-28" />
              <figcaption className="font-hud text-2xs text-fg-muted">{type}</figcaption>
            </figure>
          ))}
        </div>
      </Section>

      <Section title="Sheet">
        <Sheet>
          <SheetTrigger asChild>
            <Button>Open right sheet</Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            title="Game details"
            description="Requirements and fit for your devices."
          >
            <div className="flex gap-2">
              <FitBadge status="green" />
              <DeckBadge category="playable" />
            </div>
          </SheetContent>
        </Sheet>
        <Sheet>
          <SheetTrigger asChild>
            <Button>Open bottom sheet</Button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            title="Filters"
            description="Narrow the list by fit and platform."
          >
            <Input placeholder="Search" icon={<Search size={14} strokeWidth={1.75} />} />
          </SheetContent>
        </Sheet>
      </Section>
    </main>
  );
}
