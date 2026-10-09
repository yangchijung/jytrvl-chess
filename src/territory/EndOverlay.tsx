import type { TerritoryClient } from './client';
import { useI18n, type StringKey } from '../i18n';
import { useSettings } from '../lib/settings';
import { Button } from '../components/ui';
import { PALETTE } from './render';
import { useClient } from './TerritoryCanvas';

export function EndOverlay({ client, onAgain, onBack, againLabel }: { client: TerritoryClient; onAgain?: () => void; onBack: () => void; againLabel?: string }) {
  const { t } = useI18n();
  const { settings } = useSettings();
  useClient(client); // re-render on game updates even when passed as a stable element
  const g = client.game;
  const end = client.end;
  if (client.status !== 'ended' || !g || !end) return null;
  const total = g.w * g.h;
  const r = end.result;
  const myIdx = client.me.length === 1 ? client.me[0] : null;
  const won = myIdx !== null && r.winner === myIdx;
  const lost = myIdx !== null && !won;
  const title = won ? t('tr.end.win') : lost ? t('tr.end.lose') : r.winner !== null ? t('tr.end.winnerIs', { name: g.players[r.winner].name }) : t('tr.end.draw');
  const me = myIdx !== null ? g.players[myIdx] : null;
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-label={title}>
      {won && settings.animation && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {Array.from({ length: 36 }, (_, i) => (
            <span
              key={i}
              className="absolute top-0 block h-3 w-2 rounded-sm"
              style={{
                left: `${(i * 37) % 100}%`,
                background: PALETTE[i % 8].base,
                animation: `jy-fall ${2.2 + (i % 5) * 0.4}s linear ${(i % 7) * 0.25}s infinite`,
              }}
            />
          ))}
        </div>
      )}
      <div
        className="relative w-full max-w-sm rounded-2xl bg-[var(--surface)] p-6 text-center text-[var(--text)] shadow-2xl"
        style={settings.animation ? { animation: lost ? 'jy-shake 0.5s ease-in-out' : 'jy-pop 0.45s ease-out' } : undefined}
      >
        <div className="text-5xl" aria-hidden="true">
          {won ? '🏆' : lost ? '💥' : '⏱'}
        </div>
        <h2 className="mt-2 font-serif text-3xl font-bold">{title}</h2>
        <p className="mt-1 text-[var(--muted)]">{t(`tr.end.reason.${r.reason}` as StringKey)}</p>
        {me && (
          <div className="mt-4 rounded-xl bg-[var(--surface-2)] p-3 text-sm">
            <p className="font-semibold">{t('tr.end.yourRank', { n: r.ranking.indexOf(me.idx) + 1 })}</p>
            <p>{t('tr.end.yourStats', { pct: ((me.bestLand / total) * 100).toFixed(1), kills: me.kills, score: me.bestLand + me.kills * 50 })}</p>
          </div>
        )}
        <ol className="mt-3 space-y-1 text-left text-sm">
          {r.ranking.slice(0, 8).map((pi, i) => {
            const p = g.players[pi];
            return (
              <li key={pi} className={`flex items-center gap-2 ${client.me.includes(pi) ? 'font-bold' : ''}`}>
                <span className="w-5 tabular-nums">{i + 1}.</span>
                <span className="h-3 w-3 rounded-sm" style={{ background: PALETTE[p.color % 8].base }} />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="tabular-nums text-[var(--muted)]">{((p.bestLand / total) * 100).toFixed(1)}%</span>
              </li>
            );
          })}
        </ol>
        <div className="mt-5 flex justify-center gap-2">
          {onAgain && <Button onClick={onAgain}>{againLabel ?? t('tr.end.again')}</Button>}
          <Button variant="secondary" onClick={onBack}>
            {t('tr.end.back')}
          </Button>
        </div>
      </div>
    </div>
  );
}
