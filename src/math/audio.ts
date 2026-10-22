// Math Island — short spoken prompts from pre-made audio files only (spec §5, MA05).
// Files are produced offline with Azure Neural TTS (scripts/math-tts.mjs, key kept as a server-side secret) and
// served as static files; the page never sends text to a speech service while a child plays. Playing starts only
// after a tap (browsers may block sound before that), one clip at a time; a missing file never blocks play.
import { APPLE_PROBLEMS } from '../../shared/math/apple';
import { FACTORY_PROBLEMS } from '../../shared/math/factory';
import { TRAIN_PROBLEMS } from '../../shared/math/train';
import { SHOP_PROBLEMS } from '../../shared/math/shop';
import { BALANCE_PROBLEMS, unknownOf, type BalanceProblem } from '../../shared/math/balance';

/** "5 加 3 等於 6 加 2" — the solved equation as it is read aloud */
const spokenEq = (p: BalanceProblem) => {
  const side = (t: (number | 'x')[]) => t.map((x) => (x === 'x' ? unknownOf(p) : x)).join(' 加 ');
  return `${side(p.left)} 等於 ${side(p.right)}`;
};

export const VOICE = { locale: 'zh-TW', voice: 'zh-TW-HsiaoChenNeural', version: 1 } as const;

/** Every clip with its exact text (also the source list for generating the files). */
export const CLIPS: Record<string, string> = {
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
