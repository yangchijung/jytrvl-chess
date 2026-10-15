import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useI18n, type StringKey } from '../i18n';
import { Button, Card, LinkButton, Modal, Notice, PageTitle, Segmented } from '../components/ui';
import { DIFFICULTIES, type Difficulty } from '../../shared/sudoku/engine';
import { conflictCells } from '../../shared/sudoku/session';
import { SudokuBoard, type BoardModel } from './Board';
import { SudokuPreview } from './preview';
import { SudokuController, formatTime, type View } from './game';
import { records, savedDifficulty, saveDifficulty, type CompletionRecord } from './store';
import { TECHNIQUE_LABEL, cellName, stepText } from './hintText';

function useController() {
  const ctl = useMemo(() => new SudokuController(), []);
  useEffect(() => () => ctl.dispose(), [ctl]);
  const v = useSyncExternalStore(ctl.subscribe, ctl.snapshot, ctl.snapshot);
  return { ctl, v };
}

export function SudokuPage() {
  const { ctl, v } = useController();
  // expose for automated tests only (no secrets; local game state)
  useEffect(() => {
    (window as unknown as { __sudoku?: SudokuController }).__sudoku = ctl;
  }, [ctl]);
  if (v.phase === 'lobby') return <Lobby ctl={ctl} v={v} />;
  return <Game ctl={ctl} v={v} />;
}

// ---------- lobby ----------
function Lobby({ ctl, v }: { ctl: SudokuController; v: View }) {
  const { t, to } = useI18n();
  const [d, setD] = useState<Difficulty>(savedDifficulty);
  const [confirm, setConfirm] = useState(false);
  const pick = (x: Difficulty) => {
    setD(x);
    saveDifficulty(x);
  };
  const hasSave = !!v.s && v.s.status === 'playing';
  return (
    <div className="space-y-6">
      <div className="grid items-center gap-6 md:grid-cols-[1fr_20rem]">
        <PageTitle sub={`${t('sudoku.subtitle')} · ${t('game.sudoku.desc')}`}>{t('sudoku.title')}</PageTitle>
        <SudokuPreview />
      </div>
      <Card className="mx-auto max-w-2xl space-y-5" data-testid="sudoku-lobby">
        {v.invalidSave && <Notice kind="error">{t('sudoku.save.invalid')}</Notice>}
        {v.saveState === 'failed' && <Notice kind="warning">{t('sudoku.save.failed')}</Notice>}
        {hasSave ? (
          <div className="space-y-3">
            <p className="text-[var(--muted)]">
              {t(`sudoku.${v.s!.difficulty}` as StringKey)} · {formatTime(v.s!.activeElapsedMs)} · {t('sudoku.saved')}
            </p>
            <Button size="lg" className="w-full" onClick={() => ctl.resume()} data-testid="sudoku-continue">
              {t('sudoku.continue')}
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => setConfirm(true)}>
              {t('sudoku.new')}
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <DifficultyPicker value={d} onChange={pick} />
            <Button size="lg" className="w-full" onClick={() => ctl.startNew(d)} data-testid="sudoku-start">
              {t('sudoku.start')}
            </Button>
          </div>
        )}
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <Link to={to('/learn/sudoku')} className="inline-flex min-h-11 items-center underline">
            🎓 {t('sudoku.learn')}
          </Link>
          <span className="inline-flex min-h-11 items-center text-[var(--muted)]">{t('sudoku.rules.short')}</span>
        </div>
      </Card>
      <NewGameDialog open={confirm} onClose={() => setConfirm(false)} initial={d} onConfirm={(x) => (pick(x), setConfirm(false), ctl.startNew(x))} />
      <details className="mx-auto max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold">📖 {t('sudoku.title')}</summary>
        <p className="mt-2">{t('sudoku.rules')}</p>
      </details>
      <History />
    </div>
  );
}

function DifficultyPicker({ value, onChange }: { value: Difficulty; onChange: (d: Difficulty) => void }) {
  const { t } = useI18n();
  return <Segmented label={t('sudoku.difficulty')} value={value} onChange={onChange} options={DIFFICULTIES.map((x) => ({ value: x, label: t(`sudoku.${x}` as StringKey), desc: t(`sudoku.${x}.desc` as StringKey) }))} />;
}

