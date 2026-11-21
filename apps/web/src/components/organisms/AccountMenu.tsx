import { Link } from 'react-router';
import { CircleUser } from 'lucide-react';
import { Button, Notice, Sheet, SheetClose, SheetContent, SheetTrigger } from '../atoms';
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
        <Button variant="secondary" loading={signOut.pending} onClick={() => void signOut.run()}>
          Sign out
        </Button>
      </SheetContent>
    </Sheet>
  );
}
