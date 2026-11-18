import { SectionHeading } from '../atoms';

/** A titled block of the game detail. */
export function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionHeading>{title}</SectionHeading>
      {children}
    </section>
  );
}
