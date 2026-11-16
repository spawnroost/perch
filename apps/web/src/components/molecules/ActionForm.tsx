import type { FormEvent, ReactNode } from 'react';
import { Button, Notice } from '../atoms';

export interface ActionFormProps {
  /** Receives the submitted fields; read values with `String(data.get(name))`. */
  onSubmit: (data: FormData) => void;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  /** Rendered below the submit button. */
  after?: ReactNode;
  children: ReactNode;
}

/** Form shell shared by the auth screens: fields, an error notice and a primary submit button. */
export function ActionForm({
  onSubmit,
  submitLabel,
  pending,
  error,
  after,
  children,
}: ActionFormProps) {
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit(new FormData(e.currentTarget));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {children}
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" variant="primary" loading={pending}>
        {submitLabel}
      </Button>
      {after}
    </form>
  );
}
