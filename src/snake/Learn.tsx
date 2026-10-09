// Interactive Snake Arena tutorial: every step runs the real engine and advances only when the learner
// actually does what the step asks.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SnakeGame, Dir } from '../../shared/snake/engine';
import { useI18n, type StringKey } from '../i18n';
import { Button } from '../components/ui';
import { LocalSnake } from './local';
import { SnakeCanvas, useSnakeClient } from './SnakeCanvas';

type Step = 1 | 2 | 3 | 4 | 5;

/** tutorial-only safety net: turn the learner away from walls (and their own body in early steps) */
function guard(g: SnakeGame, body: boolean) {
  const s = g.snakes[0];
  if (!s?.alive) return;
  const bad = (d: number) => {
    const c = g.next(s.body[0], d as Dir);
    return c < 0 || g.wall[c] === 1 || (body && g.occ[c] === 0 && c !== s.body[s.body.length - 1]) || (g.occ[c] >= 1);
  };
  const next = s.queue.length ? s.queue[0] : s.dir;
  if (!bad(next)) return;
  const opts = [(next + 1) % 4, (next + 3) % 4].filter((d) => !bad(d));
  if (opts.length) s.queue = [opts[0] as Dir];
}

function make(step: Step): LocalSnake {
  const c = new LocalSnake({
    mode: step === 4 ? 'versus' : 'classic',
    humans: [{ name: '🙂', color: 0 }],
    bots: step === 4 ? 1 : 0,
    level: 'easy',
    speed: 'slow',
    map: 'open',
    walls: true,
    minutes: 0,
    size: step === 4 ? 22 : 18,
    seed: 4321 + step,
    countdownMs: 700,
  });
  c.beforeStepHook = (g) => guard(g, step <= 2);
  return c;
}

export function SnakeLearn() {
  const { t, to } = useI18n();
  const nav = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState(0);
  const client = useMemo(() => make(step), [step]);
  useSnakeClient(client);
  const ref = useRef(0);

  useEffect(() => {
    setDone(step === 5);
    setProgress(0);
    ref.current = 0;
    let lastDir = -1;
    let startTick = -1;
    client.onStep = (g) => {
      const s = g.snakes[0];
      if (step === 1) {
        if (lastDir >= 0 && s.dir !== lastDir) {
          ref.current++;
          setProgress(ref.current);
          if (ref.current >= 3) setDone(true);
        }
        lastDir = s.dir;
      }
      if (step === 2) {
        setProgress(s.foods);
        if (s.foods >= 3) setDone(true);
      }
      if (step === 3) {
        setProgress(s.body.length);
        if (s.body.length >= 9) setDone(true);
      }
      if (step === 4) {
        if (startTick < 0) startTick = g.tick;
        const secs = Math.floor(((g.tick - startTick) * client.stepMs) / 1000);
        setProgress(secs);
        if (s.alive && secs >= 15 && s.foods >= 2) setDone(true);
      }
    };
    return () => client.dispose();
  }, [client, step]);

  const failed = client.status === 'ended' && !done;
  const steps: Step[] = [1, 2, 3, 4, 5];
  const progressText = step === 1 ? t('tr.learn.progress', { n: progress }) : step === 2 ? t('sn.learn.food', { n: progress }) : step === 3 ? t('sn.learn.len', { n: progress }) : step === 4 ? t('sn.learn.secs', { n: progress }) : '';
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div>
        <SnakeCanvas client={client} />
      </div>
      <section className="space-y-4" aria-live="polite">
        <div className="flex gap-1" aria-label="progress">
          {steps.map((s) => (
            <span key={s} className={`h-2 flex-1 rounded-full ${s <= step ? 'bg-[var(--accent)]' : 'bg-[var(--surface-2)]'}`} />
          ))}
        </div>
        <p className="text-sm text-[var(--muted)]">{t('learn.lesson', { n: step })}</p>
        <h2 className="font-serif text-2xl font-bold">{t(`sn.learn.s${step}.title` as StringKey)}</h2>
        <p className="text-lg leading-relaxed">{t(`sn.learn.s${step}.text` as StringKey)}</p>
        {!done && progressText && <p className="font-medium">{progressText}</p>}
        {done && step < 5 && <p className="rounded-lg bg-[var(--ok-bg)] px-3 py-2 font-medium">✓ {t('learn.correct')}</p>}
        {failed && (
          <p className="rounded-lg bg-[var(--warn-bg)] px-3 py-2 font-medium" role="alert">
            {t('tr.learn.retry')}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={step === 1} onClick={() => setStep((step - 1) as Step)}>
            ← {t('learn.prev')}
          </Button>
          {step < 5 ? (
            <Button disabled={!done} onClick={() => setStep((step + 1) as Step)}>
              {t('learn.next')} →
            </Button>
          ) : (
            <Button onClick={() => nav(to('/snake/play?mode=classic'))}>{t('tr.setup.start')} →</Button>
          )}
          <Button variant="secondary" onClick={() => void client.restart()}>
            ⟲ {t('learn.retry')}
          </Button>
          <Button variant="ghost" onClick={() => nav(to('/snake'))}>
            {t('learn.exit')}
          </Button>
        </div>
      </section>
    </div>
  );
}
