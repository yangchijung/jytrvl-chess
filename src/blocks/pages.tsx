import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n, type StringKey } from '../i18n';
import { Button, Card, PageTitle, Segmented } from '../components/ui';
import { loadJSON, saveJSON } from '../lib/settings';
import { useAuth } from '../lib/auth';
import type { BlocksLevel } from '../../shared/blocks/ai';
import { LocalBlocks, type LocalBlocksMode } from './local';
import { BlocksView } from './BlocksView';
import { BlocksEndOverlay } from './EndOverlay';
import { BLOCK_COLORS } from './render';
import { CONTROLS, DEFAULT_KEYS, DEFAULT_HANDLING, keyLabel, loadHandling, loadKeys, saveHandling, saveKeys, type Control, type KeyMap } from './keys';
import { JoinForm } from '../snake/pages';

export function BlocksPreview() {
  const rows = ['..........', '......3...', '.....333..', '1...44..77', '1..44.6.7.', '1222.66.7.', '1222255566'];
  return (
    <div className="grid aspect-[2/1] grid-cols-[repeat(10,1fr)] gap-[2px] overflow-hidden rounded-xl bg-[#1b2a41] p-[3%]" aria-hidden="true">
      {rows.flatMap((r, y) =>
        [...r].map((ch, x) => {
          const v = Number(ch);
          return <div key={`${x}-${y}`} className="rounded-[3px]" style={{ background: ch === '.' ? 'rgba(255,255,255,0.04)' : BLOCK_COLORS[v][0] }} />;
        }),
      )}
    </div>
  );
}

export function BlocksHub() {
  const { t, to } = useI18n();
  const options = [
    { icon: '🧱', title: 'bl.mode.classic', desc: 'bl.mode.classic.desc', href: '/blocks/play?mode=classic' },
    { icon: '♾️', title: 'bl.mode.marathon', desc: 'bl.mode.marathon.desc', href: '/blocks/play?mode=marathon' },
    { icon: '🏁', title: 'bl.mode.sprint', desc: 'bl.mode.sprint.desc', href: '/blocks/play?mode=sprint' },
    { icon: '⏱', title: 'bl.mode.ultra', desc: 'bl.mode.ultra.desc', href: '/blocks/play?mode=ultra' },
    { icon: '🤖', title: 'bl.mode.ai', desc: 'bl.mode.ai.desc', href: '/blocks/play?mode=ai' },
    { icon: '👨‍👩‍👧', title: 'bl.mode.local', desc: 'bl.mode.local.desc', href: '/blocks/play?mode=local' },
    { icon: '🔗', title: 'bl.mode.online', desc: 'bl.mode.online.desc', href: '/blocks/new-room' },
    { icon: '⚡', title: 'bl.mode.match', desc: 'bl.mode.match.desc', href: '/blocks/match' },
    { icon: '🏆', title: 'bl.mode.ranked', desc: 'bl.mode.ranked.desc', href: '/blocks/ranked' },
    { icon: '🎓', title: 'bl.mode.learn', desc: 'bl.mode.learn.desc', href: '/learn/blocks' },
  ] as const;
  return (
    <div className="space-y-8">
      <div className="grid items-center gap-6 md:grid-cols-[1fr_20rem]">
        <PageTitle sub={t('game.blocks.desc')}>{t('game.blocks')}</PageTitle>
        <BlocksPreview />
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
        <summary className="cursor-pointer font-semibold">📖 {t('bl.rules.title')}</summary>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          {([1, 2, 3, 4, 5, 6, 7] as const).map((n) => (
            <li key={n}>{t(`bl.rules.r${n}` as StringKey)}</li>
          ))}
        </ul>
      </details>
      <JoinForm base="/blocks/room" />
    </div>
  );
}

