// Math Island — pieces shared by the game pages: progress + sound wiring, the header, sound/start-over bar,
// view-only and save notices. Same wording and behaviour as the Apple Basket page.
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { Progress } from './save';
import { CLIPS, Speaker } from './audio';
import type { Store } from '../doodle/storage';

export type L = { zh: string; en: string };
export const S = {
  island: { zh: '回到島上', en: 'Back to the island' },
  progress: { zh: '第 {n} 題／共 {t} 題', en: 'Problem {n} of {t}' },
  zhOnly: { zh: '', en: 'Preview: the questions and voice are in Traditional Chinese for now.' },
  listen: { zh: '聽一遍', en: 'Listen' },
  soundOn: { zh: '聲音：開', en: 'Sound: on' },
  soundOff: { zh: '聲音：關', en: 'Sound: off' },
  restart: { zh: '重來', en: 'Start over' },
  next: { zh: '下一題', en: 'Next' },
  cancel: { zh: '不拿了', en: 'Never mind' },
  viewOnly: { zh: '這一局正在另一個分頁玩，這裡先只看不改。', en: 'This game is open in another tab, so this tab only shows it.' },
  takeOver: { zh: '改在這裡玩', en: 'Play here instead' },
  uncoord: { zh: '這個瀏覽器無法協調多個分頁，請只開一個分頁玩。', en: 'This browser cannot coordinate tabs; please play in one tab only.' },
  saveFailed: { zh: '剛才的進度沒有存好，可以繼續玩；重新整理可能回到上一步。', en: 'Progress was not saved just now. You can keep playing; a reload may go back a step.' },
  noStorage: { zh: '這個瀏覽器現在不能存進度，可以照常玩，重新整理會從第一題開始。', en: 'This browser cannot save progress right now. Play on; a reload starts from problem 1.' },
  broken: { zh: '之前的進度讀不出來，已另外保留一份；這裡從第一題開始。', en: 'The earlier progress could not be read. A copy was kept; this starts from problem 1.' },
  brokenFuture: { zh: '之前的進度來自較新的版本，已另外保留一份；這裡從第一題開始。', en: 'The earlier progress is from a newer version. A copy was kept; this starts from problem 1.' },
  brokenNoBackup: { zh: '之前的進度讀不出來，也沒辦法另存一份，所以不會覆蓋它；這次的進度存在另一個位置。', en: 'The earlier progress could not be read or copied, so it is left untouched; this session saves elsewhere.' },
  brokenNoSave: { zh: '之前的進度讀不出來，也沒辦法另存一份，所以不會覆蓋它；這次的進度不會保存。', en: 'The earlier progress could not be read or copied, so it is left untouched; this session is not saved.' },
  restored: { zh: '找回了上次的進度。', en: 'Your last progress was found.' },
  noAudio: { zh: '這段聲音還沒準備好，可以看字；按「聽一遍」再試。', en: 'This sound is not ready yet. Read the words, or press Listen to try again.' },
  blocked: { zh: '按「聽一遍」就會播放。', en: 'Press Listen to hear it.' },
  allDone: { zh: '五題都完成了', en: 'All five problems done' },
  again: { zh: '再玩一次', en: 'Play again' },
  doneList: { zh: '你算出來的', en: 'What you worked out' },
};

export function useTr() {
  const { lang, to } = useI18n();
  const tr = (l: L, v?: Record<string, string | number>) => l[lang].replace(/\{(\w+)\}/g, (_, k) => String(v?.[k] ?? ''));
  return { lang, to, tr };
}

interface Cfg<T> {
  key: string;
  read: (get: () => string | null) => { kind: 'ok'; save: T } | { kind: 'empty' } | { kind: 'broken'; raw: string; cause: 'json' | 'schema' } | { kind: 'noStorage' };
  blank: () => T;
  valid: (x: unknown) => x is T;
}

/** Progress (single writer) + sound for one game page. */
export function useGame<T extends { voice: boolean }>(cfg: Cfg<T>, store?: Store) {
  const prog = useMemo(() => new Progress<T>(cfg, store), []); // eslint-disable-line react-hooks/exhaustive-deps
  const speaker = useMemo(() => new Speaker(), []);
  const subP = useCallback((f: () => void) => prog.subscribe(f), [prog]);
  const subS = useCallback((f: () => void) => speaker.subscribe(f), [speaker]);
  const ver = useRef(0);
  useSyncExternalStore(subP, () => `${prog.role}|${prog.status}|${JSON.stringify(prog.v)}|${ver.current}`, () => '');
  const audio = useSyncExternalStore(subS, () => speaker.state, () => 'idle' as const);
  useEffect(() => {
    prog.start();
    return () => prog.stop();
  }, [prog]);
  useEffect(() => () => speaker.stop(), [speaker]);
  const say = useCallback(
    (id: string, force = false) => {
      if (!(id in CLIPS)) return;
      if (!force && !prog.v.voice) return;
      speaker.play(id);
    },
    [prog, speaker],
  );
  const commit = (next: T) => {
    const ok = prog.commit(next);
    ver.current++;
    return ok;
  };
  return { prog, speaker, audio, say, commit, viewer: prog.role === 'viewer' };
}

