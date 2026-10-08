import { useEffect, useRef, useState } from 'react';
import type { GameController, Snapshot } from './controller';
import { hint as engineHint, judgeMove, threatenedPieces, reviewGame, notate, type MoveFeedback, type Review } from './coach';
import { restoreRules, truncateState } from '../../shared/games/registry';
import { Button, Spinner } from '../components/ui';
import { useI18n, type StringKey } from '../i18n';
import { moveSquares } from '../components/board/useBoard';
import { seatLabel } from './GameScreen';

const PIECE_ZH: Record<string, string> = { k: '國王', q: '皇后', r: '城堡', b: '主教', n: '騎士', p: '士兵', K: '帥', A: '仕', B: '相', R: '俥', N: '傌', C: '炮', P: '兵' };
const PIECE_EN: Record<string, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn', K: 'general', A: 'advisor', B: 'elephant', R: 'chariot', N: 'horse', C: 'cannon', P: 'soldier' };

export function CoachPanel({
  controller,
  snap,
  onHint,
  reviewRequested,
  onReviewDone,
}: {
  controller: GameController;
  snap: Snapshot;
  onHint: (h: [string, string] | null) => void;
  reviewRequested: boolean;
  onReviewDone: () => void;
}) {
  const { t, lang } = useI18n();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<MoveFeedback | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const judged = useRef(0);
  const disabled = snap.rated && !snap.result;
  const pieceName = (p: string) => (lang === 'zh' ? (PIECE_ZH[p] ?? PIECE_ZH[p.toUpperCase()]) : (PIECE_EN[p] ?? PIECE_EN[p.toUpperCase()]));

  // judge each human move in coach/practice mode
  useEffect(() => {
    if (disabled || !snap.coachAllowed) return;
    const n = snap.records.length;
    if (n <= judged.current) {
      judged.current = n;
      return;
    }
    judged.current = n;
    const last = snap.records[n - 1];
    const humanMoved = !snap.players[last.seat].isAi && (snap.mode === 'practice' || snap.mode === 'ai' || snap.mode === 'local');
    if (!humanMoved || snap.game === 'banqi') {
      setFeedback(null);
      return;
    }
    const st = controller.exportState();
    if (!st) return;
    const before = restoreRules(truncateState(st, n - 1));
    let alive = true;
    judgeMove(before, last.move)
      .then((f) => alive && setFeedback(f))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [snap.records.length, disabled, snap.coachAllowed, controller, snap.game, snap.mode, snap.players, snap.records]);

  useEffect(() => {
    if (reviewRequested) {
      void runReview();
      onReviewDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewRequested]);

  const myTurn = snap.mySeats.includes(snap.sideToMove) && !snap.result;
  const rules = controller.currentRules?.();
  const threats = myTurn && rules && !disabled ? threatenedPieces(rules, snap.sideToMove) : [];

  async function askHint() {
    if (!rules) return;
    setBusy(true);
    setMsg(t('coach.hint.loading'));
    try {
      const m = await engineHint(rules);
      if (m) {
        const sq = moveSquares(m);
        onHint(sq);
        setMsg(t('coach.hint', { move: notate(rules, m) }));
      } else setMsg(t('err.engine'));
    } finally {
      setBusy(false);
    }
  }

  async function runReview() {
    const st = controller.exportState();
    if (!st) return;
    setProgress([0, st.state.moves.length]);
    try {
      const r = await reviewGame(st, (a, b) => setProgress([a, b]));
      setReview(r);
    } finally {
      setProgress(null);
    }
  }

  if (disabled) {
    return (
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm" aria-label={t('coach.title')}>
        <h2 className="mb-1 font-semibold">🎓 {t('coach.title')}</h2>
        <p className="text-[var(--muted)]">{t('coach.disabledRated')}</p>
      </section>
    );
  }

  const fbText =
    feedback &&
    (feedback.kind === 'best'
      ? t('coach.best')
      : feedback.kind === 'good'
        ? t('coach.good')
        : feedback.kind === 'mistake'
          ? t('coach.mistake', { move: feedback.better ?? '' })
          : t('coach.blunder', { cp: feedback.lossCp, move: feedback.better ?? '' }));

  return (
    <section className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm" aria-label={t('coach.title')} aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">🎓 {t('coach.title')}</h2>
        {!snap.result && (
          <Button size="sm" variant="secondary" disabled={!myTurn || busy || !rules} onClick={askHint}>
            💡 {t('ctl.hint')}
          </Button>
        )}
      </div>
      {busy && <Spinner label={t('coach.hint.loading')} />}
      {msg && !busy && <p>{msg}</p>}
      {fbText && !snap.result && (
        <p className={feedback!.kind === 'blunder' ? 'font-semibold text-[var(--danger)]' : feedback!.kind === 'mistake' ? 'text-[var(--warn)]' : 'text-[var(--ok)]'}>{fbText}</p>
      )}
      {snap.checkSquare && myTurn && <p className="font-medium">{t('coach.inCheck')}</p>}
      {threats.slice(0, 2).map((th) => (
        <p key={th.square}>⚠ {t('coach.threat', { piece: `${pieceName(th.piece)} (${th.square})` })}</p>
      ))}
      {!snap.result && snap.records.length < 6 && <p className="text-[var(--muted)]">{t(`coach.strategy.${snap.game}` as StringKey)}</p>}
      {snap.result && !review && !progress && (
        <Button size="sm" onClick={runReview}>
          {t('end.analyse')}
        </Button>
      )}
      {progress && <Spinner label={t('coach.analysis.running', { n: progress[0], total: progress[1] })} />}
      {review && (
        <div className="space-y-1 border-t border-[var(--border)] pt-2">
          <h3 className="font-semibold">{t('coach.analysis.title')}</h3>
          {review.material ? (
            <>
              <p>{t('coach.analysis.banqi')}</p>
              <ul className="max-h-40 overflow-y-auto">
                {review.material.map((m) => (
                  <li key={m.ply}>{t('coach.analysis.material', { n: m.ply, diff: m.diff > 0 ? `+${m.diff}` : m.diff })}</li>
                ))}
              </ul>
            </>
          ) : (
            <>
              {([0, 1] as const).map((s) => (
                <p key={s}>
                  {t('coach.analysis.summary', {
                    side: seatLabel(t, snap.game, s, snap),
                    b: review.perSeat[s].blunders,
                    m: review.perSeat[s].mistakes,
                    acpl: review.perSeat[s].acpl,
                  })}
                </p>
              ))}
              {review.items.filter((i) => i.kind === 'blunder').length === 0 ? (
                <p>{t('coach.analysis.none')}</p>
              ) : (
                <ul className="max-h-48 list-disc overflow-y-auto pl-5">
                  {review.items
                    .filter((i) => i.kind === 'blunder')
                    .map((i) => (
                      <li key={i.ply}>{t('coach.analysis.blunderAt', { n: i.ply, move: i.played, best: i.best ?? '—' })}</li>
                    ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
