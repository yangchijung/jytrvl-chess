import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n, type StringKey } from '../i18n';
import { Button, Card, PageTitle, Segmented, Toggle } from '../components/ui';
import { loadJSON, saveJSON } from '../lib/settings';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PALETTE } from '../territory/render';
import { MAPS, type SnakeMap, type SnakeMode, type SpeedName } from '../../shared/snake/engine';
import type { SnakeLevel } from '../../shared/snake/ai';
import { LocalSnake } from './local';
import { SnakeCanvas } from './SnakeCanvas';
import { SnakeEndOverlay } from './EndOverlay';

export function SnakePreview() {
  // static illustration in the JY Games style
  const W = 12,
    H = 6;
  const body = [
    [2, 3],
    [3, 3],
    [4, 3],
    [5, 3],
    [5, 2],
    [6, 2],
    [7, 2],
  ];
  const rival = [
    [9, 5],
    [9, 4],
    [10, 4],
  ];
  return (
    <div className="relative aspect-[2/1] overflow-hidden rounded-xl bg-[#f7f3ea] dark:bg-[#141c2a]" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full">
        {Array.from({ length: W * H }, (_, i) => ((i % W) + Math.floor(i / W)) % 2 === 0 && <rect key={i} x={i % W} y={Math.floor(i / W)} width="1" height="1" fill="currentColor" className="text-black/[0.04] dark:text-white/[0.04]" />)}
        <polyline points={body.map(([x, y]) => `${x + 0.5},${y + 0.5}`).join(' ')} fill="none" stroke={PALETTE[0].base} strokeWidth="0.75" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={body.map(([x, y]) => `${x + 0.5},${y + 0.5}`).join(' ')} fill="none" stroke={PALETTE[0].land} strokeWidth="0.22" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={rival.map(([x, y]) => `${x + 0.5},${y + 0.5}`).join(' ')} fill="none" stroke={PALETTE[2].base} strokeWidth="0.75" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="8.5" cy="2.5" r="0.33" fill="#e4572e" />
        <circle cx="9.7" cy="1.4" r="0.33" fill="#e4572e" />
        <polygon points="3.5,0.6 3.68,1.05 4.15,1.05 3.77,1.32 3.92,1.78 3.5,1.5 3.08,1.78 3.23,1.32 2.85,1.05 3.32,1.05" fill="#f5b301" />
        <circle cx="7.62" cy="2.36" r="0.1" fill="#fff" />
        <circle cx="7.62" cy="2.64" r="0.1" fill="#fff" />
      </svg>
    </div>
  );
}

export function SnakeHub() {
  const { t, to } = useI18n();
  const options = [
    { icon: '🍎', title: 'sn.mode.classic', desc: 'sn.mode.classic.desc', href: '/snake/play?mode=classic' },
    { icon: '🧱', title: 'sn.mode.survival', desc: 'sn.mode.survival.desc', href: '/snake/play?mode=survival' },
    { icon: '⏱', title: 'sn.mode.timeattack', desc: 'sn.mode.timeattack.desc', href: '/snake/play?mode=timeattack' },
    { icon: '🤖', title: 'sn.mode.ai', desc: 'sn.mode.ai.desc', href: '/snake/play?mode=ai' },
    { icon: '👨‍👩‍👧', title: 'sn.mode.local', desc: 'sn.mode.local.desc', href: '/snake/play?mode=local' },
    { icon: '🔗', title: 'sn.mode.online', desc: 'sn.mode.online.desc', href: '/snake/new-room' },
    { icon: '🏟', title: 'sn.mode.arena', desc: 'sn.mode.arena.desc', href: '/snake/match' },
    { icon: '🎓', title: 'sn.mode.learn', desc: 'sn.mode.learn.desc', href: '/learn/snake' },
  ] as const;
  return (
    <div className="space-y-8">
      <div className="grid items-center gap-6 md:grid-cols-[1fr_20rem]">
        <PageTitle sub={t('game.snake.desc')}>{t('game.snake')}</PageTitle>
        <SnakePreview />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <summary className="cursor-pointer font-semibold">📖 {t('sn.rules.title')}</summary>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          {([1, 2, 3, 4, 5, 6] as const).map((n) => (
            <li key={n}>{t(`sn.rules.r${n}` as StringKey)}</li>
          ))}
        </ul>
      </details>
      <JoinForm base="/snake/room" />
    </div>
  );
}

