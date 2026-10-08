import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { Button, Card, PageTitle, Segmented, Spinner, Toggle } from '../components/ui';
import { useAuth } from '../lib/auth';
import { GAME_IDS, type GameId } from '../../shared/types';
import { guestName } from './Room';

const POOLS = [
  { minutes: 3, inc: 2 },
  { minutes: 5, inc: 3 },
  { minutes: 10, inc: 5 },
  { minutes: 15, inc: 10 },
];

export function Matchmaking() {
  const { t, to } = useI18n();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { me, login } = useAuth();
  const [game, setGame] = useState<GameId>((GAME_IDS as string[]).includes(params.get('game') ?? '') ? (params.get('game') as GameId) : 'chess');
  const [pool, setPool] = useState('1');
  const [rated, setRated] = useState(false);
  const [searching, setSearching] = useState(false);
  const [waited, setWaited] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => () => ws.current?.close(), []);
  useEffect(() => {
    if (!searching) return;
    const id = setInterval(() => setWaited((w) => w + 1), 1000);
    return () => clearInterval(id);
  }, [searching]);

  const start = () => {
    if (rated && me?.kind !== 'user') return login();
    const p = POOLS[Number(pool)];
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const sock = new WebSocket(
      `${proto}://${location.host}/api/match/ws?game=${game}&rated=${rated ? 1 : 0}&minutes=${p.minutes}&inc=${p.inc}&name=${encodeURIComponent(guestName())}`,
    );
    ws.current = sock;
    setSearching(true);
    setWaited(0);
    setError(null);
    sock.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'matched') {
        setSearching(false);
        nav(to(`/room/${m.room}`));
      }
    };
    sock.onclose = (e) => {
      if (e.code !== 1000) {
        setSearching(false);
        if (e.code !== 4000) setError(t('err.network'));
      }
    };
  };
  const cancel = () => {
    ws.current?.close(1000);
    setSearching(false);
  };

  return (
    <div className="space-y-4">
      <PageTitle>{t('mm.title')}</PageTitle>
      <Card className="mx-auto max-w-xl space-y-6">
        <Segmented label={t('nav.play')} value={game} onChange={setGame} options={GAME_IDS.map((g) => ({ value: g, label: t(`game.${g}`) }))} />
        <Segmented
          label={t('setup.time')}
          value={pool}
          onChange={setPool}
          options={POOLS.map((p, i) => ({ value: String(i), label: t('setup.time.fmt', { m: p.minutes, s: p.inc }) }))}
        />
        <div>
          <Toggle checked={rated} onChange={setRated} label={t('setup.rated')} />
          <p className="text-sm text-[var(--muted)]">{me?.kind === 'user' ? t('setup.rated.desc') : t('mm.rated.needLogin')}</p>
        </div>
        {searching ? (
          <div className="flex flex-col items-center gap-3">
            <Spinner label={t('mm.searching', { s: waited })} />
            <Button variant="secondary" onClick={cancel}>
              {t('mm.cancel')}
            </Button>
          </div>
        ) : (
          <Button size="lg" className="w-full" onClick={start}>
            {rated && me?.kind !== 'user' ? t('auth.login') : t('hub.match')}
          </Button>
        )}
        {error && (
          <p className="text-center text-[var(--danger)]" role="alert">
            {error}
          </p>
        )}
      </Card>
    </div>
  );
}
