// Crazy Bumper — every sound is synthesised with Web Audio (no audio files): the rubbery "boing" of two rings,
// the dash whoosh, the post's "咚!", countdown beeps, a blip per star and a small fanfare at the end.
// Sound starts only after the first tap or key (iOS rule); before that every call is silently ignored.
// Music: three Suno tracks by James (public/bumper/music/*.mp3, see docs/product/CRAZY_BUMPER_MUSIC.md). Each is
// fetched and decoded only once sound is unlocked (never on first paint), plays from 0, then loops between bar-line
// loop points with no gap (AudioBufferSourceNode loopStart/loopEnd); results plays once. Tracks cross-fade (0.6 s)
// and the last 10 s of a round speed the music up to 1.08×.

export type MusicTrack = 'title' | 'play' | 'results';
export interface MusicFile {
  url: string;
  /** seconds; after the first pass the music loops between these (null: play once) */
  loop: [number, number] | null;
}
export const MUSIC_TRACKS: Record<MusicTrack, MusicFile> = {
  title: { url: '/bumper/music/title.mp3', loop: [19.9459, 76.2438] },
  play: { url: '/bumper/music/play.mp3', loop: [19.2725, 67.1743] },
  results: { url: '/bumper/music/results.mp3', loop: null },
};
const FADE = 0.6;

const MUTE_KEY = 'jy-bumper-muted';

