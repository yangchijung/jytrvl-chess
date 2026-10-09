import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { Button, Card, PageTitle, Segmented } from '../components/ui';
import { LocalTerritory } from './local';
import { TerritoryCanvas } from './TerritoryCanvas';
import { EndOverlay } from './EndOverlay';
import { PALETTE } from './render';
import { loadJSON, saveJSON } from '../lib/settings';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { BotLevel } from '../../shared/territory/ai';

export function TerritoryPreview() {
  // static illustration in the JY Chess style (not a screenshot of any other game)
  const cells = [
    '..AAAA......',
    '.AAAAAA..bb.',
    '.AAAAAaa.BBB',
    '..AAA..a.BBB',
    '.......aaBB.',
    '..CC........',
    '.CCCC...DD..',
    '..CC...DDDD.',
  ];
  const map: Record<string, string> = { A: PALETTE[0].land, a: PALETTE[0].base, B: PALETTE[2].land, b: PALETTE[2].base, C: PALETTE[1].land, D: PALETTE[3].land };
  return (
    <div className="grid aspect-[2/1] overflow-hidden rounded-xl bg-[#fffdf8] dark:bg-[#1a2333]" style={{ gridTemplateColumns: 'repeat(12, 1fr)' }} aria-hidden="true">
      {cells.flatMap((row, y) =>
        [...row].map((ch, x) => (
          <div key={`${x}-${y}`} style={{ background: map[ch] ?? 'transparent', opacity: ch === 'a' || ch === 'b' ? 0.7 : 1 }} className={ch === 'a' && x === 7 && y === 4 ? 'rounded-md ring-2 ring-white' : ''} />
        )),
      )}
    </div>
  );
}

export function TerritoryHub() {
  const { t, to, lang } = useI18n();
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const options = [
    { icon: '🤖', title: 'tr.mode.ai', desc: 'tr.mode.ai.desc', href: '/territory/play?mode=ai' },
    { icon: '👨‍👩‍👧', title: 'tr.mode.local', desc: 'tr.mode.local.desc', href: '/territory/play?mode=local' },
    { icon: '⚡', title: 'tr.mode.match', desc: 'tr.mode.match.desc', href: '/territory/match' },
    { icon: '🔗', title: 'tr.mode.room', desc: 'tr.mode.room.desc', href: '/territory/new-room' },
    { icon: '🎓', title: 'tr.mode.learn', desc: 'tr.mode.learn.desc', href: '/learn/territory' },
  ] as const;
  return (
    <div className="space-y-8">
      <div className="grid items-center gap-6 md:grid-cols-[1fr_20rem]">
        <PageTitle sub={t('game.territory.desc')}>
          {t('game.territory')} {lang === 'zh' && <span className="text-xl font-normal text-[var(--muted)]">Territory Rush</span>}
        </PageTitle>
        <TerritoryPreview />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((o) => (
          <Link
            key={o.title}
            to={to(o.href)}
            className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--card-shadow)] outline-none transition hover:-translate-y-0.5 hover:border-[var(--accent)] focus-visible:ring-4 focus-visible:ring-[var(--focus)]"
          >
            <div className="text-3xl" aria-hidden="true">
              {o.icon}
            </div>
            <h2 className="mt-2 text-lg font-semibold group-hover:text-[var(--accent-text)]">{t(o.title)}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{t(o.desc)}</p>
          </Link>
        ))}
      </div>
      <details className="max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <summary className="cursor-pointer font-semibold">📖 {t('tr.rules.title')}</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5">
          {([2, 3, 4, 5] as const).map((n) => (
            <li key={n}>
              <strong>{t(`tr.learn.s${n}.title`)}</strong>：{t(`tr.learn.s${n}.text`)}
            </li>
          ))}
        </ol>
      </details>
      <form
        className="flex max-w-md flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const c = code.trim().toUpperCase();
          if (/^[A-HJ-NP-Z2-9]{6}$/.test(c)) nav(to(`/territory/room/${c}`));
        }}
      >
        <label className="flex-1">
          <span className="mb-1 block text-sm font-semibold text-[var(--muted)]">{t('hub.join')}</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
            className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 font-mono text-lg tracking-widest uppercase outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus)]"
            placeholder="ABCD12"
            autoComplete="off"
            aria-label={t('online.code')}
          />
        </label>
        <Button type="submit">{t('hub.join.btn')}</Button>
      </form>
    </div>
  );
}

interface TSetup {
  bots: number;
  level: BotLevel;
  minutes: number;
}
const TSETUP_KEY = 'jychess.territory.setup.v1';