function NewGameDialog({ open, onClose, initial, onConfirm }: { open: boolean; onClose: () => void; initial: Difficulty; onConfirm: (d: Difficulty) => void }) {
  const { t } = useI18n();
  const [d, setD] = useState<Difficulty>(initial);
  useEffect(() => setD(initial), [initial, open]);
  return (
    <Modal open={open} onClose={onClose} title={t('sudoku.new.title')}>
      <div className="space-y-4" data-testid="sudoku-new-dialog">
        <p className="text-[var(--muted)]">{t('sudoku.new.desc')}</p>
        <DifficultyPicker value={d} onChange={setD} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('sudoku.cancel')}
          </Button>
          <Button onClick={() => onConfirm(d)}>{t('sudoku.new.confirm')}</Button>
        </div>
      </div>
    </Modal>
  );
}

function History() {
  const { t, lang } = useI18n();
  const list = records();
  return (
    <section className="mx-auto max-w-2xl space-y-2" aria-labelledby="su-history">
      <h2 id="su-history" className="font-serif text-xl font-bold">
        {t('sudoku.history')}
      </h2>
      <p className="text-sm text-[var(--muted)]">{t('sudoku.history.local')}</p>
      {list.length === 0 ? (
        <p className="text-sm">{t('sudoku.records.empty')}</p>
      ) : (
        <ol className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]" data-testid="sudoku-history">
          {list.map((r: CompletionRecord) => (
            <li key={r.sessionId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className="font-semibold">{t(`sudoku.${r.difficulty}` as StringKey)}</span>
              <span className="tabular-nums">{formatTime(r.ms)}</span>
              <span>{r.assisted ? `${t('sudoku.assisted')}（${r.hints}）`.replace('（', lang === 'en' ? ' (' : '（').replace('）', lang === 'en' ? ')' : '）') : t('sudoku.unassisted')}</span>
              {r.replay && <span className="rounded bg-[var(--surface-2)] px-1.5">{t('sudoku.replayed')}</span>}
              <span className="ml-auto text-[var(--muted)]">{new Date(r.completedAt).toLocaleDateString(lang === 'zh' ? 'zh-TW' : 'en')}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ---------- game ----------
function Clock({ ctl, running }: { ctl: SudokuController; running: boolean }) {
  const { t } = useI18n();
  const [, force] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => force((x) => x + 1), 500);
    return () => clearInterval(id);
  }, [running]);
  return (
    <span className="font-serif text-2xl tabular-nums" aria-label={t('sudoku.time')} data-testid="sudoku-clock" role="timer">
      {formatTime(ctl.elapsed())}
    </span>
  );
}

function Game({ ctl, v }: { ctl: SudokuController; v: View }) {
  const { t, lang, to } = useI18n();
  const s = v.s!;
  const [confirmNew, setConfirmNew] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [more, setMore] = useState(false);
  const [viewBoard, setViewBoard] = useState(false);
  const running = v.phase === 'running';
  const conflicts = useMemo(() => conflictCells(s), [s]);
  const h = v.hint;
  const evidence = h?.kind === 'step' ? new Set(h.step.cells) : h?.kind === 'conflict' ? new Set(h.cells) : h?.kind === 'contradiction' ? new Set([h.cell]) : undefined;
  const targets = h?.kind === 'step' ? new Set(h.step.eliminate.map((e) => e.cell)) : undefined;
  const model: BoardModel = { givens: s.givens, entries: s.entries, notes: s.notes, sel: v.sel, conflicts, evidence, targets, readOnly: v.phase === 'complete' };
  const sectionRef = useRef<HTMLElement>(null);

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || (e.target as HTMLElement).closest('dialog')) return;
    if (!running) return;
    const k = e.key;
    let handled = true;
    if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z')) ctl.undo();
    else if (e.ctrlKey || e.metaKey || e.altKey) handled = false;
    else if (k === 'ArrowUp') ctl.move(-1, 0);
    else if (k === 'ArrowDown') ctl.move(1, 0);
    else if (k === 'ArrowLeft') ctl.move(0, -1);
    else if (k === 'ArrowRight') ctl.move(0, 1);
    else if (/^[1-9]$/.test(k)) ctl.digit(Number(k));
    else if (k === 'Backspace' || k === 'Delete') ctl.erase();
    else if (k === 'n' || k === 'N') ctl.toggleNotes();
    else handled = false;
    if (handled) e.preventDefault();
  };

  const status: ReactNode = v.msg ? t(v.msg) : conflicts.size ? t('sudoku.conflict') : null;
  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-serif text-3xl font-bold">{t('sudoku.title')}</h1>
        <p className="text-sm text-[var(--muted)]">
          {t(`sudoku.${s.difficulty}` as StringKey)} · 9 × 9 · {t('sudoku.hint.count', { count: s.hintsUsed })}
          {s.replay ? ` · ${t('sudoku.replayed')}` : ''}
        </p>
      </div>
      <div className="text-right">
        <Clock ctl={ctl} running={running} />
        <p className="text-xs text-[var(--muted)]" data-testid="sudoku-save" aria-live="polite">
          {v.saveState === 'saved' ? `✓ ${t('sudoku.saved')}` : v.saveState === 'failed' ? `⚠ ${t('sudoku.save.failed')}` : ''}
        </p>
      </div>
    </div>
  );

  if (v.phase === 'complete' && !viewBoard)
    return (
      <div className="space-y-4">
        {header}
        <Card className="mx-auto max-w-md space-y-4 text-center" data-testid="sudoku-complete">
          <div className="text-5xl" aria-hidden="true">
            🎉
          </div>
          <h2 className="font-serif text-3xl font-bold">{t('sudoku.complete')}</h2>
          <dl className="grid grid-cols-2 gap-2 text-left">
            <dt className="text-[var(--muted)]">{t('sudoku.level')}</dt>
            <dd>{t(`sudoku.${s.difficulty}` as StringKey)}</dd>
            <dt className="text-[var(--muted)]">{t('sudoku.time')}</dt>
            <dd className="tabular-nums">{formatTime(s.activeElapsedMs)}</dd>
            <dt className="text-[var(--muted)]">{t('sudoku.hints')}</dt>
            <dd>{s.hintsUsed}</dd>
          </dl>
          <p className="font-semibold">
            {s.assisted ? t('sudoku.assisted') : `✓ ${t('sudoku.unassisted')}`}
            {s.replay ? ` · ${t('sudoku.replayed')}` : ''}
          </p>
          <p className="text-xs text-[var(--muted)]">{t('sudoku.history.local')}</p>
          <div className="flex flex-col gap-2">
            <Button size="lg" onClick={() => ctl.startNew(s.difficulty)} data-testid="sudoku-next">
              {t('sudoku.next')}
            </Button>
            <Button variant="secondary" onClick={() => setViewBoard(true)}>
              {t('sudoku.viewBoard')}
            </Button>
            <Button variant="ghost" onClick={() => ctl.backToLobby()}>
              {t('sudoku.back')}
            </Button>
          </div>
        </Card>
      </div>
    );

  const sel = v.sel;
  const disabled = !running;
  return (
    <section ref={sectionRef} className="space-y-4" onKeyDown={onKey} aria-label={t('sudoku.title')} data-testid="sudoku-game" data-phase={v.phase} data-hints={s.hintsUsed} data-sel={sel} data-notes={v.notesMode ? 'on' : 'off'} data-zoom={v.zoom ? 'on' : 'off'}>
      {header}
      {v.phase === 'otherTab' && (
        <Notice kind="warning" actions={<Button onClick={() => ctl.resume()}>{t('sudoku.resume')}</Button>}>
          {t('sudoku.otherTab')}
        </Notice>
      )}
      {v.saveState === 'failed' && <Notice kind="warning">{t('sudoku.save.failed')}</Notice>}
      <div className="grid gap-5 md:grid-cols-[minmax(0,468px)_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-[468px] space-y-3">
          {v.zoom && running && (
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="su-box" className="text-sm font-semibold">
                {t('sudoku.box.choose')}
              </label>
              <select id="su-box" value={v.box} onChange={(e) => ctl.setBox(Number(e.target.value))} className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3">
                {Array.from({ length: 9 }, (_, b) => (
                  <option key={b} value={b}>
                    {t('sudoku.selectBox', { number: b + 1 })}
                  </option>
                ))}
              </select>
            </div>
          )}
          {running || v.phase === 'complete' ? (
            <SudokuBoard m={model} zoomBox={v.zoom && running ? v.box : null} onSelect={(i) => ctl.select(i)} />
          ) : (
            <div className="flex aspect-square w-full flex-col items-center justify-center gap-4 rounded-md border-2 border-[var(--text)] bg-[var(--surface)] p-6 text-center" data-testid="sudoku-paused">
              <strong className="font-serif text-2xl">{t('sudoku.paused.title')}</strong>
              <p className="text-[var(--muted)]">{t('sudoku.paused.desc')}</p>
              {v.phase === 'paused' && (
                <Button size="lg" onClick={() => ctl.resume()} autoFocus>
                  {t('sudoku.resume')}
                </Button>
              )}
            </div>
          )}
          {v.phase !== 'complete' && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" aria-pressed={v.zoom} disabled={disabled} onClick={() => ctl.toggleZoom()}>
                🔍 {v.zoom ? t('sudoku.overview') : t('sudoku.zoom')}
              </Button>
              <Button variant="secondary" disabled={disabled} onClick={() => ctl.pause()} data-testid="sudoku-pause">
                ⏸ {t('sudoku.pause')}
              </Button>
            </div>
          )}
          {v.phase === 'complete' && (
            <Button className="w-full" onClick={() => setViewBoard(false)}>
              {t('sudoku.complete')}
            </Button>
          )}
        </div>
        {v.phase !== 'complete' && (
          <div className="space-y-3">
            <p className="min-h-6 font-medium text-[var(--accent-text)]" aria-live="polite" data-testid="sudoku-selection">
              {t('sudoku.selection', { row: Math.floor(sel / 9) + 1, column: (sel % 9) + 1 })}
            </p>
            <div className="grid grid-cols-4 gap-2">
              <ToolButton icon="↶" label={t('sudoku.undo')} disabled={disabled || !s.history.length} onClick={() => ctl.undo()} testid="sudoku-undo" />
              <ToolButton icon="⌫" label={t('sudoku.erase')} disabled={disabled} onClick={() => ctl.erase()} testid="sudoku-erase" />
              <ToolButton icon="✎" label={v.notesMode ? t('sudoku.notes.on') : t('sudoku.notes.off')} pressed={v.notesMode} disabled={disabled} onClick={() => ctl.toggleNotes()} testid="sudoku-notes" />
              <ToolButton icon="💡" label={t('sudoku.hint')} disabled={disabled} onClick={() => ctl.requestHint()} testid="sudoku-hint" />
            </div>
            {v.notesMode && <p className="text-sm text-[var(--muted)]">{t('sudoku.notes.help')}</p>}
            <div className="grid grid-cols-5 gap-2 md:grid-cols-3" role="group" aria-label={t('sudoku.a11y.keypad')}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={disabled}
                  onClick={() => ctl.digit(d)}
                  data-digit={d}
                  className={`min-h-12 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-2xl font-medium outline-none hover:bg-[var(--surface-2)] focus-visible:ring-4 focus-visible:ring-[var(--focus)] disabled:opacity-40 ${v.notesMode ? 'text-[var(--muted)]' : 'text-[var(--accent-text)]'}`}
                >
                  {d}
                </button>
              ))}
            </div>
            <p className="min-h-6 text-sm text-[var(--muted)]" role="status">
              {status ?? (running ? t('sudoku.select.help') : '')}
            </p>
            {running && h && <HintPanel ctl={ctl} v={v} lang={lang} />}
            <div className="relative">
              <Button variant="ghost" className="w-full" aria-expanded={more} onClick={() => setMore((m) => !m)}>
                ⋯ {t('sudoku.more')}
              </Button>
              {more && (
                <div className="mt-2 grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2">
                  <Button variant="secondary" onClick={() => (setMore(false), setConfirmNew(true))}>
                    {t('sudoku.new')}
                  </Button>
                  <Button variant="secondary" onClick={() => (setMore(false), setConfirmRestart(true))}>
                    {t('sudoku.restart')}
                  </Button>
                  <LinkButton to={to('/learn/sudoku')} variant="secondary">
                    🎓 {t('sudoku.learn')}
                  </LinkButton>
                  <Button variant="ghost" onClick={() => ctl.backToLobby()}>
                    {t('sudoku.back')}
                  </Button>
                </div>
              )}
            </div>
            <p className="text-xs text-[var(--muted)]">
              {t('sudoku.rules.short')} · {s.assisted ? t('sudoku.assisted') : t('sudoku.unassisted')}
            </p>
          </div>
        )}
      </div>
      <NewGameDialog open={confirmNew} onClose={() => setConfirmNew(false)} initial={s.difficulty} onConfirm={(d) => (setConfirmNew(false), ctl.startNew(d))} />
      <Modal open={confirmRestart} onClose={() => setConfirmRestart(false)} title={t('sudoku.restart.title')}>
        <div className="space-y-4">
          <p className="text-[var(--muted)]">{t('sudoku.restart.desc')}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmRestart(false)}>
              {t('sudoku.cancel')}
            </Button>
            <Button onClick={() => (setConfirmRestart(false), ctl.restart())}>{t('sudoku.restart.confirm')}</Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}

