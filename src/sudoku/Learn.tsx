// Short Sudoku tutorial: ① row ② column ③ box ④ single candidate ⑤ notes and hints.
// Each step needs a real action (enter the right digit / turn notes on and add a note) before moving on.
import { useMemo, useState } from 'react';
import { useI18n, type StringKey } from '../i18n';
import { Button, Card, LinkButton, Notice, PageTitle } from '../components/ui';
import { BANK } from '../../shared/sudoku/bank';
import { UNITS, boxOf, candidates, colOf, parseGrid, popcount, rowOf, digitsOf, bit } from '../../shared/sudoku/engine';
import { SudokuBoard } from './Board';

interface Lesson {
  text: StringKey;
  givens: string;
  target: number;
  answer: number | null; // null = notes step
  unit: number[];
}

function buildLessons(): Lesson[] {
  // the first easy puzzle whose givens contain a single candidate with ≥2 blanks left in its row, column and box
  let p = BANK[0];
  let single = -1;
  for (const x of BANK.filter((q) => q.difficulty === 'easy')) {
    const gg = parseGrid(x.givens);
    const cc = candidates(gg);
    const blanks = (u: number) => UNITS[u].filter((i) => !gg[i]).length;
    single = [...Array(81).keys()].find((i) => !gg[i] && popcount(cc[i]) === 1 && blanks(9 + rowOf(i)) >= 2 && blanks(18 + colOf(i)) >= 2 && blanks(boxOf(i)) >= 2) ?? -1;
    if (single >= 0) {
      p = x;
      break;
    }
  }
  const g = parseGrid(p.givens);
  const sol = parseGrid(p.solution);
  const c = candidates(g);
  // a unit lesson: the puzzle with that unit completed except one cell
  const unitLesson = (u: number, text: StringKey): Lesson => {
    const cells = UNITS[u];
    const target = cells.find((i) => !g[i])!;
    const gg = g.slice();
    for (const i of cells) if (i !== target) gg[i] = sol[i];
    return { text, givens: gg.join(''), target, answer: sol[target], unit: cells };
  };
  const firstUnit = (from: number) => {
    for (let u = from; u < from + 9; u++) if (UNITS[u].some((i) => !g[i])) return u;
    return from;
  };
  const noteCell = [...Array(81).keys()].find((i) => !g[i] && popcount(c[i]) >= 2) ?? g.findIndex((v) => !v);
  return [
    unitLesson(firstUnit(9), 'sudoku.teach.row'),
    unitLesson(firstUnit(18), 'sudoku.teach.column'),
    unitLesson(firstUnit(0), 'sudoku.teach.box'),
    { text: 'sudoku.teach.single', givens: p.givens, target: single, answer: digitsOf(c[single])[0], unit: [...UNITS[9 + rowOf(single)], ...UNITS[18 + colOf(single)], ...UNITS[boxOf(single)]] },
    { text: 'sudoku.teach.notes', givens: p.givens, target: noteCell, answer: null, unit: [] },
  ];
}

export function SudokuLearn() {
  const { t, to } = useI18n();
  const lessons = useMemo(buildLessons, []);
  const [idx, setIdx] = useState(0);
  const [entry, setEntry] = useState(0);
  const [notes, setNotes] = useState(0);
  const [notesMode, setNotesMode] = useState(false);
  const [state, setState] = useState<'idle' | 'ok' | 'retry'>('idle');
  const L = lessons[idx];
  const finished = idx >= lessons.length;
  const reset = (n: number) => {
    setIdx(n);
    setEntry(0);
    setNotes(0);
    setNotesMode(false);
    setState('idle');
  };
  const press = (d: number) => {
    if (state === 'ok') return;
    if (L.answer === null) {
      if (!notesMode) {
        setState('retry');
        return;
      }
      setNotes((n) => n ^ bit(d));
      setState('ok');
      return;
    }
    setEntry(d);
    setState(d === L.answer ? 'ok' : 'retry');
  };
  if (finished)
    return (
      <div className="space-y-4">
        <PageTitle>{t('sudoku.teach.title')}</PageTitle>
        <Card className="mx-auto max-w-md space-y-4 text-center" data-testid="sudoku-learn-done">
          <p className="text-lg">{t('sudoku.teach.done')}</p>
          <LinkButton to={to('/sudoku')}>{t('sudoku.start')}</LinkButton>
          <Button variant="secondary" onClick={() => reset(0)}>
            ↺ {t('sudoku.teach.title')}
          </Button>
        </Card>
      </div>
    );
  const entries = new Array(81).fill(0);
  if (L.answer !== null) entries[L.target] = entry;
  const noteArr = new Array(81).fill(0);
  noteArr[L.target] = notes;
  return (
    <div className="space-y-4" data-testid="sudoku-learn" data-step={idx + 1}>
      <PageTitle sub={`${idx + 1} / ${lessons.length}`}>{t('sudoku.teach.title')}</PageTitle>
      <div className="grid gap-5 md:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-[420px]">
          <SudokuBoard m={{ givens: L.givens, entries, notes: noteArr, sel: L.target, conflicts: new Set(), evidence: new Set(L.unit.filter((i) => i !== L.target)) }} zoomBox={null} onSelect={() => {}} />
        </div>
        <div className="space-y-3">
          <p className="text-lg font-medium">{t(L.text)}</p>
          {L.answer === null && <p className="text-sm text-[var(--muted)]">{t('sudoku.teach.toggleNotes')}</p>}
          <p className="text-sm text-[var(--accent-text)]">{t('sudoku.selection', { row: Math.floor(L.target / 9) + 1, column: (L.target % 9) + 1 })}</p>
          {L.answer === null && (
            <Button variant="secondary" aria-pressed={notesMode} onClick={() => setNotesMode((m) => !m)} data-testid="sudoku-learn-notes">
              ✎ {notesMode ? t('sudoku.notes.on') : t('sudoku.notes.off')}
            </Button>
          )}
          <div className="grid grid-cols-5 gap-2" role="group" aria-label={t('sudoku.a11y.keypad')}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
              <button key={d} type="button" data-digit={d} onClick={() => press(d)} className="min-h-12 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-2xl text-[var(--accent-text)] outline-none hover:bg-[var(--surface-2)] focus-visible:ring-4 focus-visible:ring-[var(--focus)]">
                {d}
              </button>
            ))}
          </div>
          {state === 'ok' && (
            <Notice kind="success" actions={<Button onClick={() => reset(idx + 1)} data-testid="sudoku-learn-next">{t('sudoku.teach.next')}</Button>}>
              {t('sudoku.teach.success')}
            </Notice>
          )}
          {state === 'retry' && <Notice kind="warning">{L.answer === null ? t('sudoku.teach.toggleNotes') : t('sudoku.teach.retry')}</Notice>}
        </div>
      </div>
    </div>
  );
}
