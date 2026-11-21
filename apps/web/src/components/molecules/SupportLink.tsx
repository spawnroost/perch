import { Coffee } from 'lucide-react';
import { Button } from '../atoms';

/** Tip link (Dodo Payments). Shows "coming soon" until VITE_SUPPORT_URL is set. */
const SUPPORT_URL = import.meta.env.VITE_SUPPORT_URL?.trim() || null;

export function SupportLink() {
  const icon = <Coffee size={16} strokeWidth={1.75} aria-hidden />;
  if (!SUPPORT_URL) {
    return (
      <Button variant="secondary" disabled aria-disabled>
        {icon}
        Buy me a coffee · coming soon
      </Button>
    );
  }
  return (
    <Button asChild variant="secondary">
      <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">
        {icon}
        Buy me a coffee
      </a>
    </Button>
  );
}
