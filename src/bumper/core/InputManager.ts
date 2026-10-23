// Crazy Bumper — one input for keyboard and touch (spec 5.2). Both give a direction on the screen (up = away from
// the camera) and a push strength: the car turns to face that way and drives. WASD / arrow keys work like an
// eight-way stick; Space or the big lightning button dashes.

export interface ScreenInput {
  /** direction on the screen: x to the right, y up (away from the camera), unit length or 0 */
  x: number;
  y: number;
  thrust: number;
  dash: boolean;
}

type Dir = 'up' | 'down' | 'left' | 'right';
const KEYS: Record<string, Dir> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

/** stick length → push: a small dead zone, then full push well before the rim so small hands reach top speed */
export const stickThrust = (len: number) => (len < 0.12 ? 0 : Math.min(1, (len - 0.12) / 0.6));

export class InputManager {
  /** key codes held down right now */
  private codes = new Set<string>();
  private dashQueued = false;
  /** the touch stick, set by the HUD (x right, y up, length ≤ 1) */
  stick = { x: 0, y: 0, active: false };
  enabled = true;

  constructor(private target: Window = window) {
    target.addEventListener('keydown', this.down);
    target.addEventListener('keyup', this.up);
    target.addEventListener('blur', this.clear);
  }

  private down = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      // Space on a focused button presses that button instead of dashing
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('button, a, input')) return;
      e.preventDefault();
      if (!e.repeat) this.dashQueued = true;
      return;
    }
    if (!KEYS[e.code]) return;
    e.preventDefault();
    this.codes.add(e.code);
  };
  private up = (e: KeyboardEvent) => {
    this.codes.delete(e.code);
  };
  private clear = () => {
    this.codes.clear();
    this.stick = { x: 0, y: 0, active: false };
  };

  /** the dash button on screen */
  pressDash() {
    this.dashQueued = true;
  }

  private has(d: Dir) {
    for (const c of this.codes) if (KEYS[c] === d) return true;
    return false;
  }

  /** current state; a queued dash is handed out once */
  read(): ScreenInput {
    const dash = this.dashQueued;
    this.dashQueued = false;
    if (!this.enabled) return { x: 0, y: 0, thrust: 0, dash: false };
    const x = (this.has('right') ? 1 : 0) - (this.has('left') ? 1 : 0);
    const y = (this.has('up') ? 1 : 0) - (this.has('down') ? 1 : 0);
    if (x || y) {
      const l = Math.hypot(x, y);
      return { x: x / l, y: y / l, thrust: 1, dash };
    }
    if (this.stick.active) {
      const l = Math.hypot(this.stick.x, this.stick.y);
      if (l > 0) return { x: this.stick.x / l, y: this.stick.y / l, thrust: stickThrust(l), dash };
    }
    return { x: 0, y: 0, thrust: 0, dash };
  }

  dispose() {
    this.target.removeEventListener('keydown', this.down);
    this.target.removeEventListener('keyup', this.up);
    this.target.removeEventListener('blur', this.clear);
  }
}
