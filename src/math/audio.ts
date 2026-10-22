// Math Island — short spoken prompts from pre-made audio files only (spec §5, MA05).
// Files are produced offline with Azure Neural TTS (scripts/math-tts.mjs, key kept as a server-side secret) and
// served as static files; the page never sends text to a speech service while a child plays. Playing starts only
// after a tap (browsers may block sound before that), one clip at a time; a missing file never blocks play.
import { APPLE_PROBLEMS } from '../../shared/math/apple';
import { FACTORY_PROBLEMS } from '../../shared/math/factory';
import { TRAIN_PROBLEMS } from '../../shared/math/train';
import { SHOP_PROBLEMS } from '../../shared/math/shop';
import { BALANCE_PROBLEMS, unknownOf, type BalanceProblem } from '../../shared/math/balance';
import { CLOCK_PROBLEMS, sayTime } from '../../shared/math/clock';
import { GARDEN_PROBLEMS } from '../../shared/math/garden';
import { FROG_PROBLEMS, landing, taskOf } from '../../shared/math/frog';

/** "5 加 3 等於 6 加 2" — the solved equation as it is read aloud */
const spokenEq = (p: BalanceProblem) => {
  const side = (t: (number | 'x')[]) => t.map((x) => (x === 'x' ? unknownOf(p) : x)).join(' 加 ');
  return `${side(p.left)} 等於 ${side(p.right)}`;
};

export const VOICE = { locale: 'zh-TW', voice: 'zh-TW-HsiaoChenNeural', version: 1 } as const;

/** Every clip with its exact text (also the source list for generating the files). */
export const CLIPS: Record<string, string> = {
  menu_hello: '想玩哪一個？點一下圖片。',
  menu_apple: '蘋果籃，把蘋果放進籃子！',
  menu_train: '湊十小火車，請乘客上火車！',
  menu_shop: '零錢小商店，用硬幣付錢！',
  menu_balance: '天平等一等，讓天平平衡！',
  menu_clock: '時鐘修理站，把時鐘撥對！',
  menu_garden: '乘法花圃，種一排一排的花！',
  menu_factory: '分裝工廠，把餅乾平分到盒子裡！',
  menu_frog: '數線青蛙，幫青蛙找到落點！',
  ...Object.fromEntries(Array.from({ length: 10 }, (_, k) => [`n_${k + 1}`, String(k + 1)])),
  apple_card: '一共幾顆？把數字卡放進籃子。',
  apple_task: '把蘋果放一起。',
  apple_ask: '一共有幾顆？',
  apple_not_ready: '先把兩堆蘋果都放進籃子，再數一數。',
  apple_again: '再數一次看看。',
  apple_where: '要放哪裡？點一下籃子或原來的地方。',
  apple_done: '五題都完成了。',
  ...Object.fromEntries(APPLE_PROBLEMS.map((p) => [`apple_right_${p.id.slice(-2)}`, `${p.a} 加 ${p.b}，一共 ${p.a + p.b} 顆。`])),
  factory_task: '每盒放一樣多。',
  factory_ask: '每盒有幾個？',
  factory_not_all: '還有沒分完的，先全部放進盒子。',
  factory_unequal: '每盒要一樣多，再分分看。',
  factory_again: '再數一次看看。',
  factory_where: '要放哪裡？點一下盒子或輸送帶。',
  factory_done: '五題都完成了。',
  ...Object.fromEntries(FACTORY_PROBLEMS.map((p) => [`factory_right_${p.id.slice(-2)}`, `${p.boxes} 盒，每盒 ${p.total / p.boxes} 個，一共 ${p.total} 個。`])),
  train_task: '請月台上的人上火車。第一節坐滿 10 人，才能坐第二節。',
  train_ask: '火車上一共有幾個人？',
  train_full: '第一節坐滿了，請坐第二節。',
  train_fill_first: '先把第一節坐滿。',
  train_not_all: '月台上還有人，先讓大家都上車。',
  train_again: '再數一次看看。',
  train_where: '要坐哪裡？點一下車廂或月台。',
  train_done: '五題都完成了。',
  ...Object.fromEntries(TRAIN_PROBLEMS.map((p) => [`train_right_${p.id.slice(-2)}`, p.a + p.b === 10 ? `${p.a} 加 ${p.b}，剛好 10 人。` : `${p.a} 加 ${p.b}，先湊成 10，再多 ${p.a + p.b - 10}，一共 ${p.a + p.b} 人。`])),
  ...Object.fromEntries(SHOP_PROBLEMS.map((p) => [`shop_task_${p.id.slice(-2)}`, `${p.item}一個 ${p.price} 元，請付剛好的錢。`])),
  shop_empty: '先把錢幣放到托盤上，再按付錢。',
  shop_short: '錢還不夠喔。',
  shop_over: '付太多了喔。',
  shop_where: '要放哪裡？點一下托盤或錢包。',
  shop_done: '五題都完成了。',
  ...Object.fromEntries(SHOP_PROBLEMS.map((p) => [`shop_right_${p.id.slice(-2)}`, `剛好 ${p.price} 元，謝謝！`])),
  balance_task: '放積木，讓天平兩邊一樣重。',
  balance_not_level: '還沒有平衡，看看哪一邊比較重。',
  balance_where: '要放哪裡？點一下盤子或積木箱。',
  balance_done: '五題都完成了。',
  ...Object.fromEntries(BALANCE_PROBLEMS.map((p) => [`balance_right_${p.id.slice(-2)}`, `${spokenEq(p)}，兩邊一樣重。`])),
  ...Object.fromEntries(CLOCK_PROBLEMS.map((p) => [`clock_task_${p.id.slice(-2)}`, p.task])),
  clock_wrong: '再看看長針和短針指在哪裡。',
  clock_wrong_part: '鐘面對了，再看看是上午還是下午。',
  clock_done: '五題都完成了。',
  ...Object.fromEntries(CLOCK_PROBLEMS.map((p) => [`clock_right_${p.id.slice(-2)}`, `對了，${sayTime(p.goal)}。`])),
  ...Object.fromEntries(
    GARDEN_PROBLEMS.map((p) => [`garden_task_${p.id.slice(-2)}`, p.kind === 'make' ? `每排種 ${p.cols} 朵，種 ${p.rows} 排。` : `種 ${p.total} 朵花，每排一樣多。找出 ${p.need} 種不同的種法。`]),
  ),
  garden_shape: '再看看每排幾朵、種了幾排。',
  garden_not_equal: '要剛好 12 朵，而且每排一樣多。',
  garden_again: '這種種過了，換一種排法。',
  garden_found: '找到一種了，再找一種。',
  garden_ask: '一共有幾朵花？',
  garden_not_planted: '先拉好花圃，再按種下去。',
  garden_wrong: '再數一次看看。',
  garden_done: '五題都完成了。',
  ...Object.fromEntries(
    GARDEN_PROBLEMS.map((p) => [
      `garden_right_${p.id.slice(-2)}`,
      p.kind === 'ways'
        ? '找到兩種種法了，花的數量都一樣。'
        : p.split
          ? `${p.cols} 乘以 ${p.rows}，可以拆成 ${p.split} 乘以 ${p.rows} 和 ${p.cols - p.split} 乘以 ${p.rows}，${p.split * p.rows} 加 ${(p.cols - p.split) * p.rows}，一共 ${p.cols * p.rows} 朵。`
          : `每排 ${p.cols} 朵，有 ${p.rows} 排，${p.cols} 乘以 ${p.rows} 等於 ${p.cols * p.rows}。`,
    ]),
  ),
  ...Object.fromEntries(FROG_PROBLEMS.map((p) => [`frog_task_${p.id.slice(-2)}`, taskOf(p)])),
  frog_no_pick: '先點數線，選青蛙會停在哪裡。',
  frog_start: '那是青蛙出發的地方喔。',
  frog_other_way: '看看青蛙是往哪一邊跳。',
  frog_not_on_path: '青蛙這樣跳，跳不到那裡。',
  frog_jumps: '跳到那裡的次數不一樣，再算算看。',
  frog_done: '五題都完成了。',
  ...Object.fromEntries(FROG_PROBLEMS.map((p) => [`frog_right_${p.id.slice(-2)}`, `從 ${p.start} 跳 ${p.times} 次，每次 ${Math.abs(p.jump)}，停在 ${landing(p)}。`])),
};
export type ClipId = keyof typeof CLIPS;

