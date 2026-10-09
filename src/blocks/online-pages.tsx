import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { Button, Card, LinkButton, PageTitle, Spinner } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useStableName } from '../territory/pages';
import { ArenaLobbyView, ArenaMatchView } from '../arena/Lobby';
import { OnlineBlocks } from './online';
import { BlocksView, useBlocks } from './BlocksView';
import { BlocksEndOverlay } from './EndOverlay';
import { KeySettings } from './pages';

function BlocksRoomView({ s }: { s: OnlineBlocks }) {
  const { t, to } = useI18n();
  const nav = useNavigate();
  useBlocks(s);
  const l = s.sock.lobby;
  if (s.sock.error === 'room_not_found')
    return (
      <Card className="mx-auto max-w-md text-center">
        <p className="mb-4">{t('online.notFound')}</p>
        <Button onClick={() => nav(to('/blocks'))}>{t('ctl.back')}</Button>
      </Card>
    );
  if (!l) return <Spinner label={t('online.connecting')} />;
  if (s.status === 'lobby' || !s.players.length)
    return (
      <div className="space-y-4">
        <ArenaLobbyView sock={s.sock} backTo="/blocks" title={t('bl.room.title')} />
        <div className="mx-auto max-w-xl">
          <KeySettings />
        </div>
      </div>
    );
  const isHost = l.mySeat !== null && l.mySeat === l.hostSeat;
  const again = l.kind === 'private' && isHost ? () => s.sock.again() : l.kind === 'match' ? () => nav(to('/blocks/match')) : l.kind === 'ranked' ? () => nav(to('/blocks/ranked')) : undefined;
  return (
    <div className="space-y-2">
      <h1 className="sr-only">{t('game.blocks')}</h1>
      {s.sock.conn === 'reconnecting' && (
        <p className="rounded-lg bg-[var(--warn-bg)] px-3 py-2 text-center text-sm" role="alert">
          {t('online.reconnecting')}
        </p>
      )}
      {l.mySeat === null && <p className="text-center text-sm text-[var(--muted)]">{t('tr.room.inProgress')}</p>}
      <BlocksView session={s} extraHud={l.kind === 'ranked' ? <span>🏆 {t('bl.mode.ranked')}</span> : null} overlay={<BlocksEndOverlay session={s} mySlotIdx={s.mySeat} onAgain={again} onBack={() => nav(to('/blocks'))} />} />
    </div>
  );
}

export function BlocksRoomPage() {
  const { id } = useParams();
  const { loading } = useAuth();
  const name = useStableName();
  const [s, setS] = useState<OnlineBlocks | null>(null);
  useEffect(() => {
    if (!id || loading) return;
    const ctl = new OnlineBlocks(`/api/arena/blocks/rooms/${id.toUpperCase()}/ws`, name);
    setS(ctl);
    return () => ctl.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loading]);
  if (!s) return <Spinner />;
  return <BlocksRoomView s={s} />;
}

export function BlocksMatchPage() {
  const { t } = useI18n();
  const name = useStableName();
  return <ArenaMatchView pool="blocks" title={t('bl.mode.match')} note={t('bl.match.note')} backTo="/blocks" roomBase="/blocks/room" name={name} />;
}

export function BlocksRankedPage() {
  const { t, to } = useI18n();
  const { me, loading } = useAuth();
  const name = useStableName();
  if (loading) return <Spinner />;
  if (me?.kind !== 'user')
    return (
      <div className="space-y-4">
        <PageTitle>{t('bl.mode.ranked')}</PageTitle>
        <Card className="mx-auto max-w-md space-y-4 text-center">
          <p>{t('bl.ranked.login')}</p>
          <LinkButton to={to('/blocks')} variant="secondary">
            {t('ctl.back')}
          </LinkButton>
        </Card>
      </div>
    );
  return <ArenaMatchView pool="blocks-ranked" title={t('bl.mode.ranked')} note={t('bl.ranked.note', { r: me.ratings?.blocks?.rating ?? 1200 })} backTo="/blocks" roomBase="/blocks/room" name={name} />;
}
