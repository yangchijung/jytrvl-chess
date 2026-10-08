import { useEffect, useState, useSyncExternalStore, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { OnlineController } from '../game/online';
import { GameScreen } from '../game/GameScreen';
import { Button, Card, Spinner } from '../components/ui';
import { useAuth } from '../lib/auth';

export function guestName(): string {
  try {
    return localStorage.getItem('jychess.guestName') ?? '';
  } catch {
    return '';
  }
}

function RoomInner({ c }: { c: OnlineController }) {
  const { t, to } = useI18n();
  const nav = useNavigate();
  const sub = useCallback((f: () => void) => c.subscribe(f), [c]);
  const snap = useSyncExternalStore(sub, () => c.snapshot());
  const [copied, setCopied] = useState(false);
  const url = `${location.origin}/room/${c.roomId}`;
  const o = snap.online!;

  if (o.error === 'room_not_found' || o.status === 'closed') {
    return (
      <Card className="mx-auto max-w-md text-center">
        <p className="mb-4">{t('online.notFound')}</p>
        <Button onClick={() => nav(to('/'))}>{t('end.home')}</Button>
      </Card>
    );
  }
  if (o.waiting) {
    return (
      <Card className="mx-auto max-w-lg space-y-4 text-center">
        <Spinner label={o.status === 'open' ? t('online.waiting') : t('online.connecting')} />
        <p>{t('online.share')}</p>
        <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2">
          <code className="flex-1 truncate text-left text-sm">{url}</code>
          <Button
            size="sm"
            onClick={async () => {
              try {
                if (navigator.share) await navigator.share({ title: 'JY Chess', url });
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
          {t('online.code')}: <span className="font-mono text-2xl font-bold tracking-[0.3em] text-[var(--text)]">{c.roomId}</span>
        </p>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {o.status === 'reconnecting' && (
        <p className="rounded-lg bg-[var(--warn-bg)] px-3 py-2 text-center text-sm" role="alert">
          {t('online.reconnecting')}
        </p>
      )}
      {o.opponentAwaySec !== null && !snap.result && (
        <p className="rounded-lg bg-[var(--warn-bg)] px-3 py-2 text-center text-sm" role="alert">
          {t('online.opponentLeft', { s: o.opponentAwaySec })}
        </p>
      )}
      {o.spectator && <p className="text-center text-sm text-[var(--muted)]">{t('online.spectator')}</p>}
      {o.error && o.error !== 'room_not_found' && (
        <p className="text-center text-sm text-[var(--danger)]" role="alert">
          {o.error === 'illegal' ? t('err.illegal') : o.error === 'not_your_turn' ? t('err.notYourTurn') : o.error === 'claim_invalid' ? t('claim.invalid') : o.error === 'rate_limited' ? t('err.rateLimit') : ''}
        </p>
      )}
      <GameScreen controller={c} onNewGame={() => nav(to(`/${snap.game}`))} title={t(`game.${snap.game}`)} />
    </div>
  );
}

export function Room() {
  const { id } = useParams();
  const { loading } = useAuth();
  const [c, setC] = useState<OnlineController | null>(null);
  useEffect(() => {
    if (!id || loading) return;
    const ctl = new OnlineController(id.toUpperCase(), guestName());
    setC(ctl);
    return () => ctl.dispose();
  }, [id, loading]);
  if (!c) return <Spinner />;
  return <RoomInner c={c} />;
}
