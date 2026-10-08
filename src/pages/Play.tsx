import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { Button, Card, PageTitle, Segmented, Toggle } from '../components/ui';
import { LocalController, type LocalSave } from '../game/local';
import { GameScreen } from '../game/GameScreen';
import type { LocalOptions } from '../game/controller';
import { DEFAULT_TIME_CONTROLS, GAME_IDS, type GameId, type Seat, type TimeControl } from '../../shared/types';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { getLocalGame, isLocalSave } from '../lib/history';
import { GamePreview } from './Home';
import { loadJSON, saveJSON } from '../lib/settings';

type SetupMode = 'ai' | 'local' | 'practice' | 'room';
type Level = 'easy' | 'medium' | 'hard';
type Preset = 'taiwan' | 'taiwan_chain' | 'strict_rank';

interface SetupState {
  level: Level;
  side: 'first' | 'second' | 'random';
  time: number; // index into DEFAULT_TIME_CONTROLS
  allowUndo: boolean;
  coach: boolean;
  preset: Preset;
  rated: boolean;
}
const SETUP_KEY = 'jychess.setup.v1';

function sideLabels(t: ReturnType<typeof useI18n>['t'], game: GameId) {
  if (game === 'chess') return [t('side.white'), t('side.black')];
  if (game === 'xiangqi') return [t('side.red'), t('side.blackXq')];
  return [t('side.first'), t('side.second')];
}

function SetupForm({ game, mode, onStart }: { game: GameId; mode: SetupMode; onStart: (s: SetupState) => void }) {
  const { t } = useI18n();
  const { me, login } = useAuth();
  const [s, setS] = useState<SetupState>(() =>
    loadJSON<SetupState>(SETUP_KEY, { level: 'easy', side: 'first', time: 0, allowUndo: true, coach: false, preset: 'taiwan', rated: false }),
  );
  const up = (p: Partial<SetupState>) =>
    setS((x) => {
      const n = { ...x, ...p };
      saveJSON(SETUP_KEY, n);
      return n;
    });
  const [first, second] = sideLabels(t, game);
  const times = mode === 'room' ? DEFAULT_TIME_CONTROLS : DEFAULT_TIME_CONTROLS;
  const timeLabel = (tc: TimeControl) => (tc.minutes ? t('setup.time.fmt', { m: tc.minutes, s: tc.incrementSec }) : t('setup.time.none'));

  return (
    <Card className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-32 shrink-0">
          <GamePreview game={game} />
        </div>
        <div>
          <h2 className="font-serif text-2xl font-bold">{t(`game.${game}`)}</h2>
          <p className="text-[var(--muted)]">{t(mode === 'ai' ? 'mode.ai' : mode === 'local' ? 'mode.local' : mode === 'practice' ? 'mode.practice' : 'hub.room')}</p>
        </div>
      </div>
      {(mode === 'ai' || mode === 'practice') && (
        <Segmented
          label={t('setup.level')}
          value={s.level}
          onChange={(v) => up({ level: v })}
          options={(['easy', 'medium', 'hard'] as Level[]).map((l) => ({ value: l, label: t(`level.${l}`), desc: t(`level.${l}.desc`) }))}
        />
      )}
      {mode !== 'local' && (
        <Segmented
          label={t('setup.side')}
          value={s.side}
          onChange={(v) => up({ side: v })}
          options={[
            { value: 'first', label: first, desc: t('side.first') },
            { value: 'second', label: second, desc: t('side.second') },
            { value: 'random', label: t('side.random') },
          ]}
        />
      )}
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-[var(--muted)]">{t('setup.time')}</span>
        <select
          value={s.time}
          onChange={(e) => up({ time: Number(e.target.value) })}
          className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus)]"
        >
          {times.map((tc, i) => (
            <option key={i} value={i}>
              {timeLabel(tc)}
            </option>
          ))}
        </select>
      </label>
      {game === 'banqi' && !(mode === 'room' && s.rated) && (
        <Segmented
          label={t('setup.rules')}
          value={s.preset}
          onChange={(v) => up({ preset: v })}
          options={(['taiwan', 'taiwan_chain', 'strict_rank'] as Preset[]).map((p) => ({ value: p, label: t(`preset.${p}`) }))}
        />
      )}
      {mode === 'ai' && (
        <div className="space-y-1">
          <Toggle checked={s.allowUndo} onChange={(v) => up({ allowUndo: v })} label={t('setup.allowUndo')} />
          <Toggle checked={s.coach} onChange={(v) => up({ coach: v })} label={t('setup.coach')} />
        </div>
      )}
      {mode === 'room' && (
        <div>
          <Toggle checked={s.rated && me?.kind === 'user'} onChange={(v) => (me?.kind === 'user' ? up({ rated: v }) : login())} label={t('setup.rated')} />
          <p className="text-sm text-[var(--muted)]">{me?.kind === 'user' ? t('setup.rated.desc') : t('mm.rated.needLogin')}</p>
        </div>
      )}
      <Button size="lg" className="w-full" onClick={() => onStart(s)}>
        {t('setup.start')}
      </Button>
    </Card>
  );
}

