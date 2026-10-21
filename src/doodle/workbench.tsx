// Color Doodle V2 (色彩塗鴉樂) — the drawing workbench (docs/product/DOODLE_WORKBENCH_V2.md §2, Issue #7 C1).
// Task: pick a paint, mix a new colour on the palette, paint with it. The white paper is the main content (about
// two thirds of the width on a tablet); next to it a hand-held palette with five paints, two wells, a mixing
// pool and the result. Phones: paper → tools → palette, scrolling naturally. One short hint at a time.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { format, useI18n } from '../i18n';
import { Button, Modal } from '../components/ui';
import {
  BASE_PAINTS,
  COLORS,
  COPY,
  LESSONS,
  MAX_PTS,
  RECIPES,
  canRedo,
  canUndo,
  clearFree,
  colorOf,
  freeFull,
  gridCells,
  inkOn,
  isCorrectChoice,
  lessonStep,
  mixOutcome,
  newRun,
  partnersOf,
  pushFree,
  pushGrid,
  recipeOf,
  redo,
  splitPoints,
  undo,
  visibleFree,
  type ColorId,
  type FreeOp,
  type History,
  type MixOutcome,
  type Shape,
  type Size,
} from '../../shared/doodle/model';
import { FISH_ART, pushScene, regionColors, taskMet, type Region } from '../../shared/doodle/scene';
import { LINE, REGIONS_OF, TEMPLATES, VIEWBOX, templateOf, type Template } from '../../shared/doodle/templates';
import { addMixed, addQuest, useRecent, withWork, workOf, type SavedV2 } from '../../shared/doodle/v2';
import { exportPng, exportTemplatePng } from './draw';
import { DoodleStore } from './v2store';
import { ICONS, Icon, MarkIcon, Paper, StampGrid, Wheel, X, downloadText, markColour, reduced } from './parts';
import { BoardShape, Dab, ToolIcon } from './art';
import './workbench.css';

type L = { zh: string; en: string };
const W: Record<string, L> = {
  subtitle: { zh: '選個顏色，畫看看', en: 'Pick a colour and draw' },
  myPalette: { zh: '我的調色盤', en: 'My palette' },
  myColours: { zh: '我的顏色', en: 'My colours' },
  allColours: { zh: '全部 29 色', en: 'All 29 colours' },
  hideAll: { zh: '收起全部顏色', en: 'Hide all colours' },
  startMix: { zh: '玩混色', en: 'Mix colours' },
  stopMix: { zh: '不混了', en: 'Stop mixing' },
  paintHint: { zh: '點顏料就能畫。想調新顏色，按「玩混色」。', en: 'Tap a paint to draw with it. To make a new colour, press “Mix colours”.' },
  pickTwo: { zh: '點兩色，混看看', en: 'Pick two colours to mix' },
  pickSecond: { zh: '再點一色；有外框的顏色可以和它混', en: 'Pick one more. Outlined paints mix with it' },
  ready: { zh: '按「混一混」', en: 'Press “Mix”' },
  well: { zh: '第 {n} 格：{c}', en: 'Well {n}: {c}' },
  wellEmpty: { zh: '空的', en: 'empty' },
  pool: { zh: '新顏色', en: 'New colour' },
  poolLabel: { zh: '新顏色會出現在這裡', en: 'The new colour appears here' },
  poolResult: { zh: '混好的顏色：{c}，點一下就能用', en: 'Mixed colour: {c}. Tap to use it' },
  equation: { zh: '{a} ＋ {b} ＝ {r}', en: '{a} + {b} = {r}' },
  same: { zh: '還是{c}。換一個顏色混混看。', en: 'Still {c}. Try a different colour.' },
  none: { zh: '這兩色這裡還不能混。', en: 'These two do not mix here yet.' },
  tryThese: { zh: '試試 {a} ＋ {b}', en: 'Try {a} + {b}' },
  seeRecipes: { zh: '看配方', en: 'See the recipes' },
  paint: { zh: '用這色畫', en: 'Paint with this' },
  fillWith: { zh: '用這色填', en: 'Fill with this' },
  stampWith: { zh: '用這色蓋章', en: 'Stamp with this' },
  addWhite: { zh: '再加白', en: 'Add white' },
  again: { zh: '換兩色', en: 'Pick two again' },
  recipe: { zh: '{a}＋{b}', en: '{a} + {b}' },
  putInWells: { zh: '把 {a} 和 {b} 放進調色盤', en: 'Put {a} and {b} on the palette' },
  basePaint: { zh: '基本顏料', en: 'Base paint' },
  fill: { zh: '填色', en: 'Fill' },
  stampTool: { zh: '蓋章', en: 'Stamp' },
  savePic: { zh: '存成圖', en: 'Save picture' },
  quests: { zh: '混色小挑戰', en: 'Mixing challenges' },
  q_pink: { zh: '紅＋白，混出粉紅', en: 'Red + white: make pink' },
  q_pale_pink: { zh: '粉紅再加白', en: 'Pink + white' },
  q_use: { zh: '用混出的顏色畫一筆', en: 'Paint with a colour you mixed' },
  questDone: { zh: '完成', en: 'Done' },
  questNote: { zh: '想玩再玩，不做也可以。', en: 'Only if you feel like it.' },
  viewOnly: { zh: '這張畫正在另一個分頁打開，這裡先只看不改。', en: 'This drawing is open in another tab, so this tab only shows it.' },
  takeOver: { zh: '改在這裡畫', en: 'Draw here instead' },
  uncoord: { zh: '這個瀏覽器無法協調多個分頁，請只開一個分頁畫。', en: 'This browser cannot coordinate tabs; please draw in one tab only.' },
  v1Kept: { zh: '舊的存檔讀不出來，所以沒有搬進新畫板；原本的資料留著沒動，可以下載。', en: 'The old save could not be read, so it was not moved in; it is kept untouched and can be downloaded.' },
  conflict: { zh: '另一個分頁剛改過這張畫，這裡已換成最新的；剛才這一筆另外保留，可以下載。', en: 'Another tab changed this drawing first. This tab now shows the newest one; your last change is kept separately and can be downloaded.' },
  downloadThis: { zh: '下載剛才這一筆', en: 'Download that change' },
  imported: { zh: '之前的畫已經搬進新的畫板，原本的存檔也留著。', en: 'Your earlier drawings moved into the new workbench; the old save is kept too.' },
  sceneHint: { zh: '點身體、尾巴或魚鰭，就能上色', en: 'Tap the body, tail or fin to colour it' },
  sceneAny: { zh: '點圖上的一塊，就能上色', en: 'Tap a part of the picture to colour it' },
  choose: { zh: '換底圖', en: 'Choose a picture' },
  chooseTitle: { zh: '選一張底圖', en: 'Choose a picture' },
  chooseNote: { zh: '每張都會各自保留，換回來還在。', en: 'Each picture keeps its own colours. Come back any time.' },
  coloured: { zh: '已上色 {n}／{t}', en: '{n} of {t} coloured' },
  regionsOf: { zh: '{name}的部位', en: 'Parts of {name}' },
  gridHint: { zh: '選顏色，點格子蓋章', en: 'Pick a colour, then tap a square to stamp' },
  backToPaper: { zh: '回到畫紙', en: 'Back to the paper' },
  usingNow: { zh: '正在用：{c}', en: 'Painting with: {c}' },
  eraserOn: { zh: '正在用：橡皮擦', en: 'Using: eraser' },
};

