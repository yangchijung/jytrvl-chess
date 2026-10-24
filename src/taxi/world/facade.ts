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
