// Rush Taxi — steering by tilting the iPad / phone (DeviceOrientation). Held in landscape like a steering wheel:
// lowering the right edge of the screen steers right. The maths is pure (tested); TiltInput wires it to the browser.
//
// DeviceOrientation angles are in the device's own frame (portrait, natural orientation): beta = rotation about the
// device's x axis (top edge up = +), gamma = rotation about its y axis (right edge down = +). Which one is "the
// wheel" depends on how the screen is rotated:
//   angle   0 (portrait)            steer =  gamma
//   angle 180 (portrait, flipped)   steer = −gamma
//   angle  90 (landscape, top of the device on the left)   steer =  beta
//   angle 270 (landscape, top of the device on the right)  steer = −beta

export interface Tilt {
  beta: number;
  gamma: number;
}

/** degrees of full lock and the dead zone around the centre */
export const TILT_FULL = 28;
export const TILT_DEAD = 3;

/** normalise any angle to the screen orientation set 0 / 90 / 180 / 270 */
export function quarter(angle: number): 0 | 90 | 180 | 270 {
  const a = (((Math.round(angle / 90) * 90) % 360) + 360) % 360;
  return a as 0 | 90 | 180 | 270;
}

/** the wheel angle in degrees (+ = right) for this screen orientation */
export function wheelAngle(t: Tilt, angle: number): number {
  switch (quarter(angle)) {
    case 0:
      return t.gamma;
    case 180:
      return -t.gamma;
    case 90:
      return t.beta;
    case 270:
      return -t.beta;
  }
}

/** a difference of two angles folded into −90…90: beta wraps at ±180 and jumps by 180 when the device passes upright */
export function angleDiff(a: number, b: number): number {
  let d = (((a - b) % 360) + 540) % 360 - 180; // −180…180
  if (d > 90) d = 180 - d;
  else if (d < -90) d = -180 - d;
  return d;
}

/** steering −1…1 from the device angles, the screen orientation and the calibrated centre */
export function tiltSteer(t: Tilt, angle: number, centre: Tilt | null = null, full = TILT_FULL, dead = TILT_DEAD): number {
  if (!Number.isFinite(t.beta) || !Number.isFinite(t.gamma)) return 0;
  const zero = centre ? wheelAngle(centre, angle) : 0;
  const d = angleDiff(wheelAngle(t, angle), zero);
  const m = Math.abs(d);
  if (m <= dead) return 0;
  const v = Math.min(1, (m - dead) / (full - dead));
  return Math.sign(d) * v;
}

/** the screen orientation angle, from whichever API this browser has */
export function screenAngle(): number {
  if (typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
  const w = typeof window !== 'undefined' ? (window as unknown as { orientation?: number }).orientation : undefined;
  return typeof w === 'number' ? w : 0;
}

type PermissionFn = () => Promise<'granted' | 'denied' | 'default'>;
const permissionFn = (): PermissionFn | null => {
  if (typeof DeviceOrientationEvent === 'undefined') return null;
  const f = (DeviceOrientationEvent as unknown as { requestPermission?: PermissionFn }).requestPermission;
  return typeof f === 'function' ? f.bind(DeviceOrientationEvent) : null;
};

export type TiltStatus = 'off' | 'on' | 'denied' | 'unsupported';

/** listens to `deviceorientation`; `enable()` must be called from a tap on iOS (it asks for permission there) */
export class TiltInput {
  status: TiltStatus = 'off';
  /** the latest reading, or null before the first event */
  last: Tilt | null = null;
  centre: Tilt | null;
  private listening = false;
  private onEvent = (e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null) return;
    this.last = { beta: e.beta, gamma: e.gamma };
    this.onSteer(tiltSteer(this.last, screenAngle(), this.centre));
  };

  constructor(
    private onSteer: (v: number) => void,
    centre: Tilt | null = null,
  ) {
    this.centre = centre;
  }

  static supported(): boolean {
    return typeof window !== 'undefined' && typeof DeviceOrientationEvent !== 'undefined';
  }
  /** iOS: a permission prompt is still needed (only a tap can show it) */
  static needsPermission(): boolean {
    return permissionFn() !== null;
  }

  /** start listening; on iOS this shows the permission prompt, so call it inside a tap handler */
  async enable(): Promise<TiltStatus> {
    if (!TiltInput.supported()) return (this.status = 'unsupported');
    const ask = permissionFn();
    if (ask) {
      try {
        if ((await ask()) !== 'granted') return (this.status = 'denied');
      } catch {
        return (this.status = 'denied');
      }
    }
    this.listen();
    return (this.status = 'on');
  }
  /** start listening without asking (Android, desktop, or iOS after an earlier grant); false if a tap is needed */
  resume(): boolean {
    if (!TiltInput.supported() || TiltInput.needsPermission()) return false;
    this.listen();
    this.status = 'on';
    return true;
  }
  private listen() {
    if (this.listening) return;
    window.addEventListener('deviceorientation', this.onEvent);
    this.listening = true;
  }
  disable() {
    if (this.listening) window.removeEventListener('deviceorientation', this.onEvent);
    this.listening = false;
    this.status = 'off';
    this.last = null;
    this.onSteer(0);
  }
  /** 校正: take the way the device is held right now as straight ahead */
  calibrate(): Tilt | null {
    if (!this.last) return null;
    this.centre = { ...this.last };
    this.onSteer(0);
    return this.centre;
  }
}
