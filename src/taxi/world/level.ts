// Rush Taxi — a level is plain data: what collides (shapes), what is only drawn (landmark primitives, lots, road
// markings, trees, water), where people wait and where they want to go, and the road graph the traffic drives on.
// Two levels exist: the stage 1 test ground (tuning, unit tests) and the city (the game). Both are built without
// Three.js or Rapier so the data can be checked in plain unit tests.
import { GROUND, greybox, type Shape } from './greybox';
import type { Place, Spot } from '../gameplay/rules';
import { PLACES, STOPS } from '../gameplay/places';
import type { Massing } from './massing';
import type { OsmCityData } from './osm/data';
import type { RoadNet } from './osm/roadnet';

export type { Shape };

/**
 * a drawn-only primitive in world metres (landmarks); y is the centre height. Optional extras (used by the real-map
 * landmark models, world/osm/landmarks.ts): `yaw` turns the shape about y (same sense as Shape yaw); `seg` is the
 * number of sides of a cylinder/cone/sphere (6 = hexagonal prism; 4 = square, then `r` is the half side, not the
 * corner radius); `rt` is a cylinder's top radius (a taper; default `r`); `sx` stretches it along its own x.
 * `gab` is a pitched roof: base L (x) × W (z) at y − H/2, ridge at y + H/2, ridge shortened by `hip` at each end
 * (0 = gable ends, W/2 = a full hip roof).
 */
export type Prim =
  | { t: 'box'; x: number; y: number; z: number; sx: number; sy: number; sz: number; color: string; yaw?: number }
  | { t: 'cyl'; x: number; y: number; z: number; r: number; h: number; color: string; yaw?: number; seg?: number; rt?: number; sx?: number }
  | { t: 'cone'; x: number; y: number; z: number; r: number; h: number; color: string; yaw?: number; seg?: number; sx?: number }
  | { t: 'sph'; x: number; y: number; z: number; r: number; color: string; seg?: number }
  | { t: 'tor'; x: number; y: number; z: number; R: number; tube: number; color: string; yaw: number }
  | { t: 'gab'; x: number; y: number; z: number; L: number; W: number; H: number; color: string; yaw?: number; hip?: number };

export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
  color: string;
}
export interface Sign {
  id: string;
  name: { zh: string; en: string };
  x: number;
  y: number;
  z: number;
  /** the board faces this way (radians, 0 = +z) */
  yaw: number;
  /** a street-name style board that is not a destination (the river's name) */
  decor?: boolean;
}
export interface RoadGraph {
  nodes: { x: number; z: number }[];
  /** undirected; traffic drives on the right-hand lane of each */
  edges: [number, number][];
}
export interface Walk {
  /** a rectangular sidewalk loop around a block: centre and half size */
  cx: number;
  cz: number;
  h: number;
  /** the real map: the loop as a closed polyline instead (x, z points); cx, cz are then its centre and h unused */
  loop?: [number, number][];
}
/** a traffic light head. Grid city: it shows the light of the streets along `axis`. Real map: `phase` and `t0`
 * say which of its junction's two phases it shows (0 = the main street, 1 = the cross street) and its junction's
 * clock offset; `axis` is then only the nearer of the two map axes. */
export interface Signal {
  x: number;
  z: number;
  /** the head faces this way (radians, 0 = +z) */
  yaw: number;
  axis: 'x' | 'z';
  phase?: 0 | 1;
  t0?: number;
}
/** street furniture and building details (drawn only, apart from the palm trunks) */
export interface Decor {
  /** rooftop water tanks (stainless, on a stand): position on the roof */
  tanks: { x: number; y: number; z: number }[];
  /** rooftop sheet-metal extensions */
  sheds: { x: number; y: number; z: number; w: number; d: number; h: number; color: string }[];
  /** air-conditioner boxes on the walls; yaw = the wall's outward direction */
  acs: { x: number; y: number; z: number; yaw: number }[];
  /** vertical shop signboards sticking out over the pavement; yaw = the board's face direction */
  shopSigns: { x: number; y: number; z: number; yaw: number; word: number; color: number }[];
  scooters: { x: number; z: number; yaw: number; color: string }[];
  /** street lamps on the kerb; yaw = towards the road */
  lamps: { x: number; z: number; yaw: number }[];
  /** traffic lights: one head facing the traffic that comes along `axis` */
  signals: Signal[];
  palms: { x: number; z: number; h: number }[];
  /** painted kerb pieces; yaw (optional, real-map city) turns the piece so `w` runs along the road */
  curbs: (Rect & { yaw?: number })[];
  /** Love River boats: they cruise between x0 and x1 at z; with `path` (real-map city) they go back and forth
   * along that polyline instead, starting at `phase` (0..1) of the way */
  boats: { z: number; x0: number; x1: number; speed: number; color: string; path?: [number, number][]; phase?: number }[];
  /** 路名牌 (real-map city): a pole at a junction corner with one green board per road (zh above, en below);
   * board yaw = the face direction (0 = +z), y = the board's centre height */
  streetSigns?: { x: number; z: number; boards: { zh: string; en: string; yaw: number; y: number }[] }[];
  /** the light rail (real-map city), drawn only: track pieces on the road, a sidewalk or a grass bed, and low posts */
  rail?: { pieces: { x0: number; z0: number; x1: number; z1: number; bed: 'road' | 'walk' | 'grass' }[]; poles: { x: number; z: number }[] };
}
export interface Tree {
  x: number;
  z: number;
  h: number;
}

export interface Level {
  id: 'city' | 'test';
  /** half the playable size (m); walls stand at ±bounds */
  bounds: number;
  /** solid ground pieces (top at y = 0) */
  ground: { p: [number, number, number]; size: [number, number, number] }[];
  water: { y: number; floor: number; x0: number; x1: number; z0: number; z1: number } | null;
  shapes: Shape[];
  prims: Prim[];
  lots: Rect[];
  marks: Rect[];
  signs: Sign[];
  trees: Tree[];
  stops: Spot[];
  places: Place[];
  spawn: { p: { x: number; y: number; z: number }; yaw: number };
  graph: RoadGraph | null;
  walks: Walk[];
  /** places the traffic avoids (jump ramps) */
  avoid: { x: number; z: number; r: number }[];
  decor: Decor | null;
  /** building detail drawn on top of the base boxes: upper volumes, balconies and crowns, pitched roofs, flat roofs */
  massing?: Massing;
  /** the play area when it is not the square ±bounds (the real-map city) */
  rect?: { x0: number; z0: number; x1: number; z1: number };
  /** the real-map city: polygons for the ground, roads, sidewalks, water and blocks (drawn by world/osm/surfaces.ts) */
  osm?: OsmCityData;
  /** the real-map city: directed lanes, turns and traffic light groups for the traffic (world/osm/roadnet.ts) */
  roadnet?: RoadNet;
  /** the real-map city: traffic light heads (drawn by drawSignals when there is no `decor` to carry them) */
  signals?: Signal[];
}

/** the stage 1 grey-box ground (still used for the physics feel tests and the ?track=test page) */
export function testLevel(): Level {
  return {
    id: 'test',
    bounds: GROUND / 2,
    ground: [{ p: [0, -0.5, 0], size: [GROUND, 1, GROUND] }],
    water: null,
    shapes: greybox(),
    prims: [],
    lots: [],
    marks: [],
    signs: [],
    trees: [],
    stops: STOPS,
    places: PLACES,
    spawn: { p: { x: 0, y: 1.0, z: -60 }, yaw: 0 },
    graph: null,
    walks: [],
    avoid: [],
    decor: null,
  };
}
