import { Button, Notice } from '../atoms';

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <Notice tone="error">{message}</Notice>
      <Button onClick={onRetry}>Try again</Button>
    </div>
  );
}
