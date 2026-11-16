import { useId, type ComponentProps } from 'react';
import { Input, Label } from '../atoms';

export interface FormFieldProps extends Omit<ComponentProps<typeof Input>, 'id'> {
  label: string;
  hint?: string;
  error?: string | null;
}

export function FormField({ label, hint, error, ...inputProps }: FormFieldProps) {
  const id = useId();
  const describedBy = error || hint ? `${id}-note` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...inputProps}
      />
      {(error || hint) && (
        <p id={describedBy} className={error ? 'text-xs text-fit-no' : 'text-xs text-fg-subtle'}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
