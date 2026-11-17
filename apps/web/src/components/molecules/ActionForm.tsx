import type { FormEvent, ReactNode } from 'react';
import { Button, Notice } from '../atoms';

export interface ActionFormProps {
  /** Receives the submitted fields; read values with `String(data.get(name))`. */
  onSubmit: (data: FormData, form: HTMLFormElement) => void;
  /** Fires when any field changes. */
  onChange?: () => void;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  /** Disables submit without showing a spinner, e.g. while another action is pending. */
  disabled?: boolean;
  /** Rendered below the submit button. */
  after?: ReactNode;
  children: ReactNode;
}

/** Form shell shared by the auth screens: fields, an error notice and a primary submit button. */
export function ActionForm({
  onSubmit,
  onChange,
  submitLabel,
  pending,
  error,
  disabled,
  after,
  children,
}: ActionFormProps) {
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit(new FormData(e.currentTarget), e.currentTarget);
  }

  return (
    <form onSubmit={handleSubmit} onChange={onChange} className="flex flex-col gap-4">
      {children}
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" variant="primary" loading={pending} disabled={disabled}>
        {submitLabel}
      </Button>
      {after}
    </form>
  );
}
