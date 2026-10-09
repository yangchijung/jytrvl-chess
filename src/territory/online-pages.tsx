import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { Button, Card, PageTitle, Spinner } from '../components/ui';
import { OnlineTerritory } from './online';
import { TerritoryCanvas, useClient } from './TerritoryCanvas';
import { EndOverlay } from './EndOverlay';
import { PALETTE } from './render';
import { useAuth } from '../lib/auth';
import { useStableName } from './pages';
import type { BotLevel } from '../../shared/territory/ai';

function Lobby({ c }: { c: OnlineTerritory }) {
  const { t, to } = useI18n();
  const nav = useNavigate();
  const [copied, setCopied] = useState(false);
  const [level, setLevel] = useState<BotLevel>('medium');
  const l = c.lobby!;
  const isHost = l.mySeat !== null && l.mySeat === l.hostSeat;
  const url = `${location.origin}/territory/room/${l.id}`;
  return (
    <div className="space-y-4">
      <PageTitle>{t('tr.room.title')}</PageTitle>
      <Card className="mx-auto max-w-xl space-y-5">
        {l.kind === 'private' && (
          <div className="space-y-2">
            <p className="text-sm">{t('online.share')}</p>
            <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2">
              <code className="flex-1 truncate text-sm">{url}</code>
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    if (navigator.share) await navigator.share({ title: 'JY Games · Territory Rush', url });
                    else await navigator.clipboard.writeText(url);
                    setCopied(true);
                  } catch {
                    /* cancelled */
                  }
                }}
              >
                {copied ? t('ctl.copied') : t('ctl.copy')}
              </Button>
            </div>
            <p className="text-sm text-[var(--muted)]">
              {t('online.code')}: <span className="font-mono text-xl font-bold tracking-[0.3em] text-[var(--text)]">{l.id}</span>
            </p>
          </div>
        )}
        <div>
          <h2 className="mb-2 font-semibold">{t('tr.room.players', { n: l.seats.length })}</h2>
          <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
            {l.seats.map((s, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2">
                <span className="h-4 w-4 rounded" style={{ background: PALETTE[s.color % 8].base }} />
                <span className="flex-1 truncate">
                  {s.name}
                  {i === l.mySeat && ` (${t('online.you')})`}
                </span>
                {i === l.hostSeat && <span className="rounded bg-[var(--gold)] px-1.5 text-xs text-black">{t('tr.room.host')}</span>}
                {s.bot && <span className="text-xs text-[var(--muted)]">{t(`level.${s.level ?? 'medium'}`)}</span>}
                {!s.bot && !s.connected && <span className="text-xs text-[var(--danger)]">⚠</span>}
                {s.bot && isHost && (
                  <button type="button" className="text-sm text-[var(--danger)] underline" onClick={() => c.removeBot(i)}>
                    {t('tr.room.removeBot')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
        {isHost ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as BotLevel)}
                className="min-h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2"
                aria-label={t('tr.setup.level')}
              >
                {(['easy', 'medium', 'hard'] as BotLevel[]).map((v) => (
                  <option key={v} value={v}>
                    {t(`level.${v}`)}
                  </option>
                ))}
              </select>
              <Button variant="secondary" size="sm" disabled={l.seats.length >= 8} onClick={() => c.addBot(level)}>
                ＋ {t('tr.room.addBot')}
              </Button>
            </div>
            <Button size="lg" className="w-full" disabled={l.seats.length < 2} onClick={() => c.start()}>
              {t('tr.room.start')}
            </Button>
            {l.seats.length < 2 && <p className="text-center text-sm text-[var(--muted)]">{t('tr.room.needTwo')}</p>}
          </div>
        ) : (
          <Spinner label={t('tr.room.waitHost')} />
        )}
        <button type="button" className="w-full text-sm underline" onClick={() => nav(to('/territory'))}>
          {t('ctl.back')}
        </button>
      </Card>
    </div>
  );
}

function RoomView({ c }: { c: OnlineTerritory }) {
  const { t, to } = useI18n();
  const nav = useNavigate();
  useClient(c);
  if (c.error === 'room_not_found')
    return (
      <Card className="mx-auto max-w-md text-center">
        <p className="mb-4">{t('online.notFound')}</p>
        <Button onClick={() => nav(to('/territory'))}>{t('ctl.back')}</Button>
      </Card>
    );
  if (!c.lobby) return <Spinner label={t('online.connecting')} />;
  if (c.status === 'lobby' || !c.game) return <Lobby c={c} />;
  const isHost = c.lobby.mySeat !== null && c.lobby.mySeat === c.lobby.hostSeat;
  return (
    <div className="space-y-2">
      <h1 className="sr-only">{t('game.territory')}</h1>
      {c.conn === 'reconnecting' && (
        <p className="rounded-lg bg-[var(--warn-bg)] px-3 py-2 text-center text-sm" role="alert">
          {t('online.reconnecting')}
        </p>
      )}
      {c.lobby.mySeat === null && <p className="text-center text-sm text-[var(--muted)]">{t('tr.room.inProgress')}</p>}
      <TerritoryCanvas
        client={c}
        overlay={
          <EndOverlay
            client={c}
            onAgain={c.lobby.kind === 'private' && isHost ? () => c.again() : c.lobby.kind === 'match' ? () => nav(to('/territory/match')) : undefined}
            onBack={() => nav(to('/territory'))}
          />
        }
      />
    </div>
  );
}

export function TerritoryRoomPage() {
  const { id } = useParams();
  const { loading } = useAuth();
  const name = useStableName();
  const [c, setC] = useState<OnlineTerritory | null>(null);
  useEffect(() => {
    if (!id || loading) return;
    const ctl = new OnlineTerritory(`/api/territory/rooms/${id.toUpperCase()}/ws`, name);
    setC(ctl);
    return () => ctl.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loading]);
  if (!c) return <Spinner />;
  return <RoomView c={c} />;
}

export function TerritoryMatchPage() {
  const { t, to } = useI18n();
  const nav = useNavigate();
  const name = useStableName();
  const [waiting, setWaiting] = useState(1);
  const [err, setErr] = useState(false);
  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/api/territory/match/ws?name=${encodeURIComponent(name)}`);
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'queue') setWaiting(m.waiting);
      if (m.t === 'matched') nav(to(`/territory/room/${m.room}`));
    };
    ws.onclose = (e) => {
      if (e.code !== 1000) setErr(true);
    };
    const ping = setInterval(() => ws.readyState === 1 && ws.send('{"t":"ping"}'), 20000);
    return () => {
      clearInterval(ping);
      ws.close(1000);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="space-y-4">
      <PageTitle>{t('tr.mode.match')}</PageTitle>
      <Card className="mx-auto max-w-md space-y-4 text-center">
        <Spinner label={t('tr.match.searching', { n: waiting })} />
        <p className="text-sm text-[var(--muted)]">{t('tr.match.note')}</p>
        {err && <p className="text-[var(--danger)]">{t('err.network')}</p>}
        <Button variant="secondary" onClick={() => nav(to('/territory'))}>
          {t('mm.cancel')}
        </Button>
      </Card>
    </div>
  );
}
