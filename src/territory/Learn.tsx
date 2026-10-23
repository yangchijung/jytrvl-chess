// Interactive Territory Rush tutorial: each step runs the real engine and advances when the player
// actually performs the requested action.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LocalTerritory } from './local';
import { TerritoryCanvas, useClient } from './TerritoryCanvas';
import { useI18n, type StringKey } from '../i18n';
import { Button, Notice } from '../components/ui';
import type { TerritoryGame } from '../../shared/territory/engine';
import { FlowGame, turnCounter } from '../../shared/territory/flow';
import { TERRITORY_COLORS, autoColor } from '../../shared/territory/colors';
import { loadColorPrefs } from './ColorPicker';

/** Tutorial safety net for continuous steering: about to leave the map → aim back towards the centre. */
function flowGuard(g: FlowGame) {
  const f = g.flow[0];
  const p = g.players[0];
  if (!f || !p?.alive) return;
  const x = f.fx + Math.cos(f.heading) * 3,
    y = f.fy + Math.sin(f.heading) * 3;
  if (x < 1 || y < 1 || x > g.w - 1 || y > g.h - 1) g.setTarget(0, Math.atan2(g.h / 2 - f.fy, g.w / 2 - f.fx));
}

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

function makeClient(step: StepId, name: string): LocalTerritory {
  const c = new LocalTerritory({
    humans: [{ name, color: loadColorPrefs().p1 }],
    bots: step === 4 ? 1 : 0,
    level: 'easy',
    durationMin: 0,
    size: step === 4 ? 30 : 26,
    seed: 1234 + step,
    countdownMs: 600,
    flow: true,
  });
  c.beforeStep = (g: TerritoryGame) => {
    if (g instanceof FlowGame) {
      flowGuard(g);
      // scripted rival: a wide circle far from home, so its line stays out in the open for a long time
      if (step === 4 && g.players[1]?.alive) g.setTarget(1, g.flow[1].heading + 0.05);
      return;
    }
    guardRails(g, step !== 4);
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
  const client = useMemo(() => makeClient(step, t('tr.hud.you')), [step]); // eslint-disable-line react-hooks/exhaustive-deps
  useClient(client);
  const turnsRef = useRef(0);

  useEffect(() => {
    setDone(step === 3 || step === 5);
    setRetry(false);
    turnsRef.current = 0;
    setTurns(0);
    const counted = turnCounter(client.flow?.flow[0]?.heading ?? 0);
    client.onStep = (g) => {
      const h = (g as FlowGame).flow?.[0]?.heading;
      if (step === 1 && h !== undefined && counted(h)) {
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
        <StepPicture step={step} />
        <h2 className="font-serif text-2xl font-bold">{t(`tr.learn.s${step}.title` as StringKey)}</h2>
        <p className="text-lg leading-relaxed">{t(`tr.learn.s${step}.text` as StringKey)}</p>
        {step === 1 && !done && <p className="font-medium">{t('tr.learn.progress', { n: turns })}</p>}
        {done && (step === 1 || step === 2 || step === 4) && <Notice kind="success">{t('tutorial.actionDone')}</Notice>}
        {done && step === 5 && <Notice kind="success">{t('tutorial.finish')}</Notice>}
        {retry && <Notice kind="warning">{t('tr.learn.retry')} {t('tutorial.tryAgain')}</Notice>}
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

/** One small picture per lesson: what to do, drawn in the game's own colours (original, no text inside). */
function StepPicture({ step }: { step: StepId }) {
  // your chosen colour (same as in the lesson board); the rival takes the colour a computer rival would get
  const mine = loadColorPrefs().p1;
  const you = TERRITORY_COLORS[mine],
    rv = TERRITORY_COLORS[autoColor([mine])];
  const me = you.base,
    meLand = you.land,
    rival = rv.base,
    ink = 'var(--text)';
  const runner = (x: number, y: number, c = me) => <rect x={x - 7} y={y - 7} width="14" height="14" rx="5" fill={c} stroke={c === me ? you.dark : rv.dark} strokeWidth="2" />;
  return (
    <svg viewBox="0 0 240 120" className="block w-full max-w-sm rounded-md border border-[var(--border)] bg-[var(--surface)]" aria-hidden="true" data-testid={`tr-learn-pic-${step}`}>
      {step === 1 && (
        <>
          <path d="M30 95 C70 95 80 40 120 40 S180 85 205 50" fill="none" stroke={me} strokeWidth="6" strokeLinecap="round" opacity="0.7" />
          {runner(205, 50)}
          <path d="M205 50 L225 22" stroke={ink} strokeWidth="2" strokeDasharray="4 4" />
          <path d="M222 14 l6 14 l-5 -2 l-3 6 l-3 -2 l3 -5 l-5 -1 z" fill={ink} />
        </>
      )}
      {step === 2 && (
        <>
          <rect x="30" y="60" width="50" height="40" fill={meLand} />
          <path d="M80 70 C120 40 170 40 175 70 S130 105 80 92" fill={meLand} opacity="0.55" stroke={me} strokeWidth="5" strokeLinecap="round" />
          {runner(82, 90)}
        </>
      )}
      {step === 3 && (
        <>
          <rect x="20" y="60" width="44" height="40" fill={meLand} />
          <path d="M64 80 C110 30 170 40 160 80 S120 70 110 55" fill="none" stroke={me} strokeWidth="5" strokeLinecap="round" opacity="0.7" />
          {runner(110, 55)}
          <path d="M98 43 l24 24 M122 43 l-24 24" stroke="#b3261e" strokeWidth="4" strokeLinecap="round" />
        </>
      )}
      {step === 4 && (
        <>
          <path d="M150 20 C210 30 215 95 160 100" fill="none" stroke={rival} strokeWidth="5" strokeLinecap="round" opacity="0.7" />
          {runner(160, 100, rival)}
          <path d="M40 60 C90 60 150 60 196 58" fill="none" stroke={me} strokeWidth="5" strokeLinecap="round" opacity="0.7" />
          {runner(196, 58)}
        </>
      )}
      {step === 5 && (
        <>
          <rect x="20" y="20" width="200" height="80" fill="none" stroke={ink} strokeWidth="2" />
          <rect x="20" y="20" width="130" height="80" fill={meLand} />
          <rect x="150" y="20" width="70" height="40" fill={rv.land} />
          <path d="M150 20 V100" stroke={ink} strokeWidth="2" strokeDasharray="4 4" />
        </>
      )}
    </svg>
  );
}
