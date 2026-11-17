import { Navigate, useParams, useSearchParams } from 'react-router';
import { ForYouShelf } from '@/components/organisms';
import { ALL_TAB, parseShelfKey } from '@/lib/forYou';

export function ForYouShelfPage() {
  const key = parseShelfKey(useParams().shelfKey);
  const [params] = useSearchParams();
  if (!key) return <Navigate to="/" replace />;
  return <ForYouShelf shelfKey={key} device={params.get('device') ?? ALL_TAB} />;
}
