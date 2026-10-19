// Color Doodle (色彩塗鴉樂) — preview (A1+A2). Task: draw straight away; learn three paint mixes by predicting,
// mixing and using the result. The paper is the main content; one short instruction at a time.
// Spec: docs/product/DOODLE_COLOR_LAB_V1.md, data: shared/doodle/lessons.json. Canvas 2D + DOM controls.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode, type RefObject } from 'react';
import { format, useI18n } from '../i18n';
import { Button, Modal } from '../components/ui';
import {
  BASE_COLORS,
  COLORS,
  COPY,
  LESSONS,
  WHEEL,
  MAX_PTS,
  canRedo,
  clearFree,
  freeFull,
  canUndo,
  colorOf,
  gridCells,
  isCorrectChoice,
  lessonStep,
  mix,
  newRun,
  pushFree,
  pushGrid,
  redo,
  splitPoints,
  undo,
  validSave,
  visibleFree,
  type ColorId,
  type FreeOp,
  type GridOp,
  type History,
  type LessonRun,
  type Mark,
  type Recipe,
  type Saved,
  type Shape,
  type Size,
} from '../../shared/doodle/model';
import { RATIO, drawOp, exportPng, exportScenePng, renderFree } from './draw';
import { loadKeyed, loadSave, saveChecked } from './storage';
import { FISH_ART, FISH_REGIONS, SCENE_KEY, anyFilled, blankScene, pushScene, readScene, regionColors, taskMet, validScene, type Region, type SceneSave } from '../../shared/doodle/scene';

