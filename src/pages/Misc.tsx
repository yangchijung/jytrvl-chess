import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useI18n, type StringKey } from '../i18n';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/settings';
import { api } from '../lib/api';
import { Button, Card, PageTitle, Segmented, Spinner, Toggle } from '../components/ui';
import { LessonPlayer } from '../learn/LessonPlayer';
import { listLocalGames, deleteLocalGame } from '../lib/history';
import { GAME_IDS, type GameId } from '../../shared/types';
import { restoreRules, truncateState, type AnyState } from '../../shared/games/registry';
import { ChessBoard } from '../components/board/ChessBoard';
import { XiangqiBoard } from '../components/board/XiangqiBoard';
import { BanqiBoard } from '../components/board/BanqiBoard';
import { reviewGame, type Review } from '../game/coach';

export function Learn() {
  const { game } = useParams();
  const { t } = useI18n();
  const g = (GAME_IDS as string[]).includes(game ?? '') ? (game as GameId) : 'chess';
  return (
    <div className="space-y-4">
      <PageTitle>
        {t('learn.title')} · {t(`game.${g}`)}
      </PageTitle>
      <LessonPlayer key={g} game={g} />
    </div>
  );
}

export function Settings() {
  const { t } = useI18n();
  const { settings, update } = useSettings();
  return (
    <div className="space-y-4">
      <PageTitle>{t('settings.title')}</PageTitle>
      <Card className="max-w-xl space-y-4">
        <Segmented
          label={t('settings.theme')}
          value={settings.theme}
          onChange={(v) => update({ theme: v })}
          options={(['system', 'light', 'dark'] as const).map((v) => ({ value: v, label: t(`theme.${v}`) }))}
        />
        <Toggle checked={settings.sound} onChange={(v) => update({ sound: v })} label={t('settings.sound')} />
        <Toggle checked={settings.animation} onChange={(v) => update({ animation: v })} label={t('settings.animation')} />
        <Toggle checked={settings.hints} onChange={(v) => update({ hints: v })} label={t('settings.hints')} />
        <Toggle checked={settings.coords} onChange={(v) => update({ coords: v })} label={t('settings.coord')} />
        <GuestNameSetting />
      </Card>
    </div>
  );
}

function GuestNameSetting() {
  const { t, lang } = useI18n();
  const { me } = useAuth();
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('jychess.guestName') ?? '';
    } catch {
      return '';
    }
  });
  if (me?.kind === 'user') return null;
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-[var(--muted)]">
        {t('profile.nickname')} ({t('auth.guest')})
      </span>
      <input
        value={name}
        maxLength={20}
        placeholder={me?.nickname}
        onChange={(e) => {
          setName(e.target.value);
          try {
            localStorage.setItem('jychess.guestName', e.target.value);
          } catch {
            /* ignore */
          }
        }}
        className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus)]"
        aria-describedby="guest-note"
      />
      <span id="guest-note" className="mt-1 block text-xs text-[var(--muted)]">
        {lang === 'zh' ? '線上對戰時顯示的名稱。' : 'Shown to opponents in online games.'}
      </span>
    </label>
  );
}

