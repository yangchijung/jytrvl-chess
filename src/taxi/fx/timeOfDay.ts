// Rush Taxi: time of day. One pure function gives the whole lighting rig for a point in a day cycle (t in 0..1) or
// for one of the three moods: the sun (the moon at night), the hemisphere fill, fog, the sky dome's colours, an
// exposure multiplier and how far the city's lights are switched on. game.ts applies it every frame; 自動 (auto)
// moves t slowly so a full day passes in DAY_SECONDS. No three.js here, so it can be unit tested.
//
// The cycle: t = 0 a clear afternoon, sunset around 0.45, night from about 0.55 to 0.85, a short dawn, back to day.

export type Mood = 'day' | 'sunset' | 'night';
export type TimeSetting = Mood | 'auto';
export const TIME_SETTINGS: TimeSetting[] = ['day', 'sunset', 'night', 'auto'];
/** 自動: one full day in six minutes */
export const DAY_SECONDS = 360;
/** where auto starts: late afternoon, so the first sunset comes within a run or two */
export const AUTO_START = 0.3;
/** the point of the cycle each fixed mood shows */
export const PRESET_T: Record<Mood, number> = { day: 0.15, sunset: 0.45, night: 0.7 };

export type Vec3 = [number, number, number];
export interface Lighting {
  /** unit vector pointing from the scene towards the sun (or the moon) */
  sunDir: Vec3;
  sunColor: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  skyZenith: string;
  skyHorizon: string;
  skyGlow: string;
  /** how much of the low sky is mixed towards white (a pale blue by day, none at night) */
  skyPale: number;
  cloudColor: string;
  cloudEmissive: string;
  /** a multiplier on the light intensities (the renderer has no tone mapping, so this is where exposure lives) */
  exposure: number;
  /** 0 = city lights off, 1 = windows, lamps, signs and car lights fully on */
  lights: number;
}

type Key = Omit<Lighting, 'sunDir'> & { sunDir: Vec3; t: number };

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

const DAY: Omit<Key, 't'> = {
  // high in the south-west: short shadows to the north-east (the look the city was balanced for)
  sunDir: norm([-0.52, 0.78, 0.34]),
  sunColor: '#FFEACB',
  sunIntensity: 2.6,
  hemiSky: '#CFE8FF',
  hemiGround: '#8C7B5E',
  hemiIntensity: 1.15,
  fogColor: '#E8E6DA',
  fogNear: 260,
  fogFar: 860,
  skyZenith: '#2F86DA',
  skyHorizon: '#E8E6DA',
  skyGlow: '#F7E3BC',
  skyPale: 0.45,
  cloudColor: '#FFFFFF',
  cloudEmissive: '#B4C3D2',
  exposure: 1,
  lights: 0,
};
const SUNSET: Omit<Key, 't'> = {
  // low over the sea to the west: long shadows, warm faces, buildings in silhouette against the glow
  sunDir: norm([-0.93, 0.2, 0.3]),
  sunColor: '#FF9C5A',
  sunIntensity: 2.5,
  hemiSky: '#E7A98C',
  hemiGround: '#5B4652',
  hemiIntensity: 0.8,
  fogColor: '#E6A07E',
  fogNear: 210,
  fogFar: 830,
  skyZenith: '#33468A',
  skyHorizon: '#F1A577',
  skyGlow: '#FF7F6A',
  skyPale: 0.18,
  cloudColor: '#EDB8A4',
  cloudEmissive: '#7E4A56',
  exposure: 1,
  lights: 0.45,
};
const NIGHT: Omit<Key, 't'> = {
  // a pale moon high in the east; a blue fill keeps the streets readable, the city's own lights do the rest
  sunDir: norm([0.35, 0.75, -0.45]),
  sunColor: '#9DB2E0',
  sunIntensity: 0.5,
  hemiSky: '#5268A0',
  hemiGround: '#34303C',
  hemiIntensity: 0.95,
  fogColor: '#1D2539',
  fogNear: 160,
  fogFar: 760,
  skyZenith: '#050A1A',
  skyHorizon: '#26304A',
  skyGlow: '#3F3D58',
  skyPale: 0.04,
  cloudColor: '#3E4560',
  cloudEmissive: '#151A2A',
  exposure: 1.2,
  lights: 1,
};
const DAWN: Omit<Key, 't'> = {
  ...SUNSET,
  // low in the east, cooler and pinker than the evening
  sunDir: norm([0.9, 0.22, -0.2]),
  sunColor: '#FFB487',
  sunIntensity: 2.0,
  skyGlow: '#F79A9A',
  skyHorizon: '#E9B3A0',
  fogColor: '#DDA99A',
  lights: 0.5,
};

/** keyframes over one day; the first and last are the same, so the cycle wraps smoothly */
const KEYS: Key[] = [
  { ...DAY, t: 0 },
  { ...DAY, t: 0.33 },
  { ...SUNSET, t: 0.45 },
  { ...NIGHT, t: 0.56 },
  { ...NIGHT, t: 0.84 },
  { ...DAWN, t: 0.93 },
  { ...DAY, t: 1 },
];

const hex2 = (h: string): Vec3 => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (c: Vec3) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
export const mixHex = (a: string, b: string, k: number) => {
  const x = hex2(a),
    y = hex2(b);
  return toHex([x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k]);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const smooth = (k: number) => k * k * (3 - 2 * k);

/** the lighting at point `t` of the day cycle (any number; it wraps to 0..1) */
export function lightingAt(t: number): Lighting {
  const u = ((t % 1) + 1) % 1;
  let i = 0;
  while (i < KEYS.length - 2 && u > KEYS[i + 1].t) i++;
  const a = KEYS[i],
    b = KEYS[i + 1];
  const k = smooth(b.t > a.t ? Math.min(1, Math.max(0, (u - a.t) / (b.t - a.t))) : 0);
  const out = {} as Lighting;
  for (const key of Object.keys(DAY) as (keyof Lighting)[]) {
    const va = a[key],
      vb = b[key];
    if (key === 'sunDir') {
      const da = va as Vec3,
        db = vb as Vec3;
      const d = norm([lerp(da[0], db[0], k), lerp(da[1], db[1], k), lerp(da[2], db[2], k)]);
      // never let the light go below a low angle (in between the sunset and the moon it would cross the horizon)
      out.sunDir = d[1] < 0.15 ? norm([d[0], 0.15, d[2]]) : d;
    } else if (typeof va === 'string') (out as unknown as Record<string, string>)[key] = mixHex(va, vb as string, k);
    else (out as unknown as Record<string, number>)[key] = lerp(va as number, vb as number, k);
  }
  return out;
}

/** the lighting for a fixed mood */
export function lightingFor(m: Mood): Lighting {
  return lightingAt(PRESET_T[m]);
}

/** the cycle point for a setting: a fixed mood, or auto after `seconds` of play */
export function cycleT(s: TimeSetting, seconds: number): number {
  if (s !== 'auto') return PRESET_T[s];
  return (((AUTO_START + seconds / DAY_SECONDS) % 1) + 1) % 1;
}

/** which named mood a cycle point is closest to (for labels and tests) */
export function moodAt(t: number): Mood {
  const l = lightingAt(t).lights;
  if (l > 0.8) return 'night';
  const d = lightingAt(t).sunDir[1];
  return d < 0.45 ? 'sunset' : 'day';
}

export const isTimeSetting = (v: unknown): v is TimeSetting => typeof v === 'string' && (TIME_SETTINGS as string[]).includes(v);
