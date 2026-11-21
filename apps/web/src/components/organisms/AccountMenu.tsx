import { Link } from 'react-router';
import { CircleUser } from 'lucide-react';
import { Button, Notice, Sheet, SheetClose, SheetContent, SheetTrigger } from '../atoms';
import { SupportLink } from '../molecules';
import { useSignOut } from '@/hooks/useSignOut';
import { authClient } from '@/lib/auth-client';

export function AccountMenu() {
  const { data } = authClient.useSession();
  const signOut = useSignOut();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account">
          <CircleUser size={18} strokeWidth={1.75} aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent
        title="Account"
        description={data ? `Signed in as ${data.user.email}` : 'Signed in'}
      >
        {signOut.error && <Notice tone="error">{signOut.error}</Notice>}
        <SheetClose asChild>
          <Button asChild variant="secondary">
            <Link to="/me/card">Your taste card</Link>
          </Button>
        </SheetClose>
        <SheetClose asChild>
          <Button asChild variant="secondary">
            <Link to="/account">Account settings</Link>
          </Button>
        </SheetClose>
        <SupportLink />
        <Button variant="secondary" loading={signOut.pending} onClick={() => void signOut.run()}>
          Sign out
        </Button>
        <p className="flex gap-4 pt-2 text-xs text-fg-muted">
          <SheetClose asChild>
            <Link to="/privacy" className="underline underline-offset-4">
              Privacy
            </Link>
          </SheetClose>
          <SheetClose asChild>
            <Link to="/terms" className="underline underline-offset-4">
              Terms
            </Link>
          </SheetClose>
        </p>
      </SheetContent>
    </Sheet>
  );
}
