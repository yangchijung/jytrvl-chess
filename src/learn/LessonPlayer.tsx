import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LESSONS, type Step } from './lessons';
import { buildStepRules, matchesExpect } from './build';
import { RulesReference } from './RulesReference';
import { ChessBoard } from '../components/board/ChessBoard';
import { XiangqiBoard } from '../components/board/XiangqiBoard';
import { BanqiBoard } from '../components/board/BanqiBoard';
import { Button, Modal } from '../components/ui';
import { useI18n, type StringKey } from '../i18n';
import { useSettings, loadJSON, saveJSON } from '../lib/settings';
import { playSound } from '../lib/sound';
import type { GameId } from '../../shared/types';
import type { Rules } from '../../shared/games/registry';

const CAT_KEY: Record<Step['category'], { zh: string; en: string }> = {
  board: { zh: '棋盤介紹', en: 'Board' },
  names: { zh: '棋子名稱', en: 'Pieces' },
  moves: { zh: '棋子走法', en: 'Moves' },
  capture: { zh: '吃棋方式', en: 'Captures' },
  special: { zh: '特殊規則', en: 'Special rules' },
  win: { zh: '勝負條件', en: 'Winning' },
  practice: { zh: '練習', en: 'Practice' },
  challenge: { zh: '挑戰題', en: 'Challenge' },
  mistakes: { zh: '常見錯誤', en: 'Common mistakes' },
};

