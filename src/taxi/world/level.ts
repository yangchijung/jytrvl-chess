// Rush Taxi — a level is plain data: what collides (shapes), what is only drawn (landmark primitives, lots, road
// markings, trees, water), where people wait and where they want to go, and the road graph the traffic drives on.
// Two levels exist: the stage 1 test ground (tuning, unit tests) and the city (the game). Both are built without
// Three.js or Rapier so the data can be checked in plain unit tests.
import { GROUND, greybox, type Shape } from './greybox';
import type { Place, Spot } from '../gameplay/rules';
import { PLACES, STOPS } from '../gameplay/places';
import type { Massing } from './massing';

export type { Shape };

/** a drawn-only primitive in world metres (landmarks); y is the centre height */
export type Prim =
  | { t: 'box'; x: number; y: number; z: number; sx: number; sy: number; sz: number; color: string }
  | { t: 'cyl'; x: number; y: number; z: number; r: number; h: number; color: string }
  | { t: 'cone'; x: number; y: number; z: number; r: number; h: number; color: string }
  | { t: 'sph'; x: number; y: number; z: number; r: number; color: string }
  | { t: 'tor'; x: number; y: number; z: number; R: number; tube: number; color: string; yaw: number };

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
  signals: { x: number; z: number; yaw: number; axis: 'x' | 'z' }[];
  palms: { x: number; z: number; h: number }[];
  curbs: Rect[];
  /** Love River boats: they cruise between x0 and x1 at z */
  boats: { z: number; x0: number; x1: number; speed: number; color: string }[];
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