let gameCounter = 0;

export function Play() {
  const { t, to } = useI18n();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { me } = useAuth();
  const game = params.get('game') as GameId | null;
  const mode = (params.get('mode') as SetupMode | null) ?? 'ai';
  const loadId = params.get('load');
  const [controller, setController] = useState<LocalController | null>(null);
  const [saveKey, setSaveKey] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState(false);

  useEffect(() => () => controller?.dispose(), [controller]);

  const startFromSave = (save: LocalSave, id: string) => {
    controller?.dispose();
    setSaveKey(id);
    setController(new LocalController(save.options, save));
  };

  useEffect(() => {
    if (!loadId) return;
    const s = getLocalGame(loadId);
    if (s) startFromSave(s, loadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadId]);

  const names = useMemo(() => {
    const you = me?.nickname ?? t('online.you');
    return { you, ai: (lvl: Level) => `${t('mode.ai')} · ${t(`level.${lvl}`)}` };
  }, [me, t]);

  const start = async (s: SetupState) => {
    if (!game) return;
    const time = DEFAULT_TIME_CONTROLS[s.time] ?? DEFAULT_TIME_CONTROLS[0];
    if (mode === 'room') {
      try {
        const r = await api<{ id: string }>('/rooms', {
          method: 'POST',
          body: JSON.stringify({ game, minutes: time.minutes, inc: time.incrementSec, banqiPreset: s.preset, rated: s.rated, side: s.side }),
        });
        nav(to(`/room/${r.id}`));
      } catch (e) {
        setError(e instanceof ApiError && e.status === 429 ? t('err.rateLimit') : t('err.generic'));
      }
      return;
    }
    let humanSeat: Seat = s.side === 'second' ? 1 : 0;
    if (s.side === 'random') humanSeat = Math.random() < 0.5 ? 0 : 1;
    const aiSeat: Seat | null = mode === 'local' ? null : humanSeat === 0 ? 1 : 0;
    const playerNames: [string, string] =
      aiSeat === null ? [sideLabels(t, game)[0], sideLabels(t, game)[1]] : aiSeat === 0 ? [names.ai(s.level), names.you] : [names.you, names.ai(s.level)];
    const opts: LocalOptions = {
      game,
      mode: mode === 'practice' ? 'practice' : mode === 'local' ? 'local' : 'ai',
      aiSeat,
      level: s.level,
      time: mode === 'practice' ? DEFAULT_TIME_CONTROLS[0] : time,
      allowUndo: mode === 'practice' || mode === 'local' ? true : s.allowUndo,
      coach: mode === 'practice' ? true : s.coach,
      banqiPreset: s.preset,
      playerNames,
    };
    controller?.dispose();
    setSaveKey(`${Date.now().toString(36)}-${++gameCounter}`);
    setController(new LocalController(opts));
  };

  const loadFile = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      if (!isLocalSave(data)) throw new Error('bad');
      startFromSave(data, `${Date.now().toString(36)}-file`);
      setFileError(false);
    } catch {
      setFileError(true);
    }
  };

  if (controller) {
    return (
      <GameScreen
        key={saveKey}
        controller={controller}
        localSaveKey={saveKey}
        title={t(`game.${controller.opts.game}`)}
        onNewGame={() => {
          controller.dispose();
          setController(null);
        }}
      />
    );
  }

  if (!game || !GAME_IDS.includes(game)) {
    return (
      <div className="space-y-6">
        <PageTitle>{t('nav.play')}</PageTitle>
        <div className="grid gap-5 md:grid-cols-3">
          {GAME_IDS.map((g) => (
            <Link key={g} to={to(`/${g}`)} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 hover:border-[var(--accent)] focus-visible:ring-4 focus-visible:ring-[var(--focus)]">
              <GamePreview game={g} />
              <h2 className="mt-3 font-serif text-xl font-bold">{t(`game.${g}`)}</h2>
            </Link>
          ))}
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2">
          📂 {t('ctl.load')}
          <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} />
        </label>
        {fileError && <p className="text-[var(--danger)]">{t('err.loadFailed')}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageTitle>{t('setup.title')}</PageTitle>
      <SetupForm game={game} mode={mode} onStart={start} />
      {error && (
        <p className="text-center text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
      <div className="text-center">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm text-[var(--muted)] hover:bg-[var(--surface-2)]">
          📂 {t('ctl.load')}
          <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} />
        </label>
        {fileError && <p className="text-[var(--danger)]">{t('err.loadFailed')}</p>}
      </div>
    </div>
  );
}
