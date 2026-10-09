import { useI18n, type StringKey } from '../i18n';
import { useSettings } from '../lib/settings';
import { Button } from '../components/ui';
import { PALETTE } from '../territory/render';
import type { SnakeClient } from './client';
import { useSnakeClient } from './SnakeCanvas';

export function SnakeEndOverlay({ client, onAgain, onBack }: { client: SnakeClient; onAgain?: () => void; onBack: () => void }) {
  const { t } = useI18n();
  const { settings } = useSettings();
  useSnakeClient(client);
  const g = client.game;
  const end = client.end;
  if (client.status !== 'ended' || !g || !end) return null;
  const r = end.result;
  const versus = g.cfg.mode === 'versus';
  const myIdx = client.me.length === 1 ? client.me[0] : null;
  const won = versus && myIdx !== null && r.winner === myIdx;
  const me = myIdx !== null ? g.snakes[myIdx] : null;
  const title = !versus ? t('sn.end.over') : won ? t('tr.end.win') : myIdx !== null ? t('tr.end.lose') : r.winner !== null ? t('tr.end.winnerIs', { name: g.snakes[r.winner].name }) : t('tr.end.draw');
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-label={title}>
      {won && settings.animation && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {Array.from({ length: 30 }, (_, i) => (
            <span key={i} className="absolute top-0 block h-3 w-2 rounded-sm" style={{ left: `${(i * 37) % 100}%`, background: PALETTE[i % 8].base, animation: `jy-fall ${2.2 + (i % 5) * 0.4}s linear ${(i % 7) * 0.25}s infinite` }} />
          ))}
        </div>
      )}
      <div className="relative w-full max-w-sm rounded-2xl bg-[var(--surface)] p-6 text-center text-[var(--text)] shadow-2xl" style={settings.animation ? { animation: versus && !won ? 'jy-shake 0.5s ease-in-out' : 'jy-pop 0.45s ease-out' } : undefined}>
        <div className="text-5xl" aria-hidden="true">
          {won ? '🏆' : versus ? '💥' : '🐍'}
        </div>
        <h2 className="mt-2 font-serif text-3xl font-bold">{title}</h2>
        <p className="mt-1 text-[var(--muted)]">{t(`sn.end.reason.${r.reason}` as StringKey)}</p>
        {me && (
          <div className="mt-4 rounded-xl bg-[var(--surface-2)] p-3 text-sm">
            <p className="text-3xl font-bold tabular-nums">{me.score}</p>
            <p>{t('sn.end.stats', { len: me.maxLen, foods: me.foods, kills: me.kills })}</p>
            {end.record && (
              <p className="mt-1 font-semibold">
                {end.record.improved ? `🎉 ${t('sn.end.newBest')}` : t('sn.hud.best', { n: end.record.best })}
              </p>
            )}
            {end.saved === true && <p className="mt-1 text-xs text-[var(--muted)]">✓ {t('ar.recordSaved')}</p>}
            {end.saved === false && <p className="mt-1 text-xs text-[var(--danger)]">{t('ar.recordFailed')}</p>}
          </div>
        )}
        {versus && (
          <ol className="mt-3 space-y-1 text-left text-sm">
            {r.ranking.slice(0, 8).map((si, i) => {
              const s = g.snakes[si];
              return (
                <li key={si} className={`flex items-center gap-2 ${client.me.includes(si) ? 'font-bold' : ''}`}>
                  <span className="w-5 tabular-nums">{i + 1}.</span>
                  <span className="h-3 w-3 rounded-full" style={{ background: PALETTE[(client.colors[si] ?? s.color) % 8].base }} />
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="tabular-nums text-[var(--muted)]">{t('sn.hud.len')} {s.maxLen}</span>
                </li>
              );
            })}
          </ol>
        )}
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
