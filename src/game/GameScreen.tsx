import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GameController, Snapshot } from './controller';
import { ChessBoard } from '../components/board/ChessBoard';
import { XiangqiBoard } from '../components/board/XiangqiBoard';
import { BanqiBoard } from '../components/board/BanqiBoard';
import { DiscPiece } from '../components/board/pieces';
import { Button, Modal, Spinner, Toggle } from '../components/ui';
import { useI18n, type StringKey } from '../i18n';
import { useSettings } from '../lib/settings';
import { playSound } from '../lib/sound';
import { RulesReference } from '../learn/RulesReference';
import { CoachPanel } from './CoachPanel';
import type { Seat, GameResult } from '../../shared/types';
import type { LocalController } from './local';
import { saveLocalGame } from '../lib/history';

export function useSnapshot(c: GameController): Snapshot {
  const sub = useCallback((f: () => void) => c.subscribe(f), [c]);
  return useSyncExternalStore(sub, () => c.snapshot());
}

function fmtClock(ms: number) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (ms < 10000) return `${m}:${String(r).padStart(2, '0')}.${Math.floor((ms % 1000) / 100)}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function seatLabel(t: (k: StringKey) => string, game: Snapshot['game'], seat: Seat, snap?: Snapshot): string {
  if (game === 'chess') return t(seat === 0 ? 'side.white' : 'side.black');
  if (game === 'xiangqi') return t(seat === 0 ? 'side.red' : 'side.blackXq');
  if (snap && snap.position.game === 'banqi') {
    const c = snap.position.view.seatColor[seat];
    if (c) return t(c === 'red' ? 'side.red' : 'side.blackXq');
  }
  return t(seat === 0 ? 'side.first' : 'side.second');
}

function PlayerBar({ snap, seat, flipped }: { snap: Snapshot; seat: Seat; flipped: boolean }) {
  const { t } = useI18n();
  const p = snap.players[seat];
  const active = !snap.result && snap.sideToMove === seat;
  const ms = snap.clock.ms?.[seat];
  const color =
    snap.game === 'chess'
      ? seat === 0
        ? '#f4f1ea'
        : '#1c1c1c'
      : snap.game === 'xiangqi'
        ? seat === 0
          ? 'var(--xq-red)'
          : 'var(--xq-black)'
        : snap.position.game === 'banqi' && snap.position.view.seatColor[seat]
          ? snap.position.view.seatColor[seat] === 'red'
            ? 'var(--xq-red)'
            : 'var(--xq-black)'
          : 'var(--muted)';
  void flipped;
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 transition ${active ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border)] bg-[var(--surface)]'}`}
      aria-live="off"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="h-4 w-4 shrink-0 rounded-full border border-[var(--border)]" style={{ background: color }} aria-hidden="true" />
        <div className="min-w-0">
          <div className="truncate font-semibold">
            {p.name}
            {p.rating ? <span className="ml-2 text-sm font-normal text-[var(--muted)]">{p.rating}</span> : null}
          </div>
          <div className="text-xs text-[var(--muted)]">
            {seatLabel(t, snap.game, seat, snap)}
            {p.connected === false && ` · ${t('online.reconnecting').split('，')[0].split(' —')[0]}`}
          </div>
        </div>
        {snap.thinking && active && p.isAi && <Spinner label={t('board.thinking')} />}
      </div>
      {ms !== undefined && (
        <div
          className={`rounded-lg px-3 py-1 font-mono text-xl tabular-nums ${active ? 'bg-[var(--clock-active)] text-[var(--on-accent)]' : 'bg-[var(--surface-2)]'} ${ms < 20000 && active ? 'animate-pulse' : ''}`}
          role="timer"
          aria-label={`${seatLabel(t, snap.game, seat, snap)} ${fmtClock(ms)}`}
        >
          {snap.clock.paused ? '⏸ ' : ''}
          {fmtClock(ms)}
        </div>
      )}
    </div>
  );
}