export function Profile() {
  const { t, lang } = useI18n();
  const { me, login, logout, refresh } = useAuth();
  const [nick, setNick] = useState(me?.nickname ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => setNick(me?.nickname ?? ''), [me]);
  if (!me || me.kind !== 'user')
    return (
      <div className="space-y-4">
        <PageTitle>{t('profile.title')}</PageTitle>
        <Card className="max-w-lg space-y-3">
          <p>{t('profile.loginRequired')}</p>
          <p className="text-sm text-[var(--muted)]">{t('auth.guestNote')}</p>
          <Button onClick={() => login()}>{t('auth.login')}</Button>
        </Card>
      </div>
    );
  return (
    <div className="space-y-6">
      <PageTitle>{t('profile.title')}</PageTitle>
      <Card className="max-w-xl space-y-3">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api('/me', { method: 'PATCH', body: JSON.stringify({ nickname: nick }) });
              setMsg(t('profile.saved'));
              await refresh();
            } catch {
              setMsg(t('profile.nickname.invalid'));
            }
          }}
        >
          <label className="flex-1">
            <span className="mb-1 block text-sm font-semibold text-[var(--muted)]">{t('profile.nickname')}</span>
            <input
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              maxLength={20}
              className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus)]"
            />
          </label>
          <Button type="submit">{t('profile.save')}</Button>
        </form>
        {msg && <p role="status">{msg}</p>}
        {me.createdAt && (
          <p className="text-sm text-[var(--muted)]">
            {t('profile.since')}: {new Date(me.createdAt).toLocaleDateString(lang === 'zh' ? 'zh-TW' : 'en')}
          </p>
        )}
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        {GAME_IDS.map((g) => {
          const r = me.ratings?.[g];
          const total = r?.games ?? 0;
          return (
            <Card key={g}>
              <h2 className="font-serif text-xl font-bold">{t(`game.${g}`)}</h2>
              <p className="mt-2 text-3xl font-bold tabular-nums">{r?.rating ?? 1200}</p>
              <p className="text-sm text-[var(--muted)]">{t('profile.rating')}</p>
              <dl className="mt-3 grid grid-cols-2 gap-1 text-sm">
                <dt>{t('profile.games')}</dt>
                <dd className="text-right">{total}</dd>
                <dt>{t('profile.winRate')}</dt>
                <dd className="text-right">{total ? Math.round(((r?.wins ?? 0) / total) * 100) : 0}%</dd>
                <dt>
                  {t('profile.wins')} / {t('profile.losses')} / {t('profile.draws')}
                </dt>
                <dd className="text-right">
                  {r?.wins ?? 0} / {r?.losses ?? 0} / {r?.draws ?? 0}
                </dd>
              </dl>
            </Card>
          );
        })}
      </div>
      {me.territory && (
        <Card className="max-w-xl">
          <h2 className="font-serif text-xl font-bold">{t('tr.profile.title')}</h2>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
            {(
              [
                ['tr.lb.games', me.territory.games],
                ['tr.lb.wins', me.territory.wins],
                ['tr.lb.kills', me.territory.kills],
                ['tr.lb.bestPct', `${me.territory.best_pct}%`],
                ['tr.lb.score', me.territory.best_score],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-[var(--surface-2)] p-2 text-center">
                <dt className="text-xs text-[var(--muted)]">{t(k)}</dt>
                <dd className="text-xl font-bold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void logout()}>
          {t('auth.logout')}
        </Button>
        {!confirmDelete ? (
          <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
            {lang === 'zh' ? '刪除帳號' : 'Delete account'}
          </Button>
        ) : (
          <Button
            variant="danger"
            onClick={async () => {
              await api('/me', { method: 'DELETE' });
              await refresh();
            }}
          >
            {lang === 'zh' ? '確定永久刪除帳號與積分' : 'Permanently delete account and ratings'}
          </Button>
        )}
      </div>
    </div>
  );
}

interface OnlineRow {
  id: string;
  game: GameId;
  rated: number;
  counted: number;
  seat0_name: string;
  seat1_name: string;
  result: string;
  winner: number | null;
  reason: string;
  ended_at: number;
  mySeat: 0 | 1;
  rating_change: string | null;
}

export function History() {
  const { t, lang, to } = useI18n();
  const { me } = useAuth();
  const [local, setLocal] = useState(() => listLocalGames());
  const [online, setOnline] = useState<OnlineRow[] | null>(null);
  useEffect(() => {
    if (me?.kind !== 'user') return setOnline([]);
    api<{ games: OnlineRow[] }>('/history')
      .then((r) => setOnline(r.games))
      .catch(() => setOnline([]));
  }, [me]);
  const fmt = (ts: number) => new Date(ts).toLocaleString(lang === 'zh' ? 'zh-TW' : 'en', { dateStyle: 'medium', timeStyle: 'short' });
  const outcome = (kind: string, winner: number | null | undefined, mySeat: number | null) =>
    kind === 'draw' ? t('history.result.draw') : mySeat === null ? '—' : winner === mySeat ? t('history.result.win') : t('history.result.loss');
  return (
    <div className="space-y-8">
      <PageTitle>{t('history.title')}</PageTitle>
      <section>
        <h2 className="mb-3 text-xl font-semibold">{t('history.online')}</h2>
        {online === null ? (
          <Spinner />
        ) : online.length === 0 ? (
          <p className="text-[var(--muted)]">{me?.kind === 'user' ? t('history.empty') : t('profile.loginRequired')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="text-[var(--muted)]">
                <tr>
                  <th className="py-2">{t('history.date')}</th>
                  <th>{t('nav.play')}</th>
                  <th>{t('history.vs')}</th>
                  <th>{t('lb.rating')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {online.map((g) => {
                  let rc = '';
                  try {
                    const c = g.rating_change ? JSON.parse(g.rating_change) : null;
                    if (Array.isArray(c)) rc = `${c[g.mySeat].old} → ${c[g.mySeat].new}`;
                  } catch {
                    /* ignore */
                  }
                  return (
                    <tr key={g.id} className="border-t border-[var(--border)]">
                      <td className="py-2">{fmt(g.ended_at)}</td>
                      <td>{t(`game.${g.game}`)}</td>
                      <td>
                        {g.mySeat === 0 ? g.seat1_name : g.seat0_name} · <strong>{outcome(g.result, g.winner, g.mySeat)}</strong>
                        <span className="ml-1 text-[var(--muted)]">({t(`reason.${g.reason}` as StringKey)})</span>
                      </td>
                      <td>{rc}</td>
                      <td>
                        <Link className="underline" to={to(`/history/${g.id}`)}>
                          {t('history.replay')}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-3 text-xl font-semibold">{t('history.local')}</h2>
        {local.length === 0 ? (
          <p className="text-[var(--muted)]">{t('history.empty')}</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {local.map(({ id, save }) => {
              const res = save.result ?? restoreRules(save.state).result();
              const human = save.options.aiSeat === null ? null : save.options.aiSeat === 0 ? 1 : 0;
              return (
                <li key={id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="w-40 text-sm text-[var(--muted)]">{fmt(save.savedAt)}</span>
                  <span className="font-medium">{t(`game.${save.state.game}`)}</span>
                  <span className="text-sm">
                    {t(`mode.${save.options.mode}`)}
                    {save.options.aiSeat !== null && ` · ${t(`level.${save.options.level}`)}`}
                  </span>
                  <span className="text-sm">{res ? `${outcome(res.kind, res.winner, human)} · ${t(`reason.${res.reason}` as StringKey)}` : '…'}</span>
                  <span className="ml-auto flex gap-2">
                    <Link className="rounded-lg border border-[var(--border)] px-3 py-1 text-sm hover:bg-[var(--surface-2)]" to={to(`/play?load=${encodeURIComponent(id)}`)}>
                      {t('history.open')}
                    </Link>
                    <button
                      type="button"
                      className="rounded-lg px-3 py-1 text-sm text-[var(--danger)] hover:bg-[var(--surface-2)]"
                      onClick={() => {
                        deleteLocalGame(id);
                        setLocal(listLocalGames());
                      }}
                    >
                      {t('history.delete')}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export function Replay() {
  const { id } = useParams();
  const { t } = useI18n();
  const [state, setState] = useState<AnyState | null>(null);
  const [n, setN] = useState(0);
  const [err, setErr] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState<[number, number] | null>(null);
  useEffect(() => {
    api<{ state: AnyState }>(`/games/${id}`)
      .then((g) => {
        setState(g.state);
        setN(g.state.state.moves.length);
      })
      .catch(() => setErr(true));
  }, [id]);
  const rules = useMemo(() => (state ? restoreRules(truncateState(state, n)) : null), [state, n]);
  if (err) return <p>{t('err.notFound')}</p>;
  if (!state || !rules) return <Spinner />;
  const pos = rules.position();
  const noop = { legalFrom: () => [], move: () => false };
  const total = state.state.moves.length;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageTitle>{t('history.replay')}</PageTitle>
      <div className="mx-auto" style={{ maxWidth: pos.game === 'banqi' ? '48rem' : '34rem' }}>
        {pos.game === 'chess' ? (
          <ChessBoard fen={pos.fen} api={noop} lastMove={rules.lastMove()} checkSquare={rules.checkSquare()} interactive={false} />
        ) : pos.game === 'xiangqi' ? (
          <XiangqiBoard board={pos.board} positionKey={String(n)} api={noop} lastMove={rules.lastMove()} checkSquare={rules.checkSquare()} interactive={false} />
        ) : (
          <BanqiBoard cells={pos.view.cells} positionKey={String(n)} api={noop} lastMove={rules.lastMove()} interactive={false} />
        )}
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button variant="secondary" onClick={() => setN(0)} aria-label="start">
          ⏮
        </Button>
        <Button variant="secondary" onClick={() => setN(Math.max(0, n - 1))} aria-label="back">
          ◀
        </Button>
        <span className="w-20 text-center tabular-nums">
          {n}/{total}
        </span>
        <Button variant="secondary" onClick={() => setN(Math.min(total, n + 1))} aria-label="forward">
          ▶
        </Button>
        <Button variant="secondary" onClick={() => setN(total)} aria-label="end">
          ⏭
        </Button>
      </div>
      <input type="range" min={0} max={total} value={n} onChange={(e) => setN(Number(e.target.value))} className="w-full" aria-label={t('ctl.moves')} />
      {!review && !busy && state.game !== 'banqi' && (
        <Button
          onClick={async () => {
            setBusy([0, total]);
            setReview(await reviewGame(state, (a, b) => setBusy([a, b])));
            setBusy(null);
          }}
        >
          {t('end.analyse')}
        </Button>
      )}
      {busy && <Spinner label={t('coach.analysis.running', { n: busy[0], total: busy[1] })} />}
      {review && (
        <Card>
          <h2 className="mb-2 font-semibold">{t('coach.analysis.title')}</h2>
          {review.items.length === 0 ? (
            <p>{t('coach.analysis.none')}</p>
          ) : (
            <ul className="list-disc pl-5">
              {review.items
                .filter((i) => i.kind === 'blunder')
                .map((i) => (
                  <li key={i.ply}>
                    <button type="button" className="underline" onClick={() => setN(i.ply)}>
                      {t('coach.analysis.blunderAt', { n: i.ply, move: i.played, best: i.best ?? '—' })}
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

interface LbRow {
  nickname: string;
  rating: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

interface TLbRow {
  nickname: string;
  games: number;
  wins: number;
  kills: number;
  best_pct: number;
  best_score: number;
}

function TerritoryBoard() {
  const { t } = useI18n();
  const [sort, setSort] = useState<'score' | 'wins' | 'kills' | 'pct'>('score');
  const [rows, setRows] = useState<TLbRow[] | null>(null);
  useEffect(() => {
    setRows(null);
    api<{ rows: TLbRow[] }>(`/territory/leaderboard?sort=${sort}`)
      .then((r) => setRows(r.rows))
      .catch(() => setRows([]));
  }, [sort]);
  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--muted)]">{t('tr.lb.note')}</p>
      <div className="max-w-xl">
        <Segmented
          label={t('lb.rank')}
          value={sort}
          onChange={setSort}
          options={[
            { value: 'score', label: t('tr.lb.score') },
            { value: 'wins', label: t('tr.lb.wins') },
            { value: 'kills', label: t('tr.lb.kills') },
          ]}
        />
      </div>
      {rows === null ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="text-[var(--muted)]">{t('lb.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] max-w-3xl text-left">
            <thead className="text-sm text-[var(--muted)]">
              <tr>
                <th className="py-2">{t('lb.rank')}</th>
                <th>{t('lb.player')}</th>
                <th className="text-right">{t('tr.lb.score')}</th>
                <th className="text-right">{t('tr.lb.wins')}</th>
                <th className="text-right">{t('tr.lb.kills')}</th>
                <th className="text-right">{t('tr.lb.bestPct')}</th>
                <th className="text-right">{t('tr.lb.games')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-[var(--border)]">
                  <td className="py-2 font-semibold">{i + 1}</td>
                  <td>{r.nickname}</td>
                  <td className="text-right tabular-nums">{r.best_score}</td>
                  <td className="text-right tabular-nums">{r.wins}</td>
                  <td className="text-right tabular-nums">{r.kills}</td>
                  <td className="text-right tabular-nums">{r.best_pct}%</td>
                  <td className="text-right tabular-nums">{r.games}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function Leaderboard() {
  const { t } = useI18n();
  const [game, setGame] = useState<GameId | 'territory'>('chess');
  const [rows, setRows] = useState<LbRow[] | null>(null);
  useEffect(() => {
    if (game === 'territory') return;
    setRows(null);
    api<{ rows: LbRow[] }>(`/leaderboard?game=${game}`)
      .then((r) => setRows(r.rows))
      .catch(() => setRows([]));
  }, [game]);
  return (
    <div className="space-y-4">
      <PageTitle sub={game === 'territory' ? undefined : t('lb.note')}>{t('lb.title')}</PageTitle>
      <div className="max-w-2xl">
        <Segmented
          label={t('nav.play')}
          value={game}
          onChange={setGame}
          options={[...GAME_IDS.map((g) => ({ value: g as GameId | 'territory', label: t(`game.${g}`) })), { value: 'territory', label: t('game.territory') }]}
        />
      </div>
      {game === 'territory' ? (
        <TerritoryBoard />
      ) : rows === null ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="text-[var(--muted)]">{t('lb.empty')}</p>
      ) : (
        <table className="w-full max-w-2xl text-left">
          <thead className="text-sm text-[var(--muted)]">
            <tr>
              <th className="py-2">{t('lb.rank')}</th>
              <th>{t('lb.player')}</th>
              <th className="text-right">{t('lb.rating')}</th>
              <th className="text-right">{t('lb.games')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-[var(--border)]">
                <td className="py-2 font-semibold">{i + 1}</td>
                <td>{r.nickname}</td>
                <td className="text-right tabular-nums">{r.rating}</td>
                <td className="text-right tabular-nums">{r.games}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function NotFound() {
  const { t, to } = useI18n();
  return (
    <div className="py-20 text-center">
      <p className="font-serif text-6xl font-bold">404</p>
      <p className="mt-4">{t('err.notFound')}</p>
      <Link to={to('/')} className="mt-6 inline-block underline">
        {t('nav.home')}
      </Link>
    </div>
  );
}