export function LessonPlayer({ game }: { game: GameId }) {
  const { t, lang, pick, to } = useI18n();
  const { settings } = useSettings();
  const nav = useNavigate();
  const steps = LESSONS[game];
  const progressKey = `jychess.learn.${game}`;
  const [done, setDone] = useState<number[]>(() => loadJSON<{ done: number[] }>(progressKey, { done: [] }).done);
  const [idx, setIdx] = useState(() => {
    const first = steps.findIndex((_, i) => !done.includes(i));
    return first < 0 ? 0 : first;
  });
  const [rules, setRules] = useState<Rules>(() => buildStepRules(game, steps[idx]));
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState<'idle' | 'wrong' | 'correct'>('idle');
  const [info, setInfo] = useState<string | null>(null);
  const [refOpen, setRefOpen] = useState(false);
  const step = steps[idx];

  useEffect(() => {
    setRules(buildStepRules(game, steps[idx]));
    setStatus('idle');
    setInfo(null);
    setVersion((v) => v + 1);
  }, [idx, game, steps]);

  const markDone = (i: number) => {
    setDone((d) => {
      const n = d.includes(i) ? d : [...d, i];
      saveJSON(progressKey, { done: n });
      return n;
    });
  };

  useEffect(() => {
    if (step.kind === 'info') markDone(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  const interactive = step.kind !== 'info' && status !== 'correct';
  const api = useMemo(
    () => ({
      legalFrom: (sq: string) => (interactive ? rules.legalFrom(sq) : []),
      move: (m: string) => {
        if (!interactive) return false;
        if (step.kind === 'explore') {
          // exploring: any legal move is allowed, the position resets afterwards
          rules.play(m);
          playSound('move', settings.sound);
          setVersion((v) => v + 1);
          setTimeout(() => {
            setRules(buildStepRules(game, step));
            setVersion((v) => v + 1);
          }, 900);
          return true;
        }
        if (!matchesExpect(step.expect, m)) {
          setStatus('wrong');
          playSound('error', settings.sound);
          return false;
        }
        const rec = rules.play(m);
        playSound(rec?.capture ? 'capture' : rec?.reveal ? 'flip' : 'move', settings.sound);
        setStatus('correct');
        markDone(idx);
        setVersion((v) => v + 1);
        return true;
      },
      explain: (sq: string) => rules.explainNoMove(sq),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rules, interactive, step, idx, settings.sound],
  );

  const pos = rules.position();
  const key = `${idx}:${version}`;
  const hl = step.highlight ? ([step.highlight[0], step.highlight[1] ?? step.highlight[0]] as [string, string]) : null;
  const board =
    pos.game === 'chess' ? (
      <ChessBoard fen={pos.fen} api={api} lastMove={rules.lastMove()} checkSquare={rules.checkSquare()} hint={hl} onInfo={setInfo} />
    ) : pos.game === 'xiangqi' ? (
      <XiangqiBoard board={pos.board} positionKey={key} api={api} lastMove={rules.lastMove()} checkSquare={rules.checkSquare()} hint={hl} onInfo={setInfo} />
    ) : (
      <BanqiBoard cells={pos.view.cells} positionKey={key} api={api} lastMove={rules.lastMove()} hint={hl} onInfo={setInfo} />
    );

  const canNext = step.kind === 'info' || step.kind === 'explore' || status === 'correct';
  const allDone = done.length >= steps.length;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="mx-auto w-full" style={{ maxWidth: game === 'banqi' ? '52rem' : 'min(100%, calc(100dvh - 12rem))' }}>
        {board}
      </div>
      <section className="flex flex-col gap-4" aria-live="polite">
        <div className="flex items-center justify-between text-sm text-[var(--muted)]">
          <span>
            {t('learn.lesson', { n: idx + 1 })} · {pick(CAT_KEY[step.category])}
          </span>
          <span>{t('learn.progress', { a: done.length, b: steps.length })}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]" aria-hidden="true">
          <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${(done.length / steps.length) * 100}%` }} />
        </div>
        <h2 className="font-serif text-2xl font-bold">
          {step.kind === 'challenge' && <span className="mr-2 rounded bg-[var(--gold)] px-2 py-0.5 align-middle text-sm text-black">{t('learn.challenge')}</span>}
          {step.kind === 'explore' && step.category === 'mistakes' && <span className="mr-2 rounded bg-[var(--warn)] px-2 py-0.5 align-middle text-sm text-black">{t('learn.mistakes')}</span>}
          {pick(step.title)}
        </h2>
        <p className="text-lg leading-relaxed">{pick(step.text)}</p>
        {status === 'wrong' && (
          <p className="rounded-lg bg-[var(--warn-bg)] px-3 py-2 font-medium" role="alert">
            {t('learn.wrong')}
          </p>
        )}
        {status === 'correct' && (
          <p className="rounded-lg bg-[var(--ok-bg)] px-3 py-2 font-medium" role="status">
            ✓ {step.success ? pick(step.success) : t('learn.correct')}
          </p>
        )}
        {info && <p className="rounded-lg bg-[var(--info-bg)] px-3 py-2">{t(info as StringKey)}</p>}
        {(step.kind === 'move' || step.kind === 'challenge') && status === 'idle' && <p className="text-sm text-[var(--muted)]">{t('learn.try')}</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>
            ← {t('learn.prev')}
          </Button>
          <Button
            disabled={!canNext || idx === steps.length - 1}
            onClick={() => {
              if (step.kind !== 'info') markDone(idx);
              setIdx(idx + 1);
            }}
          >
            {step.kind === 'info' || step.kind === 'explore' ? t('learn.continue') : t('learn.next')} →
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setRules(buildStepRules(game, step));
              setStatus('idle');
              setInfo(null);
              setVersion((v) => v + 1);
            }}
          >
            ⟲ {t('learn.retry')}
          </Button>
          <Button variant="ghost" onClick={() => nav(to(`/${game}`))}>
            {t('learn.exit')}
          </Button>
        </div>
        {allDone && <p className="rounded-lg bg-[var(--ok-bg)] px-3 py-2 font-medium">🎉 {t('learn.allDone')}</p>}
        <details className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <summary className="cursor-pointer font-semibold">{lang === 'zh' ? '全部課程' : 'All lessons'}</summary>
          <ol className="mt-2 space-y-1">
            {steps.map((s, i) => (
              <li key={i}>
                <button type="button" className={`w-full rounded px-2 py-1 text-left hover:bg-[var(--surface-2)] ${i === idx ? 'font-semibold text-[var(--accent-text)]' : ''}`} onClick={() => setIdx(i)}>
                  {done.includes(i) ? '✓ ' : '○ '}
                  {i + 1}. {pick(s.title)}
                </button>
              </li>
            ))}
          </ol>
        </details>
        <Button variant="secondary" onClick={() => setRefOpen(true)}>
          📖 {t('learn.reference')}
        </Button>
      </section>
      <Modal open={refOpen} onClose={() => setRefOpen(false)} title={t('learn.reference')} wide>
        <RulesReference game={game} />
      </Modal>
    </div>
  );
}