function MoveList({ snap }: { snap: Snapshot }) {
  const { t } = useI18n();
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [snap.records.length]);
  const rows: { n: number; a?: string; b?: string }[] = [];
  if (snap.game === 'banqi') {
    snap.records.forEach((r, i) => rows.push({ n: i + 1, a: r.notation + (r.reveal ? ` ${revealName(r.reveal)}` : '') }));
  } else {
    snap.records.forEach((r, i) => {
      if (i % 2 === 0) rows.push({ n: i / 2 + 1, a: r.notation });
      else rows[rows.length - 1].b = r.notation;
    });
  }
  return (
    <section aria-label={t('ctl.moves')} className="flex min-h-0 flex-col">
      <h2 className="mb-1 text-sm font-semibold text-[var(--muted)]">{t('ctl.moves')}</h2>
      <ol ref={ref} className="max-h-48 min-h-16 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 font-mono text-sm lg:max-h-[40vh]">
        {rows.length === 0 && <li className="text-[var(--muted)]">—</li>}
        {rows.map((r) => (
          <li key={r.n} className="grid grid-cols-[2.5rem_1fr_1fr] gap-1 py-0.5">
            <span className="text-[var(--muted)]">{r.n}.</span>
            <span>{r.a}</span>
            <span>{r.b}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const BQ_CH: Record<string, string> = { K: '帥', A: '仕', B: '相', R: '俥', N: '傌', C: '炮', P: '兵', k: '將', a: '士', b: '象', r: '車', n: '馬', c: '包', p: '卒' };
const revealName = (p: string) => BQ_CH[p] ?? p;

function Captured({ snap }: { snap: Snapshot }) {
  if (snap.position.game !== 'banqi' || !snap.position.view.captured.length) return null;
  return (
    <div className="flex flex-wrap gap-1" aria-label="captured">
      {snap.position.view.captured.map((p, i) => (
        <span key={i} className="h-7 w-7">
          <DiscPiece code={p} dim />
        </span>
      ))}
    </div>
  );
}

export function resultTitle(t: (k: StringKey, v?: Record<string, string | number>) => string, snap: Snapshot, res: GameResult): string {
  if (res.kind === 'draw') return t('end.title.draw');
  const humans = snap.mode === 'ai' || snap.mode === 'practice' || snap.mode === 'online' ? snap.players.map((p, i) => (!p.isAi ? i : -1)).filter((i) => i >= 0) : [];
  if (snap.mode === 'online' && snap.online?.mySeat != null) return res.winner === snap.online.mySeat ? t('end.title.youWin') : t('end.title.youLose');
  if ((snap.mode === 'ai' || snap.mode === 'practice') && humans.length === 1) return res.winner === humans[0] ? t('end.title.youWin') : t('end.title.youLose');
  return t('end.title.win', { side: seatLabel(t, snap.game, res.winner!, snap) });
}

export function GameScreen({
  controller,
  onNewGame,
  title,
  localSaveKey,
}: {
  controller: GameController;
  onNewGame?: () => void;
  title?: string;
  localSaveKey?: string;
}) {
  const snap = useSnapshot(controller);
  const { t, to } = useI18n();
  const { settings, update } = useSettings();
  const nav = useNavigate();
  const defaultFlip = snap.mode === 'online' ? snap.online?.mySeat === 1 : snap.mode !== 'local' && snap.mySeats.length === 1 && snap.mySeats[0] === 1;
  const [flipped, setFlipped] = useState(defaultFlip);
  useEffect(() => setFlipped(defaultFlip), [defaultFlip]);
  const [info, setInfo] = useState<string | null>(null);
  const [hint, setHint] = useState<[string, string] | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | 'resign' | 'restart'>(null);
  const [endOpen, setEndOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [reviewRequested, setReviewRequested] = useState(false);
  const prevLen = useRef(snap.records.length);
  const prevResult = useRef(snap.result);

  // sounds & end-of-game dialog
  useEffect(() => {
    const n = snap.records.length;
    if (n > prevLen.current) {
      const r = snap.records[n - 1];
      if (snap.checkSquare) playSound('check', settings.sound);
      else if (r.capture) playSound('capture', settings.sound);
      else if (r.reveal) playSound('flip', settings.sound);
      else playSound('move', settings.sound);
      setHint(null);
    }
    prevLen.current = n;
    if (snap.result && !prevResult.current) {
      playSound('end', settings.sound);
      setEndOpen(true);
      if (localSaveKey && (controller as LocalController).save) saveLocalGame(localSaveKey, (controller as LocalController).save());
    }
    prevResult.current = snap.result;
  }, [snap.records.length, snap.result, snap.checkSquare, settings.sound, snap.records, localSaveKey, controller]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const api = useMemo(
    () => ({
      legalFrom: (sq: string) => controller.legalFrom(sq),
      move: (m: string) => {
        const ok = controller.move(m);
        if (!ok) playSound('error', settings.sound);
        return ok;
      },
      explain: (sq: string) => (snap.coachAllowed || snap.mode !== 'online' ? controller.explain(sq) : null),
    }),
    [controller, settings.sound, snap.coachAllowed, snap.mode],
  );

  const posKey = snap.position.game === 'banqi' ? `${snap.records.length}|${snap.position.view.cells.join('')}` : snap.position.fen + snap.records.length;
  const interactive = snap.mySeats.includes(snap.sideToMove) && !snap.result && !snap.clock.paused && !snap.thinking;

  const board =
    snap.position.game === 'chess' ? (
      <ChessBoard fen={snap.position.fen} api={api} flipped={flipped} lastMove={snap.lastMove} checkSquare={snap.checkSquare} hint={hint} interactive={interactive} onInfo={setInfo} />
    ) : snap.position.game === 'xiangqi' ? (
      <XiangqiBoard board={snap.position.board} positionKey={posKey} api={api} flipped={flipped} lastMove={snap.lastMove} checkSquare={snap.checkSquare} hint={hint} interactive={interactive} onInfo={setInfo} />
    ) : (
      <BanqiBoard cells={snap.position.view.cells} positionKey={posKey} api={api} flipped={flipped} lastMove={snap.lastMove} hint={hint} interactive={interactive} onInfo={setInfo} />
    );

  const top: Seat = flipped ? 0 : 1;
  const bottom: Seat = flipped ? 1 : 0;
  const status = snap.result
    ? `${resultTitle(t, snap, snap.result)} · ${t(`reason.${snap.result.reason}` as StringKey)}`
    : snap.clock.paused
      ? t('clock.paused')
      : snap.thinking
        ? t('board.thinking')
        : snap.mySeats.includes(snap.sideToMove) && snap.mySeats.length === 1
          ? t('board.yourTurn')
          : t('board.turn', { side: seatLabel(t, snap.game, snap.sideToMove, snap) });

  const isOnline = snap.mode === 'online';
  const isLocalish = !isOnline;

  const exportNotation = async () => {
    const st = (controller as LocalController).currentRules?.();
    let text = snap.records.map((r) => r.notation).join(' ');
    if (st && st.game === 'chess') {
      const s = st.serialize();
      if (s.game === 'chess') {
        const { ChessRules } = await import('../../shared/games/chess/rules');
        text = new ChessRules(s.state).pgn({ Event: 'JY Chess', Site: 'https://chess.jytrvl.com', Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.') });
      }
    } else if (st && st.game === 'xiangqi') {
      text = `[Game "Chinese Chess"]\n[FEN "${st.position().game === 'xiangqi' ? (st.serialize().state as { startFen: string }).startFen : ''}"]\n\n${snap.records
        .map((r, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${r.notation}` : r.notation))
        .join(' ')}\n\nICCS: ${st.moveList().join(' ')}`;
    }
    try {
      await navigator.clipboard.writeText(text);
      setToast(t('ctl.copied'));
    } catch {
      const blob = new Blob([text], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `jychess-${snap.game}.${snap.game === 'chess' ? 'pgn' : 'txt'}`;
      a.click();
    }
  };

  const saveFile = () => {
    const c = controller as LocalController;
    if (!c.save) return;
    const data = c.save();
    if (localSaveKey) saveLocalGame(localSaveKey, data);
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `jychess-${snap.game}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.json`;
    a.click();
    setToast(t('ctl.save'));
  };

  const offerForMe = snap.offer && !snap.mySeats.includes(snap.offer.from) && (isOnline || snap.mode === 'local');
  const offerByMe = snap.offer && snap.mySeats.includes(snap.offer.from) && isOnline;

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="mx-auto flex w-full flex-col gap-2" style={{ maxWidth: snap.game === 'banqi' ? '56rem' : 'min(100%, calc(100dvh - 15rem) * ' + (snap.game === 'xiangqi' ? '0.9' : '1') + ')' }}>
        {title && <h1 className="sr-only">{title}</h1>}
        <PlayerBar snap={snap} seat={top} flipped={flipped} />
        <div className="relative">
          {board}
          {snap.clock.paused && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-black/50">
              <Button size="lg" onClick={() => controller.resume()}>
                ▶ {t('ctl.resume')}
              </Button>
            </div>
          )}
        </div>
        <PlayerBar snap={snap} seat={bottom} flipped={flipped} />
        <p className="min-h-6 text-center text-sm font-medium" role="status" aria-live="polite">
          {status}
          {snap.checkSquare && !snap.result ? ` · ${t(snap.game === 'chess' ? 'board.checkChess' : 'board.check')}` : ''}
        </p>
        {info && (
          <p className="rounded-lg bg-[var(--info-bg)] px-3 py-2 text-center text-sm" role="note">
            {t(info as StringKey)}
          </p>
        )}
        <Captured snap={snap} />
      </div>

      <aside className="flex flex-col gap-3" aria-label={t('ctl.more')}>
        {(offerForMe || offerByMe) && (
          <div className="rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] p-3" role="alert">
            <p className="mb-2 font-medium">
              {offerByMe ? t(snap.offer!.kind === 'draw' ? 'offer.draw.sent' : 'offer.undo.sent') : t(snap.offer!.kind === 'draw' ? 'offer.draw.recv' : 'offer.undo.recv')}
            </p>
            {offerForMe && (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => controller.respondOffer(true)}>
                  {t('offer.accept')}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => controller.respondOffer(false)}>
                  {t('offer.decline')}
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3">
          {snap.canUndo !== undefined && (isLocalish || isOnline) && (
            <Button variant="secondary" size="sm" disabled={!snap.canUndo} onClick={() => controller.undo()}>
              ↶ {t('ctl.undo')}
            </Button>
          )}
          {isLocalish && (
            <Button variant="secondary" size="sm" disabled={!snap.canRedo} onClick={() => controller.redo()}>
              ↷ {t('ctl.redo')}
            </Button>
          )}
          {isLocalish && (
            <Button variant="secondary" size="sm" disabled={!snap.canPause} onClick={() => (snap.clock.paused ? controller.resume() : controller.pause())}>
              {snap.clock.paused ? `▶ ${t('ctl.resume')}` : `⏸ ${t('ctl.pause')}`}
            </Button>
          )}
          <Button variant="secondary" size="sm" disabled={!!snap.result || snap.mySeats.length === 0} onClick={() => controller.offerDraw()}>
            ½ {t('ctl.draw')}
          </Button>
          {snap.claimable && (
            <Button variant="secondary" size="sm" onClick={() => controller.claimDraw()}>
              ⚖ {t('ctl.claim')}
            </Button>
          )}
          <Button variant="secondary" size="sm" disabled={!!snap.result || snap.mySeats.length === 0} onClick={() => setConfirm('resign')}>
            ⚑ {t('ctl.resign')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setFlipped((f) => !f)}>
            ⇅ {t('ctl.flip')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setRulesOpen(true)}>
            📖 {t('ctl.rules')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setMoreOpen(true)}>
            ⋯ {t('ctl.more')}
          </Button>
        </div>

        {(snap.coachAllowed || (snap.mode === 'online' && snap.rated)) && (
          <CoachPanel
            controller={controller}
            snap={snap}
            onHint={setHint}
            reviewRequested={reviewRequested}
            onReviewDone={() => setReviewRequested(false)}
          />
        )}

        <MoveList snap={snap} />
        {toast && (
          <p className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-center text-sm" role="status">
            {toast}
          </p>
        )}
      </aside>

      <Modal open={rulesOpen} onClose={() => setRulesOpen(false)} title={t('ctl.rules')} wide>
        <RulesReference game={snap.game} banqiOptions={snap.position.game === 'banqi' ? snap.position.view.options : undefined} />
      </Modal>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title={t('ctl.more')}>
        <div className="space-y-2">
          <Toggle checked={settings.sound} onChange={(v) => update({ sound: v })} label={t('ctl.sound')} />
          <Toggle checked={settings.animation} onChange={(v) => update({ animation: v })} label={t('ctl.anim')} />
          <Toggle checked={settings.hints} onChange={(v) => update({ hints: v })} label={t('settings.hints')} />
          <Toggle checked={settings.coords} onChange={(v) => update({ coords: v })} label={t('settings.coord')} />
          <div className="grid grid-cols-2 gap-2 pt-2">
            {isLocalish && (
              <Button variant="secondary" onClick={saveFile}>
                💾 {t('ctl.save')}
              </Button>
            )}
            {snap.game !== 'banqi' && isLocalish && (
              <Button variant="secondary" onClick={exportNotation}>
                📋 {t('ctl.export')}
              </Button>
            )}
            {isLocalish && (
              <Button variant="secondary" onClick={() => setConfirm('restart')}>
                ⟲ {t('ctl.restart')}
              </Button>
            )}
            {onNewGame && (
              <Button variant="secondary" onClick={onNewGame}>
                ＋ {t('ctl.new')}
              </Button>
            )}
          </div>
        </div>
      </Modal>

      <Modal open={confirm !== null} onClose={() => setConfirm(null)} title={confirm === 'resign' ? t('ctl.resign') : t('ctl.restart')}>
        <p className="mb-4">{confirm === 'resign' ? t('confirm.resign') : t('confirm.restart')}</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirm(null)}>
            {t('ctl.cancel')}
          </Button>
          <Button
            variant={confirm === 'resign' ? 'danger' : 'primary'}
            onClick={() => {
              if (confirm === 'resign') controller.resign();
              else controller.restart();
              setConfirm(null);
              setMoreOpen(false);
            }}
          >
            {t('ctl.confirm')}
          </Button>
        </div>
      </Modal>

      <Modal open={endOpen && !!snap.result} onClose={() => setEndOpen(false)} title={snap.result ? resultTitle(t, snap, snap.result) : ''}>
        {snap.result && (
          <div className="space-y-4">
            <p className="text-lg">{t(`reason.${snap.result.reason}` as StringKey)}</p>
            {snap.online?.ratingChange && <p className="font-medium">{t('end.rating', { old: snap.online.ratingChange.old, new: snap.online.ratingChange.new })}</p>}
            <div className="flex flex-wrap gap-2">
              {isLocalish && (
                <Button
                  onClick={() => {
                    controller.restart();
                    setEndOpen(false);
                  }}
                >
                  {t('end.again')}
                </Button>
              )}
              {onNewGame && isOnline && <Button onClick={onNewGame}>{t('end.again')}</Button>}
              {snap.game !== 'banqi' || isLocalish ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setReviewRequested(true);
                    setEndOpen(false);
                  }}
                >
                  {t('end.analyse')}
                </Button>
              ) : null}
              <Button variant="ghost" onClick={() => nav(to('/'))}>
                {t('end.home')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
