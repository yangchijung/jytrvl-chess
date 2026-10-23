// Rush Taxi — one set of controls from the keyboard, a gamepad and touch. Each frame the game reads a plain
// snapshot; "pressed" flags are edges (true for one read only).
// Keyboard: W/↑ gas, S/↓ brake/reverse, A D/← → steer, Space drift, Shift rush, R reset, Esc pause, ~ dev panel.
// Touch (landscape): the left half is a steering stick, gas and brake buttons bottom right, drift top right.
// Tilt: `tilt` is written by TiltInput (core/tilt.ts); the stick overrides it while a finger is on it.
// Auto gas (for small children): full throttle unless braking. The page switches it on only while a run is played.

export interface Controls {
  throttle: number;
  brake: number;
  steer: number;
  drift: boolean;
  rush: boolean;
  reset: boolean;
  pause: boolean;
  dev: boolean;
}

export class Input {
  private keys = new Set<string>();
  private edges = new Set<string>();
  /** touch state, written by the on-screen controls */
  touch = { steer: 0, stick: false, gas: false, brake: false, drift: false, rush: false, reset: false };
  /** steering from tilting the device, −1…1; null = tilt is off */
  tilt: number | null = null;
  /** full throttle unless the brake is held; never set it while a menu is showing */
  autoGas = false;
  /** tests and replays can drive the car directly; null = use the real devices */
  override: Partial<Controls> | null = null;
  private off: () => void;

  constructor(target: Window = window) {
    const down = (e: KeyboardEvent) => {
      const k = e.code;
      // keep Space / Enter working on focused buttons, switches and sliders in the menus
      const t = e.target as { closest?: (s: string) => unknown } | null;
      const onControl = !!t?.closest?.('button, input, select, textarea, a, [role=switch]');
      if (!onControl && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(k)) e.preventDefault();
      if (!this.keys.has(k)) this.edges.add(k);
      this.keys.add(k);
    };
    const up = (e: KeyboardEvent) => this.keys.delete(e.code);
    const blur = () => this.keys.clear();
    target.addEventListener('keydown', down);
    target.addEventListener('keyup', up);
    target.addEventListener('blur', blur);
    this.off = () => {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      target.removeEventListener('blur', blur);
    };
  }
  dispose() {
    this.off();
  }
  private edge(...codes: string[]) {
    let hit = false;
    for (const c of codes) if (this.edges.has(c)) hit = true;
    return hit;
  }

  read(): Controls {
    const k = (c: string) => this.keys.has(c);
    let throttle = k('KeyW') || k('ArrowUp') || this.touch.gas ? 1 : 0;
    let brake = k('KeyS') || k('ArrowDown') || this.touch.brake ? 1 : 0;
    const tilt = this.tilt !== null && !this.touch.stick ? this.tilt : this.touch.steer;
    let steer = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0) || tilt;
    let drift = k('Space') || this.touch.drift;
    let rush = this.edge('ShiftLeft', 'ShiftRight') || this.touch.rush;
    let reset = this.edge('KeyR') || this.touch.reset;
    let pause = this.edge('Escape');
    const dev = this.edge('Backquote');
    // gamepad (standard mapping): RT gas, LT brake, left stick steer, A drift, X rush, Y reset, Start pause
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const g of pads) {
      if (!g || g.mapping !== 'standard') continue;
      throttle = Math.max(throttle, g.buttons[7]?.value ?? 0);
      brake = Math.max(brake, g.buttons[6]?.value ?? 0);
      const x = g.axes[0] ?? 0;
      if (Math.abs(x) > 0.12) steer = Math.max(-1, Math.min(1, (x - Math.sign(x) * 0.12) / 0.88));
      drift ||= !!g.buttons[0]?.pressed;
      rush ||= !!g.buttons[2]?.pressed;
      reset ||= !!g.buttons[3]?.pressed;
      pause ||= !!g.buttons[9]?.pressed;
    }
    if (this.autoGas) throttle = brake > 0.05 ? 0 : 1;
    this.touch.rush = false;
    this.touch.reset = false;
    this.edges.clear();
    const c: Controls = { throttle, brake, steer, drift, rush, reset, pause, dev };
    if (!this.override) return c;
    const o = { ...c, ...this.override, rush: !!this.override.rush, reset: !!this.override.reset };
    this.override.rush = false; // edges: once per press
    this.override.reset = false;
    return o;
  }
}
