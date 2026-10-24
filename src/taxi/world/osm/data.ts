// Rush Taxi: the OpenStreetMap city data (central Kaohsiung), as produced by scripts/osm/build_city.py.
//
// Coordinates and scale:
// - Game metres: x = east, z = south.
// - Positions are scaled to `scale` (0.55) of the real map. Road widths and heights are real.
// - Polygons are [outer ring, ...hole rings]; a ring is [[x, z], ...] without the closing point.
//
// Data © OpenStreetMap contributors, ODbL 1.0 (see ./LICENSE.md).
import RAW from './kaohsiung.json';

export type XZ = [number, number];
export type Ring = XZ[];
export type Poly = Ring[];

export type RoadClass =
  | 'trunk' | 'primary' | 'secondary' | 'tertiary' | 'unclassified' | 'residential' | 'living_street'
  | 'trunk_link' | 'primary_link' | 'secondary_link' | 'tertiary_link';

export interface OsmRoad {
  /** graph node indices of the two ends */
  a: number;
  b: number;
  cls: RoadClass;
  /** carriageway width (m) */
  w: number;
  /** centre line, from a to b; one-way roads run a → b */
  pts: XZ[];
  oneway?: 1;
  name?: string;
  en?: string;
  bridge?: 1;
}
export interface OsmBuilding {
  /** the footprint, outer ring only */
  poly: Ring;
  /** oriented box around the footprint: centre x, z, length along `yaw` direction, width, angle of the length edge (atan2(dz, dx)) */
  obb: [number, number, number, number, number];
  /** storeys and height (m), when mapped */
  lv?: number;
  h?: number;
  name?: string;
  kind?: string;
  tile: number;
}
export interface OsmBlock {
  poly: Poly;
  tile: number;
  /** 行政區, e.g. 鹽埕區 */
  district?: string;
  /** land use where mapped: residential, commercial, retail, industrial … */
  use?: string;
  park?: 1;
}
export interface OsmLandmark {
  id: string;
  kind: string;
  zh: string;
  en: string;
  x: number;
  z: number;
  poly?: Ring | null;
}
export interface OsmCityData {
  about: string;
  osmBase: string;
  scale: number;
  origin: [number, number];
  /** x0, z0, x1, z1 */
  bounds: [number, number, number, number];
  nodes: XZ[];
  roads: OsmRoad[];
  water: Poly[];
  parks: { name: string | null; poly: Poly }[];
  landuse: { kind: string; poly: Poly }[];
  buildings: OsmBuilding[];
  districts: { zh: string; en: string | null; poly: Poly[] }[];
  landmarks: OsmLandmark[];
  rail: XZ[][];
  blocks: OsmBlock[];
  surfaces: {
    /** columns, rows, tile size (m), x0, z0 */
    tile: [number, number, number, number, number];
    /** [tile index, polygon] */
    road: [number, Poly][];
    walk: [number, Poly][];
    land: [number, Poly][];
  };
}

export const KAOHSIUNG = RAW as unknown as OsmCityData;

/** road class → rank (5 = trunk/primary … 1 = residential) */
export const RANK: Record<RoadClass, number> = {
  trunk: 5, primary: 5, secondary: 4, tertiary: 3, unclassified: 2, residential: 1, living_street: 1,
  trunk_link: 3, primary_link: 3, secondary_link: 3, tertiary_link: 2,
};

/** official English names of the districts (OSM's name:en here is often a romanisation) */
export const DISTRICT_EN: Record<string, string> = {
  鹽埕區: 'Yancheng', 鼓山區: 'Gushan', 三民區: 'Sanmin', 前金區: 'Qianjin', 苓雅區: 'Lingya', 新興區: 'Xinxing', 前鎮區: 'Qianzhen', 旗津區: 'Cijin',
};
