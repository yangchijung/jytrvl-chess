import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n';
import { Button, Card, PageTitle, Spinner } from '../components/ui';
import { PALETTE } from '../territory/render';
import type { ArenaLevel } from '../../realtime/src/arena/protocol';
import type { ArenaSocket } from './socket';

/** Shared waiting room for arena games (private rooms). */
export function ArenaLobbyView({ sock, backTo, title }: { sock: ArenaSocket; backTo: string; title: string }) {
  const { t, to } = useI18n();
  const nav = useNavigate();
  const [copied, setCopied] = useState(false);
  const [level, setLevel] = useState<ArenaLevel>('medium');
  const l = sock.lobby!;
  const isHost = l.mySeat !== null && l.mySeat === l.hostSeat;
  const url = `${location.origin}/${l.game}/room/${l.id}`;
  return (
    <div className="space-y-4">
      <PageTitle>{title}</PageTitle>
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
                    if (navigator.share) await navigator.share({ title: 'JY Games', url });
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
          <h2 className="mb-2 font-semibold">
            {t('tr.room.players', { n: l.seats.length })} / {l.maxSeats}
          </h2>
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
                  <button type="button" className="text-sm text-[var(--danger)] underline" onClick={() => sock.removeBot(i)}>
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
              <select value={level} onChange={(e) => setLevel(e.target.value as ArenaLevel)} className="min-h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2" aria-label={t('tr.setup.level')}>
                {(['easy', 'medium', 'hard'] as ArenaLevel[]).map((v) => (
                  <option key={v} value={v}>
                    {t(`level.${v}`)}
                  </option>
                ))}
              </select>
              <Button variant="secondary" size="sm" disabled={l.seats.length >= l.maxSeats} onClick={() => sock.addBot(level)}>
                ＋ {t('tr.room.addBot')}
              </Button>
            </div>
            <Button size="lg" className="w-full" disabled={l.seats.length < 2} onClick={() => sock.start()}>
              {t('tr.room.start')}
            </Button>
            {l.seats.length < 2 && <p className="text-center text-sm text-[var(--muted)]">{t('tr.room.needTwo')}</p>}
          </div>
        ) : (
          <Spinner label={t('tr.room.waitHost')} />
        )}
        <button type="button" className="w-full text-sm underline" onClick={() => nav(to(backTo))}>
          {t('ctl.back')}
        </button>
      </Card>
    </div>
  );
}

/** Public matchmaking waiting screen for arena pools. */
export function ArenaMatchView({ pool, title, note, backTo, roomBase, name }: { pool: string; title: string; note: string; backTo: string; roomBase: string; name: string }) {
  const { t, to } = useI18n();
  const nav = useNavigate();
  const [waiting, setWaiting] = useState(1);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/api/arena/match/ws?pool=${pool}&name=${encodeURIComponent(name)}`);
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'queue') setWaiting(m.waiting);
      if (m.t === 'matched') nav(to(`${roomBase}/${m.room}`));
    };
    ws.onclose = (e) => {
      if (e.code !== 1000) setErr(t('err.network'));
    };
    const ping = setInterval(() => ws.readyState === 1 && ws.send('{"t":"ping"}'), 20000);
    return () => {
      clearInterval(ping);
      ws.close(1000);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool]);
  return (
    <div className="space-y-4">
      <PageTitle>{title}</PageTitle>
      <Card className="mx-auto max-w-md space-y-4 text-center">
        <Spinner label={t('tr.match.searching', { n: waiting })} />
        <p className="text-sm text-[var(--muted)]">{note}</p>
        {err && <p className="text-[var(--danger)]">{err}</p>}
        <Button variant="secondary" onClick={() => nav(to(backTo))}>
          {t('mm.cancel')}
        </Button>
      </Card>
    </div>
  );
}
