import type { ReactNode } from 'react';
import { ArrowRight, Search, Trash2 } from 'lucide-react';
import type { DeckCategory, FitStatus } from '@perch/core';
import {
  Badge,
  Button,
  Card,
  DeckBadge,
  FitBadge,
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

const FIT: FitStatus[] = ['green', 'yellow', 'hidden', 'unknown'];
const DECK: DeckCategory[] = ['verified', 'playable', 'unsupported', 'unknown'];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-medium uppercase tracking-tight text-fg-subtle">{title}</h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}

// Temporary: atom gallery for visual review.
export function Showcase() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-8">
      <h1 className="text-2xl font-semibold tracking-display">Perch atoms</h1>

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
        <Badge tone="coral">Coral</Badge>
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
