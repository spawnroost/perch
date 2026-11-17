import { Navigate, useParams, useSearchParams } from 'react-router';
import { SimilarGames } from '@/components/organisms';
import { ALL_TAB, parseGameId } from '@/lib/forYou';

export function SimilarPage() {
  const igdbId = parseGameId(useParams().igdbId);
  const [params] = useSearchParams();
  if (igdbId === null) return <Navigate to="/" replace />;
  return <SimilarGames igdbId={igdbId} device={params.get('device') ?? ALL_TAB} />;
}
