import { useParams } from 'react-router';
import { GameDetail } from '@/components/organisms';
import { parseGameId } from '@/lib/forYou';

export function GamePage() {
  const { id } = useParams();
  return <GameDetail igdbId={parseGameId(id)} />;
}
