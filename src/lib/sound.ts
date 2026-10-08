// Synthesised sound effects (Web Audio) — no third-party audio assets, so no licensing concerns.
let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function knock(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', when = 0) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + when;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.5), t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export type SoundKind = 'move' | 'capture' | 'check' | 'flip' | 'end' | 'notify' | 'error';

export function playSound(kind: SoundKind, enabled: boolean) {
  if (!enabled) return;
  switch (kind) {
    case 'move':
      knock(420, 0.08, 0.25, 'triangle');
      break;
    case 'capture':
      knock(300, 0.12, 0.35, 'triangle');
      knock(180, 0.1, 0.2, 'sine', 0.03);
      break;
    case 'flip':
      knock(650, 0.06, 0.2, 'triangle');
      knock(500, 0.06, 0.15, 'triangle', 0.05);
      break;
    case 'check':
      knock(880, 0.15, 0.2, 'sine');
      knock(660, 0.15, 0.15, 'sine', 0.08);
      break;
    case 'end':
      [523, 659, 784].forEach((f, i) => knock(f, 0.3, 0.18, 'sine', i * 0.12));
      break;
    case 'notify':
      knock(740, 0.12, 0.15, 'sine');
      break;
    case 'error':
      knock(200, 0.15, 0.15, 'square');
      break;
  }
}
