// Math Island — short spoken prompts from pre-made audio files only (spec §5, MA05).
// Files are produced offline with Azure Neural TTS (scripts/math-tts.mjs, key kept as a server-side secret) and
// served as static files; the page never sends text to a speech service while a child plays. Playing starts only
// after a tap (browsers may block sound before that), one clip at a time; a missing file never blocks play.
import { APPLE_PROBLEMS } from '../../shared/math/apple';
import { FACTORY_PROBLEMS } from '../../shared/math/factory';

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
