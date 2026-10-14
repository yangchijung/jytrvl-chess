import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { ConnBanner } from '../components/ConnBanner';
import { Button, Card, Spinner } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useStableName } from '../territory/pages';
import { ArenaLobbyView, ArenaMatchView } from '../arena/Lobby';
import { OnlineSnake } from './online';
import { SnakeCanvas, useSnakeClient } from './SnakeCanvas';
import { SnakeEndOverlay } from './EndOverlay';

function SnakeRoomView({ c }: { c: OnlineSnake }) {
  const { t, to } = useI18n();
  const nav = useNavigate();
  useSnakeClient(c);
  const l = c.sock.lobby;
  if (c.sock.error === 'room_not_found')
    return (
      <Card className="mx-auto max-w-md text-center">
        <p className="mb-4">{t('online.notFound')}</p>
        <Button onClick={() => nav(to('/snake'))}>{t('ctl.back')}</Button>
      </Card>
    );
  if (!l) return <Spinner label={t('online.connecting')} />;
  if (c.status === 'lobby' || !c.game) return <ArenaLobbyView sock={c.sock} backTo="/snake" title={t('sn.room.title')} />;
  const isHost = l.mySeat !== null && l.mySeat === l.hostSeat;
  return (
    <div className="space-y-2" data-room-status="game" data-my-seat={l.mySeat ?? 'spectator'} data-phase={c.sock.tracker.phase}>
      <h1 className="sr-only">{t('game.snake')}</h1>
      <ConnBanner phase={c.sock.tracker.phase} recovering={c.sock.tracker.recovering} recoveredAt={c.sock.tracker.recoveredAt} onRetry={() => c.sock.retryNow()} onLeave={() => nav(to('/snake'))} />
      {l.mySeat === null && <p className="text-center text-sm text-[var(--muted)]">{t('tr.room.inProgress')}</p>}
      <SnakeCanvas
        client={c}
        overlay={<SnakeEndOverlay client={c} onAgain={l.kind === 'private' && isHost ? () => c.sock.again() : l.kind === 'match' ? () => nav(to('/snake/match')) : undefined} onBack={() => nav(to('/snake'))} />}
      />
    </div>
  );
}

export function SnakeRoomPage() {
  const { id } = useParams();
  const { loading } = useAuth();
  const name = useStableName();
  const [c, setC] = useState<OnlineSnake | null>(null);
  useEffect(() => {
    if (!id || loading) return;
    const ctl = new OnlineSnake(`/api/arena/snake/rooms/${id.toUpperCase()}/ws`, name);
    setC(ctl);
    return () => ctl.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loading]);
  if (!c) return <Spinner />;
  return <SnakeRoomView c={c} />;
}

export function SnakeMatchPage() {
  const { t } = useI18n();
  const name = useStableName();
  return <ArenaMatchView pool="snake" title={t('sn.mode.arena')} note={t('sn.match.note')} backTo="/snake" roomBase="/snake/room" name={name} />;
}
