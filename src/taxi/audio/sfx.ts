// Rush Taxi — sound effects, all synthesised with Web Audio (no sound files): the engine (its pitch follows the
// revs through the gears, louder on the gas), tyre squeal while sliding, the whoosh of a rush start, a thud on
// landing, a crash, a passing whoosh for near misses, coins, the pick-up chime, the pay-out "ka-ching" and the
// countdown beeps of the last ten seconds. Every call takes the time to play at, so the same code also renders
// offline (OfflineAudioContext) for the recordings.

export interface EngineState {
  kmh: number;
  throttle: number;
  /** 0…1: how hard the tyres are sliding (drift, hard braking, wheelspin) */
  skid: number;
  airborne: boolean;
}
export type SfxEvent = 'crash' | 'hit' | 'land' | 'rush' | 'near' | 'coin' | 'pickup' | 'drop' | 'timeout' | 'tick' | 'tickLast' | 'over';

/** engine revs (0…1) for a speed: five gears, revs climb in each and drop at a shift */
export function revs(kmh: number) {
  const gears = [0, 28, 55, 85, 115, 999];
  const g = gears.findIndex((top, i) => i > 0 && kmh < top);
  const lo = gears[g - 1],
    hi = Math.min(gears[g], 150);
  return 0.18 + 0.82 * Math.max(0, Math.min(1, (kmh - lo) / Math.max(1, hi - lo)));
}

export class Sfx {
  private engineGain: GainNode;
  private oscA: OscillatorNode;
  private oscB: OscillatorNode;
  private filter: BiquadFilterNode;
  private squealGain: GainNode;
  private squealFilter: BiquadFilterNode;
  private noise: AudioBuffer;
  private started = false;

  constructor(
    private ctx: BaseAudioContext,
    private out: AudioNode,
  ) {
    // engine: a saw and a square an octave below, through a low-pass that opens with the revs
    this.oscA = ctx.createOscillator();
    this.oscA.type = 'sawtooth';
    this.oscB = ctx.createOscillator();
    this.oscB.type = 'square';
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 4;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    const mixB = ctx.createGain();
    mixB.gain.value = 0.45;
    this.oscA.connect(this.filter);
    this.oscB.connect(mixB).connect(this.filter);
    this.filter.connect(this.engineGain).connect(out);
    // tyre squeal: band-passed noise
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const sq = ctx.createBufferSource();
    sq.buffer = this.noise;
    sq.loop = true;
    this.squealFilter = ctx.createBiquadFilter();
    this.squealFilter.type = 'bandpass';
    this.squealFilter.frequency.value = 1700;
    this.squealFilter.Q.value = 9;
    this.squealGain = ctx.createGain();
    this.squealGain.gain.value = 0;
    sq.connect(this.squealFilter).connect(this.squealGain).connect(out);
    this.squealSrc = sq;
  }
  private squealSrc: AudioBufferSourceNode;

  private start(at: number) {
    if (this.started) return;
    this.started = true;
    this.oscA.start(at);
    this.oscB.start(at);
    this.squealSrc.start(at);
  }

  /** per frame: the engine and the tyres follow the car */
  frame(s: EngineState, at = this.ctx.currentTime) {
    this.start(at);
    const r = revs(s.kmh);
    const f = 48 + r * 120 + (s.airborne ? 25 : 0) * s.throttle; // the engine flares when the wheels leave the ground
    this.oscA.frequency.setTargetAtTime(f, at, 0.05);
    this.oscB.frequency.setTargetAtTime(f / 2, at, 0.05);
    this.filter.frequency.setTargetAtTime(380 + r * 1400 + s.throttle * 600, at, 0.06);
    this.engineGain.gain.setTargetAtTime(0.05 + s.throttle * 0.07 + r * 0.03, at, 0.08);
    const sk = Math.max(0, Math.min(1, s.skid)) * Math.min(1, s.kmh / 25);
    this.squealGain.gain.setTargetAtTime(sk * 0.16, at, 0.05);
    this.squealFilter.frequency.setTargetAtTime(1500 + sk * 500 + Math.sin(at * 23) * 120, at, 0.03);
  }
  /** fade the engine out (menus, pause) */
  silence(at = this.ctx.currentTime) {
    this.engineGain.gain.setTargetAtTime(0, at, 0.1);
    this.squealGain.gain.setTargetAtTime(0, at, 0.05);
  }

  private tone(freq: number, at: number, dur: number, vol: number, type: OscillatorType = 'sine', slide = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), at + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
    o.connect(g).connect(this.out);
    o.start(at);
    o.stop(at + dur + 0.02);
  }
  private burst(at: number, dur: number, vol: number, freq: number, q: number, type: BiquadFilterType = 'lowpass', sweepTo = 0) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, at);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(at, Math.random());
    src.stop(at + dur + 0.02);
  }

  /** one-shot sounds; strength scales crashes and landings */
  play(e: SfxEvent, at = this.ctx.currentTime, strength = 1) {
    const k = Math.max(0.3, Math.min(1.5, strength));
    switch (e) {
      case 'crash':
      case 'hit':
        this.burst(at, 0.35, 0.5 * k, 900, 0.8);
        this.tone(70, at, 0.3, 0.45 * k, 'sine', 0.5);
        if (e === 'hit') this.tone(420, at + 0.02, 0.12, 0.12, 'square', 0.6); // a metallic clang off the other car
        break;
      case 'land':
        this.tone(58, at, 0.22, 0.4 * k, 'sine', 0.6);
        this.burst(at, 0.18, 0.18 * k, 400, 0.7);
        break;
      case 'rush':
        this.burst(at, 0.5, 0.25, 300, 1.2, 'bandpass', 2400);
        break;
      case 'near':
        this.burst(at, 0.45, 0.22, 2600, 1.4, 'bandpass', 500);
        break;
      case 'coin':
        this.tone(988, at, 0.09, 0.16, 'square');
        this.tone(1319, at + 0.07, 0.22, 0.16, 'square');
        break;
      case 'pickup':
        [523, 659, 784].forEach((f, i) => this.tone(f, at + i * 0.07, 0.25, 0.14, 'triangle'));
        break;
      case 'drop':
        // the meter's ka-ching
        this.tone(1568, at, 0.08, 0.16, 'square');
        this.tone(2093, at + 0.08, 0.35, 0.16, 'square');
        this.burst(at, 0.12, 0.12, 5000, 1, 'highpass');
        break;
      case 'timeout':
        this.tone(330, at, 0.25, 0.16, 'triangle', 0.7);
        this.tone(247, at + 0.2, 0.35, 0.16, 'triangle', 0.7);
        break;
      case 'tick':
        this.tone(880, at, 0.09, 0.14, 'square');
        break;
      case 'tickLast':
        this.tone(1320, at, 0.14, 0.18, 'square');
        break;
      case 'over':
        this.tone(1320, at, 0.6, 0.2, 'square', 0.5);
        break;
    }
  }
  stop(at = this.ctx.currentTime) {
    try {
      this.oscA.stop(at);
      this.oscB.stop(at);
      this.squealSrc.stop(at);
    } catch {
      /* never started */
    }
  }
}
