// Rush Taxi minimap: the pure helpers — the heading-up world → map transform, pulling off-map markers to the rim,
// the cab arrow's angle, and the static map's layers read from the city data.
import { describe, expect, it } from 'vitest';
import { cityLevel } from '../src/taxi/world/city';
import { MAP_PX_PER_M, MINIMAP_RANGE, clampToEdge, headingOnMap, mapLayers, staticMapFrame, worldToMap } from '../src/taxi/ui/minimapMath';

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe('worldToMap (heading up)', () => {
  it('a point straight ahead of the camera is straight up, for any heading', () => {
    for (const view of [0, 0.7, Math.PI / 2, -2.4, Math.PI]) close(worldToMap(Math.sin(view) * 50, Math.cos(view) * 50, view, 2), { x: 0, y: -100 });
  });
  it('looking along +z, world −x is to the right (as on screen) and +z behind is down', () => {
    close(worldToMap(-10, 0, 0, 1), { x: 10, y: 0 });
    close(worldToMap(10, 0, 0, 1), { x: -10, y: 0 });
    close(worldToMap(0, -10, 0, 1), { x: 0, y: 10 });
  });
  it('looking along +x, world +z is to the right', () => {
    close(worldToMap(0, 10, Math.PI / 2, 1), { x: 10, y: 0 });
  });
  it('keeps distances (a rotation times the scale)', () => {
    const o = worldToMap(30, -40, 1.234, 0.5);
    expect(Math.hypot(o.x, o.y)).toBeCloseTo(25, 6);
  });
  it('matches the static map frame turned by the camera yaw (what the canvas does)', () => {
    const L = cityLevel();
    const f = staticMapFrame(L);
    const car = { x: 26.5, z: -60 },
      pt = { x: 80, z: 10 },
      view = 0.9;
    const a = f.toPx(car.x, car.z),
      b = f.toPx(pt.x, pt.z);
    // canvas: translate(centre) rotate(view) scale(1/px-per-m) drawImage at −car
    const du = (b.u - a.u) / MAP_PX_PER_M,
      dv = (b.v - a.v) / MAP_PX_PER_M;
    const rot = { x: du * Math.cos(view) - dv * Math.sin(view), y: du * Math.sin(view) + dv * Math.cos(view) };
    close(worldToMap(pt.x - car.x, pt.z - car.z, view, 1), rot);
  });
});

describe('clampToEdge', () => {
  it('leaves markers inside the map alone', () => {
    expect(clampToEdge(10, -20, 50)).toEqual({ x: 10, y: -20, clamped: false });
    expect(clampToEdge(50, 0, 50).clamped).toBe(false);
  });
  it('pulls an off-map marker onto the rim in the same direction', () => {
    const c = clampToEdge(300, -400, 50);
    expect(c.clamped).toBe(true);
    expect(Math.hypot(c.x, c.y)).toBeCloseTo(50, 6);
    expect(c.x / c.y).toBeCloseTo(300 / -400, 6);
  });
});

describe('headingOnMap', () => {
  it('the cab arrow points up when the camera looks the way the cab points', () => {
    expect(headingOnMap(1.1, 1.1)).toBeCloseTo(0, 9);
  });
  it('stays within ±π and turns clockwise when the cab points right of the view', () => {
    // looking along +z (view 0), the cab turned towards −x (screen right): yaw = −π/2 → +π/2 on the map
    expect(headingOnMap(-Math.PI / 2, 0)).toBeCloseTo(Math.PI / 2, 9);
    const a = headingOnMap(3, -3);
    expect(Math.abs(a)).toBeLessThanOrEqual(Math.PI);
  });
});

describe('mapLayers (city)', () => {
  const L = cityLevel();
  const layers = mapLayers(L);
  it('has the river, the sea to the west, parks and blocks', () => {
    const water = layers.filter((r) => r.kind === 'water');
    expect(water.length).toBe(2);
    expect(water.some((r) => r.x < -L.bounds && r.w > MINIMAP_RANGE)).toBe(true); // the sea
    expect(water.some((r) => Math.abs(r.z) < 1 && r.w >= L.bounds * 2)).toBe(true); // the Love River
    expect(layers.filter((r) => r.kind === 'park').length).toBe(8);
    expect(layers.filter((r) => r.kind === 'block').length).toBeGreaterThan(50);
  });
  it('draws a bridge for each of the four river crossings, after the river', () => {
    const river = layers.findIndex((r) => r.kind === 'water' && Math.abs(r.x) < 1 && Math.abs(r.z) < 1);
    const bridges = layers.slice(river + 1).filter((r) => r.kind === 'road');
    expect(bridges.map((b) => b.x).sort((a, b) => a - b)).toEqual([-270, -150, 30, 210]);
  });
  it('the static map is a reasonable size for an offscreen canvas', () => {
    const f = staticMapFrame(L);
    expect(f.size).toBeLessThanOrEqual(2048);
    expect(f.toPx(L.bounds, L.bounds).u).toBeGreaterThan(0);
  });
});
