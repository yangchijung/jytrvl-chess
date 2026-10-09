import { useI18n, type StringKey } from '../i18n';
import { useSettings } from '../lib/settings';
import { Button } from '../components/ui';
import { PALETTE } from '../territory/render';
import type { BlocksSession } from './session';
import { useBlocks } from './BlocksView';

const fmtMs = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}.${String(Math.floor((ms % 1000) / 10)).padStart(2, '0')}`;

export function BlocksEndOverlay({ session, onAgain, onBack, mySlotIdx }: { session: BlocksSession; onAgain?: () => void; onBack: () => void; mySlotIdx?: number | null }) {
  const { t } = useI18n();
  const { settings } = useSettings();
  useBlocks(session);
  const e = session.end;
  if (session.status !== 'ended' || !e) return null;
  const solo = e.solo;
  const me = mySlotIdx ?? null;
  const won = !solo && me !== null && e.winner === me;
  const lost = !solo && me !== null && e.winner !== null && e.winner !== me;
  const title = solo
    ? solo.result === 'goal'
      ? t('bl.end.cleared')
      : solo.result === 'time'
        ? t('bl.end.time')
        : t('sn.end.over')
    : won
      ? t('tr.end.win')
      : lost
        ? t('tr.end.lose')
        : e.winner !== null
          ? t('tr.end.winnerIs', { name: session.players[e.winner]?.name ?? '?' })
          : t('bl.end.draw');
  const sprint = solo && session.players[0]?.game.cfg.mode === 'sprint';
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-label={title}>
      {(won || (solo && e.record?.improved)) && settings.animation && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {Array.from({ length: 30 }, (_, i) => (
            <span key={i} className="absolute top-0 block h-3 w-2 rounded-sm" style={{ left: `${(i * 37) % 100}%`, background: PALETTE[i % 8].base, animation: `jy-fall ${2.2 + (i % 5) * 0.4}s linear ${(i % 7) * 0.25}s infinite` }} />
          ))}
        </div>
      )}
      <div className="relative w-full max-w-sm rounded-2xl bg-[var(--surface)] p-6 text-center text-[var(--text)] shadow-2xl" style={settings.animation ? { animation: lost ? 'jy-shake 0.5s ease-in-out' : 'jy-pop 0.45s ease-out' } : undefined}>
        <div className="text-5xl" aria-hidden="true">
          {won ? '🏆' : lost ? '💥' : solo?.result === 'goal' ? '🏁' : '🧱'}
        </div>
        <h2 className="mt-2 font-serif text-3xl font-bold">{title}</h2>
        {!solo && <p className="mt-1 text-[var(--muted)]">{t(`bl.end.reason.${e.reason}` as StringKey)}</p>}
        {solo && (
          <div className="mt-4 rounded-xl bg-[var(--surface-2)] p-3 text-sm">
            <p className="text-3xl font-bold tabular-nums">{sprint && solo.result === 'goal' ? fmtMs(solo.seconds * 1000) : solo.score.toLocaleString()}</p>
            <p>{t('bl.end.stats', { lines: solo.lines, score: solo.score.toLocaleString(), time: fmtMs(solo.seconds * 1000) })}</p>
            {e.record && (
              <p className="mt-1 font-semibold">
                {e.record.improved ? `🎉 ${t('sn.end.newBest')}` : sprint ? (e.record.bestMs ? t('bl.end.bestTime', { t: fmtMs(e.record.bestMs) }) : '') : t('sn.hud.best', { n: e.record.best.toLocaleString() })}
              </p>
            )}
            {e.saved === true && <p className="mt-1 text-xs text-[var(--muted)]">✓ {t('ar.recordSaved')}</p>}
            {e.saved === false && <p className="mt-1 text-xs text-[var(--danger)]">{t('ar.recordFailed')}</p>}
          </div>
        )}
        {!solo && (
          <ul className="mt-3 space-y-1 text-left text-sm">
            {session.players.map((p, i) => (
              <li key={i} className={`flex items-center gap-2 ${i === me ? 'font-bold' : ''}`}>
                <span className="w-5">{e.winner === i ? '🏆' : ''}</span>
                <span className="flex-1 truncate">{p.name}</span>
                <span className="tabular-nums text-[var(--muted)]">
                  {t('bl.hud.lines')} {p.game.lines} · ⚔ {p.game.stats.attack}
                </span>
                {e.ratingChange?.[i] && (
                  <span className={`tabular-nums ${e.ratingChange[i].new >= e.ratingChange[i].old ? 'text-[var(--ok)]' : 'text-[var(--danger)]'}`}>
                    {e.ratingChange[i].new} ({e.ratingChange[i].new >= e.ratingChange[i].old ? '+' : ''}
                    {e.ratingChange[i].new - e.ratingChange[i].old})
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {!solo && e.saved && <p className="mt-2 text-xs text-[var(--muted)]">✓ {t('ar.statsSaved')}</p>}
        <div className="mt-5 flex justify-center gap-2">
          {onAgain && <Button onClick={onAgain}>{t('tr.end.again')}</Button>}
          <Button variant="secondary" onClick={onBack}>
            {t('tr.end.back')}
          </Button>
        </div>
      </div>
    </div>
  );
}
