// Decorative Sudoku preview for the home page and lobby (no puzzle bank import).
export function SudokuPreview() {
  const rows = ['53..7....', '6..195...', '.98....6.', '8...6...3', '4..8.3..1', '7...2...6', '.6....28.', '...419..5', '....8..79'];
  return (
    <div className="mx-auto grid aspect-[2/1] w-full grid-cols-[repeat(9,1fr)] grid-rows-[repeat(4,1fr)] overflow-hidden rounded-xl border-2 border-[var(--text)] bg-[var(--surface)]" aria-hidden="true">
      {rows.slice(0, 4).flatMap((r, y) =>
        [...r].map((ch, x) => (
          <div key={`${x}-${y}`} className={`flex items-center justify-center font-serif text-lg font-bold ${x % 3 === 2 && x < 8 ? 'border-r-2 border-r-[var(--text)]' : 'border-r border-r-[var(--border)]'} ${y < 3 ? (y === 2 ? 'border-b-2 border-b-[var(--text)]' : 'border-b border-b-[var(--border)]') : ''} ${ch === '.' ? '' : 'text-[var(--text)]'}`}>
            {ch === '.' ? (x + y) % 5 === 0 ? <span className="text-sm font-normal text-[var(--accent-text)] underline underline-offset-2">{((x * 7 + y * 3) % 9) + 1}</span> : '' : ch}
          </div>
        )),
      )}
    </div>
  );
}
