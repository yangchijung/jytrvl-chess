// Interactive Territory Rush tutorial: each step runs the real engine and advances when the player
// actually performs the requested action.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LocalTerritory } from './local';
import { TerritoryCanvas, useClient } from './TerritoryCanvas';
import { useI18n, type StringKey } from '../i18n';
import { Button } from '../components/ui';
import type { TerritoryGame } from '../../shared/territory/engine';

type StepId = 1 | 2 | 3 | 4 | 5;

const DXY = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

/**
 * Beginner safety net used only in the tutorial: if the learner is about to hit the border
 * (or, in the first lessons, their own trail) we turn them for them so a lesson never ends abruptly.
 */
function guardRails(g: TerritoryGame, ownTrail: boolean) {
  const me = g.players[0];
  if (!me?.alive) return;
  const bad = (d: number) => {
    const x = me.x + DXY[d][0],
      y = me.y + DXY[d][1];
    if (x < 0 || y < 0 || x >= g.w || y >= g.h) return true;
    return ownTrail && g.trail[y * g.w + x] === 0;
  };
  const next = me.queue.length ? me.queue[0] : me.dir;
  if (!bad(next)) return;
  // prefer the turn that heads towards the centre
  const options = [(next + 1) % 4, (next + 3) % 4].filter((d) => !bad(d));
  if (!options.length) return;
  const score = (d: number) => Math.hypot(me.x + DXY[d][0] * 4 - g.w / 2, me.y + DXY[d][1] * 4 - g.h / 2);
  options.sort((a, b) => score(a) - score(b));
  me.queue = [options[0] as 0 | 1 | 2 | 3];
}

function makeClient(step: StepId): LocalTerritory {
  const c = new LocalTerritory({
    humans: [{ name: '🙂' }],
    bots: step === 4 ? 1 : 0,
    level: 'easy',
    durationMin: 0,
    size: step === 4 ? 30 : 26,
    seed: 1234 + step,
    countdownMs: 600,
  });
  let turnAt = 0;
  c.beforeStep = (g: TerritoryGame) => {
    guardRails(g, step !== 4);
    if (step !== 4) return;
    // scripted rival: walks a big square far from home so its trail stays exposed for a long time
    const b = g.players[1];
    if (!b?.alive) return;
    b.queue = [];
    turnAt++;
    if (turnAt % 9 === 0) b.queue.push(((b.dir + 1) % 4) as 0 | 1 | 2 | 3);
  };
  return c;
}

export function TerritoryLearn() {
  const { t, to } = useI18n();
  const nav = useNavigate();
  const [step, setStep] = useState<StepId>(1);
  const [done, setDone] = useState(false);
  const [retry, setRetry] = useState(false);
  const [turns, setTurns] = useState(0);
  const client = useMemo(() => makeClient(step), [step]);
  useClient(client);
  const turnsRef = useRef(0);

  useEffect(() => {
    setDone(step === 3 || step === 5);
    setRetry(false);
    turnsRef.current = 0;
    setTurns(0);
    let lastDir = client.game!.players[0].dir;
    client.onStep = (g) => {
      const me = g.players[0];
      if (step === 1 && me.dir !== lastDir) {
        lastDir = me.dir;
        turnsRef.current++;
        setTurns(turnsRef.current);
        if (turnsRef.current >= 3) setDone(true);
      }
      if (step === 2 && g.events.some((e) => e.type === 'capture' && e.player === 0 && (e.cells ?? 0) >= 15)) setDone(true);
      if (step === 4 && g.events.some((e) => e.type === 'death' && e.player === 1 && e.by === 0)) setDone(true);
    };
    return () => client.dispose();
  }, [client, step]);

  // knocked out → offer retry (tutorial never ends silently)
  useEffect(() => {
    if (client.status === 'ended' && !done) setRetry(true);
  }, [client.status, client.version, done]);

  const steps: StepId[] = [1, 2, 3, 4, 5];
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div>
        <TerritoryCanvas client={client} />
      </div>
      <section className="space-y-4" aria-live="polite">
        <div className="flex gap-1" aria-label="progress">
          {steps.map((s) => (
            <span key={s} className={`h-2 flex-1 rounded-full ${s <= step ? 'bg-[var(--accent)]' : 'bg-[var(--surface-2)]'}`} />
          ))}
        </div>
        <p className="text-sm text-[var(--muted)]">{t('learn.lesson', { n: step })}</p>
        <h2 className="font-serif text-2xl font-bold">{t(`tr.learn.s${step}.title` as StringKey)}</h2>
        <p className="text-lg leading-relaxed">{t(`tr.learn.s${step}.text` as StringKey)}</p>
        {step === 1 && !done && <p className="font-medium">{t('tr.learn.progress', { n: turns })}</p>}
        {done && (step === 1 || step === 2 || step === 4) && <p className="rounded-lg bg-[var(--ok-bg)] px-3 py-2 font-medium">✓ {t('learn.correct')}</p>}
        {retry && (
          <p className="rounded-lg bg-[var(--warn-bg)] px-3 py-2 font-medium" role="alert">
            {t('tr.learn.retry')}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={step === 1} onClick={() => setStep((step - 1) as StepId)}>
            ← {t('learn.prev')}
          </Button>
          {step < 5 ? (
            <Button disabled={!done} onClick={() => setStep((step + 1) as StepId)}>
              {t('learn.next')} →
            </Button>
          ) : (
            <Button onClick={() => nav(to('/territory/play?mode=ai'))}>{t('tr.setup.start')} →</Button>
          )}
          <Button
            variant="secondary"
            onClick={() => {
              client.restart();
              setRetry(false);
            }}
          >
            ⟲ {t('learn.retry')}
          </Button>
          <Button variant="ghost" onClick={() => nav(to('/territory'))}>
            {t('learn.exit')}
          </Button>
        </div>
      </section>
    </div>
  );
}
