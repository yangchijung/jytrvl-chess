import { useEffect, useState } from 'react';
import { useI18n, type StringKey } from '../i18n';
import { Segmented, Spinner } from '../components/ui';
import { api } from '../lib/api';

type Row = Record<string, string | number | null>;

function Table({ cols, rows }: { cols: { key: string; label: string; fmt?: (v: Row) => string }[]; rows: Row[] | null }) {
  const { t } = useI18n();
  if (rows === null) return <Spinner />;
  if (!rows.length) return <p className="text-[var(--muted)]">{t('lb.empty')}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] max-w-3xl text-left">
        <thead className="text-sm text-[var(--muted)]">
          <tr>
            <th className="py-2">{t('lb.rank')}</th>
            <th>{t('lb.player')}</th>
            {cols.map((c) => (
              <th key={c.key} className="text-right">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-[var(--border)]">
              <td className="py-2 font-semibold">{i + 1}</td>
              <td>{r.nickname}</td>
              {cols.map((c) => (
                <td key={c.key} className="text-right tabular-nums">
                  {c.fmt ? c.fmt(r) : (r[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const fmtMs = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}.${String(Math.floor((ms % 1000) / 10)).padStart(2, '0')}`;

function useRows(url: string) {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    setRows(null);
    api<{ rows: Row[] }>(url)
      .then((r) => setRows(r.rows))
      .catch(() => setRows([]));
  }, [url]);
  return rows;
}

export function SnakeBoard() {
  const { t } = useI18n();
  const [tab, setTab] = useState<'online' | 'classic' | 'survival' | 'timeattack'>('online');
  const rows = useRows(tab === 'online' ? '/arena/snake/leaderboard?board=online&sort=score' : `/arena/snake/leaderboard?board=solo&mode=${tab}`);
  return (
    <div className="space-y-3">
      <div className="max-w-2xl">
        <Segmented
          label={t('lb.board')}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'online', label: t('sn.mode.arena') },
            { value: 'classic', label: t('sn.mode.classic') },
            { value: 'survival', label: t('sn.mode.survival') },
            { value: 'timeattack', label: t('sn.mode.timeattack') },
          ]}
        />
      </div>
      <p className="text-sm text-[var(--muted)]">{t(tab === 'online' ? 'lb.arena.note' : 'lb.solo.note')}</p>
      {tab === 'online' ? (
        <Table
          rows={rows}
          cols={[
            { key: 'best_score', label: t('lb.col.score') },
            { key: 'best_len', label: t('lb.col.len') },
            { key: 'wins', label: t('tr.lb.wins') },
            { key: 'kills', label: t('tr.lb.kills') },
            { key: 'games', label: t('tr.lb.games') },
          ]}
        />
      ) : (
        <Table
          rows={rows}
          cols={[
            { key: 'best_score', label: t('lb.col.score') },
            { key: 'lines', label: t('lb.col.len') },
            { key: 'plays', label: t('lb.col.plays') },
          ]}
        />
      )}
    </div>
  );
}

export function BlocksBoard() {
  const { t } = useI18n();
  const [tab, setTab] = useState<'rating' | 'online' | 'classic' | 'marathon' | 'sprint' | 'ultra'>('rating');
  const url = tab === 'rating' ? '/arena/blocks/leaderboard?board=rating' : tab === 'online' ? '/arena/blocks/leaderboard?board=online&sort=wins' : `/arena/blocks/leaderboard?board=solo&mode=${tab}`;
  const rows = useRows(url);
  return (
    <div className="space-y-3">
      <div className="max-w-2xl">
        <Segmented
          label={t('lb.board')}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'rating', label: t('bl.mode.ranked') },
            { value: 'online', label: t('lb.blocks.online') },
            { value: 'classic', label: t('bl.mode.classic') },
            { value: 'marathon', label: t('bl.mode.marathon') },
            { value: 'sprint', label: t('bl.mode.sprint') },
            { value: 'ultra', label: t('bl.mode.ultra') },
          ]}
        />
      </div>
      <p className="text-sm text-[var(--muted)]">{t((tab === 'rating' ? 'lb.rating.note' : tab === 'online' ? 'lb.arena.note' : 'lb.solo.note') as StringKey)}</p>
      {tab === 'rating' ? (
        <Table
          rows={rows}
          cols={[
            { key: 'rating', label: t('lb.rating') },
            { key: 'wins', label: t('tr.lb.wins') },
            { key: 'games', label: t('lb.games') },
          ]}
        />
      ) : tab === 'online' ? (
        <Table
          rows={rows}
          cols={[
            { key: 'wins', label: t('tr.lb.wins') },
            { key: 'lines', label: t('lb.col.lines') },
            { key: 'attack', label: t('lb.col.attack') },
            { key: 'games', label: t('tr.lb.games') },
          ]}
        />
      ) : (
        <Table
          rows={rows}
          cols={
            tab === 'sprint'
              ? [
                  { key: 'best_ms', label: t('lb.col.time'), fmt: (r) => (r.best_ms ? fmtMs(Number(r.best_ms)) : '—') },
                  { key: 'plays', label: t('lb.col.plays') },
                ]
              : [
                  { key: 'best_score', label: t('lb.col.score'), fmt: (r) => Number(r.best_score).toLocaleString() },
                  { key: 'lines', label: t('lb.col.lines') },
                  { key: 'plays', label: t('lb.col.plays') },
                ]
          }
        />
      )}
    </div>
  );
}