type Out = { a: ColorId; b: ColorId; o: MixOutcome } | null;

export function DoodlePage() {
  const { lang } = useI18n();
  const tr = (l: L, v?: Record<string, string | number>) => format(l[lang], v);
  const c = (k: string, v?: Record<string, string | number>) => format((COPY[k] ?? X[k] ?? W[k])[lang], v);
  const name = (id: ColorId) => colorOf(id).name[lang];

  const store = useMemo(() => new DoodleStore(), []);
  const [, setVer] = useState(0);
  const [showImported] = useState(() => store.imported);
  useEffect(() => {
    const off = store.subscribe(() => setVer((n) => n + 1));
    store.start();
    return () => {
      off();
      store.stop();
    };
  }, [store]);
  const w = store.v;
  const viewer = store.role === 'viewer';
  /** Apply one finished change to the saved drawing (refused in a view-only tab). */
  const update = useCallback((f: (s: SavedV2) => SavedV2) => {
    const next = f(store.v);
    if (next === store.v) return true;
    const ok = store.commit(next);
    setVer((n) => n + 1);
    return ok;
  }, [store]);

  const view = w.view;
  const run = w.active;
  const lessonIdx = run ? LESSONS.findIndex((l) => l.id === run.lessonId) : null;
  const lesson = lessonIdx !== null && lessonIdx >= 0 ? LESSONS[lessonIdx] : null;
  const step = lesson && run ? lessonStep(lesson, run, w.level) : null;
  const sid = w.sceneId;
  const tpl = templateOf(sid);
  const regions = REGIONS_OF[sid];
  const work = workOf(w, sid);
  const colors = regionColors(work.fills, regions);
  const regionName = (r: Region) => tpl.regions.find((x) => x.id === r)?.name[lang] ?? r;
  const isFish = sid === 'fish';

  const [tool, setTool] = useState<'brush' | 'eraser' | 'stamp'>('brush');
  const [color, setColor] = useState<ColorId>(() => w.recent[0] ?? 'red');
  const [size, setSize] = useState<Size>('m');
  const [shape, setShape] = useState<Shape>('circle');
  const [mixing, setMixing] = useState(false);
  const [slots, setSlots] = useState<(ColorId | null)[]>([null, null]);
  const [out, setOut] = useState<Out>(null);
  const [allOpen, setAllOpen] = useState(false);
  const [say, setSay] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [gridFocus, setGridFocus] = useState(0);
  const [full, setFull] = useState(false);
  const [moveMsg, setMoveMsg] = useState(false);
  const [why, setWhy] = useState(false);
  const [choiceMsg, setChoiceMsg] = useState<string | null>(null);
  const [fx, setFx] = useState(0);
  const [picker, setPicker] = useState(false);
  const paperRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<SVGGElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (window as unknown as { __doodle?: unknown }).__doodle = { s: w, role: store.role, status: store.status, notice: store.notice, view, color, tool, mixing, slots, out, run, step, lesson: lesson?.id, full };
  });

  // ---------------------------------------------------------------- history per paper
  const history: History<unknown> = view === 'scene' ? work.fills : view === 'free' ? w.free : w.grid;
  const onHistory = (f: 'undo' | 'redo' | 'clear') => {
    if (view === 'scene') return update((s) => withWork(s, sid, { ...work, fills: f === 'undo' ? undo(work.fills) : f === 'redo' ? redo(work.fills) : pushScene(work.fills, { t: 'clear' }, regions) }));
    update((s) => (view === 'free' ? { ...s, free: f === 'undo' ? undo(s.free) : f === 'redo' ? redo(s.free) : clearFree(s.free) } : { ...s, grid: f === 'undo' ? undo(s.grid) : f === 'redo' ? redo(s.grid) : pushGrid(s.grid, { t: 'clear' }) }));
  };
  useEffect(() => {
    if (full && !freeFull(w.free)) setFull(false);
  }, [w.free, full]);
  const openView = (v: 'free' | 'grid' | 'scene') => {
    update((s) => (s.view === v ? s : { ...s, view: v }));
    setMoveMsg(false);
    if (v !== 'free' && tool === 'stamp') setTool('brush');
  };

  /** A mark with a colour the child mixed counts for the "use a mixed colour" challenge. */
  const marked = (s: SavedV2, col: ColorId | null): SavedV2 => {
    let n = s;
    if (col && !BASE_PAINTS.includes(col) && s.mixedColors.includes(col)) n = addQuest(n, 'use');
    if (col && run && step === 'apply') n = { ...n, active: n.active ? { ...n.active, marks: { ...n.active.marks, [col]: (n.active.marks[col] ?? 0) + 1 } } : n.active };
    return n;
  };
  const commitFree = useCallback(
    (op: FreeOp) => {
      const parts: FreeOp[] = op.t === 'stroke' && op.pts.length > MAX_PTS ? splitPoints(op.pts).map((pts) => ({ ...op, pts })) : [op];
      let h: History<FreeOp> | null = store.v.free;
      for (const part of parts) h = h && pushFree(h, part);
      if (!h) {
        setFull(true);
        setSay(X.full[lang]);
        setVer((n) => n + 1);
        return;
      }
      const next = h;
      update((s) => marked({ ...s, free: next }, op.t !== 'clear' && !(op.t === 'stroke' && op.erase) ? op.color : null));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [run, step, lang, update, store],
  );
  const stampCell = (i: number) => {
    const value = tool === 'eraser' ? null : { color, shape };
    update((s) => marked({ ...s, grid: pushGrid(s.grid, { t: 'cell', i, value }) }, value ? color : null));
    const content = value ? `${name(color)}${lang === 'zh' ? '' : ' '}${c(shape)}` : c('empty');
    setSay(c('gridAnnouncement', { row: Math.floor(i / 3) + 1, column: (i % 3) + 1, content }));
  };
  const fillRegion = (region: Region) => {
    const value = tool === 'eraser' ? null : color;
    const fills = pushScene(work.fills, { t: 'fill', region, color: value }, regions);
    const met = isFish && taskMet({ mixedOrange: work.mixedOrange, fills });
    update((s) => marked(withWork(s, sid, { ...work, fills, done: work.done || met }), value));
    setMoveMsg(false);
    const msg = `${regionName(region)}${lang === 'zh' ? '：' : ': '}${value ? name(value) : X.noColour[lang]}`;
    setSay(met && !work.done ? `${msg} ${X.fishDone[lang]}` : msg);
  };
  const moveFish = () => {
    setMoveMsg(true);
    setSay(X.moved[lang]);
    if (!reduced()) tailRef.current?.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(-14deg)' }, { transform: 'rotate(0deg)' }], { duration: 200, easing: 'ease-out' });
  };

  // ---------------------------------------------------------------- lessons (unchanged rules)
  useEffect(() => {
    if (lesson && step === 'done' && !w.done.includes(lesson.id)) {
      update((s) => ({ ...s, done: [...s.done, lesson.id] }));
      setSay((prev) => (prev && !prev.includes(lesson.success[lang]) ? `${prev} ${lesson.success[lang]}` : lesson.success[lang]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  const startLesson = (i: number) => {
    const l = LESSONS[i];
    update((s) => ({ ...s, active: newRun(l.id) }));
    setChoiceMsg(null);
    setWhy(false);
    setOut(null);
    const r = l.recipe ? RECIPE_BY_ID[l.recipe] : null;
    if (r) {
      setSlots([...r.inputs]);
      setMixing(true);
    }
  };
  const exitLesson = () => update((s) => ({ ...s, active: null }));
  const choose = (choice: string) => {
    if (!lesson || !run) return;
    if (lesson.recipe) {
      update((s) => ({ ...s, active: s.active ? { ...s.active, guess: choice } : null }));
      setChoiceMsg(c('predictionFeedback'));
      return;
    }
    update((s) => ({ ...s, active: s.active ? { ...s.active, chosen: choice } : null }));
    setChoiceMsg(isCorrectChoice(lesson, choice) ? null : X.notYet[lang]);
  };
  useEffect(() => {
    if (!lesson || step !== 'apply' || w.level !== 'easy') return;
    const need = lesson.complete.appliedColors ?? (lesson.complete.appliedColor ? [lesson.complete.appliedColor] : []);
    const missing = need.find((col) => (run?.marks[col] ?? 0) < 1);
    if (missing && color !== missing) setColor(missing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, run?.marks]);

  // ---------------------------------------------------------------- palette: paint and mix
  const paintWith = (id: ColorId) => {
    setColor(id);
    if (tool === 'eraser') setTool('brush');
    update((s) => useRecent(s, id));
    setSay(tr(W.usingNow, { c: name(id) }));
  };
  const pick = (id: ColorId) => {
    if (!mixing) return paintWith(id);
    setOut(null);
    setSlots(([a, b]) => (a === null ? [id, b] : b === null ? [a, id] : [a, id]));
  };
  const doMix = () => {
    const [a, b] = slots;
    if (!a || !b) return;
    const o = mixOutcome(a, b);
    setOut({ a, b, o });
    setFx((n) => n + 1);
    setMoveMsg(false);
    if (o.kind === 'recipe') {
      const r = o.recipe;
      update((s) => {
        let n = addMixed(s, r.output);
        if (r.id === 'tint_red') n = addQuest(n, 'pink');
        if (r.id === 'tint_pink') n = addQuest(n, 'pale_pink');
        if (n.active && lesson?.recipe === r.id && view !== 'scene') n = { ...n, active: { ...n.active, mixed: [...n.active.mixed, r.id] } };
        if (view === 'scene' && isFish && r.id === 'mix_orange') n = withWork(n, 'fish', { ...workOf(n, 'fish'), mixedOrange: true, done: workOf(n, 'fish').done || taskMet({ mixedOrange: true, fills: workOf(n, 'fish').fills }) });
        return n;
      });
      setSay(c('mixAnnouncement', { a: name(a), b: name(b), result: name(r.output) }));
    } else if (o.kind === 'same') setSay(tr(W.same, { c: name(a) }));
    else setSay(tr(W.none));
  };
  const resultColor = out?.o.kind === 'recipe' ? out.o.recipe.output : out?.o.kind === 'same' ? out.o.color : null;
  const takeToPaper = (id: ColorId) => {
    paintWith(id);
    setMixing(false);
    setOut(null);
    setSlots([null, null]);
    requestAnimationFrame(() => {
      const el = stageRef.current;
      if (el) el.scrollIntoView({ block: el.getBoundingClientRect().height <= window.innerHeight - 80 ? 'center' : 'start', behavior: reduced() ? 'instant' : 'smooth' });
      if (view === 'scene') regionRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
      else if (view === 'free') paperRef.current?.focus({ preventScroll: true });
      else gridRef.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus({ preventScroll: true });
    });
  };
  const addWhite = () => {
    if (!resultColor) return;
    setSlots([resultColor, 'white']);
    setOut(null);
  };
  const putRecipe = (a: ColorId, b: ColorId) => {
    setMixing(true);
    setSlots([a, b]);
    setOut(null);
    requestAnimationFrame(() => paletteRef.current?.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'instant' : 'smooth' }));
  };
  const startMixing = (on: boolean) => {
    setMixing(on);
    setOut(null);
    if (!on) setSlots([null, null]);
  };
  const partners = mixing && slots[0] && !slots[1] ? partnersOf(slots[0]) : [];
  const canWhite = !!resultColor && out?.o.kind === 'recipe' && !!mixOutcomeOk(resultColor, 'white');

  const doExport = async () => {
    const blob = view === 'scene' ? await exportTemplatePng(tpl, colors) : await exportPng(view === 'grid' ? 'grid' : 'free', visibleFree(w.free), gridCells(w.grid));
    if (!blob) return;
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `color-doodle-${view === 'scene' ? `${sid}-` : ''}${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        onHistory(e.shiftKey ? 'redo' : 'undo');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------------------------------------------------------------- hints
  const fishHint = !isFish ? (Object.values(colors).some(Boolean) ? X.tryAnother[lang] : tr(W.sceneAny)) : taskMet(work) ? X.fishDone[lang] : work.mixedOrange ? X.tapBody[lang] : Object.values(colors).some(Boolean) ? X.tryAnother[lang] : tr(W.sceneHint);
  const hint =
    view === 'scene'
      ? moveMsg
        ? X.moved[lang]
        : fishHint
      : lesson && step
        ? step === 'done'
          ? lesson.success[lang]
          : step === 'apply'
            ? lesson.applyPrompt[lang]
            : step === 'choose' && lesson.classification
              ? X.pickWarm[lang]
              : lesson.prompt[lang]
        : view === 'grid'
          ? tr(W.gridHint)
          : tr(W.subtitle);
  const boardHint = !mixing ? tr(W.paintHint) : out ? '' : slots[0] && slots[1] ? tr(W.ready) : slots[0] || slots[1] ? tr(W.pickSecond) : tr(W.pickTwo);
  const need = lesson ? (lesson.complete.appliedColors ?? (lesson.complete.appliedColor ? [lesson.complete.appliedColor] : [])) : [];
  const useLabel = view === 'scene' ? tr(W.fillWith) : view === 'grid' ? tr(W.stampWith) : tr(W.paint);
  const myColours = [...new Set([...w.recent, ...[...w.mixedColors].reverse()])].filter((x) => !BASE_PAINTS.includes(x)).slice(0, 5);
  const lessonsForLevel = LESSONS.map((l, i) => ({ l, i })).filter(({ l }) => w.level === 'more' || l.level === 'easy');
  const noticeText = store.notice ? (X[store.notice]?.[lang] ?? '') : '';

  const tab = (on: boolean) => `dw-tab ${on ? 'dw-tab-on' : ''}`;
  return (
    <section className="dw space-y-4" data-testid="doodle" data-view={view} data-step={step ?? ''} data-role={store.role}>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h1 className="font-serif text-[1.75rem] font-bold leading-9">{c('title')}</h1>
          <p className="text-base text-[var(--muted)]">{tr(W.subtitle)}</p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={X.level[lang]}>
          {(['easy', 'more'] as const).map((lv) => (
            <button key={lv} type="button" aria-pressed={w.level === lv} className={tab(w.level === lv)} onClick={() => update((s) => ({ ...s, level: lv }))} data-testid={`level-${lv}`}>
              {c(lv)}
            </button>
          ))}
        </div>
      </header>

      {viewer && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border-2 border-[var(--ui-control-border)] bg-[var(--surface)] px-3 py-2" role="status" data-testid="view-only">
          <p className="flex-1 font-medium">{tr(W.viewOnly)}</p>
          <Button onClick={() => store.takeOver()} data-testid="take-over">
            {tr(W.takeOver)}
          </Button>
        </div>
      )}
      {store.role === 'uncoordinated' && <p className="text-sm text-[var(--muted)]">{tr(W.uncoord)}</p>}
      {store.notice && noticeText && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-[var(--ui-alert-bg)] px-3 py-2 text-[var(--ui-alert-text)]" role="alert" data-testid="save-notice" data-notice={store.notice}>
          <p>{noticeText}</p>
          {store.oldRaw && (
            <Button variant="secondary" size="sm" onClick={() => downloadText(store.oldRaw!)} data-testid="download-old">
              <Icon d={ICONS.save} />
              {store.notice === 'altKept' ? X.downloadAlt[lang] : X.downloadOld[lang]}
            </Button>
          )}
        </div>
      )}
      {store.v1Raw.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-[var(--ui-alert-bg)] px-3 py-2 text-[var(--ui-alert-text)]" role="alert" data-testid="v1-kept">
          <p>{tr(W.v1Kept)}</p>
          <Button variant="secondary" size="sm" onClick={() => store.v1Raw.forEach((t) => downloadText(t))} data-testid="download-v1">
            <Icon d={ICONS.save} />
            {X.downloadOld[lang]}
          </Button>
        </div>
      )}
      {store.conflict && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-[var(--ui-alert-bg)] px-3 py-2 text-[var(--ui-alert-text)]" role="alert" data-testid="tab-conflict">
          <p>{tr(W.conflict)}</p>
          <Button variant="secondary" size="sm" onClick={() => downloadText(store.conflict!)} data-testid="download-conflict">
            <Icon d={ICONS.save} />
            {tr(W.downloadThis)}
          </Button>
        </div>
      )}
      {showImported && store.status !== 'failed' && (
        <p className="text-sm text-[var(--muted)]" data-testid="imported-note">
          {tr(W.imported)}
        </p>
      )}

      <div className="dw-grid">
        {/* ---------------- the paper (main content) ---------------- */}
        <div className="dw-desk min-w-0">
          <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label={c('title')}>
            <button type="button" aria-pressed={view === 'free'} className={tab(view === 'free')} onClick={() => openView('free')} data-testid="surface-free">
              {c('freehand')}
            </button>
            <button type="button" aria-pressed={view === 'scene'} className={tab(view === 'scene')} onClick={() => openView('scene')} data-testid="surface-fish">
              {X.picture[lang]}
            </button>
            <button type="button" aria-haspopup="dialog" className={tab(false)} onClick={() => setPicker(true)} data-testid="choose-picture">
              {tr(W.choose)}
            </button>
            <button type="button" aria-pressed={view === 'grid'} className={tab(view === 'grid')} onClick={() => openView('grid')} data-testid="surface-grid">
              {c('grid')}
            </button>
          </div>
          <div ref={stageRef} className={`space-y-3 ${viewer ? 'pointer-events-none opacity-80' : ''}`} aria-disabled={viewer || undefined}>
            <div className="dw-paper">
              {view === 'scene' ? (
                <ScenePaper tpl={tpl} colors={colors} tailRef={tailRef} onFill={fillRegion} lang={lang} />
              ) : view === 'free' ? (
                <Paper canvasRef={paperRef} ops={visibleFree(w.free)} tool={tool} color={color} size={size} shape={shape} onCommit={commitFree} label={X.paper[lang]} />
              ) : (
                <StampGrid boxRef={gridRef} cells={gridCells(w.grid)} focus={gridFocus} setFocus={setGridFocus} onStamp={stampCell} lang={lang} label={X.gridLabel[lang]} c={c} erase={tool === 'eraser'} />
              )}
            </div>

            {/* tools: icons with short labels, one style */}
            <div className="flex flex-wrap items-stretch gap-2" role="toolbar" aria-label={c('brush')}>
              <Tool icon={view === 'scene' ? 'fill' : 'brush'} label={view === 'scene' ? tr(W.fill) : view === 'grid' ? tr(W.stampTool) : c('brush')} pressed={tool !== 'eraser' && !(view === 'free' && tool === 'stamp')} onClick={() => setTool('brush')} testid="tool-brush" swatch={tool !== 'eraser' ? color : undefined} />
              {view === 'free' && <Tool icon="stamp" label={c('stamp')} pressed={tool === 'stamp'} onClick={() => setTool('stamp')} testid="tool-stamp" />}
              <Tool icon="eraser" label={c('eraser')} pressed={tool === 'eraser'} onClick={() => setTool('eraser')} testid="tool-eraser" />
              <Tool icon="undo" label={c('undo')} onClick={() => onHistory('undo')} disabled={!canUndo(history)} testid="tool-undo" />
              <Tool icon="save" label={tr(W.savePic)} onClick={doExport} testid="tool-export" />
              {view === 'scene' && isFish && <Tool icon="move" label={X.move[lang]} onClick={moveFish} disabled={!Object.values(colors).some(Boolean)} testid="fish-move" />}
            </div>
            {view === 'scene' && (
              <div ref={regionRef} className="flex flex-wrap gap-2" role="group" aria-label={tr(W.regionsOf, { name: tpl.name[lang] })}>
                {tpl.accessibleOrder.map((r) => (
                  <button key={r} type="button" onClick={() => fillRegion(r)} aria-label={`${regionName(r)}${lang === 'zh' ? '，目前' : ', now '}${colors[r] ? name(colors[r]!) : X.noColour[lang]}`} className="dw-chip" data-testid={`region-${r}`} data-color={colors[r] ?? ''}>
                    <span className="dw-chip-dot" style={{ background: colors[r] ? colorOf(colors[r]!).hex : '#ffffff' }} aria-hidden="true" />
                    {regionName(r)}
                  </button>
                ))}
              </div>
            )}
            {view !== 'scene' && (
              <div className="flex flex-wrap gap-2">
                <fieldset className="flex flex-wrap items-center gap-1">
                  <legend className="sr-only">{X.size[lang]}</legend>
                  {(['s', 'm', 'l'] as Size[]).map((z) => (
                    <button key={z} type="button" aria-pressed={size === z} className={tab(size === z)} onClick={() => setSize(z)} data-testid={`size-${z}`}>
                      <span className="inline-block rounded-full bg-current" style={{ width: z === 's' ? 6 : z === 'm' ? 11 : 16, height: z === 's' ? 6 : z === 'm' ? 11 : 16 }} aria-hidden="true" />
                      <span className="ml-1.5">{X[z][lang]}</span>
                    </button>
                  ))}
                </fieldset>
                {(tool === 'stamp' || view === 'grid') && (
                  <fieldset className="flex flex-wrap items-center gap-1">
                    <legend className="sr-only">{X.shape[lang]}</legend>
                    {(['circle', 'triangle', 'square'] as Shape[]).map((z) => (
                      <button key={z} type="button" aria-pressed={shape === z} className={tab(shape === z)} onClick={() => setShape(z)} data-testid={`shape-${z}`}>
                        <span className="inline-flex items-center gap-1">
                          <MarkIcon mark={z} />
                          {c(z)}
                        </span>
                      </button>
                    ))}
                  </fieldset>
                )}
              </div>
            )}
            <p className="min-h-6 text-base font-medium" data-testid="doodle-hint">
              {hint}
            </p>
            {full && view === 'free' && (
              <p className="rounded-md bg-[var(--ui-alert-bg)] px-3 py-2 text-[var(--ui-alert-text)]" data-testid="paper-full">
                {X.full[lang]}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => onHistory('redo')} disabled={!canRedo(history)} data-testid="tool-redo">
                <ToolIcon name="redo" className="h-5 w-5" />
                {c('redo')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)} disabled={view === 'scene' ? !Object.values(colors).some(Boolean) : view === 'free' ? visibleFree(w.free).length === 0 : gridCells(w.grid).every((x) => !x)} data-testid="tool-clear">
                <ToolIcon name="paper" className="h-5 w-5" />
                {c('newPaper')}
              </Button>
              <p className="text-sm text-[var(--muted)]" data-testid="save-state" aria-live="polite">
                {store.status === 'failed' || !store.canSave ? (
                  <span className="text-[var(--ui-alert-text)]">
                    {c('saveError')}{' '}
                    <button type="button" className="min-h-11 underline" onClick={doExport}>
                      {c('export')}
                    </button>
                  </span>
                ) : store.status === 'ok' ? (
                  `${c('saved')} · ${X.savedLocal[lang]}`
                ) : (
                  X.savedLocal[lang]
                )}
              </p>
            </div>
          </div>
        </div>

        {/* ---------------- the palette ---------------- */}
        <aside ref={paletteRef} className={`dw-side space-y-4 ${viewer ? 'pointer-events-none opacity-80' : ''}`} aria-label={tr(W.myPalette)}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">{tr(W.myPalette)}</h2>
              <button type="button" aria-pressed={mixing} className={tab(mixing)} onClick={() => startMixing(!mixing)} data-testid="panel-mix">
                <ToolIcon name="mix" className="h-5 w-5" />
                <span className="ml-1">{mixing ? tr(W.stopMix) : tr(W.startMix)}</span>
              </button>
            </div>
            {/* five base paints, always here */}
            <div className="flex flex-wrap gap-1" role="group" aria-label={tr(W.basePaint)}>
              {BASE_PAINTS.map((id, k) => (
                <PaintButton key={id} id={id} k={k} label={name(id)} selected={!mixing && color === id && tool !== 'eraser'} outlined={partners.includes(id)} onClick={() => pick(id)} />
              ))}
            </div>
            <Board slots={slots} out={out} fx={fx} hint={boardHint} name={name} tr={tr} mixing={mixing} onWell={(k) => setSlots((s) => s.map((x, i) => (i === k ? null : x)))} onPool={() => resultColor && takeToPaper(resultColor)} onStart={() => startMixing(true)} />
            {mixing && (
              <div className="space-y-2" data-testid="mixpad">
                {out ? (
                  <div className="space-y-2" data-testid="mix-result" data-output={out.o.kind === 'recipe' ? out.o.recipe.output : out.o.kind === 'same' ? out.o.color : ''} data-kind={out.o.kind}>
                    {out.o.kind === 'recipe' && (
                      <p className="text-xl font-bold" data-testid="mix-equation">
                        {tr(W.equation, { a: name(out.a), b: name(out.b), r: name(out.o.recipe.output) })}
                      </p>
                    )}
                    {out.o.kind === 'same' && <p className="text-lg font-bold">{tr(W.same, { c: name(out.a) })}</p>}
                    {out.o.kind === 'none' && (
                      <div className="space-y-2" data-testid="mix-unsupported">
                        <p className="text-lg font-bold">{tr(W.none)}</p>
                        {partnersOf(out.a)[0] && (
                          <Button variant="secondary" onClick={() => putRecipe(out.a, partnersOf(out.a)[0])} data-testid="mix-try">
                            {tr(W.tryThese, { a: name(out.a), b: name(partnersOf(out.a)[0]) })}
                          </Button>
                        )}
                        <Button variant="ghost" onClick={() => setAllOpen(true)}>
                          {tr(W.seeRecipes)}
                        </Button>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {canWhite && (
                        <Button variant="secondary" size="lg" onClick={addWhite} data-testid="mix-white">
                          {tr(W.addWhite)}
                        </Button>
                      )}
                      {resultColor && (
                        <Button size="lg" onClick={() => takeToPaper(resultColor)} data-testid="mix-use">
                          {useLabel}
                        </Button>
                      )}
                      <Button variant="ghost" onClick={() => (setSlots([null, null]), setOut(null))} data-testid="mix-reset">
                        {tr(W.again)}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button size="lg" onClick={doMix} disabled={!slots[0] || !slots[1]} data-testid="mix-go">
                      {c('mix')}
                    </Button>
                    {(slots[0] || slots[1]) && (
                      <Button variant="ghost" onClick={() => setSlots([null, null])} data-testid="mix-clear">
                        {X.clearSlots[lang]}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* my colours + all 29 */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold">{tr(W.myColours)}</h3>
              <button type="button" aria-expanded={allOpen} className={tab(allOpen)} onClick={() => setAllOpen((v) => !v)} data-testid="all-colours">
                {allOpen ? tr(W.hideAll) : tr(W.allColours)}
              </button>
            </div>
            {myColours.length > 0 && (
              <div className="flex flex-wrap gap-1" role="group" aria-label={tr(W.myColours)}>
                {myColours.map((id, k) => (
                  <PaintButton key={id} id={id} k={k + 1} label={name(id)} selected={!mixing && color === id && tool !== 'eraser'} outlined={partners.includes(id)} onClick={() => pick(id)} testid={`mine-${id}`} />
                ))}
              </div>
            )}
            {allOpen && (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2" aria-label={tr(W.allColours)} data-testid="all-list">
                {COLORS.map((col, k) => {
                  const r = recipeOf(col.id);
                  return (
                    <li key={col.id} className="flex flex-col items-center gap-1">
                      <PaintButton id={col.id} k={k} label={name(col.id)} selected={!mixing && color === col.id && tool !== 'eraser'} outlined={partners.includes(col.id)} onClick={() => pick(col.id)} />
                      {r && (
                        <button type="button" className="dw-recipe" onClick={() => putRecipe(r.inputs[0], r.inputs[1])} aria-label={tr(W.putInWells, { a: name(r.inputs[0]), b: name(r.inputs[1]) })} data-testid={`recipe-${col.id}`}>
                          <span className="dw-mini" style={{ background: colorOf(r.inputs[0]).hex }} aria-hidden="true" />＋<span className="dw-mini" style={{ background: colorOf(r.inputs[1]).hex }} aria-hidden="true" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* mixing challenges (optional) */}
          <div className="space-y-2" data-testid="quests">
            <h3 className="text-base font-bold">{tr(W.quests)}</h3>
            <ul className="space-y-1">
              {(['pink', 'pale_pink', 'use'] as const).map((q) => (
                <li key={q} className="flex min-h-8 items-center gap-2 text-base" data-done={w.quests.includes(q)} data-testid={`quest-${q}`}>
                  <span className={`dw-check ${w.quests.includes(q) ? 'dw-check-on' : ''}`} aria-hidden="true">
                    {w.quests.includes(q) && (
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
                        <path d="M3 8.5 6.5 12 13 4.5" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" />
                      </svg>
                    )}
                  </span>
                  {tr(W[`q_${q}`])}
                  {w.quests.includes(q) && <span className="sr-only">{tr(W.questDone)}</span>}
                </li>
              ))}
            </ul>
            <p className="text-sm text-[var(--muted)]">{tr(W.questNote)}</p>
          </div>

          {view === 'scene' && isFish && (
            <div className="space-y-1" data-testid="fish-task" data-done={work.done ? 'true' : 'false'}>
              <h3 className="text-base font-bold">{X.fishName[lang]}</h3>
              <p className="text-base">
                {X.fishTask[lang]}
                {work.done && <span className="ml-2 font-bold text-[var(--ui-accent-text)]">{X.done[lang]}</span>}
              </p>
              {!mixing && (
                <Button variant="secondary" onClick={() => putRecipe('red', 'yellow')} data-testid="fish-mix">
                  {X.tryMix[lang]}
                </Button>
              )}
            </div>
          )}

          {/* short tasks (unchanged from V1) */}
          <Tasks
            hidden={view === 'scene'}
            lessonsForLevel={lessonsForLevel}
            lessonIdx={lessonIdx}
            done={w.done}
            lesson={lesson}
            run={run}
            step={step}
            level={w.level}
            lang={lang}
            c={c}
            need={need}
            choiceMsg={choiceMsg}
            why={why}
            setWhy={setWhy}
            startLesson={startLesson}
            exitLesson={() => (exitLesson(), startMixing(false))}
            choose={choose}
          />
        </aside>
      </div>

      <p className="sr-only" role="status" aria-live="polite" data-testid="announce">
        {say}
      </p>

      <Modal open={picker} onClose={() => setPicker(false)} title={tr(W.chooseTitle)} wide>
        <p className="mb-3 text-sm text-[var(--muted)]">{tr(W.chooseNote)}</p>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="picker">
          {TEMPLATES.map((t) => {
            const cs = regionColors(workOf(w, t.id).fills, REGIONS_OF[t.id]);
            const n = Object.values(cs).filter(Boolean).length;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  className={`dw-thumb ${sid === t.id && view === 'scene' ? 'dw-thumb-on' : ''}`}
                  aria-pressed={sid === t.id && view === 'scene'}
                  onClick={() => {
                    update((s) => ({ ...s, sceneId: t.id, view: 'scene' }));
                    setPicker(false);
                    setMoveMsg(false);
                    if (tool === 'stamp') setTool('brush');
                    // after the dialog returns focus, move it to the first part of the new picture (keyboard / screen readers)
                    setTimeout(() => {
                      stageRef.current?.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'instant' : 'smooth' });
                      regionRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
                    }, 60);
                  }}
                  data-testid={`pick-${t.id}`}
                >
                  <TemplateArt tpl={t} colors={cs} />
                  <span className="font-bold">{t.name[lang]}</span>
                  <span className="text-xs text-[var(--muted)]">{tr(W.coloured, { n, t: t.regions.length })}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Modal>

      <Modal open={confirmClear} onClose={() => setConfirmClear(false)} title={c('clearTitle')}>
        <p className="mb-4">{view === 'free' && freeFull(w.free) ? X.fullClear[lang] : c('clearBody')}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" data-autofocus onClick={() => setConfirmClear(false)} data-testid="clear-cancel">
            {c('cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onHistory('clear');
              setConfirmClear(false);
            }}
            data-testid="clear-confirm"
          >
            {c('confirmClear')}
          </Button>
        </div>
      </Modal>
    </section>
  );
}

const RECIPE_BY_ID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));
const mixOutcomeOk = (a: ColorId, b: ColorId) => {
  const o = mixOutcome(a, b);
  return o.kind === 'recipe' ? o.recipe : null;
};

// ------------------------------------------------------------------ pieces
function PaintButton({ id, k, label, selected, outlined, onClick, testid }: { id: ColorId; k: number; label: string; selected: boolean; outlined?: boolean; onClick: () => void; testid?: string }) {
  return (
    <button type="button" className={`dw-paint ${outlined ? 'dw-paint-hint' : ''}`} aria-pressed={selected} aria-label={label} onClick={onClick} data-testid={testid ?? `swatch-${id}`} data-outlined={outlined ? 'true' : undefined}>
      <Dab hex={colorOf(id).hex} k={k} selected={selected} />
      <span className="dw-paint-name">{label}</span>
    </button>
  );
}

function Tool({ icon, label, pressed, onClick, disabled, testid, swatch }: { icon: string; label: string; pressed?: boolean; onClick: () => void; disabled?: boolean; testid: string; swatch?: ColorId }) {
  return (
    <button type="button" className="dw-tool" aria-pressed={pressed} onClick={onClick} disabled={disabled} data-testid={testid}>
      <span className="relative">
        <ToolIcon name={icon} />
        {swatch && <span className="dw-tool-swatch" style={{ background: colorOf(swatch).hex }} aria-hidden="true" />}
      </span>
      <span>{label}</span>
    </button>
  );
}

/** The hand-held palette: two wells (the paints to mix) and the pool where the result appears. */
function Board({ slots, out, fx, hint, name, tr, mixing, onWell, onPool, onStart }: { slots: (ColorId | null)[]; out: Out; fx: number; hint: string; name: (id: ColorId) => string; tr: (l: L, v?: Record<string, string | number>) => string; mixing: boolean; onWell: (k: number) => void; onPool: () => void; onStart: () => void }) {
  const result = out?.o.kind === 'recipe' ? out.o.recipe.output : out?.o.kind === 'same' ? out.o.color : null;
  return (
    <div className="space-y-1">
      <div className="dw-board" data-testid="board">
        <BoardShape />
        {[0, 1].map((k) => {
          const id = slots[k];
          return (
            <button
              key={k}
              type="button"
              className={`dw-well dw-well-${k} ${id ? '' : 'dw-well-empty'}`}
              style={id ? { background: colorOf(id).hex, color: inkOn(colorOf(id).hex) } : undefined}
              onClick={() => (mixing ? id && onWell(k) : onStart())}
              aria-label={tr(W.well, { n: k + 1, c: id ? name(id) : tr(W.wellEmpty) })}
              data-testid={`slot-${k}`}
              data-color={id ?? ''}
            >
              {!id && <span aria-hidden="true">{k + 1}</span>}
            </button>
          );
        })}
        <button
          key={fx}
          type="button"
          className={`dw-pool ${result ? 'dw-pool-on' : ''}`}
          style={result ? { background: colorOf(result).hex, color: inkOn(colorOf(result).hex) } : undefined}
          onClick={onPool}
          disabled={!result}
          aria-label={result ? tr(W.poolResult, { c: name(result) }) : tr(W.poolLabel)}
          data-testid="pool"
          data-color={result ?? ''}
        >
          {result ? <span className="dw-pool-name">{name(result)}</span> : <span className="dw-pool-empty">{tr(W.pool)}</span>}
        </button>
      </div>
      {hint && (
        <p className="text-base font-medium" data-testid="board-hint">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Static drawing of a template with the child's colours (used for the paper and the picture picker). */
function TemplateArt({ tpl, colors, onFill, tailRef, label }: { tpl: Template; colors: Record<Region, ColorId | null>; onFill?: (r: Region) => void; tailRef?: RefObject<SVGGElement | null>; label?: string }) {
  const fill = (r: Region) => (colors[r] ? colorOf(colors[r]!).hex : '#ffffff');
  const path = (r: { id: string; d: string }) => (
    <path key={r.id} d={r.d} fill={fill(r.id)} className={onFill ? 'cursor-pointer' : undefined} onClick={onFill ? () => onFill(r.id) : undefined} data-testid={onFill ? `scene-${tpl.id}-${r.id}` : undefined} data-color={colors[r.id] ?? ''} />
  );
  return (
    <svg viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`} className="block aspect-[4/3] w-full bg-white" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <g stroke={LINE} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round">
        {tpl.regions.map((r) =>
          tpl.id === 'fish' && r.id === 'tail' && tailRef ? (
            <g key={r.id} ref={tailRef} style={{ transformOrigin: `${FISH_ART.tailPivot.x}px ${FISH_ART.tailPivot.y}px`, transformBox: 'view-box' }}>
              {path(r)}
            </g>
          ) : (
            path(r)
          ),
        )}
        <g fill="none" pointerEvents="none" dangerouslySetInnerHTML={{ __html: tpl.details }} />
      </g>
    </svg>
  );
}

function ScenePaper({ tpl, colors, tailRef, onFill, lang }: { tpl: Template; colors: Record<Region, ColorId | null>; tailRef: RefObject<SVGGElement | null>; onFill: (r: Region) => void; lang: 'zh' | 'en' }) {
  const label = `${tpl.name[lang]}${lang === 'zh' ? '：' : ': '}${tpl.accessibleOrder.map((r) => `${tpl.regions.find((x) => x.id === r)?.name[lang]}${lang === 'zh' ? '' : ' '}${colors[r] ? colorOf(colors[r]!).name[lang] : X.noColour[lang]}`).join(lang === 'zh' ? '、' : ', ')}`;
  return (
    <div data-testid="fish" data-scene={tpl.id}>
      <TemplateArt tpl={tpl} colors={colors} onFill={onFill} tailRef={tailRef} label={label} />
    </div>
  );
}

function Tasks(p: {
  hidden: boolean;
  lessonsForLevel: { l: (typeof LESSONS)[number]; i: number }[];
  lessonIdx: number | null;
  done: string[];
  lesson: (typeof LESSONS)[number] | null;
  run: SavedV2['active'];
  step: string | null;
  level: 'easy' | 'more';
  lang: 'zh' | 'en';
  c: (k: string, v?: Record<string, string | number>) => string;
  need: ColorId[];
  choiceMsg: string | null;
  why: boolean;
  setWhy: (f: (w: boolean) => boolean) => void;
  startLesson: (i: number) => void;
  exitLesson: () => void;
  choose: (c: string) => void;
}): ReactNode {
  const { lessonsForLevel, lessonIdx, done, lesson, run, step, level, lang, c } = p;
  return (
    <div className={`space-y-2 ${p.hidden ? 'hidden' : ''}`} data-testid="tasks">
      <h3 className="text-base font-bold">{X.tasks[lang]}</h3>
      <div className="flex flex-wrap gap-1">
        {lessonsForLevel.map(({ l, i }) => (
          <button key={l.id} type="button" aria-pressed={lessonIdx === i} aria-label={`${format(X.task[lang], { n: i + 1 })}${done.includes(l.id) ? ` · ${X.done[lang]}` : ''}`} className={`dw-tab min-w-11 ${lessonIdx === i ? 'dw-tab-on' : ''}`} onClick={() => p.startLesson(i)} data-testid={`lesson-${i + 1}`}>
            {i + 1}
            {done.includes(l.id) && (
              <svg viewBox="0 0 16 16" className="ml-1 inline h-3.5 w-3.5" aria-hidden="true">
                <path d="M3 8.5 6.5 12 13 4.5" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" />
              </svg>
            )}
          </button>
        ))}
      </div>
      {lesson && run && step && (
        <div className="space-y-3" data-testid="lesson-card">
          <p className="text-lg font-bold">{lesson.prompt[lang]}</p>
          {lesson.id === 'DC-L06' && <Wheel lang={lang} />}
          {(step === 'predict' || step === 'choose' || (step === 'mix' && level === 'easy' && !run.guess)) && (
            <div className="space-y-1">
              <p className="text-sm text-[var(--muted)]">{step === 'choose' ? (lesson.classification ? X.pickWarm[lang] : X.guess[lang]) : level === 'easy' ? X.guessOptional[lang] : X.guess[lang]}</p>
              <div className="flex flex-wrap gap-1">
                {lesson.choices.map((ch, k) =>
                  COLORS.some((x) => x.id === ch) ? (
                    <PaintButton key={ch} id={ch} k={k} label={colorOf(ch).name[lang]} selected={run.guess === ch || run.chosen === ch} onClick={() => p.choose(ch)} testid={`choice-${ch}`} />
                  ) : (
                    <button key={ch} type="button" aria-pressed={run.guess === ch} className={`dw-tab ${run.guess === ch ? 'dw-tab-on' : ''}`} onClick={() => p.choose(ch)} data-testid={`choice-${ch}`}>
                      {ch === 'lighter' ? (lang === 'zh' ? '變亮' : 'Lighter') : lang === 'zh' ? '變暗' : 'Darker'}
                    </button>
                  ),
                )}
              </div>
            </div>
          )}
          {p.choiceMsg && <p className="text-sm font-medium">{p.choiceMsg}</p>}
          {step === 'apply' && (
            <p className="text-sm">
              {X.need[lang]}{' '}
              {p.need.map((col) => (
                <span key={col} className="mr-2 inline-flex items-center gap-1 font-medium">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--ui-control-border)]" style={{ background: colorOf(col).hex, color: markColour(col) }}>
                    <MarkIcon mark={colorOf(col).mark} className="h-3 w-3" />
                  </span>
                  {colorOf(col).name[lang]} {(run.marks[col] ?? 0) >= 1 ? '✓' : ''}
                </span>
              ))}
            </p>
          )}
          {step === 'done' && (
            <p className="rounded-md bg-[var(--ui-accent-soft)] px-3 py-2 font-bold text-[var(--ui-accent-text)]" data-testid="lesson-success">
              {lesson.success[lang]}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {step === 'done' && lessonIdx !== null && lessonsForLevel.some(({ i }) => i > lessonIdx) && (
              <Button size="sm" onClick={() => p.startLesson(lessonsForLevel.find(({ i }) => i > lessonIdx)!.i)} data-testid="lesson-next">
                {X.next[lang]}
              </Button>
            )}
            {step !== 'done' && (
              <Button size="sm" variant="secondary" onClick={() => lessonIdx !== null && p.startLesson(lessonIdx)} data-testid="lesson-retry">
                {c('retry')}
              </Button>
            )}
            {step !== 'done' && lessonIdx !== null && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const nx = lessonsForLevel.find(({ i }) => i > lessonIdx);
                  if (nx) p.startLesson(nx.i);
                  else p.exitLesson();
                }}
                data-testid="lesson-skip"
              >
                {c('skip')}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={p.exitLesson} data-testid="lesson-exit">
              {X.backFree[lang]}
            </Button>
            <Button size="sm" variant="ghost" aria-expanded={p.why} onClick={() => p.setWhy((v) => !v)} data-testid="lesson-why">
              <Icon d={ICONS.why} />
              {c('why')}
            </Button>
          </div>
          {p.why && (
            <p className="text-sm text-[var(--muted)]" data-testid="why-text">
              {lesson.success[lang]} {c('modelNote')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
