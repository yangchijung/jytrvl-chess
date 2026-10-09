// Interactive Block Puzzle Battle tutorial: each step uses the real engine and completes only when the
// learner performs the requested action.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { W, H } from '../../shared/blocks/engine';
import { useI18n, type StringKey } from '../i18n';
import { Button } from '../components/ui';
import { LocalBlocks } from './local';
import { BlocksView, useBlocks } from './BlocksView';

type Step = 1 | 2 | 3 | 4 | 5 | 6;

function fillRows(s: LocalBlocks, rows: string[]) {
  const g = s.players[0].game;
  g.board.fill(0);
  rows.forEach((r, i) => {
    const y = H - rows.length + i;
    for (let x = 0; x < W; x++) if (r[x] === '#') g.board[y * W + x] = 8;
  });
}

function make(step: Step): LocalBlocks {
  const s = new LocalBlocks({ mode: 'marathon', names: ['🙂'], level: 'easy', seed: 777 + step, countdownMs: 600 });
  const setup = (x: LocalBlocks) => {
    const g = x.players[0].game;
    if (step === 3) {
      fillRows(x, ['####.#####', '###...####']);
      g.piece = { type: 'T', rot: 2, x: 3, y: 2 };
    }
    if (step === 5) {
      fillRows(x, ['#########.', '#########.', '#########.', '#########.']);
      g.piece = { type: 'I', rot: 0, x: 3, y: 1 };
    }
  };
  s.onRestart = setup;
  setup(s);
  return s;
}

export function BlocksLearn() {
  const { t, to } = useI18n();
  const nav = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [done, setDone] = useState(false);
  const session = useMemo(() => make(step), [step]);
  useBlocks(session);
  const base = useRef({ inputs: 0, rotate: 0 });
  useEffect(() => {
    setDone(step === 6);
    base.current = { inputs: 0, rotate: 0 };
    return () => session.dispose();
  }, [session, step]);

  // progress checks on every update
  const g = session.players[0]?.game;
  useEffect(() => {
    if (!g || done) return;
    const st = g.stats;
    if (step === 1 && st.inputs >= 4 && g.piece && (g.piece.rot !== 0 || g.pieces > 0)) setDone(true);
    if (step === 2 && g.pieces >= 3) setDone(true);
    if (step === 3 && g.lines >= 1) setDone(true);
    if (step === 4 && g.hold) setDone(true);
    if (step === 5 && st.quads >= 1) setDone(true);
  });
  const failed = session.status === 'ended' && !done;
  const steps: Step[] = [1, 2, 3, 4, 5, 6];
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div>
        <BlocksView session={session} />
      </div>
      <section className="space-y-4" aria-live="polite">
        <div className="flex gap-1" aria-label="progress">
          {steps.map((s) => (
            <span key={s} className={`h-2 flex-1 rounded-full ${s <= step ? 'bg-[var(--accent)]' : 'bg-[var(--surface-2)]'}`} />
          ))}
        </div>
        <p className="text-sm text-[var(--muted)]">{t('learn.lesson', { n: step })}</p>
        <h2 className="font-serif text-2xl font-bold">{t(`bl.learn.s${step}.title` as StringKey)}</h2>
        <p className="text-lg leading-relaxed">{t(`bl.learn.s${step}.text` as StringKey)}</p>
        {done && step < 6 && <p className="rounded-lg bg-[var(--ok-bg)] px-3 py-2 font-medium">✓ {t('learn.correct')}</p>}
        {failed && (
          <p className="rounded-lg bg-[var(--warn-bg)] px-3 py-2 font-medium" role="alert">
            {t('tr.learn.retry')}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={step === 1} onClick={() => setStep((step - 1) as Step)}>
            ← {t('learn.prev')}
          </Button>
          {step < 6 ? (
            <Button disabled={!done} onClick={() => setStep((step + 1) as Step)}>
              {t('learn.next')} →
            </Button>
          ) : (
            <Button onClick={() => nav(to('/blocks/play?mode=marathon'))}>{t('tr.setup.start')} →</Button>
          )}
          <Button variant="secondary" onClick={() => void session.restart()}>
            ⟲ {t('learn.retry')}
          </Button>
          <Button variant="ghost" onClick={() => nav(to('/blocks'))}>
            {t('learn.exit')}
          </Button>
        </div>
      </section>
    </div>
  );
}
