// Crazy Bumper — every sound is synthesised with Web Audio (no audio files): the rubbery "boing" of two rings,
// the dash whoosh, the post's "咚!", countdown beeps, a blip per star and a small fanfare at the end.
// Sound starts only after the first tap or key (iOS rule); before that every call is silently ignored.
// Music: James will add Suno tracks later. setMusic() is the hook: register a URL per track in MUSIC_TRACKS and
// it loops that file; with no URL it does nothing.

export type MusicTrack = 'title' | 'play' | 'result';
/** fill in when the music files exist, e.g. { title: '/bumper/music/title.mp3' } */
export const MUSIC_TRACKS: Partial<Record<MusicTrack, string>> = {};

const MUTE_KEY = 'jy-bumper-muted';

export class AudioSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private music: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last: Record<string, number> = {};
  private track: { name: MusicTrack; src: AudioBufferSourceNode } | null = null;
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

  /** switch the looping background track; does nothing until a URL is registered for it */
  async setMusic(name: MusicTrack | null) {
    this.wanted = name;
    if (!this.ctx || !this.music) return;
    if (this.track?.name === name) return;
    if (this.track) {
      try {
        this.track.src.stop();
      } catch {
        /* already stopped */
      }
      this.track = null;
    }
    const url = name ? MUSIC_TRACKS[name] : undefined;
    if (!name || !url) return;
    const buf = await this.load(url);
    if (!buf || this.wanted !== name || !this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.music);
    src.start();
    this.track = { name, src };
  }

  dispose() {
    void this.setMusic(null);
    void this.ctx?.close();
    this.ctx = null;
  }
}