export function JoinForm({ base }: { base: string }) {
  const { t, to } = useI18n();
  const nav = useNavigate();
  const [code, setCode] = useState('');
  return (
    <form
      className="flex max-w-md flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const c = code.trim().toUpperCase();
        if (/^[A-HJ-NP-Z2-9]{6}$/.test(c)) nav(to(`${base}/${c}`));
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
  );
}

export function ColorPicker({ label, value, onChange, taken }: { label: string; value: number; onChange: (c: number) => void; taken?: number }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-[var(--muted)]">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {PALETTE.map((p, i) => (
          <button
            key={i}
            type="button"
            disabled={taken === i}
            onClick={() => onChange(i)}
            aria-pressed={value === i}
            aria-label={`${label} ${i + 1}`}
            className={`h-10 w-10 rounded-full border-4 focus-visible:ring-4 focus-visible:ring-[var(--focus)] disabled:opacity-25 ${value === i ? 'border-[var(--text)]' : 'border-transparent'}`}
            style={{ background: p.base }}
          />
        ))}
      </div>
    </fieldset>
  );
}

interface SSetup {
  speed: SpeedName;
  map: SnakeMap;
  walls: boolean;
  bots: number;
  level: SnakeLevel;
  minutes: number;
  color: number;
  color2: number;
}
const SKEY = 'jychess.snake.setup.v1';
type PlayMode = 'classic' | 'survival' | 'timeattack' | 'ai' | 'local';