/** Plays the first prompt by itself only when the child has already tapped (here or on the island). */
export function useGreeting(play: () => void) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const ua = (navigator as unknown as { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua?.hasBeenActive) play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function Header({ title, sub, index, total, finished }: { title: string; sub: string; index: number; total: number; finished: boolean }) {
  const { tr, to } = useTr();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to={to('/math')} className="mi-btn" data-testid="mi-back">
          <span aria-hidden="true">←</span> {tr(S.island)}
        </Link>
        {!finished && (
          <p className="text-lg font-bold" data-testid="mi-progress">
            {tr(S.progress, { n: index + 1, t: total })}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h1 className="text-2xl font-extrabold">{title}</h1>
        <p className="text-base">{sub}</p>
      </div>
    </div>
  );
}

export function SoundBar({ voice, viewer, onListen, onVoice, onRestart }: { voice: boolean; viewer: boolean; onListen: () => void; onVoice: () => void; onRestart?: () => void }) {
  const { tr } = useTr();
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="mi-btn" onClick={onListen} data-testid="mi-listen">
        {tr(S.listen)}
      </button>
      <button type="button" className="mi-btn" aria-pressed={voice} onClick={onVoice} disabled={viewer} data-testid="mi-voice">
        {tr(voice ? S.soundOn : S.soundOff)}
      </button>
      {onRestart && (
        <button type="button" className="mi-btn" onClick={onRestart} disabled={viewer} data-testid="mi-restart">
          {tr(S.restart)}
        </button>
      )}
    </div>
  );
}

export function Notices<T>({ prog, audio }: { prog: Progress<T>; audio: string }) {
  const { tr, lang } = useTr();
  const nmap: Record<string, L> = { broken: S.broken, brokenFuture: S.brokenFuture, brokenNoBackup: S.brokenNoBackup, brokenNoSave: S.brokenNoSave, noStorage: S.noStorage, restored: S.restored, altKept: S.restored };
  const list: { key: string; text: string }[] = [];
  if (prog.notice && nmap[prog.notice]) list.push({ key: `notice-${prog.notice}`, text: tr(nmap[prog.notice]) });
  if (prog.status === 'failed') list.push({ key: 'save-failed', text: tr(S.saveFailed) });
  if (prog.role === 'uncoordinated') list.push({ key: 'uncoord', text: tr(S.uncoord) });
  return (
    <>
      {lang === 'en' && <p className="text-base">{tr(S.zhOnly)}</p>}
      {prog.role === 'viewer' && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-[var(--mi-line)] bg-[var(--mi-surface)] p-3" role="status" data-testid="mi-view-only">
          <p className="flex-1 font-bold">{tr(S.viewOnly)}</p>
          <button type="button" className="mi-btn mi-btn-primary" onClick={() => prog.takeOver()} data-testid="mi-take-over">
            {tr(S.takeOver)}
          </button>
        </div>
      )}
      {list.map((n) => (
        <p key={n.key} className="rounded-lg border-2 border-[var(--mi-line)] bg-[var(--mi-surface)] p-3 text-base" role="status" data-testid={`mi-${n.key}`}>
          {n.text}
        </p>
      ))}
      {audio === 'missing' && (
        <p className="text-base" role="status" data-testid="mi-audio-missing">
          {tr(S.noAudio)}
        </p>
      )}
      {audio === 'blocked' && (
        <p className="text-base" role="status" data-testid="mi-audio-blocked">
          {tr(S.blocked)}
        </p>
      )}
    </>
  );
}

export function Feedback({ msg }: { msg: { text: string; kind: 'info' | 'hint' | 'ok' } | null }) {
  if (!msg) return null;
  return (
    <p
      className={`rounded-lg p-3 text-2xl font-bold ${msg.kind === 'hint' ? 'bg-[var(--mi-coral-bg)] text-[var(--mi-coral-text)]' : 'border-2 border-[var(--mi-line)] bg-[var(--mi-surface)]'}`}
      role="status"
      lang="zh-Hant"
      data-testid="mi-msg"
      data-kind={msg.kind}
    >
      {msg.kind === 'hint' && <span aria-hidden="true">↺ </span>}
      {msg.text}
    </p>
  );
}

export function Page({ children, testid, data }: { children: ReactNode; testid: string; data?: Record<string, string | number | boolean> }) {
  const attrs = Object.fromEntries(Object.entries(data ?? {}).map(([k, v]) => [`data-${k}`, String(v)]));
  return (
    <div className="mi rounded-lg px-3 py-4 sm:px-6 sm:py-6" data-testid={testid} {...attrs}>
      <div className="mx-auto flex max-w-4xl flex-col gap-4">{children}</div>
    </div>
  );
}