function ToolButton({ icon, label, onClick, disabled, pressed, testid }: { icon: string; label: string; onClick: () => void; disabled?: boolean; pressed?: boolean; testid?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      data-testid={testid}
      className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 text-xs font-medium outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus)] disabled:opacity-40 sm:text-sm ${pressed ? 'border-[var(--accent-text)] bg-[var(--accent-soft)] text-[var(--accent-text)]' : 'border-[var(--border)] bg-[var(--surface)]'}`}
    >
      <span aria-hidden="true" className="text-lg leading-none">
        {icon}
      </span>
      {label}
    </button>
  );
}

function HintPanel({ ctl, v, lang }: { ctl: SudokuController; v: View; lang: 'zh' | 'en' }) {
  const { t } = useI18n();
  const h = v.hint!;
  let body: ReactNode = null;
  let action: ReactNode = null;
  let heading = t('sudoku.hint.title');
  if (h.kind === 'conflict') body = t('sudoku.hint.conflict');
  else if (h.kind === 'contradiction') body = t('sudoku.hint.contradiction', { row: Math.floor(h.cell / 9) + 1, column: (h.cell % 9) + 1 });
  else if (h.kind === 'unavailable') body = t('sudoku.hint.unavailable');
  else if (h.kind === 'step') {
    heading = `${t('sudoku.hint.title')} · ${TECHNIQUE_LABEL[h.step.technique][lang]}`;
    body = stepText(t, lang, h.step);
    action = h.step.place ? (
      <Button onClick={() => ctl.applyHint(h.step)} data-testid="sudoku-hint-apply">
        {t('sudoku.hint.apply')}
      </Button>
    ) : (
      <Button onClick={() => ctl.applyHint(h.step)} data-testid="sudoku-hint-apply">
        {t('sudoku.hint.eliminate')}
      </Button>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border-l-4 border-[var(--accent-text)] bg-[var(--surface)] p-3 shadow-[var(--card-shadow)]" data-testid="sudoku-hint-panel" data-kind={h.kind} data-technique={h.kind === 'step' ? h.step.technique : undefined}>
      <strong>{heading}</strong>
      <p>{body}</p>
      {h.kind === 'step' && h.step.place && <p className="text-xs text-[var(--muted)]">{cellName(lang, h.step.place.cell)}</p>}
      <div className="flex flex-wrap gap-2">
        {action}
        <Button variant="secondary" onClick={() => ctl.closeHint()}>
          {t('sudoku.hint.close')}
        </Button>
      </div>
    </div>
  );
}