export function SnakePlay() {
  const { t, to } = useI18n();
  const nav = useNavigate();
  const { me } = useAuth();
  const [params] = useSearchParams();
  const pm = (['classic', 'survival', 'timeattack', 'ai', 'local'].includes(params.get('mode') ?? '') ? params.get('mode') : 'classic') as PlayMode;
  const [s, setS] = useState<SSetup>(() => loadJSON<SSetup>(SKEY, { speed: 'normal', map: 'open', walls: true, bots: 3, level: 'easy', minutes: 3, color: 0, color2: 2 }));
  const up = (p: Partial<SSetup>) =>
    setS((x) => {
      const n = { ...x, ...p };
      saveJSON(SKEY, n);
      return n;
    });
  const [client, setClient] = useState<LocalSnake | null>(null);
  useEffect(() => () => client?.dispose(), [client]);
  const solo = pm === 'classic' || pm === 'survival' || pm === 'timeattack';
  const mode: SnakeMode = solo ? pm : 'versus';
  const standard = solo && s.map === 'open' && s.walls && s.speed === 'normal';

  const start = () => {
    const humans = pm === 'local' ? [{ name: t('tr.setup.name1'), color: s.color }, { name: t('tr.setup.name2'), color: s.color2 === s.color ? (s.color + 1) % 8 : s.color2 }] : [{ name: me?.nickname ?? t('tr.hud.you'), color: s.color }];
    client?.dispose();
    setClient(
      new LocalSnake({
        mode,
        humans,
        bots: solo ? 0 : pm === 'local' ? Math.min(s.bots, 6) : Math.max(1, s.bots),
        level: s.level,
        speed: s.speed,
        map: s.map,
        walls: s.walls,
        minutes: s.minutes,
        ranked: standard && me?.kind === 'user',
      }),
    );
  };

  if (client) {
    return (
      <div className="space-y-2">
        <h1 className="sr-only">{t('game.snake')}</h1>
        <SnakeCanvas client={client} best={solo ? client.localBest() : undefined} overlay={<SnakeEndOverlay client={client} onAgain={() => void client.restart()} onBack={() => setClient(null)} />} />
      </div>
    );
  }
  const botChoices = pm === 'local' ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 7];
  return (
    <div className="space-y-4">
      <PageTitle sub={t(`sn.mode.${pm}.desc` as StringKey)}>{t(`sn.mode.${pm}` as StringKey)}</PageTitle>
      <Card className="mx-auto max-w-2xl space-y-6">
        {!solo && (
          <>
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
            <Segmented label={t('tr.setup.level')} value={s.level} onChange={(v) => up({ level: v })} options={(['easy', 'medium', 'hard'] as SnakeLevel[]).map((l) => ({ value: l, label: t(`level.${l}`), desc: t(`sn.level.${l}.desc` as StringKey) }))} />
            <Segmented label={t('tr.setup.duration')} value={String(s.minutes)} onChange={(v) => up({ minutes: Number(v) })} options={[2, 3, 5].map((m) => ({ value: String(m), label: t('tr.setup.minutes', { m }) }))} />
          </>
        )}
        <Segmented label={t('sn.setup.speed')} value={s.speed} onChange={(v) => up({ speed: v })} options={(['slow', 'normal', 'fast'] as SpeedName[]).map((v) => ({ value: v, label: t(`sn.speed.${v}` as StringKey) }))} />
        <Segmented label={t('sn.setup.map')} value={s.map} onChange={(v) => up({ map: v })} options={MAPS.map((m) => ({ value: m, label: t(`sn.map.${m}` as StringKey) }))} />
        {solo && <Toggle checked={s.walls} onChange={(v) => up({ walls: v })} label={t('sn.setup.walls')} />}
        <ColorPicker label={pm === 'local' ? t('sn.setup.color1') : t('sn.setup.color')} value={s.color} onChange={(c) => up({ color: c })} />
        {pm === 'local' && <ColorPicker label={t('sn.setup.color2')} value={s.color2} onChange={(c) => up({ color2: c })} taken={s.color} />}
        {solo && (
          <p className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm">
            {standard ? (me?.kind === 'user' ? `🏆 ${t('ar.rankedOn')}` : t('ar.rankedLogin')) : t('sn.setup.customNote')}
          </p>
        )}
        <p className="text-sm text-[var(--muted)]">{pm === 'local' ? t('tr.hud.controls2p') : t('sn.hud.controls')}</p>
        <Button size="lg" className="w-full" onClick={start}>
          {t('tr.setup.start')}
        </Button>
        <button type="button" className="w-full text-sm underline" onClick={() => nav(to('/snake'))}>
          {t('ctl.back')}
        </button>
      </Card>
    </div>
  );
}

export function ArenaNewRoom({ game }: { game: 'snake' | 'blocks' }) {
  const { t, to } = useI18n();
  const nav = useNavigate();
  const [minutes, setMinutes] = useState('3');
  const [map, setMap] = useState<SnakeMap>('open');
  const [err, setErr] = useState<string | null>(null);
  const create = async () => {
    try {
      const r = await api<{ id: string }>(`/arena/${game}/rooms`, { method: 'POST', body: JSON.stringify({ minutes: Number(minutes), map }) });
      nav(to(`/${game}/room/${r.id}`));
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 429 ? t('err.rateLimit') : t('err.generic'));
    }
  };
  return (
    <div className="space-y-4">
      <PageTitle>{t(game === 'snake' ? 'sn.mode.online' : 'bl.mode.online')}</PageTitle>
      <Card className="mx-auto max-w-xl space-y-6">
        {game === 'snake' && (
          <>
            <Segmented label={t('tr.setup.duration')} value={minutes} onChange={setMinutes} options={[2, 3, 5].map((m) => ({ value: String(m), label: t('tr.setup.minutes', { m }) }))} />
            <Segmented label={t('sn.setup.map')} value={map} onChange={(v) => setMap(v)} options={MAPS.map((m) => ({ value: m, label: t(`sn.map.${m}` as StringKey) }))} />
          </>
        )}
        <p className="text-sm text-[var(--muted)]">{t(game === 'snake' ? 'sn.room.note' : 'bl.room.note')}</p>
        <Button size="lg" className="w-full" onClick={create}>
          {t('ar.createRoom')}
        </Button>
        {err && <p className="text-center text-[var(--danger)]">{err}</p>}
      </Card>
    </div>
  );
}
