// Rush Taxi — four original cabs (each drives a little differently) and four original drivers. Every cab is taxi
// yellow, as in Taiwan; they differ in shape and trim. Handling changes are small multipliers on the shared tuning,
// so all four stay easy to drive.
import { TUNING, type Tuning } from './tuning';

export interface CarLook {
  /** where the body ends at the back (m, negative), the glass house (rear base, rear top, front top, front base), the roof height */
  rearEnd: number;
  glass: [number, number, number, number];
  roofY: number;
  spoiler: boolean;
  /** a stripe along the sides (null = none) */
  stripe: string | null;
}
export interface CarSpec {
  id: string;
  name: { zh: string; en: string };
  kind: { zh: string; en: string };
  /** 1–5 for the garage cards: acceleration, handling, top speed */
  stats: { accel: number; handling: number; top: number };
  tune: Partial<Tuning>;
  look: CarLook;
}
export interface DriverLook {
  shirt: string;
  vest: string;
  hair: string;
  hairStyle: 'short' | 'perm' | 'spiky' | 'ponytail';
  cap: string | null;
  glasses: boolean;
  mustache: boolean;
  skin: string;
  /** how much the driver throws themselves around (1 = normal) */
  sway: number;
}
export interface DriverSpec {
  id: string;
  name: { zh: string; en: string };
  look: DriverLook;
}

export const CARS: CarSpec[] = [
  {
    id: 'classic',
    name: { zh: '小黃', en: 'Classic' },
    kind: { zh: '均衡', en: 'All-round' },
    stats: { accel: 3, handling: 3, top: 3 },
    tune: {},
    look: { rearEnd: -2.02, glass: [-1.24, -0.86, 0.31, 0.99], roofY: 0.88, spoiler: false, stripe: null },
  },
  {
    id: 'zippy',
    name: { zh: '衝衝', en: 'Zippy' },
    kind: { zh: '加速', en: 'Acceleration' },
    stats: { accel: 5, handling: 3, top: 2 },
    tune: { engineForce: TUNING.engineForce * 1.3, topSpeedKmh: 130, rushBoost: TUNING.rushBoost * 1.2 },
    look: { rearEnd: -1.86, glass: [-1.78, -1.6, 0.3, 0.99], roofY: 0.9, spoiler: false, stripe: '#23303F' },
  },
  {
    id: 'swift',
    name: { zh: '飄飄', en: 'Swift' },
    kind: { zh: '操控', en: 'Handling' },
    stats: { accel: 3, handling: 5, top: 3 },
    tune: { steerLow: TUNING.steerLow * 1.15, steerHigh: TUNING.steerHigh * 1.25, steerRate: TUNING.steerRate * 1.25, grip: TUNING.grip * 1.12, maxDriftAngle: 42, driftCarve: TUNING.driftCarve * 1.25, engineForce: TUNING.engineForce * 0.95 },
    look: { rearEnd: -2.0, glass: [-1.3, -0.62, 0.12, 0.98], roofY: 0.78, spoiler: false, stripe: '#E53935' },
  },
  {
    id: 'rocket',
    name: { zh: '飛飛', en: 'Rocket' },
    kind: { zh: '極速', en: 'Top speed' },
    stats: { accel: 2, handling: 2, top: 5 },
    tune: { topSpeedKmh: 165, engineForce: TUNING.engineForce * 1.05, steerHigh: TUNING.steerHigh * 0.85, drag: TUNING.drag * 0.8 },
    look: { rearEnd: -2.04, glass: [-1.2, -0.8, 0.28, 1.02], roofY: 0.82, spoiler: true, stripe: null },
  },
];

export const DRIVERS: DriverSpec[] = [
  { id: 'abo', name: { zh: '阿伯', en: 'Grandpa' }, look: { shirt: '#F5F5F5', vest: '#1E5AA8', hair: '#BDBDBD', hairStyle: 'short', cap: '#1565C0', glasses: false, mustache: true, skin: '#E8B98E', sway: 0.9 } },
  { id: 'ayi', name: { zh: '阿姨', en: 'Auntie' }, look: { shirt: '#F48FB1', vest: '#AD1457', hair: '#4E342E', hairStyle: 'perm', cap: null, glasses: false, mustache: false, skin: '#F1C9A5', sway: 1.2 } },
  { id: 'xiaoge', name: { zh: '小哥', en: 'Bro' }, look: { shirt: '#43A047', vest: '#1B5E20', hair: '#212121', hairStyle: 'spiky', cap: null, glasses: true, mustache: false, skin: '#C68B59', sway: 1.45 } },
  { id: 'jiejie', name: { zh: '姊姊', en: 'Sis' }, look: { shirt: '#FF8A65', vest: '#5D4037', hair: '#3E2723', hairStyle: 'ponytail', cap: null, glasses: false, mustache: false, skin: '#F1C9A5', sway: 1.1 } },
];

export const carById = (id: string) => CARS.find((c) => c.id === id) ?? CARS[0];
export const driverById = (id: string) => DRIVERS.find((d) => d.id === id) ?? DRIVERS[0];
/** the full tuning for a cab */
export const tuningFor = (car: CarSpec): Tuning => ({ ...TUNING, ...car.tune });
