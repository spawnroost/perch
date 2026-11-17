import { Navigate, useParams, useSearchParams } from 'react-router';
import { SimilarGames } from '@/components/organisms';
import { parseDevice, parseGameId } from '@/lib/forYou';

export function SimilarPage() {
  const igdbId = parseGameId(useParams().igdbId);
  const [params] = useSearchParams();
  if (igdbId === null) return <Navigate to="/" replace />;
  return <SimilarGames igdbId={igdbId} device={parseDevice(params.get('device'))} />;
}
