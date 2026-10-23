// Rush Taxi — background music (four instrumental tracks James made with Suno). Web Audio, not <audio>: a buffer
// source loops between two sample positions with no gap, tracks cross-fade, and the last 10 s of an arcade run
// speed the music up a little. iOS only allows sound after a touch, so nothing plays until the first tap or key.
// Music and sound-effect volumes are separate (sound effects come with the next stage) and are remembered per
// browser.

import { Sfx, type EngineState, type SfxEvent } from './sfx';

export type Track = 'menu' | 'arcade' | 'practice' | 'results';

/** loop points (s) found on bar lines where the music continues seamlessly; results plays once */
export const TRACKS: Record<Track, { url: string; loop: [number, number] | null }> = {
  menu: { url: '/taxi/music/menu.mp3', loop: [32.6008, 69.3417] },
  arcade: { url: '/taxi/music/arcade.mp3', loop: [26.6101, 83.6054] },
  practice: { url: '/taxi/music/practice.mp3', loop: [44.7913, 85.6355] },
  results: { url: '/taxi/music/results.mp3', loop: null },
};

const KEY = 'jy.taxi.volume';
const FADE = 0.6;

function loadVolumes() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { music: typeof v.music === 'number' ? v.music : 0.7, sfx: typeof v.sfx === 'number' ? v.sfx : 0.8 };
  } catch {
    return { music: 0.7, sfx: 0.8 };
  }
}

export class Music {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  sfxBus: GainNode | null = null;
  private buffers = new Map<Track, Promise<AudioBuffer | null>>();
  private current: { track: Track; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private wanted: Track | null = null;
  private rate = 1;
  private ducked = false;
  volumes = loadVolumes();
  /** sound effects share the context and have their own volume */
  sfx: Sfx | null = null;

  /** call from a user gesture (tap, click, key): creates or resumes the audio context and starts the wanted track */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.sfx = new Sfx(this.ctx, this.sfxBus);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.wanted && this.current?.track !== this.wanted) void this.play(this.wanted);
  }
  get unlocked() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  private load(t: Track) {
    let p = this.buffers.get(t);
    if (!p && this.ctx) {
      const ctx = this.ctx;
      p = fetch(TRACKS[t].url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((b) => ctx.decodeAudioData(b))
        .catch(() => null);
      this.buffers.set(t, p);
    }
    return p ?? Promise.resolve(null);
  }

  /** switch to a track (cross-fade); before the first gesture this only remembers what to play */
  async play(t: Track) {
    this.wanted = t;
    if (!this.ctx || !this.musicBus) return;
    if (this.current?.track === t) return;
    const buf = await this.load(t);
    if (!buf || this.wanted !== t || !this.ctx || !this.musicBus) return;
    const now = this.ctx.currentTime;
    if (this.current) {
      const old = this.current;
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + FADE);
      old.src.stop(now + FADE + 0.05);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const loop = TRACKS[t].loop;
    if (loop) {
      src.loop = true;
      src.loopStart = loop[0];
      src.loopEnd = Math.min(loop[1], buf.duration);
    }
    src.playbackRate.value = this.rate;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + FADE);
    src.connect(gain).connect(this.musicBus);
    src.start(now);
    this.current = { track: t, src, gain };
    // warm the cache for the track that usually comes next
    void this.load(t === 'menu' ? 'arcade' : t === 'arcade' ? 'results' : 'menu');
  }

  /** the car's sounds for this frame (engine, tyres); nothing before the first tap */
  engine(s: EngineState | null) {
    if (!this.sfx || !this.unlocked) return;
    if (s) this.sfx.frame(s);
    else this.sfx.silence();
  }
  effect(e: SfxEvent, strength = 1) {
    if (this.sfx && this.unlocked) this.sfx.play(e, undefined, strength);
  }

  stop() {
    this.wanted = null;
    if (!this.ctx || !this.current) return;
    const now = this.ctx.currentTime;
    this.current.gain.gain.linearRampToValueAtTime(0, now + FADE);
    this.current.src.stop(now + FADE + 0.05);
    this.current = null;
  }

  /** the last seconds of a run: a touch faster (1 = normal) */
  setRate(r: number) {
    if (r === this.rate) return;
    this.rate = r;
    if (this.ctx && this.current) this.current.src.playbackRate.setTargetAtTime(r, this.ctx.currentTime, 0.15);
  }
  /** quieter while paused */
  duck(on: boolean) {
    this.ducked = on;
    this.applyVolumes();
  }
  setVolume(kind: 'music' | 'sfx', v: number) {
    this.volumes[kind] = Math.max(0, Math.min(1, v));
    try {
      localStorage.setItem(KEY, JSON.stringify(this.volumes));
    } catch {
      /* private mode: keep for this visit only */
    }
    this.applyVolumes();
  }
  private applyVolumes() {
    if (!this.ctx || !this.musicBus || !this.sfxBus) return;
    const t = this.ctx.currentTime;
    // a perceptual curve: the slider's middle sounds like half as loud
    this.musicBus.gain.setTargetAtTime(this.volumes.music ** 2 * (this.ducked ? 0.35 : 1), t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx ** 2, t, 0.05);
  }
  /** the tab is hidden: stop using the speaker (and the battery) */
  suspend(hidden: boolean) {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  }
  dispose() {
    this.stop();
    this.sfx?.stop();
    void this.ctx?.close();
    this.ctx = null;
  }
}
