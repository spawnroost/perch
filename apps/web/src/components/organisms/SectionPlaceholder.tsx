export function SectionPlaceholder({ title }: { title: string }) {
  return (
    <section className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-display text-fg">{title}</h1>
      <p className="text-base text-fg-muted">Coming soon.</p>
    </section>
  );
}