export class AudioSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private music: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last: Record<string, number> = {};
  private track: { name: MusicTrack; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private rate = 1;
  private wanted: MusicTrack | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      /* storage blocked: sound on */
    }
  }

  get unlocked() {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** call from a user gesture (tap, click, key) */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.9;
        this.master.connect(this.ctx.destination);
        this.sfx = this.ctx.createGain();
        this.sfx.gain.value = 0.8;
        this.sfx.connect(this.master);
        this.music = this.ctx.createGain();
        this.music.gain.value = 0.45;
        this.music.connect(this.master);
        const n = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, n, n);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        if (this.wanted) void this.setMusic(this.wanted);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.03);
  }

  suspend(hidden: boolean) {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  /** returns the context when sound may play now and this effect is not repeating too fast */
  private ready(kind: string, gap: number): AudioContext | null {
    const c = this.ctx;
    if (!c || c.state !== 'running' || this.muted) return null;
    const t = c.currentTime;
    if (t - (this.last[kind] ?? -1) < gap) return null;
    this.last[kind] = t;
    return c;
  }

  private env(c: AudioContext, peak: number, attack: number, decay: number, at = c.currentTime) {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    g.connect(this.sfx!);
    return g;
  }

  /** two rubber rings: a springy pitch wobble plus a soft thump; strength in u/s */
  boing(strength: number) {
    const c = this.ready('boing', 0.06);
    if (!c) return;
    const t = c.currentTime;
    const s = Math.max(0.2, Math.min(1, strength / 16));
    const o = c.createOscillator();
    o.type = 'sine';
    const base = 170 + Math.random() * 40;
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * 2.6, t + 0.05);
    o.frequency.exponentialRampToValueAtTime(base * 1.15, t + 0.32);
    const lfo = c.createOscillator();
    lfo.frequency.value = 22;
    const lg = c.createGain();
    lg.gain.value = 40;
    lfo.connect(lg).connect(o.frequency);
    const g = this.env(c, 0.5 * s, 0.008, 0.34);
    o.connect(g);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.4);
    lfo.stop(t + 0.4);
    this.thump(c, t, 0.35 * s, 900);
  }

  private thump(c: AudioContext, t: number, gain: number, cutoff: number) {
    if (!this.noise) return;
    const n = c.createBufferSource();
    n.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = this.env(c, gain, 0.004, 0.09, t);
    n.connect(f).connect(g);
    n.start(t, Math.random() * 0.5, 0.12);
  }

  /** the dash: a rising band of air */
  whoosh() {
    const c = this.ready('whoosh', 0.1);
    if (!c || !this.noise) return;
    const t = c.currentTime;
    const n = c.createBufferSource();
    n.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(3200, t + 0.18);
    f.frequency.exponentialRampToValueAtTime(900, t + 0.45);
    const g = this.env(c, 0.55, 0.05, 0.42);
    n.connect(f).connect(g);
    n.start(t, Math.random() * 0.4, 0.5);
  }

  /** the pinball post: "咚!", a round wooden-drum note with a bright click */
  dong() {
    const c = this.ready('dong', 0.08);
    if (!c) return;
    const t = c.currentTime;
    for (const [freq, gain, dec] of [
      [196, 0.6, 0.5],
      [392, 0.25, 0.3],
      [988, 0.08, 0.12],
    ] as const) {
      const o = c.createOscillator();
      o.type = freq < 300 ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(freq * 1.25, t);
      o.frequency.exponentialRampToValueAtTime(freq, t + 0.05);
      const g = this.env(c, gain, 0.004, dec);
      o.connect(g);
      o.start(t);
      o.stop(t + dec + 0.05);
    }
    this.thump(c, t, 0.3, 2400);
  }

  /** countdown: short beeps, a long high one at zero */
  beep(final = false) {
    const c = this.ready(final ? 'beepF' : 'beep', 0.3);
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.value = final ? 1046 : 784;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2400;
    const g = this.env(c, 0.18, 0.005, final ? 0.6 : 0.13);
    o.connect(f).connect(g);
    o.start(t);
    o.stop(t + (final ? 0.7 : 0.2));
  }

  /** +1 star: a bright two-note blip */
  blip(step = 0) {
    const c = this.ready('blip', 0.05);
    if (!c) return;
    const t = c.currentTime;
    const base = 880 * Math.pow(2, Math.min(step, 6) / 12);
    for (const [k, dt] of [
      [1, 0],
      [1.5, 0.06],
    ] as const) {
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = base * k;
      const g = this.env(c, 0.22, 0.004, 0.14, t + dt);
      o.connect(g);
      o.start(t + dt);
      o.stop(t + dt + 0.2);
    }
  }

  /** end of the round: a happy rising arpeggio for every child, whatever the score */
  fanfare() {
    const c = this.ready('fanfare', 1);
    if (!c) return;
    const t = c.currentTime;
    [523, 659, 784, 1046, 784, 1046].forEach((f, i) => {
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const at = t + i * 0.11;
      const g = this.env(c, 0.22, 0.01, i === 5 ? 0.7 : 0.16, at);
      o.connect(g);
      o.start(at);
      o.stop(at + 0.9);
    });
  }

  /** a soft tap for picker buttons */
  tick() {
    const c = this.ready('tick', 0.04);
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(660, t);
    o.frequency.exponentialRampToValueAtTime(990, t + 0.05);
    const g = this.env(c, 0.15, 0.004, 0.08);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.12);
  }

  /** picking up a gift box: a quick rising sweep */
  powerUp() {
    const c = this.ready('power', 0.15);
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(330, t);
    o.frequency.exponentialRampToValueAtTime(1320, t + 0.35);
    const lfo = c.createOscillator();
    lfo.frequency.value = 30;
    const lg = c.createGain();
    lg.gain.value = 60;
    lfo.connect(lg).connect(o.frequency);
    const g = this.env(c, 0.25, 0.01, 0.42);
    o.connect(g);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.5);
    lfo.stop(t + 0.5);
  }

  /** combo ⭐x2! / ⭐x3!: a rising cheer of quick notes, higher for x3 */
  cheer(n: number) {
    const c = this.ready('cheer', 0.3);
    if (!c) return;
    const t = c.currentTime;
    const base = n >= 3 ? 784 : 659;
    [1, 1.25, 1.5, 2].forEach((k, i) => {
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = base * k;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 3000;
      const at = t + i * 0.07;
      const g = this.env(c, 0.1, 0.005, i === 3 ? 0.35 : 0.08, at);
      o.connect(f).connect(g);
      o.start(at);
      o.stop(at + 0.45);
    });
  }

  /** a shield bounces someone off: a springy "doing" */
  spring() {
    const c = this.ready('spring', 0.1);
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(600, t);
    o.frequency.exponentialRampToValueAtTime(1500, t + 0.08);
    o.frequency.exponentialRampToValueAtTime(400, t + 0.3);
    const lfo = c.createOscillator();
    lfo.frequency.value = 35;
    const lg = c.createGain();
    lg.gain.value = 120;
    lfo.connect(lg).connect(o.frequency);
    const g = this.env(c, 0.3, 0.005, 0.3);
    o.connect(g);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.35);
    lfo.stop(t + 0.35);
  }

  // ---------- the player's motor: a soft hum that rises with speed, deeper in giant mode ----------
  private motor: { o1: OscillatorNode; o2: OscillatorNode; f: BiquadFilterNode; g: GainNode } | null = null;
  engine(on: boolean, speed01 = 0, giant = false) {
    const c = this.ctx;
    if (!c || c.state !== 'running' || !this.sfx) return;
    if (!on) {
      if (this.motor) {
        const m = this.motor;
        this.motor = null;
        m.g.gain.setTargetAtTime(0, c.currentTime, 0.05);
        m.o1.stop(c.currentTime + 0.3);
        m.o2.stop(c.currentTime + 0.3);
      }
      return;
    }
    if (!this.motor) {
      const o1 = c.createOscillator(),
        o2 = c.createOscillator();
      o1.type = 'sawtooth';
      o2.type = 'square';
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 500;
      const g = c.createGain();
      g.gain.value = 0;
      o1.connect(f);
      o2.connect(f);
      f.connect(g).connect(this.sfx);
      o1.start();
      o2.start();
      this.motor = { o1, o2, f, g };
    }
    const m = this.motor;
    const t = c.currentTime;
    const base = (giant ? 34 : 58) + speed01 * (giant ? 40 : 70);
    m.o1.frequency.setTargetAtTime(base, t, 0.08);
    m.o2.frequency.setTargetAtTime(base * 0.5, t, 0.08);
    m.f.frequency.setTargetAtTime(300 + speed01 * 900, t, 0.08);
    m.g.gain.setTargetAtTime(0.025 + speed01 * 0.045, t, 0.1);
  }

  // ---------- music hook ----------
  private load(url: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(url);
    if (!p) {
      const c = this.ctx!;
      p = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((b) => c.decodeAudioData(b))
        .catch(() => null);
      this.buffers.set(url, p);
    }
    return p;
  }

  /** switch the background track (cross-fade); before the first tap this only remembers what to play */
  async setMusic(name: MusicTrack | null) {
    this.wanted = name;
    const c = this.ctx;
    if (!c || !this.music) return;
    if (this.track?.name === name) return;
    if (this.track) {
      const old = this.track;
      this.track = null;
      const now = c.currentTime;
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + FADE);
      try {
        old.src.stop(now + FADE + 0.05);
      } catch {
        /* already stopped */
      }
    }
    if (!name) return;
    const file = MUSIC_TRACKS[name];
    const buf = await this.load(file.url);
    if (!buf || this.wanted !== name || !this.ctx || this.track) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    if (file.loop) {
      src.loop = true;
      src.loopStart = file.loop[0];
      src.loopEnd = Math.min(file.loop[1], buf.duration);
    }
    src.playbackRate.value = this.rate;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + FADE);
    src.connect(gain).connect(this.music);
    src.start(now);
    this.track = { name, src, gain };
  }

  /** 1.08 in the last 10 s of a round, 1 otherwise */
  setRate(r: number) {
    if (r === this.rate) return;
    this.rate = r;
    if (this.ctx && this.track) this.track.src.playbackRate.setTargetAtTime(r, this.ctx.currentTime, 0.15);
  }

  get musicTrack(): MusicTrack | null {
    return this.track?.name ?? null;
  }

  dispose() {
    this.engine(false);
    void this.setMusic(null);
    void this.ctx?.close();
    this.ctx = null;
  }
}
