// Sudoku board (full 9×9 or the zoomed 3×3 box) with grid / row / gridcell semantics and roving focus.
import { useEffect, useRef } from 'react';
import { boxOf, colOf, rowOf, digitsOf } from '../../shared/sudoku/engine';
import { useI18n } from '../i18n';

export interface BoardModel {
  givens: string;
  entries: number[];
  notes: number[];
  sel: number;
  conflicts: Set<number>;
  /** hint evidence (pattern) and target cells */
  evidence?: Set<number>;
  targets?: Set<number>;
  readOnly?: boolean;
}

export function SudokuBoard({ m, zoomBox, onSelect, label }: { m: BoardModel; zoomBox: number | null; onSelect: (cell: number) => void; label?: string }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const cells =
    zoomBox === null
      ? Array.from({ length: 81 }, (_, i) => i)
      : Array.from({ length: 9 }, (_, k) => (Math.floor(zoomBox / 3) * 3 + Math.floor(k / 3)) * 9 + (zoomBox % 3) * 3 + (k % 3));
  const n = zoomBox === null ? 9 : 3;
  const rows = Array.from({ length: n }, (_, r) => cells.slice(r * n, r * n + n));
  const selDigit = m.entries[m.sel] || Number(m.givens[m.sel]) || 0;
  // keep DOM focus on the selected cell while the board has focus (keyboard navigation)
  useEffect(() => {
    const el = ref.current;
    if (!el || !el.contains(document.activeElement)) return;
    el.querySelector<HTMLElement>(`[data-cell="${m.sel}"]`)?.focus();
  }, [m.sel, zoomBox]);

  return (
    <div
      ref={ref}
      role="grid"
      aria-label={label ?? t('sudoku.a11y.grid')}
      aria-readonly={m.readOnly || undefined}
      className="grid aspect-square w-full select-none overflow-hidden rounded-md border-2 border-[var(--text)] bg-[var(--surface)]"
      style={{ gridTemplateRows: `repeat(${n}, minmax(0, 1fr))` }}
      data-zoom={zoomBox !== null}
    >
      {rows.map((row, r) => (
        <div role="row" key={r} className="grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {row.map((i) => {
            const given = m.givens[i] !== '0';
            const v = given ? Number(m.givens[i]) : m.entries[i];
            const selected = i === m.sel;
            const peer = !selected && (rowOf(i) === rowOf(m.sel) || colOf(i) === colOf(m.sel) || boxOf(i) === boxOf(m.sel));
            const same = !selected && selDigit > 0 && v === selDigit;
            const conflict = m.conflicts.has(i);
            const ev = m.evidence?.has(i);
            const target = m.targets?.has(i);
            const c = colOf(i),
              rr = rowOf(i);
            const thickR = zoomBox === null ? c % 3 === 2 && c < 8 : false;
            const thickB = zoomBox === null ? rr % 3 === 2 && rr < 8 : false;
            const lastC = zoomBox === null ? c === 8 : c % 3 === 2;
            const lastR = zoomBox === null ? rr === 8 : rr % 3 === 2;
            const noteDigits = digitsOf(m.notes[i]);
            const content = given ? `${t('sudoku.a11y.given')} ${v}` : v ? `${t('sudoku.a11y.entry')} ${v}` : noteDigits.length ? t('sudoku.a11y.notes', { digits: noteDigits.join(' ') }) : t('sudoku.a11y.empty');
            const bg = conflict ? 'bg-[var(--err-bg)]' : selected ? 'bg-[var(--accent-soft)]' : same ? 'bg-[var(--accent-soft)]' : peer ? 'bg-[var(--surface-2)]' : '';
            return (
              <div
                key={i}
                role="gridcell"
                data-cell={i}
                data-given={given || undefined}
                data-value={v || undefined}
                data-conflict={conflict || undefined}
                aria-selected={selected}
                aria-label={t('sudoku.a11y.cell', { row: rr + 1, column: c + 1, box: boxOf(i) + 1, content, state: conflict ? t('sudoku.a11y.conflict') : '' }).replace(/；$|; $/, '')}
                tabIndex={selected ? 0 : -1}
                onClick={() => onSelect(i)}
                className={`relative flex min-w-0 cursor-pointer items-center justify-center outline-none ${bg} ${lastC ? '' : thickR ? 'border-r-2 border-r-[var(--text)]' : 'border-r border-r-[var(--border)]'} ${lastR ? '' : thickB ? 'border-b-2 border-b-[var(--text)]' : 'border-b border-b-[var(--border)]'} ${selected ? 'shadow-[inset_0_0_0_2px_var(--accent-text)]' : ''} ${ev ? 'shadow-[inset_0_0_0_3px_var(--gold)]' : ''} ${target ? 'outline-dashed outline-2 -outline-offset-4 outline-[var(--gold)]' : ''} focus-visible:shadow-[inset_0_0_0_3px_var(--focus)]`}
                style={{ fontSize: zoomBox === null ? 'clamp(15px, 5.2vw, 26px)' : 'clamp(28px, 10vw, 44px)' }}
              >
                {v ? (
                  <span className={given ? 'font-bold text-[var(--text)]' : conflict ? 'font-normal text-[var(--err-text)]' : 'font-normal text-[var(--accent-text)] underline decoration-1 underline-offset-4'}>{v}</span>
                ) : noteDigits.length ? (
                  <span className="grid h-full w-full grid-cols-3 grid-rows-3 p-[2px] text-[var(--muted)]" style={{ fontSize: zoomBox === null ? 'clamp(7px, 2.2vw, 11px)' : 'clamp(12px, 3.6vw, 16px)', lineHeight: 1 }} aria-hidden="true">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                      <span key={d} className="flex items-center justify-center">
                        {noteDigits.includes(d) ? d : ''}
                      </span>
                    ))}
                  </span>
                ) : null}
                {conflict && (
                  <span className="absolute right-[2px] top-0 text-[10px] font-bold text-[var(--err-text)]" aria-hidden="true">
                    !
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