type L = { zh: string; en: string };
const X: Record<string, L> = {
  // picture play (B1, docs/product/DOODLE_PLAYFUL_V1_1.md §3)
  picture: { zh: '玩圖畫', en: 'Picture play' },
  fishName: { zh: '我的小魚', en: 'My fish' },
  fishFirst: { zh: '選個顏色，塗看看', en: 'Pick a colour and paint' },
  tryMix: { zh: '試試混色', en: 'Try mixing' },
  tapBody: { zh: '點身體來上色', en: 'Tap the body to colour' },
  paintThis: { zh: '用這色畫', en: 'Paint with this' },
  move: { zh: '動一下', en: 'Make it move' },
  tryAnother: { zh: '換個顏色試試', en: 'Try another colour' },
  body: { zh: '身體', en: 'Body' },
  tail: { zh: '尾巴', en: 'Tail' },
  fin: { zh: '魚鰭', en: 'Fin' },
  fishDone: { zh: '橙色用在小魚上了', en: 'You used orange on your fish' },
  alsoOrange: { zh: '也試試混出的橙色', en: 'Also try the orange you mixed' },
  noColour: { zh: '還沒上色', en: 'Not coloured yet' },
  regions: { zh: '小魚的部位', en: 'Parts of the fish' },
  fishTask: { zh: '小任務：混出橙色，塗在小魚上', en: 'Short task: mix orange and paint it on the fish' },
  moved: { zh: '小魚擺了擺尾巴', en: 'The fish wagged its tail' },
  fishLabel: { zh: '小魚：身體{body}、尾巴{tail}、魚鰭{fin}', en: 'Fish: body {body}, tail {tail}, fin {fin}' },
  preview: { zh: '預覽版', en: 'Preview' },
  allColours: { zh: '全部顏色', en: 'All colours' },
  pickTwo: { zh: '選兩個顏色', en: 'Pick two colours' },
  slot: { zh: '第 {n} 個顏色', en: 'Colour {n}' },
  emptySlot: { zh: '還沒選', en: 'Not chosen' },
  clearSlots: { zh: '重選', en: 'Pick again' },
  size: { zh: '粗細', en: 'Size' },
  s: { zh: '細', en: 'Thin' },
  m: { zh: '中', en: 'Medium' },
  l: { zh: '粗', en: 'Thick' },
  shape: { zh: '印章形狀', en: 'Stamp shape' },
  tasks: { zh: '小任務', en: 'Short tasks' },
  task: { zh: '任務 {n}', en: 'Task {n}' },
  level: { zh: '提示多寡', en: 'Hints' },
  guess: { zh: '先猜猜看', en: 'Guess first' },
  guessOptional: { zh: '可以先猜，也可以直接混', en: 'Guess, or just mix' },
  next: { zh: '下一個任務', en: 'Next task' },
  backFree: { zh: '回自由畫', en: 'Back to drawing' },
  pickWarm: { zh: '哪個是暖色？', en: 'Which one is warm?' },
  notYet: { zh: '再想想，看看提示。', en: 'Not quite. Look again.' },
  draw: { zh: '畫畫看', en: 'Draw' },
  paper: { zh: '畫紙', en: 'Drawing paper' },
  gridLabel: { zh: '格子畫紙，方向鍵移動，Enter 蓋章', en: 'Stamp grid: arrow keys to move, Enter to stamp' },
  savedLocal: { zh: '畫作只存在這個瀏覽器', en: 'Your picture stays in this browser' },
  broken: { zh: '舊的存檔讀不出來，已另外保留一份；這是一張新畫紙。', en: 'The old save could not be read. A copy was kept aside; this is a fresh page.' },
  brokenFuture: { zh: '這份存檔來自較新的版本，這裡讀不出來，已另外保留一份；這是一張新畫紙。', en: 'This save comes from a newer version and cannot be read here. A copy was kept aside; this is a fresh page.' },
  brokenNoBackup: { zh: '舊的存檔讀不出來，也沒辦法另外備份。為了不蓋掉它，這次的畫存在另一個位置。', en: 'The old save could not be read or copied. To keep it safe, this drawing is saved in a separate place.' },
  brokenNoSave: { zh: '舊的存檔讀不出來，也沒辦法另外備份。為了不蓋掉它，這次不會存檔；離開前請先存成圖片。', en: 'The old save could not be read or copied. To keep it safe, nothing is saved this time. Save a picture before you leave.' },
  downloadOld: { zh: '下載舊存檔', en: 'Download the old save' },
  downloadAlt: { zh: '下載之前的畫', en: 'Download the earlier drawing' },
  restored: { zh: '舊的存檔讀不出來，已另外保留一份；接著畫上次存在另一個位置的畫。', en: 'The old save could not be read. A copy was kept aside; you are continuing the drawing saved in the separate place.' },
  altKept: { zh: '另一個位置還留著一份之前的畫，沒有蓋掉現在這張；需要的話可以下載。', en: 'An earlier drawing is still kept in a separate place. It did not replace this one; you can download it.' },
  noStorage: { zh: '這個瀏覽器不能存畫作；離開前請先存成圖片。', en: 'This browser cannot keep drawings. Save a picture before you leave.' },
  full: { zh: '這張畫紙滿了。先存成圖片，再換一張新畫紙。', en: 'This paper is full. Save a picture, then start a new paper.' },
  fullClear: { zh: '這張畫紙已經滿了，換新後不能復原。想留下來，請先存成圖片。', en: 'This paper is full, so a new paper cannot be undone. Save a picture first if you want to keep it.' },
  goStamp: { zh: '去蓋印章', en: 'Go stamp' },
  goDraw: { zh: '用這色畫', en: 'Draw with it' },
  wheel: { zh: '色環', en: 'Colour wheel' },
  need: { zh: '還要：', en: 'Still need:' },
  stampHere: { zh: '在這格蓋章', en: 'Stamp here' },
  eraseHere: { zh: '擦掉這格', en: 'Erase this cell' },
  done: { zh: '完成', en: 'Done' },
};
const reduced = () => typeof window !== 'undefined' && (document.documentElement.hasAttribute('data-reduce-motion') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

function slotsFor(lessonId: string | undefined): (ColorId | null)[] {
  const l = LESSONS.find((x) => x.id === lessonId);
  const r = l?.recipe ? [mix('red', 'yellow'), mix('yellow', 'blue'), mix('blue', 'red'), mix('blue', 'white')].find((x) => x?.id === l.recipe) : null;
  return r ? [...r.inputs] : [null, null];
}
function downloadText(text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = `color-doodle-old-save-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ------------------------------------------------------------------ small pieces
export function MarkIcon({ mark, className = 'h-4 w-4' }: { mark: Mark; className?: string }) {
  const p: Record<Mark, ReactNode> = {
    circle: <circle cx="8" cy="8" r="5" />,
    triangle: <path d="M8 2.5 14 13H2z" />,
    square: <rect x="3" y="3" width="10" height="10" />,
    cross: <path d="M3 3l10 10M13 3 3 13" fill="none" strokeWidth="2.4" />,
    diamond: <path d="M8 1.5 14.5 8 8 14.5 1.5 8z" />,
    leaf: <path d="M3 13C3 6 7 3 13 3c0 6-3 10-10 10z" />,
    star: <path d="M8 1.5l1.9 4.3 4.6.4-3.5 3 1.1 4.6L8 11.4l-4.1 2.4 1.1-4.6-3.5-3 4.6-.4z" />,
    'square-outline': <rect x="3" y="3" width="10" height="10" fill="none" strokeWidth="2.4" />,
  };
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true" fill="currentColor" stroke="currentColor" strokeWidth="0">
      {p[mark]}
    </svg>
  );
}
const markColour = (id: ColorId) => (['yellow', 'white', 'light_blue', 'orange'].includes(id) ? '#1f2328' : '#ffffff');

function Swatch({ id, lang, pressed, onClick, big = false, testid }: { id: ColorId; lang: 'zh' | 'en'; pressed?: boolean; onClick?: () => void; big?: boolean; testid?: string }) {
  const c = colorOf(id);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={c.name[lang]}
      className={`ui-t flex min-h-12 min-w-12 flex-col items-center justify-center gap-1 rounded-md border-2 px-1 py-1 text-xs font-medium ${pressed ? 'border-[var(--text)] bg-[var(--surface-2)]' : 'border-transparent hover:bg-[var(--surface-2)]'}`}
      data-testid={testid ?? `swatch-${id}`}
    >
      <span className={`flex ${big ? 'h-12 w-12' : 'h-8 w-8'} items-center justify-center rounded-full border border-[var(--ui-control-border)]`} style={{ background: c.hex, color: markColour(id) }}>
        <MarkIcon mark={c.mark} className={big ? 'h-6 w-6' : 'h-4 w-4'} />
      </span>
      <span>{c.name[lang]}</span>
      {pressed && <span className="sr-only">✓</span>}
    </button>
  );
}

function ToolButton({ label, pressed, onClick, children, disabled, testid }: { label: string; pressed?: boolean; onClick: () => void; children: ReactNode; disabled?: boolean; testid: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={`ui-t flex min-h-12 min-w-12 flex-col items-center justify-center gap-0.5 rounded-md border-2 px-2 text-xs font-medium disabled:cursor-not-allowed disabled:bg-[var(--ui-disabled-bg)] disabled:text-[var(--ui-disabled-fg)] ${pressed ? 'border-[var(--ui-accent-text)] bg-[var(--ui-accent-soft)]' : 'border-[var(--ui-control-border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]'}`}
      data-testid={testid}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}
const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const ICONS = {
  brush: 'M4 20c3 0 4-2 4-4l9-9 3 3-9 9c-2 0-4 1-7 1zM14 5l5 5',
  eraser: 'M8 20h12M5 15l8-8 6 6-6 6H9z',
  stamp: 'M9 4h6v5l3 3v3H6v-3l3-3zM5 19h14',
  undo: 'M9 7 4 12l5 5M4 12h10a6 6 0 0 1 0 12',
  redo: 'M15 7l5 5-5 5M20 12H10a6 6 0 0 0 0 12',
  save: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  paper: 'M6 3h9l4 4v14H6zM15 3v4h4',
  why: 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h.01',
};

// ------------------------------------------------------------------ the page
export function DoodlePage() {
  const { lang } = useI18n();
  const c = (k: string, v?: Record<string, string | number>) => format((COPY[k] ?? X[k])[lang], v);
  const [{ s: init, target, notice, oldRaw }] = useState(() => loadSave());
  const [s, setS] = useState<Saved>(init);
  // D1: the open paper and the task in progress live in the save, so a reload continues where the child was
  const surface = s.surface ?? 'free';
  const setSurface = (v: 'free' | 'grid') => setS((p) => ({ ...p, surface: v }));
  const run = s.active ?? null;
  const setRun = (v: LessonRun | null | ((r: LessonRun | null) => LessonRun | null)) => setS((p) => ({ ...p, active: typeof v === 'function' ? v(p.active ?? null) : v }));
  const lessonIdx = run ? LESSONS.findIndex((l) => l.id === run.lessonId) : null;
  const [full, setFull] = useState(false);
  const freeRef = useRef(s.free);
  freeRef.current = s.free;
  const paperRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<'brush' | 'eraser' | 'stamp'>('brush');
  const [color, setColor] = useState<ColorId>('red');
  const [size, setSize] = useState<Size>('m');
  const [shape, setShape] = useState<Shape>('circle');
  const [showAll, setShowAll] = useState(false);
  const [panel, setPanel] = useState<'draw' | 'mix'>('draw');
  const [slots, setSlots] = useState<(ColorId | null)[]>(() => slotsFor(init.active?.lessonId));
  const [mixOut, setMixOut] = useState<{ recipe: Recipe | null; a: ColorId; b: ColorId } | null>(null);
  const [choiceMsg, setChoiceMsg] = useState<string | null>(null);
  const [why, setWhy] = useState(false);
  const [say, setSay] = useState('');
  const [saveState, setSaveState] = useState<'saved' | 'error' | null>(target ? null : 'error');
  const [confirmClear, setConfirmClear] = useState(false);
  const [gridFocus, setGridFocus] = useState(0);
  // picture play: its own versioned save (never written into the old free/grid save)
  const [{ s: sceneInit, target: sceneTarget, notice: sceneNotice, oldRaw: sceneRaw }] = useState(() => loadKeyed<SceneSave>({ key: SCENE_KEY, read: readScene, blank: blankScene }));
  const [scene, setScene] = useState<SceneSave>(sceneInit);
  const [sceneSaveState, setSceneSaveState] = useState<'saved' | 'error' | null>(sceneTarget ? null : 'error');
  const [moveMsg, setMoveMsg] = useState(false);
  const [otherAfterMix, setOtherAfterMix] = useState(false); // a non-orange fill after mixing: suggest the mixed orange too
  const tailRef = useRef<SVGGElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const mixRef = useRef<HTMLDivElement>(null);
  const view: 'free' | 'grid' | 'fish' = scene.open ? 'fish' : surface;
  const colors = regionColors(scene.fills);

  const lesson = lessonIdx !== null ? LESSONS[lessonIdx] : null;
  const step = lesson && run ? lessonStep(lesson, run, s.level) : null;
  const lessonsForLevel = LESSONS.map((l, i) => ({ l, i })).filter(({ l }) => s.level === 'more' || l.level === 'easy');
  const palette = (showAll ? COLORS.map((x) => x.id) : [...BASE_COLORS, ...s.mixedColors.filter((x) => !BASE_COLORS.includes(x))]) as ColorId[];

  // persist after every change; show "Saved" only when the write succeeded
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!target) return setSaveState('error');
    try {
      const text = JSON.stringify(s);
      // "Saved" only when what was written is exactly what the reader accepts (D4)
      if (!validSave(JSON.parse(text))) throw new Error('unreadable');
      localStorage.setItem(target, text);
      setSaveState(localStorage.getItem(target) === text ? 'saved' : 'error');
    } catch {
      setSaveState('error');
    }
  }, [s, target]);
  const firstScene = useRef(true);
  useEffect(() => {
    if (firstScene.current) {
      firstScene.current = false;
      return;
    }
    setSceneSaveState(saveChecked(sceneTarget, JSON.stringify(scene), validScene) ? 'saved' : 'error');
  }, [scene, sceneTarget]);
  useEffect(() => {
    (window as unknown as { __doodle?: unknown }).__doodle = { s, run, step, lesson: lesson?.id, color, tool, surface, panel, saveState, target, notice, full, view, scene, sceneSaveState, sceneTarget, sceneNotice };
  });

  const history = view === 'fish' ? scene.fills : surface === 'free' ? s.free : s.grid;
  // apply undo / redo / clear to the paper currently shown (each paper keeps its own history)
  const onHistory = (f: 'undo' | 'redo' | 'clear') => {
    if (view === 'fish') return setScene((p) => ({ ...p, fills: f === 'undo' ? undo(p.fills) : f === 'redo' ? redo(p.fills) : pushScene(p.fills, { t: 'clear' }) }));
    setS((p) => {
      if (surface === 'free') return { ...p, free: f === 'undo' ? undo(p.free) : f === 'redo' ? redo(p.free) : clearFree(p.free) };
      return { ...p, grid: f === 'undo' ? undo(p.grid) : f === 'redo' ? redo(p.grid) : pushGrid(p.grid, { t: 'clear' }) };
    });
  };
  const openView = (v: 'free' | 'grid' | 'fish') => {
    setScene((p) => (p.open === (v === 'fish') ? p : { ...p, open: v === 'fish' }));
    if (v !== 'fish') setSurface(v);
    setMoveMsg(false);
  };
  // fill one region of the fish with the chosen colour (the eraser empties it)
  const fillRegion = (region: Region) => {
    const value = tool === 'eraser' ? null : color;
    const fills = pushScene(scene.fills, { t: 'fill', region, color: value });
    const met = taskMet({ mixedOrange: scene.mixedOrange, fills });
    setScene((p) => ({ ...p, fills, done: p.done || met }));
    setMoveMsg(false);
    setOtherAfterMix(scene.mixedOrange && !met && value !== 'orange');
    const msg = `${X[region][lang]}${lang === 'zh' ? '：' : ': '}${value ? colorOf(value).name[lang] : X.noColour[lang]}`;
    setSay(met && !scene.done ? `${msg} ${X.fishDone[lang]}` : msg);
  };
  // one small tail wag in the child's colours; not a mark, never in the undo history
  const moveFish = () => {
    setMoveMsg(true);
    setSay(X.moved[lang]);
    if (!reduced()) tailRef.current?.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(-14deg)' }, { transform: 'rotate(0deg)' }], { duration: 200, easing: 'ease-out' });
  };
  const startFishMix = () => {
    setMoveMsg(false);
    setPanel('mix');
    setSlots(['red', 'yellow']);
    setMixOut(null);
    requestAnimationFrame(() => {
      mixRef.current?.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'instant' : 'smooth' });
      mixRef.current?.querySelector<HTMLButtonElement>('[data-testid=mix-go]')?.focus({ preventScroll: true });
    });
  };
  useEffect(() => {
    if (full && !freeFull(s.free)) setFull(false);
  }, [s.free, full]);
  const countMark = (col: ColorId) => {
    if (run && step === 'apply') setRun((r) => (r ? { ...r, marks: { ...r.marks, [col]: (r.marks[col] ?? 0) + 1 } } : r));
  };
  const commitFree = useCallback(
    (op: FreeOp) => {
      // D4: a stroke never exceeds what the reader accepts; a full paper is said out loud instead of silently dropped
      const parts: FreeOp[] = op.t === 'stroke' && op.pts.length > MAX_PTS ? splitPoints(op.pts).map((pts) => ({ ...op, pts })) : [op];
      let h: History<FreeOp> | null = freeRef.current; // a long stroke can commit twice before React re-renders
      for (const part of parts) h = h && pushFree(h, part);
      if (!h) {
        setFull(true); // re-render redraws the paper without the stroke that did not fit
        setSay(X.full[lang]);
        return;
      }
      const next = h;
      freeRef.current = next;
      setS((p) => ({ ...p, free: next }));
      if (op.t !== 'clear' && !(op.t === 'stroke' && op.erase)) countMark(op.color);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [run, step, lang],
  );
  const stampCell = (i: number) => {
    const value = tool === 'eraser' ? null : { color, shape };
    setS((p) => ({ ...p, grid: pushGrid(p.grid, { t: 'cell', i, value }) }));
    if (value) countMark(color);
    const content = value ? `${colorOf(color).name[lang]}${lang === 'zh' ? '' : ' '}${c(shape)}` : c('empty');
    setSay(c('gridAnnouncement', { row: Math.floor(i / 3) + 1, column: (i % 3) + 1, content }));
  };

  // lesson completion
  useEffect(() => {
    if (lesson && step === 'done' && !s.done.includes(lesson.id)) {
      setS((p) => ({ ...p, done: [...p.done, lesson.id] }));
      setSay((prev) => (prev && !prev.includes(lesson.success[lang]) ? `${prev} ${lesson.success[lang]}` : lesson.success[lang]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const startLesson = (i: number) => {
    const l = LESSONS[i];
    setRun(newRun(l.id));
    setChoiceMsg(null);
    setWhy(false);
    setMixOut(null);
    if (l.recipe) setSlots(slotsFor(l.id));
  };
  const exitLesson = () => setRun(null);
  const doMix = () => {
    const [a, b] = slots;
    if (!a || !b) return;
    const r = mix(a, b);
    setMixOut({ recipe: r, a, b });
    setMoveMsg(false);
    setOtherAfterMix(false);
    if (r) {
      setS((p) => (p.mixedColors.includes(r.output) ? p : { ...p, mixedColors: [...p.mixedColors, r.output] }));
      setSay(c('mixAnnouncement', { a: colorOf(a).name[lang], b: colorOf(b).name[lang], result: colorOf(r.output).name[lang] }));
      if (run && lesson?.recipe === r.id && view !== 'fish') setRun({ ...run, mixed: [...run.mixed, r.id] });
      if (view === 'fish' && r.id === 'mix_orange') setScene((p) => ({ ...p, mixedOrange: true, done: p.done || taskMet({ mixedOrange: true, fills: p.fills }) }));
    } else setSay(c('unsupported'));
  };
  const useColour = (id: ColorId) => {
    setColor(id);
    if (tool === 'eraser') setTool('brush');
    setPanel('draw');
  };
  // D2: after mixing, the result stays on screen until the child takes it to the paper; only that button moves the view
  useEffect(() => {
    if (mixOut) resultRef.current?.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'instant' : 'smooth' });
  }, [mixOut]);
  const takeToPaper = (id: ColorId) => {
    useColour(id);
    setMixOut(null);
    requestAnimationFrame(() => {
      // the paper (or grid) and its one-line hint together; when they are taller than the screen, start at the top
      const el = stageRef.current;
      if (el) el.scrollIntoView({ block: el.getBoundingClientRect().height <= window.innerHeight - 80 ? 'center' : 'start', behavior: reduced() ? 'instant' : 'smooth' });
      if (view === 'fish') regionRef.current?.querySelector<HTMLButtonElement>('[data-testid=region-body]')?.focus({ preventScroll: true });
      else if (surface === 'free') paperRef.current?.focus({ preventScroll: true });
      else gridRef.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus({ preventScroll: true });
    });
  };
  const pickSlot = (id: ColorId) => {
    setMixOut(null);
    setSlots(([a, b]) => (a === null ? [id, b] : b === null ? [a, id] : [a, id]));
  };
  const choose = (choice: string) => {
    if (!lesson || !run) return;
    if (lesson.recipe) {
      setRun({ ...run, guess: choice });
      setChoiceMsg(c('predictionFeedback'));
      return;
    }
    setRun({ ...run, chosen: choice });
    setChoiceMsg(isCorrectChoice(lesson, choice) ? null : X.notYet[lang]);
  };
  // in easy mode, select the colour the task needs once it is available
  useEffect(() => {
    if (!lesson || step !== 'apply' || s.level !== 'easy') return;
    const need = lesson.complete.appliedColors ?? (lesson.complete.appliedColor ? [lesson.complete.appliedColor] : []);
    const missing = need.find((col) => (run?.marks[col] ?? 0) < 1);
    if (missing && color !== missing) setColor(missing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, run?.marks]);

  const doExport = async () => {
    const blob = view === 'fish' ? await exportScenePng(colors) : await exportPng(surface, visibleFree(s.free), gridCells(s.grid));
    if (!blob) return;
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `color-doodle-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  // keyboard shortcuts for undo / redo (outside text fields)
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

  const fishHint = taskMet(scene) ? X.fishDone[lang] : scene.mixedOrange ? (otherAfterMix ? X.alsoOrange[lang] : X.tapBody[lang]) : anyFilled(scene.fills) ? X.tryAnother[lang] : X.fishFirst[lang];
  const hint = view === 'fish' ? (moveMsg ? X.moved[lang] : fishHint) : lesson && step ? (step === 'done' ? lesson.success[lang] : step === 'apply' ? lesson.applyPrompt[lang] : step === 'choose' && lesson.classification ? X.pickWarm[lang] : lesson.prompt[lang]) : panel === 'mix' ? X.pickTwo[lang] : X.draw[lang];
  const need = lesson ? (lesson.complete.appliedColors ?? (lesson.complete.appliedColor ? [lesson.complete.appliedColor] : [])) : [];

  // ---------------------------------------------------------------- render
  const segBtn = (on: boolean) => `ui-t min-h-11 min-w-11 rounded-md border-2 px-3 text-sm font-medium ${on ? 'border-[var(--ui-accent-text)] bg-[var(--ui-accent-soft)]' : 'border-[var(--ui-control-border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]'}`;
  return (
    <section className="space-y-4" data-testid="doodle" data-surface={surface} data-view={view} data-step={step ?? ''}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-[1.75rem] font-bold leading-9">
          {c('title')}
        </h1>
        <div className="flex flex-wrap gap-2" role="group" aria-label={X.level[lang]}>
          <button type="button" aria-pressed={s.level === 'easy'} className={segBtn(s.level === 'easy')} onClick={() => setS((p) => ({ ...p, level: 'easy' }))} data-testid="level-easy">
            {c('easy')}
          </button>
          <button type="button" aria-pressed={s.level === 'more'} className={segBtn(s.level === 'more')} onClick={() => setS((p) => ({ ...p, level: 'more' }))} data-testid="level-more">
            {c('more')}
          </button>
        </div>
      </div>
      {notice && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-[var(--ui-alert-bg)] px-3 py-2 text-[var(--ui-alert-text)]" role="alert" data-testid="save-notice" data-notice={notice}>
          <p>{X[notice][lang]}</p>
          {oldRaw && (
            <Button variant="secondary" size="sm" onClick={() => downloadText(oldRaw)} data-testid="download-old">
              <Icon d={ICONS.save} />
              {notice === 'altKept' ? X.downloadAlt[lang] : X.downloadOld[lang]}
            </Button>
          )}
        </div>
      )}

      {sceneNotice && view === 'fish' && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-[var(--ui-alert-bg)] px-3 py-2 text-[var(--ui-alert-text)]" role="alert" data-testid="scene-notice" data-notice={sceneNotice}>
          <p>{X[sceneNotice][lang]}</p>
          {sceneRaw && (
            <Button variant="secondary" size="sm" onClick={() => downloadText(sceneRaw)} data-testid="scene-download-old">
              <Icon d={ICONS.save} />
              {sceneNotice === 'altKept' ? X.downloadAlt[lang] : X.downloadOld[lang]}
            </Button>
          )}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_auto_1fr]">
        {/* paper column */}
        <div className="min-w-0 space-y-3 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <div className="flex flex-wrap gap-2" role="group" aria-label={c('title')}>
            <button type="button" aria-pressed={view === 'free'} className={segBtn(view === 'free')} onClick={() => openView('free')} data-testid="surface-free">
              {c('freehand')}
            </button>
            <button type="button" aria-pressed={view === 'grid'} className={segBtn(view === 'grid')} onClick={() => openView('grid')} data-testid="surface-grid">
              {c('grid')}
            </button>
            <button type="button" aria-pressed={view === 'fish'} className={segBtn(view === 'fish')} onClick={() => openView('fish')} data-testid="surface-fish">
              {X.picture[lang]}
            </button>
          </div>
          <div ref={stageRef} className="space-y-3">
          {view === 'fish' ? (
            <FishPaper colors={colors} tailRef={tailRef} regionRef={regionRef} onFill={fillRegion} onMove={moveFish} onMix={startFishMix} canMove={anyFilled(scene.fills)} lang={lang} />
          ) : surface === 'free' ? (
            <Paper canvasRef={paperRef} ops={visibleFree(s.free)} tool={tool} color={color} size={size} shape={shape} onCommit={commitFree} label={X.paper[lang]} />
          ) : (
            <StampGrid boxRef={gridRef} cells={gridCells(s.grid)} focus={gridFocus} setFocus={setGridFocus} onStamp={stampCell} lang={lang} label={X.gridLabel[lang]} c={c} erase={tool === 'eraser'} />
          )}
          <p className="min-h-6 text-base font-medium" data-testid="doodle-hint">
            {hint}
          </p>
          {full && view === 'free' && (
            <p className="rounded-md bg-[var(--ui-alert-bg)] px-3 py-2 text-[var(--ui-alert-text)]" data-testid="paper-full">
              {X.full[lang]}
            </p>
          )}
          </div>
        </div>
        {/* colours: right after the paper on phones, right column on desktop */}
        <div className="space-y-2 lg:col-start-2 lg:row-start-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold">{c('palette')}</h2>
              <button type="button" aria-pressed={showAll} className={segBtn(showAll)} onClick={() => setShowAll((v) => !v)} data-testid="all-colours">
                {X.allColours[lang]}
              </button>
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label={c('palette')}>
              {palette.map((id) => (
                <Swatch key={id} id={id} lang={lang} pressed={color === id && tool !== 'eraser'} onClick={() => (panel === 'mix' && BASE_COLORS.includes(id) ? pickSlot(id) : useColour(id))} />
              ))}
            </div>
          </div>

        {/* tools: under the paper on every width */}
        <div className="min-w-0 space-y-3 lg:col-start-1 lg:row-start-3">
          {/* main tools (max five kinds) */}
          <div className="flex flex-wrap items-end gap-2" role="toolbar" aria-label={c('brush')}>
            <ToolButton label={c('brush')} pressed={tool === 'brush'} onClick={() => setTool('brush')} testid="tool-brush">
              <Icon d={ICONS.brush} />
            </ToolButton>
            <ToolButton label={c('eraser')} pressed={tool === 'eraser'} onClick={() => setTool('eraser')} testid="tool-eraser">
              <Icon d={ICONS.eraser} />
            </ToolButton>
            {view !== 'fish' && (
              <ToolButton label={c('stamp')} pressed={tool === 'stamp'} onClick={() => setTool('stamp')} testid="tool-stamp">
                <Icon d={ICONS.stamp} />
              </ToolButton>
            )}
            <ToolButton label={c('undo')} onClick={() => onHistory('undo')} disabled={!canUndo(history as History<unknown>)} testid="tool-undo">
              <Icon d={ICONS.undo} />
            </ToolButton>
          </div>
          <div className={`flex flex-wrap gap-2 ${view === 'fish' ? 'hidden' : ''}`}>
            <fieldset className="flex flex-wrap items-center gap-1">
              <legend className="sr-only">{X.size[lang]}</legend>
              {(['s', 'm', 'l'] as Size[]).map((z) => (
                <button key={z} type="button" aria-pressed={size === z} className={segBtn(size === z)} onClick={() => setSize(z)} data-testid={`size-${z}`}>
                  {X[z][lang]}
                </button>
              ))}
            </fieldset>
            {(tool === 'stamp' || surface === 'grid') && (
              <fieldset className="flex flex-wrap items-center gap-1">
                <legend className="sr-only">{X.shape[lang]}</legend>
                {(['circle', 'triangle', 'square'] as Shape[]).map((z) => (
                  <button key={z} type="button" aria-pressed={shape === z} className={segBtn(shape === z)} onClick={() => setShape(z)} data-testid={`shape-${z}`}>
                    <span className="inline-flex items-center gap-1">
                      <MarkIcon mark={z} />
                      {c(z)}
                    </span>
                  </button>
                ))}
              </fieldset>
            )}
          </div>
          {/* secondary tools */}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => onHistory('redo')} disabled={!canRedo(history as History<unknown>)} data-testid="tool-redo">
              <Icon d={ICONS.redo} />
              {c('redo')}
            </Button>
            <Button variant="secondary" size="sm" onClick={doExport} data-testid="tool-export">
              <Icon d={ICONS.save} />
              {c('export')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setConfirmClear(true)} disabled={view === 'fish' ? !anyFilled(scene.fills) : surface === 'free' ? visibleFree(s.free).length === 0 : gridCells(s.grid).every((x) => !x)} data-testid="tool-clear">
              <Icon d={ICONS.paper} />
              {c('newPaper')}
            </Button>
          </div>
          <p className="text-sm text-[var(--muted)]" data-testid="save-state" aria-live="polite">
            {(view === 'fish' ? sceneSaveState : saveState) === 'error' ? (
              <span className="text-[var(--ui-alert-text)]">
                {c('saveError')}{' '}
                <button type="button" className="min-h-11 underline" onClick={doExport}>
                  {c('export')}
                </button>
              </span>
            ) : (view === 'fish' ? sceneSaveState : saveState) === 'saved' ? (
              `${c('saved')} · ${X.savedLocal[lang]}`
            ) : (
              X.savedLocal[lang]
            )}
          </p>
        </div>

        {/* side panel */}
        <div className="space-y-4 lg:col-start-2 lg:row-span-2 lg:row-start-2">
          <div ref={mixRef} className="space-y-2 rounded-lg border border-[var(--border)] p-3">
            <div className="flex flex-wrap gap-2">
              <button type="button" aria-pressed={panel === 'draw'} className={segBtn(panel === 'draw')} onClick={() => setPanel('draw')} data-testid="panel-draw">
                {c('draw')}
              </button>
              <button type="button" aria-pressed={panel === 'mix'} className={segBtn(panel === 'mix')} onClick={() => setPanel('mix')} data-testid="panel-mix">
                {c('mixMode')}
              </button>
            </div>
            {(panel === 'mix' || (lesson && step === 'mix') || mixOut) && (
              <MixPad slots={slots} out={mixOut} lang={lang} c={c} onPick={pickSlot} onMix={doMix} onReset={() => (setSlots([null, null]), setMixOut(null))} onUse={takeToPaper} useLabel={view === 'fish' ? X.paintThis[lang] : surface === 'grid' ? X.goStamp[lang] : X.goDraw[lang]} locked={view !== 'fish' && !!lesson && (step === 'mix' || !!mixOut)} resultRef={resultRef} />
            )}
          </div>

          {view === 'fish' && (
            <div className="space-y-2 rounded-lg border border-[var(--border)] p-3" data-testid="fish-task" data-done={scene.done ? 'true' : 'false'}>
              <h2 className="text-lg font-bold">{X.fishName[lang]}</h2>
              <p className="text-base">
                {X.fishTask[lang]}
                {scene.done && (
                  <span className="ml-2 inline-flex items-center gap-1 font-bold text-[var(--ui-accent-text)]">
                    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
                      <path d="M3 8.5 6.5 12 13 4.5" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" />
                    </svg>
                    {X.done[lang]}
                  </span>
                )}
              </p>
            </div>
          )}
          {/* short tasks */}
          <div className={`space-y-2 rounded-lg border border-[var(--border)] p-3 ${view === 'fish' ? 'hidden' : ''}`} data-testid="tasks">
            <h2 className="text-lg font-bold">{X.tasks[lang]}</h2>
            <div className="flex flex-wrap gap-1">
              {lessonsForLevel.map(({ l, i }) => (
                <button key={l.id} type="button" aria-pressed={lessonIdx === i} aria-label={`${format(X.task[lang], { n: i + 1 })}${s.done.includes(l.id) ? ` · ${X.done[lang]}` : ''}`} className={`${segBtn(lessonIdx === i)} min-w-11`} onClick={() => startLesson(i)} data-testid={`lesson-${i + 1}`}>
                  {i + 1}
                  {s.done.includes(l.id) && (
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
                {/* prediction / choice */}
                {(step === 'predict' || step === 'choose' || (step === 'mix' && s.level === 'easy' && !run.guess)) && (
                  <div className="space-y-1">
                    <p className="text-sm text-[var(--muted)]">{step === 'choose' ? (lesson.classification ? X.pickWarm[lang] : X.guess[lang]) : s.level === 'easy' ? X.guessOptional[lang] : X.guess[lang]}</p>
                    <div className="flex flex-wrap gap-1">
                      {lesson.choices.map((ch) =>
                        COLORS.some((x) => x.id === ch) ? (
                          <Swatch key={ch} id={ch as ColorId} lang={lang} pressed={run.guess === ch || run.chosen === ch} onClick={() => choose(ch)} testid={`choice-${ch}`} />
                        ) : (
                          <button key={ch} type="button" aria-pressed={run.guess === ch} className={segBtn(run.guess === ch)} onClick={() => choose(ch)} data-testid={`choice-${ch}`}>
                            {ch === 'lighter' ? (lang === 'zh' ? '變亮' : 'Lighter') : lang === 'zh' ? '變暗' : 'Darker'}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                )}
                {choiceMsg && <p className="text-sm font-medium">{choiceMsg}</p>}
                {step === 'apply' && (
                  <p className="text-sm">
                    {X.need[lang]}{' '}
                    {need.map((col) => (
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
                  <p className={`rounded-md bg-[var(--ui-accent-soft)] px-3 py-2 font-bold text-[var(--ui-accent-text)] ${reduced() ? '' : 'ui-t'}`} data-testid="lesson-success">
                    {lesson.success[lang]}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {step === 'done' && lessonIdx !== null && lessonsForLevel.some(({ i }) => i > lessonIdx) && (
                    <Button size="sm" onClick={() => startLesson(lessonsForLevel.find(({ i }) => i > lessonIdx)!.i)} data-testid="lesson-next">
                      {X.next[lang]}
                    </Button>
                  )}
                  {step !== 'done' && (
                    <Button size="sm" variant="secondary" onClick={() => lessonIdx !== null && startLesson(lessonIdx)} data-testid="lesson-retry">
                      {c('retry')}
                    </Button>
                  )}
                  {step !== 'done' && lessonIdx !== null && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const nx = lessonsForLevel.find(({ i }) => i > lessonIdx);
                        if (nx) startLesson(nx.i);
                        else exitLesson();
                      }}
                      data-testid="lesson-skip"
                    >
                      {c('skip')}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => (exitLesson(), setPanel('draw'))} data-testid="lesson-exit">
                    {X.backFree[lang]}
                  </Button>
                  <Button size="sm" variant="ghost" aria-expanded={why} onClick={() => setWhy((w) => !w)} data-testid="lesson-why">
                    <Icon d={ICONS.why} />
                    {c('why')}
                  </Button>
                </div>
                {why && (
                  <p className="text-sm text-[var(--muted)]" data-testid="why-text">
                    {lesson.success[lang]} {c('modelNote')}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite" data-testid="announce">
        {say}
      </p>

      <Modal open={confirmClear} onClose={() => setConfirmClear(false)} title={c('clearTitle')}>
        <p className="mb-4">{surface === 'free' && freeFull(s.free) ? X.fullClear[lang] : c('clearBody')}</p>
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

// ------------------------------------------------------------------ paper (Canvas 2D)
function Paper({ canvasRef, ops, tool, color, size, shape, onCommit, label }: { canvasRef: RefObject<HTMLCanvasElement | null>; ops: FreeOp[]; tool: 'brush' | 'eraser' | 'stamp'; color: ColorId; size: Size; shape: Shape; onCommit: (op: FreeOp) => void; label: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = canvasRef;
  const live = useRef<{ id: number; pts: [number, number][] } | null>(null);
  const [dim, setDim] = useState({ w: 0, h: 0, dpr: 1 });

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      setDim({ w, h: Math.round(w * RATIO), dpr: Math.min(2, window.devicePixelRatio || 1) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // redraw from the replayable ops whenever size or content changes (rotation never clears the picture)
  useEffect(() => {
    const c = cv.current;
    if (!c || !dim.w) return;
    c.width = Math.round(dim.w * dim.dpr);
    c.height = Math.round(dim.h * dim.dpr);
    renderFree(c.getContext('2d')!, ops, c.width, c.height);
  }, [ops, dim]);

  const pos = (e: RPointerEvent): [number, number] => {
    const r = cv.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  const down = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (live.current || (e.pointerType === 'mouse' && e.button !== 0)) return; // ignore a second finger / other buttons
    const p = pos(e);
    if (tool === 'stamp') {
      onCommit({ t: 'stamp', color, shape, size, x: p[0], y: p[1] });
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    live.current = { id: e.pointerId, pts: [p] };
    const c = cv.current!;
    drawOp(c.getContext('2d')!, { t: 'stroke', color, size, erase: tool === 'eraser', pts: [p] }, c.width, c.height);
  };
  const move = (e: RPointerEvent<HTMLCanvasElement>) => {
    const l = live.current;
    if (!l || l.id !== e.pointerId) return;
    const p = pos(e);
    const last = l.pts[l.pts.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.002) return;
    l.pts.push(p);
    // D4: a very long stroke continues as the next stroke, so no saved stroke exceeds MAX_PTS points
    if (l.pts.length >= MAX_PTS) {
      onCommit({ t: 'stroke', color, size, erase: tool === 'eraser', pts: l.pts.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]) });
      l.pts = [p];
    }
    const c = cv.current!;
    drawOp(c.getContext('2d')!, { t: 'stroke', color, size, erase: tool === 'eraser', pts: [last, p] }, c.width, c.height);
  };
  const end = (e: RPointerEvent<HTMLCanvasElement>, cancel = false) => {
    const l = live.current;
    if (!l || l.id !== e.pointerId) return;
    live.current = null;
    if (cancel) {
      // drop the unfinished stroke (no sticky line); redraw what was committed
      const c = cv.current!;
      renderFree(c.getContext('2d')!, ops, c.width, c.height);
      return;
    }
    onCommit({ t: 'stroke', color, size, erase: tool === 'eraser', pts: l.pts.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]) });
  };
  return (
    <div ref={wrap} className="mx-auto w-full" style={{ maxWidth: 'max(18rem, calc((100dvh - 8rem) * 4 / 3))' }}>
      <canvas
        ref={cv}
        tabIndex={-1}
        role="img"
        aria-label={label}
        className="block w-full touch-none rounded-md border border-[var(--ui-control-border)] bg-white"
        style={{ height: dim.h || undefined, aspectRatio: '4 / 3' }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={(e) => end(e)}
        onPointerCancel={(e) => end(e, true)}
        onLostPointerCapture={(e) => end(e)}
        data-testid="paper"
      />
    </div>
  );
}

// ------------------------------------------------------------------ picture play: my fish (tap a region to fill it)
function FishPaper({ colors, tailRef, regionRef, onFill, onMove, onMix, canMove, lang }: { colors: Record<Region, ColorId | null>; tailRef: RefObject<SVGGElement | null>; regionRef: RefObject<HTMLDivElement | null>; onFill: (r: Region) => void; onMove: () => void; onMix: () => void; canMove: boolean; lang: 'zh' | 'en' }) {
  const A = FISH_ART;
  const fill = (r: Region) => (colors[r] ? colorOf(colors[r]!).hex : '#ffffff');
  const name = (r: Region) => (colors[r] ? colorOf(colors[r]!).name[lang] : X.noColour[lang]);
  const region = (r: Region, d: string) => (
    <path d={d} fill={fill(r)} stroke="#1f2328" strokeWidth="4" strokeLinejoin="round" className="cursor-pointer" onClick={() => onFill(r)} data-testid={`fish-${r}`} data-color={colors[r] ?? ''} />
  );
  return (
    <div className="space-y-3" data-testid="fish">
      <div className="mx-auto w-full" style={{ maxWidth: 'max(18rem, calc((100dvh - 8rem) * 4 / 3))' }}>
        <svg viewBox={`0 0 ${A.viewBox.w} ${A.viewBox.h}`} className="block aspect-[4/3] w-full rounded-md border border-[var(--ui-control-border)] bg-white" role="img" aria-label={format(X.fishLabel[lang], { body: name('body'), tail: name('tail'), fin: name('fin') })}>
          <g ref={tailRef} style={{ transformOrigin: `${A.tailPivot.x}px ${A.tailPivot.y}px`, transformBox: 'view-box' }}>
            {region('tail', A.tail)}
          </g>
          {region('fin', A.fin)}
          {region('body', A.body)}
          <circle cx={A.eye.cx} cy={A.eye.cy} r={A.eye.r} fill="#1f2328" pointerEvents="none" />
          <path d={A.mouth} fill="none" stroke="#1f2328" strokeWidth="4" strokeLinecap="round" pointerEvents="none" />
        </svg>
      </div>
      {/* the same three regions as buttons: keyboard, screen readers and small fingers */}
      <div ref={regionRef} className="flex flex-wrap gap-2" role="group" aria-label={X.regions[lang]}>
        {FISH_REGIONS.map((r) => (
          <button key={r} type="button" onClick={() => onFill(r)} aria-label={`${X[r][lang]}${lang === 'zh' ? '：' : ': '}${name(r)}`} className="ui-t inline-flex min-h-12 min-w-12 items-center gap-2 rounded-md border-2 border-[var(--ui-control-border)] bg-[var(--surface)] px-3 font-medium hover:bg-[var(--surface-2)]" data-testid={`region-${r}`}>
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--ui-control-border)]" style={{ background: fill(r), color: colors[r] ? markColour(colors[r]!) : '#1f2328' }} aria-hidden="true">
              {colors[r] && <MarkIcon mark={colorOf(colors[r]!).mark} className="h-3.5 w-3.5" />}
            </span>
            {X[r][lang]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onMove} disabled={!canMove} data-testid="fish-move">
          {X.move[lang]}
        </Button>
        <Button variant="secondary" onClick={onMix} data-testid="fish-mix">
          {X.tryMix[lang]}
        </Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ stamp grid (keyboard / screen reader path)
function StampGrid({ boxRef, cells, focus, setFocus, onStamp, lang, label, c, erase }: { boxRef: RefObject<HTMLDivElement | null>; cells: ({ color: ColorId; shape: Shape } | null)[]; focus: number; setFocus: (i: number) => void; onStamp: (i: number) => void; lang: 'zh' | 'en'; label: string; c: (k: string, v?: Record<string, string | number>) => string; erase: boolean }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 };
    if (e.key in moves) {
      e.preventDefault();
      let n = i + moves[e.key];
      if ((e.key === 'ArrowRight' && i % 3 === 2) || (e.key === 'ArrowLeft' && i % 3 === 0)) n = i;
      if (n < 0 || n > 8) n = i;
      setFocus(n);
      refs.current[n]?.focus();
    }
  };
  return (
    <div ref={boxRef} className="mx-auto w-full max-w-md" role="group" aria-label={label} data-testid="stamp-grid">
      <div className="grid grid-cols-3 gap-0 overflow-hidden rounded-md border border-[var(--ui-control-border)] bg-white">
        {cells.map((cell, i) => {
          const content = cell ? `${colorOf(cell.color).name[lang]}${lang === 'zh' ? '' : ' '}${c(cell.shape)}` : c('empty');
          return (
            <button
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              tabIndex={i === focus ? 0 : -1}
              onFocus={() => setFocus(i)}
              onKeyDown={(e) => onKey(e, i)}
              onClick={() => onStamp(i)}
              aria-label={`${c('gridAnnouncement', { row: Math.floor(i / 3) + 1, column: (i % 3) + 1, content })} ${erase ? X.eraseHere[lang] : X.stampHere[lang]}`}
              className="relative aspect-square border border-[#d8d9d1] focus-visible:z-10"
              data-testid={`cell-${i}`}
              data-content={cell ? `${cell.color}-${cell.shape}` : ''}
            >
              {cell && (
                <svg viewBox="0 0 16 16" className="absolute inset-[18%]" aria-hidden="true">
                  <g fill={colorOf(cell.color).hex} stroke={cell.color === 'white' ? '#8a8a8a' : 'none'} strokeWidth="0.6">
                    {cell.shape === 'circle' ? <circle cx="8" cy="8" r="6.5" /> : cell.shape === 'square' ? <rect x="1.5" y="1.5" width="13" height="13" /> : <path d="M8 1.5 15 14H1z" />}
                  </g>
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ mixing pad
function MixPad({ slots, out, lang, c, onPick, onMix, onReset, onUse, useLabel, locked, resultRef }: { useLabel: string; resultRef: RefObject<HTMLDivElement | null>; slots: (ColorId | null)[]; out: { recipe: Recipe | null; a: ColorId; b: ColorId } | null; lang: 'zh' | 'en'; c: (k: string, v?: Record<string, string | number>) => string; onPick: (id: ColorId) => void; onMix: () => void; onReset: () => void; onUse: (id: ColorId) => void; locked: boolean }) {
  return (
    <div className="space-y-3" data-testid="mixpad">
      {!locked && (
        <div className="flex flex-wrap gap-1" role="group" aria-label={X.pickTwo[lang]}>
          {BASE_COLORS.map((id) => (
            <Swatch key={id} id={id} lang={lang} onClick={() => onPick(id)} testid={`mixpick-${id}`} />
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {slots.map((id, k) => (
          <span key={k} className="flex min-h-12 items-center gap-2 rounded-md border border-[var(--ui-control-border)] px-2" data-testid={`slot-${k}`} data-color={id ?? ''}>
            <span className="text-xs text-[var(--muted)]">{format(X.slot[lang], { n: k + 1 })}</span>
            {id ? (
              <span className="inline-flex items-center gap-1 font-medium">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--ui-control-border)]" style={{ background: colorOf(id).hex, color: markColour(id) }}>
                  <MarkIcon mark={colorOf(id).mark} className="h-3.5 w-3.5" />
                </span>
                {colorOf(id).name[lang]}
              </span>
            ) : (
              <span className="text-sm">{X.emptySlot[lang]}</span>
            )}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onMix} disabled={!slots[0] || !slots[1]} data-testid="mix-go">
          {c('mix')}
        </Button>
        {!locked && (
          <Button variant="ghost" onClick={onReset} data-testid="mix-reset">
            {X.clearSlots[lang]}
          </Button>
        )}
      </div>
      {out && (
        <div ref={resultRef} className="space-y-2 rounded-md bg-[var(--surface-2)] p-3" data-testid="mix-result" data-output={out.recipe?.output ?? ''}>
          {out.recipe ? (
            <>
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {colorOf(out.a).name[lang]} + {colorOf(out.b).name[lang]} →
                <span className="inline-flex items-center gap-1 font-bold">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--ui-control-border)]" style={{ background: colorOf(out.recipe.output).hex, color: markColour(out.recipe.output) }}>
                    <MarkIcon mark={colorOf(out.recipe.output).mark} className="h-5 w-5" />
                  </span>
                  {colorOf(out.recipe.output).name[lang]}
                </span>
              </p>
              <Button size="sm" onClick={() => onUse(out.recipe!.output)} data-testid="mix-use">
                {useLabel}
              </Button>
            </>
          ) : (
            <p className="font-medium" data-testid="mix-unsupported">
              {c('unsupported')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ RYB teaching wheel (L06)
function Wheel({ lang }: { lang: 'zh' | 'en' }) {
  return (
    <figure className="flex flex-wrap items-center gap-3" data-testid="wheel">
      <svg viewBox="-50 -50 100 100" className="h-32 w-32" role="img" aria-label={`${X.wheel[lang]}：${WHEEL.map((w) => colorOf(w).name[lang]).join('、')}`}>
        {WHEEL.map((id, k) => {
          const a0 = ((k - 0.5) / 6) * Math.PI * 2 - Math.PI / 2,
            a1 = ((k + 0.5) / 6) * Math.PI * 2 - Math.PI / 2;
          const p = (a: number, r: number) => `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
          const am = (a0 + a1) / 2;
          return (
            <g key={id}>
              <path d={`M${p(a0, 46)} A46 46 0 0 1 ${p(a1, 46)} L${p(a1, 20)} A20 20 0 0 0 ${p(a0, 20)}Z`} fill={colorOf(id).hex} stroke="#fff" strokeWidth="1.5" />
              <g transform={`translate(${p(am, 33).replace(' ', ',')}) scale(0.9) translate(-8,-8)`} style={{ color: markColour(id) }}>
                <MarkIcon mark={colorOf(id).mark} className="" />
              </g>
            </g>
          );
        })}
      </svg>
      <figcaption className="text-sm text-[var(--muted)]">{WHEEL.map((w) => colorOf(w).name[lang]).join(' → ')}</figcaption>
    </figure>
  );
}