/** key remapping + handling (DAS/ARR) */
export function KeySettings() {
  const { t } = useI18n();
  const [keys, setKeys] = useState<KeyMap>(loadKeys);
  const [h, setH] = useState(loadHandling);
  const [listening, setListening] = useState<Control | null>(null);
  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.code !== 'Escape') {
        const next = { ...keys };
        for (const c of CONTROLS) next[c] = next[c].filter((k) => k !== e.code);
        next[listening] = [e.code];
        setKeys(next);
        saveKeys(next);
      }
      setListening(null);
    };
    window.addEventListener('keydown', onKey, { once: true });
    return () => window.removeEventListener('keydown', onKey);
  }, [listening, keys]);
  return (
    <details className="rounded-xl border border-[var(--border)] p-3">
      <summary className="cursor-pointer text-sm font-semibold">⌨️ {t('bl.keys.title')}</summary>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        {CONTROLS.map((c) => (
          <button key={c} type="button" onClick={() => setListening(c)} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${listening === c ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border)]'}`}>
            <span>{t(`bl.ctl.${c}` as StringKey)}</span>
            <span className="font-mono">{listening === c ? '…' : keys[c].map(keyLabel).join(' / ') || '—'}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <label>
          DAS {h.das} ms
          <input type="range" min={50} max={300} step={1} value={h.das} onChange={(e) => {
            const n = { ...h, das: Number(e.target.value) };
            setH(n);
            saveHandling(n);
          }} className="w-full" />
        </label>
        <label>
          ARR {h.arr} ms
          <input type="range" min={0} max={100} step={1} value={h.arr} onChange={(e) => {
            const n = { ...h, arr: Number(e.target.value) };
            setH(n);
            saveHandling(n);
          }} className="w-full" />
        </label>
      </div>
      <button
        type="button"
        className="mt-2 text-xs underline"
        onClick={() => {
          setKeys(DEFAULT_KEYS);
          saveKeys(DEFAULT_KEYS);
          setH(DEFAULT_HANDLING);
          saveHandling(DEFAULT_HANDLING);
        }}
      >
        {t('bl.keys.reset')}
      </button>
    </details>
  );
}

interface BSetup {
  level: BlocksLevel;
  startLevel: number;
}
const BKEY = 'jychess.blocks.setup.v1';

export function BlocksPlay() {
  const { t, to } = useI18n();
  const nav = useNavigate();
  const { me } = useAuth();
  const [params] = useSearchParams();
  const mode = (['classic', 'marathon', 'sprint', 'ultra', 'ai', 'local'].includes(params.get('mode') ?? '') ? params.get('mode') : 'marathon') as LocalBlocksMode;
  const [s, setS] = useState<BSetup>(() => loadJSON<BSetup>(BKEY, { level: 'easy', startLevel: 1 }));
  const up = (p: Partial<BSetup>) =>
    setS((x) => {
      const n = { ...x, ...p };
      saveJSON(BKEY, n);
      return n;
    });
  const [session, setSession] = useState<LocalBlocks | null>(null);
  useEffect(() => () => session?.dispose(), [session]);
  const solo = mode !== 'ai' && mode !== 'local';
  const levelPick = mode === 'classic' || mode === 'marathon';

  const start = () => {
    const names = mode === 'local' ? [t('tr.setup.name1'), t('tr.setup.name2')] : mode === 'ai' ? [me?.nickname ?? t('tr.hud.you'), `${t(`level.${s.level}`)} 🤖`] : [me?.nickname ?? t('tr.hud.you')];
    session?.dispose();
    setSession(new LocalBlocks({ mode, names, level: s.level, startLevel: levelPick ? s.startLevel : 1, ranked: solo && me?.kind === 'user' }));
  };

  if (session) {
    return (
      <div className="space-y-2">
        <h1 className="sr-only">{t('game.blocks')}</h1>
        <BlocksView
          session={session}
          extraHud={solo ? <span>{t(`bl.mode.${mode}` as StringKey)}</span> : null}
          overlay={<BlocksEndOverlay session={session} mySlotIdx={mode === 'ai' ? 0 : null} onAgain={() => void session.restart()} onBack={() => setSession(null)} />}
        />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <PageTitle sub={t(`bl.mode.${mode}.desc` as StringKey)}>{t(`bl.mode.${mode}` as StringKey)}</PageTitle>
      <Card className="mx-auto max-w-2xl space-y-6">
        <BlocksPreview />
        {mode === 'ai' && <Segmented label={t('tr.setup.level')} value={s.level} onChange={(v) => up({ level: v })} options={(['easy', 'medium', 'hard'] as BlocksLevel[]).map((l) => ({ value: l, label: t(`level.${l}`), desc: t(`bl.level.${l}.desc` as StringKey) }))} />}
        {levelPick && (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-[var(--muted)]">{t('bl.setup.startLevel')}</legend>
            <div className="flex flex-wrap gap-2">
              {[1, 3, 5, 8, 10, 15].map((n) => (
                <button key={n} type="button" onClick={() => up({ startLevel: n })} aria-pressed={s.startLevel === n} className={`h-11 w-11 rounded-xl border text-lg font-semibold ${s.startLevel === n ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border)]'}`}>
                  {n}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {solo && (
          <p className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm">
            {levelPick && s.startLevel !== 1 ? t('bl.setup.levelNote') : me?.kind === 'user' ? `🏆 ${t('ar.rankedOn')}` : t('ar.rankedLogin')}
          </p>
        )}
        {mode !== 'local' && <KeySettings />}
        <p className="text-sm text-[var(--muted)]">{mode === 'local' ? t('bl.hud.controls2p') : t('bl.hud.controls')}</p>
        <Button size="lg" className="w-full" onClick={start}>
          {t('tr.setup.start')}
        </Button>
        <button type="button" className="w-full text-sm underline" onClick={() => nav(to('/blocks'))}>
          {t('ctl.back')}
        </button>
      </Card>
    </div>
  );
}
