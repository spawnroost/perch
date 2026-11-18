import { SectionHeading } from '../atoms';

/** A titled block of the game detail. With `empty` set it shows that muted line instead of children. */
export function DetailSection({
  title,
  empty,
  children,
}: {
  title: string;
  empty?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <SectionHeading>{title}</SectionHeading>
      {empty ? <p className="text-sm text-fg-subtle">{empty}</p> : children}
    </section>
  );
}
