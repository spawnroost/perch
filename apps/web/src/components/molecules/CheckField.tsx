import type { ComponentProps } from 'react';

export interface CheckFieldProps extends Omit<ComponentProps<'input'>, 'type'> {
  label: string;
  /** Muted line under the label. */
  hint?: string;
}

/** A labelled checkbox: the whole row toggles it. */
export function CheckField({ label, hint, ...props }: CheckFieldProps) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" className="mt-0.5 size-4 accent-accent" {...props} />
      <span className="flex flex-col">
        <span className="text-sm text-fg">{label}</span>
        {hint ? <span className="text-xs text-fg-subtle">{hint}</span> : null}
      </span>
    </label>
  );
}