export const clipUrl = (id: string) => `/math/audio/${VOICE.locale}/v${VOICE.version}/${id}.mp3`;

export type AudioState = 'idle' | 'playing' | 'blocked' | 'missing';

export class Speaker {
  state: AudioState = 'idle';
  private el: HTMLAudioElement | null = null;
  private subs = new Set<() => void>();
  private token = 0;

  subscribe(f: () => void) {
    this.subs.add(f);
    return () => this.subs.delete(f);
  }
  private set(s: AudioState) {
    this.state = s;
    for (const f of this.subs) f();
  }

  /** Stop anything playing now (switching problem, turning sound off, leaving the page). */
  stop() {
    this.token++;
    if (this.el) {
      this.el.onended = this.el.onerror = null;
      try {
        this.el.pause();
      } catch {
        /* ignore */
      }
      this.el.removeAttribute('src');
      this.el = null;
    }
    if (this.state === 'playing') this.set('idle');
  }

  play(id: string) {
    this.stop();
    if (typeof Audio === 'undefined' || !(id in CLIPS)) return;
    const t = this.token;
    const el = new Audio(clipUrl(id));
    this.el = el;
    el.onended = () => t === this.token && this.set('idle');
    el.onerror = () => t === this.token && this.set('missing');
    this.set('playing');
    const p = el.play();
    if (p && typeof p.catch === 'function')
      p.catch((e: unknown) => {
        if (t !== this.token) return;
        this.set((e as { name?: string })?.name === 'NotAllowedError' ? 'blocked' : 'missing');
      });
  }
}
