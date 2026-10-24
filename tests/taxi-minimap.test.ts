// Rush Taxi minimap: the pure helpers — the heading-up world → map transform, pulling off-map markers to the rim,
// the cab arrow's angle, and the static map's layers read from the city data.
import { describe, expect, it } from 'vitest';
import { cityLevel } from '../src/taxi/world/city';
import { MAP_PX_PER_M, MINIMAP_RANGE, clampToEdge, headingOnMap, mapLayers, staticMapFrame, worldToMap } from '../src/taxi/ui/minimapMath';
import { KAOHSIUNG, RANK } from '../src/taxi/world/osm/data';
import { nearestRoad, osmLevel } from '../src/taxi/world/osm/level';
import { MAP_MARGIN, OSM_TILE_M, OSM_TILE_PX_PER_M, northOf, osmMapModel, osmTileOrigin, osmTilesAround, roadStyle } from '../src/taxi/ui/minimapMath';
import { districtFinder, roadFinder, roadIndex } from '../src/taxi/ui/whereabouts';

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

// ---------------- the real-map city (OSM) ----------------

describe('osmMapModel (real-map city)', () => {
  const m = osmMapModel(KAOHSIUNG);
  it('covers the play area plus the margin in 256 m tiles', () => {
    const [x0, z0, x1, z1] = KAOHSIUNG.bounds;
    expect(m.area).toEqual([x0 - MAP_MARGIN, z0 - MAP_MARGIN, x1 + MAP_MARGIN, z1 + MAP_MARGIN]);
    expect(m.cols * OSM_TILE_M).toBeGreaterThanOrEqual(m.area[2] - m.area[0]);
    expect(m.rows * OSM_TILE_M).toBeGreaterThanOrEqual(m.area[3] - m.area[1]);
    // a tile canvas is small; the whole map at this scale would not fit one 2048 px canvas
    expect(osmTileOrigin(m, 0, 0).px).toBeLessThanOrEqual(330);
    expect((m.area[3] - m.area[1]) * OSM_TILE_PX_PER_M).toBeGreaterThan(2048);
  });
  it('has every road, the water and the parks, back to front: polygons first, main roads last', () => {
    expect(m.items.filter((i) => i.t === 'road').length).toBe(KAOHSIUNG.roads.length);
    expect(m.items.filter((i) => i.t === 'poly' && i.kind === 'water').length).toBe(KAOHSIUNG.water.length);
    expect(m.items.some((i) => i.t === 'poly' && i.kind === 'park')).toBe(true);
    const firstRoad = m.items.findIndex((i) => i.t === 'road');
    expect(m.items.slice(firstRoad).every((i) => i.t === 'road')).toBe(true);
    const ranks = m.items.filter((i) => i.t === 'road').map((i) => (i.t === 'road' ? i.rank : 0));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(m.landmarks.length).toBe(KAOHSIUNG.landmarks.length);
  });
  it('bins every road into each tile its box touches, in drawing order', () => {
    m.items.forEach((it, i) => {
      if (it.t !== 'road') return;
      const [x, z] = it.pts[0];
      const c = Math.floor((x - m.area[0]) / m.tileM),
        r = Math.floor((z - m.area[1]) / m.tileM);
      expect(m.bins[r * m.cols + c]).toContain(i);
    });
    for (const b of m.bins) expect(b).toEqual([...b].sort((a, c) => a - c));
  });
  it('a 300 m view touches at most 3 × 3 tiles', () => {
    for (const [x, z] of [[0, 0], [-1200, 1400], [255, -255]]) {
      const t = osmTilesAround(m, x, z, 150 * Math.SQRT2);
      expect(t.length).toBeGreaterThan(0);
      expect(t.length).toBeLessThanOrEqual(9);
    }
  });
  it('main roads are drawn wider and lighter than side streets', () => {
    const main = roadStyle('primary'),
      side = roadStyle('residential');
    expect(main.minPx).toBeGreaterThan(side.minPx);
    const lum = (hex: string) => [1, 3, 5].reduce((s, i) => s + parseInt(hex.slice(i, i + 2), 16), 0);
    expect(lum(main.color)).toBeGreaterThan(lum(side.color));
    expect(RANK.primary).toBeGreaterThan(RANK.residential);
  });
  it('north is −z in the real-map city and +z in the grid city', () => {
    expect(northOf(osmLevel())).toEqual({ x: 0, z: -1 });
    expect(northOf(cityLevel())).toEqual({ x: 0, z: 1 });
  });
});

describe('whereabouts (district and road name)', () => {
  const district = districtFinder(KAOHSIUNG);
  const road = roadFinder(KAOHSIUNG);
  it('finds the district of every landmark that lies inside one, with an English name', () => {
    const found = KAOHSIUNG.landmarks.map((l) => district(l.x, l.z)).filter(Boolean);
    expect(found.length).toBeGreaterThan(KAOHSIUNG.landmarks.length * 0.8);
    const zh = new Set(found.map((d) => d!.zh));
    expect(zh.size).toBeGreaterThanOrEqual(4);
    for (const d of found) expect(d!.en).toMatch(/^[A-Z][a-z]+$/);
  });
  it('the road index finds the same road as the full nearestRoad search, near any road', () => {
    const idx = roadIndex(KAOHSIUNG);
    let checked = 0;
    for (let i = 0; i < KAOHSIUNG.roads.length; i += 37) {
      const r = KAOHSIUNG.roads[i];
      const [x, z] = r.pts[0];
      const px = x + 1.3,
        pz = z - 0.7;
      const full = nearestRoad(KAOHSIUNG, px, pz)!;
      const near = nearestRoad({ ...KAOHSIUNG, roads: idx.near(px, pz) }, px, pz)!;
      expect(near.d).toBeCloseTo(full.d, 6);
      checked++;
    }
    expect(checked).toBeGreaterThan(80);
  });
  it('names the road at the spawn, and nothing far off any road', () => {
    const L = osmLevel();
    const at = road(L.spawn.p.x, L.spawn.p.z);
    expect(at?.zh).toBeTruthy();
    expect(at?.en).toBeTruthy();
    const [x0, z0] = KAOHSIUNG.bounds;
    expect(road(x0 - 300, z0 - 300)).toBeNull();
  });
});
