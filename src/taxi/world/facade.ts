// Rush Taxi: the per-instance `aLook` value that drives the building facade shader (`buildingMaterial` in decor.ts).
//
// aLook = style + variant
//   style   = floor(aLook): 0 house (透天厝 / walk-up), 1 tower, 2 hall, 3 warehouse (the `look` of a box Shape)
//   variant = fract(aLook), in [VARIANT_MIN, VARIANT_MAX]: picks the wall finish, window rhythm, iron window cages,
//             balconies, shop fronts, glass tint and so on, so neighbouring buildings differ.
//   A plain integer (variant 0, the old encoding) still works: the shader then derives the variant from the
//   building's position, so callers that only pass `look` keep working.
// Pure, no three.js, so it can be unit tested and called from city.ts or build.ts.

export const LOOK_HOUSE = 0;
export const LOOK_TOWER = 1;
export const LOOK_HALL = 2;
export const LOOK_WAREHOUSE = 3;

/** kept away from 0 (means "use the position") and from 1 (would round up into the next style) */
export const VARIANT_MIN = 1 / 256;
export const VARIANT_MAX = 0.99;

/** the attribute value for a building of `style` with a variant in [0, 1) (out-of-range values wrap) */
export function encodeLook(style: number, variant: number): number {
  const s = Math.max(0, Math.min(3, Math.floor(style)));
  const f = variant - Math.floor(variant);
  return s + VARIANT_MIN + f * (VARIANT_MAX - VARIANT_MIN);
}

/** inverse of encodeLook, as the shader reads it; `variant` is null for a legacy integer value */
export function decodeLook(v: number): { style: number; variant: number | null } {
  const style = Math.floor(v + 0.0005);
  const f = v - style;
  return { style, variant: f < 0.001 ? null : (f - VARIANT_MIN) / (VARIANT_MAX - VARIANT_MIN) };
}

/** a stable variant in [0, 1) from a building's ground position, so a rebuilt city keeps the same facades */
export function lookSeed(x: number, z: number): number {
  let h = Math.imul(Math.round(x * 8) | 0, 0x27d4eb2d) ^ Math.imul(Math.round(z * 8) | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** the value build.ts writes into aLook for a building box at (x, z) */
export function buildingLook(style: number, x: number, z: number): number {
  return encodeLook(style, lookSeed(x, z));
}

/** the share of towers drawn as a glass curtain wall (the rest are concrete offices); `buildingMaterial` uses r3 < this */
export const GLASS_TOWER_SHARE = 0.62;

/**
 * GLSL twin of decodeLook, for shader chunks that sit beside `buildingMaterial` (the glass reflection): the style,
 * the variant exactly as the facade shader derives it (including the position fallback and the quantisation), and
 * whether the building is a glass curtain-wall tower. Needs the `aLook` value and the building's foot (vOrg).
 */
export const FACADE_DECODE_GLSL = /* glsl */ `
float facadeHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float facadeStyle(float look) { return floor(look + 0.0005); }
float facadeVariant(float look, vec3 org) {
  float v = look - facadeStyle(look);
  if (v < 0.001) v = facadeHash(floor(org.xz * 2.0 + 0.5) * 0.173 + 5.3);
  return floor(v * 997.0 + 0.5) / 997.0;
}
bool facadeIsGlass(float look, vec3 org) {
  return int(facadeStyle(look)) == ${LOOK_TOWER} && facadeHash(vec2(facadeVariant(look, org) * 43.7, 8.9)) < ${GLASS_TOWER_SHARE.toFixed(2)};
}
`;

// ---------------------------------------------------------------- street facades (real-map fill)
// A fill building's box can carry `st` = [face, arcade, finish, type] (Shape.st), written into the per-instance
// `aSt` attribute. The facade shader then draws, on that one face only:
// - the 騎樓 arcade: the ground floor recessed `arcade` metres behind a row of columns, ray-cast in the shader
//   (back wall with shop fronts, ceiling with tube lights, tiled floor, the columns' sides), no extra geometry;
// - the finish: a tile or paint typical of Kaohsiung instead of the variant's pick;
// - the type: a walk-up's stair core (a strip of staggered landing windows), an apartment's balconies.

export const FINISH_AUTO = 0;
/** 二丁掛 cream tile */
export const FINISH_CREAM = 1;
/** brick-red 二丁掛 */
export const FINISH_BRICK = 2;
/** white or off-white 馬賽克 mosaic */
export const FINISH_MOSAIC = 3;
/** grey tile */
export const FINISH_GREY = 4;
/** painted render (the paint colour) */
export const FINISH_PAINT = 5;

export const TYPE_PLAIN = 0;
export const TYPE_WALKUP = 1;
export const TYPE_APARTMENT = 2;
export const TYPE_LUXURY = 3;

/**
 * the `st` face code of the box face that points along the world direction (fx, fz), for a fill box whose length
 * axis is (c, s) (build.ts turns it by yaw = −atan2(s, c), so its local x is (c, s) and its local z is (−s, c))
 */
export function faceCode(c: number, s: number, fx: number, fz: number): number {
  const along = fx * c + fz * s,
    across = -fx * s + fz * c;
  return Math.abs(across) >= Math.abs(along) ? (across > 0 ? 1 : -1) : along > 0 ? 2 : -2;
}

/** the outward world direction (x, z) of face `code` of a box turned by `yaw` (the inverse of faceCode) */
export function faceDir(code: number, yaw: number): [number, number] {
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  // local x → (cos yaw, −sin yaw), local z → (sin yaw, cos yaw)
  const k = Math.sign(code);
  return Math.abs(code) === 1 ? [k * s, k * c] : [k * c, -k * s];
}
