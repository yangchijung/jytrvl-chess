// Natural-language explanation of a hint step, built from the shared bilingual copy.
import { colOf, rowOf, unitKind, unitNumber, type Step } from '../../shared/sudoku/engine';
import type { Lang, StringKey } from '../i18n';

type T = (k: StringKey, v?: Record<string, string | number>) => string;

export function unitName(t: T, lang: Lang, u: number): string {
  const k = unitKind(u);
  const s = t(k === 'row' ? 'sudoku.row' : k === 'column' ? 'sudoku.column' : 'sudoku.box', { number: unitNumber(u) });
  return lang === 'en' ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

const join = (lang: Lang, xs: string[]) => {
  if (lang === 'zh') return xs.join('、');
  if (xs.length <= 2) return xs.join(' and ');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
};

export function cellName(lang: Lang, cell: number) {
  const r = rowOf(cell) + 1,
    c = colOf(cell) + 1;
  return lang === 'zh' ? `第 ${r} 列第 ${c} 行` : `R${r}C${c}`;
}

export function cellList(lang: Lang, cells: number[]) {
  return join(lang, [...new Set(cells)].sort((a, b) => a - b).map((c) => cellName(lang, c)));
}

export function stepText(t: T, lang: Lang, st: Step): string {
  const d = st.digits[0];
  const targets = cellList(
    lang,
    st.eliminate.map((e) => e.cell),
  );
  switch (st.technique) {
    case 'nakedSingle':
      return t('sudoku.hint.nakedSingle', { row: rowOf(st.place!.cell) + 1, column: colOf(st.place!.cell) + 1, digit: st.place!.digit });
    case 'hiddenSingle':
      return t('sudoku.hint.hiddenSingle', { unit: unitName(t, lang, st.units[0]), row: rowOf(st.place!.cell) + 1, column: colOf(st.place!.cell) + 1, digit: st.place!.digit });
    case 'pointing':
    case 'claiming':
      return t('sudoku.hint.locked', { sourceUnit: unitName(t, lang, st.units[0]), digit: d, cells: cellList(lang, st.cells), targetCells: targets });
    case 'nakedPair':
      return t('sudoku.hint.nakedPair', { unit: unitName(t, lang, st.units[0]), cells: cellList(lang, st.cells), digits: join(lang, st.digits.map(String)), targetCells: targets });
    case 'hiddenPair':
      return t('sudoku.hint.hiddenPair', { unit: unitName(t, lang, st.units[0]), digits: join(lang, st.digits.map(String)), cells: cellList(lang, st.cells) });
    case 'xwingRow':
    case 'xwingColumn':
      return t('sudoku.hint.xwing', {
        sourceUnits: join(
          lang,
          st.units.map((u) => unitName(t, lang, u)),
        ),
        digit: d,
        crossUnits: join(
          lang,
          st.targetUnits.map((u) => unitName(t, lang, u)),
        ),
        targetCells: targets,
      });
  }
}

/** Technique label for the hint panel heading. */
export const TECHNIQUE_LABEL: Record<Step['technique'], { zh: string; en: string }> = {
  nakedSingle: { zh: '單一候選', en: 'Naked single' },
  hiddenSingle: { zh: '唯一位置', en: 'Hidden single' },
  pointing: { zh: '宮列／宮行排除（宮內指向）', en: 'Locked candidates (pointing)' },
  claiming: { zh: '宮列／宮行排除（列行佔宮）', en: 'Locked candidates (claiming)' },
  nakedPair: { zh: '裸對', en: 'Naked pair' },
  hiddenPair: { zh: '隱性對', en: 'Hidden pair' },
  xwingRow: { zh: 'X-Wing（列）', en: 'X-Wing (rows)' },
  xwingColumn: { zh: 'X-Wing（行）', en: 'X-Wing (columns)' },
};