export function TerritoryPlay() {
  const { t, to } = useI18n();
  const nav = useNavigate();
  const { me } = useAuth();
  const [params] = useSearchParams();
  const mode = params.get('mode') === 'local' ? 'local' : 'ai';
  const [s, setS] = useState<TSetup>(() => loadJSON<TSetup>(TSETUP_KEY, { bots: 3, level: 'easy', minutes: 3 }));
  const up = (p: Partial<TSetup>) =>
    setS((x) => {
      const n = { ...x, ...p };
      saveJSON(TSETUP_KEY, n);
      return n;
    });
  const [client, setClient] = useState<LocalTerritory | null>(null);
  useEffect(() => () => client?.dispose(), [client]);

  const start = () => {
    const humans = mode === 'local' ? [{ name: t('tr.setup.name1') }, { name: t('tr.setup.name2') }] : [{ name: me?.nickname ?? t('tr.hud.you') }];
    client?.dispose();
    setClient(new LocalTerritory({ humans, bots: mode === 'local' ? Math.min(s.bots, 6) : Math.max(1, s.bots), level: s.level, durationMin: s.minutes }));
  };

  if (client) {
    return (
      <div className="space-y-2">
        <h1 className="sr-only">{t('game.territory')}</h1>
        <TerritoryCanvas client={client} overlay={<EndOverlay client={client} onAgain={() => client.restart()} onBack={() => setClient(null)} />} />
      </div>
    );
  }
  const botChoices = mode === 'local' ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 7];
  return (
    <div className="space-y-4">
      <PageTitle>{t(mode === 'local' ? 'tr.mode.local' : 'tr.mode.ai')}</PageTitle>
      <Card className="mx-auto max-w-2xl space-y-6">
        <TerritoryPreview />
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-[var(--muted)]">{t('tr.setup.bots')}</legend>
          <div className="flex flex-wrap gap-2">
            {botChoices.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => up({ bots: n })}
                aria-pressed={s.bots === n}
                className={`h-11 w-11 rounded-xl border text-lg font-semibold focus-visible:ring-4 focus-visible:ring-[var(--focus)] ${s.bots === n ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border)]'}`}
              >
                {n}
              </button>
            ))}
          </div>
        </fieldset>
        <Segmented
          label={t('tr.setup.level')}
          value={s.level}
          onChange={(v) => up({ level: v })}
          options={(['easy', 'medium', 'hard'] as BotLevel[]).map((l) => ({ value: l, label: t(`level.${l}`), desc: t(`tr.level.${l}.desc`) }))}
        />
        <Segmented
          label={t('tr.setup.duration')}
          value={String(s.minutes)}
          onChange={(v) => up({ minutes: Number(v) })}
          options={[2, 3, 5].map((m) => ({ value: String(m), label: t('tr.setup.minutes', { m }) }))}
        />
        <p className="text-sm text-[var(--muted)]">{mode === 'local' ? t('tr.hud.controls2p') : t('tr.hud.controls')}</p>
        <Button size="lg" className="w-full" onClick={start}>
          {t('tr.setup.start')}
        </Button>
        <button type="button" className="w-full text-sm underline" onClick={() => nav(to('/territory'))}>
          {t('ctl.back')}
        </button>
      </Card>
    </div>
  );
}

export function TerritoryNewRoom() {
  const { t, to } = useI18n();
  const nav = useNavigate();
  const [minutes, setMinutes] = useState('3');
  const [err, setErr] = useState<string | null>(null);
  const create = async () => {
    try {
      const r = await api<{ id: string }>('/territory/rooms', { method: 'POST', body: JSON.stringify({ minutes: Number(minutes) }) });
      nav(to(`/territory/room/${r.id}`));
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 429 ? t('err.rateLimit') : t('err.generic'));
    }
  };
  return (
    <div className="space-y-4">
      <PageTitle>{t('tr.mode.room')}</PageTitle>
      <Card className="mx-auto max-w-xl space-y-6">
        <Segmented label={t('tr.setup.duration')} value={minutes} onChange={setMinutes} options={[2, 3, 5].map((m) => ({ value: String(m), label: t('tr.setup.minutes', { m }) }))} />
        <Button size="lg" className="w-full" onClick={create}>
          {t('tr.mode.room')}
        </Button>
        {err && <p className="text-center text-[var(--danger)]">{err}</p>}
      </Card>
    </div>
  );
}

export function useStableName(): string {
  const { me } = useAuth();
  return useMemo(() => {
    if (me?.kind === 'user') return me.nickname;
    try {
      return localStorage.getItem('jychess.guestName') ?? '';
    } catch {
      return '';
    }
  }, [me]);
}
