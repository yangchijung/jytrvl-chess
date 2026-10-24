// Rush Taxi: materials that look like what they are made of. Everything here keys off one quality tier:
//
//   low   today's look: Lambert cabs, Lambert roads, Phong water with ripples and glints, no environment map
//   mid   (tablets; must cost about what low did, so only cheap additions) an environment map (64 px PMREM,
//         rendered once); the cabs stay Lambert but paint, chrome, glass and plastic reflect it with their own
//         Fresnel weights (one read per shiny pixel); glass towers and water reflect it on their own pixels only,
//         the river and sea also a fake bank; roads and pavement get grain and worn patches from one read of a
//         shared 128 px noise; wet mode works
//   high  (desktops) as mid with a 128 px PMREM, clearcoat on the taxi (MeshPhysical), traffic and the taxi glass in
//         MeshStandard, Phong roads whose shine varies (patches, satin road paint), a second finer grain read, and
//         a real planar reflection on the water (waterMirror.ts)
//
// Parts of a merged car mesh say what they are through a per-vertex `aSurf` value (SURF below), so one material
// draws paint, trim, chrome, glass and tyres in a single draw call.
import * as THREE from 'three';
import type { Quality } from './quality';
import { FACADE_DECODE_GLSL } from '../world/facade';
import { keepHemisphereAmbient } from './envLight';

let tier: Quality = 'low';
/** set once, before the scene is built; callers that never set it keep the 'low' (original) look */
export function setSurfaceQuality(q: Quality) {
  tier = q;
}
export function surfaceQuality(): Quality {
  return tier;
}

// ---------------------------------------------------------------------------------------------------------------
// the environment map goes only to the materials that reflect (see envLight.ts for why it is not scene.environment)

type EnvMaterial = THREE.Material & { envMap: THREE.Texture | null };
const envUsers = new Set<EnvMaterial>();
let envTex: THREE.Texture | null = null;
/** mark a material as one that samples the environment map; it gets the current one now and on every bind */
export function usesEnvironment<M extends THREE.Material>(m: M): M {
  if (!envUsers.has(m as unknown as EnvMaterial)) m.addEventListener('dispose', () => envUsers.delete(m as unknown as EnvMaterial));
  envUsers.add(m as unknown as EnvMaterial);
  if (envTex) (m as unknown as EnvMaterial).envMap = envTex;
  return m;
}
/** hand the environment (envLight's PMREM texture, a stable object) to every reflecting material; null unbinds and
 * forgets them (a game being disposed) */
export function bindEnvironment(tex: THREE.Texture | null) {
  if (tex) keepHemisphereAmbient();
  for (const m of envUsers) {
    if (!m.envMap !== !tex) m.needsUpdate = true;
    m.envMap = tex;
  }
  envTex = tex;
  if (!tex) envUsers.clear();
}

// ---------------------------------------------------------------------------------------------------------------
// cars

export const SURF = { paint: 0, plastic: 1, rubber: 2, chrome: 3, glass: 4, lamp: 5, cloth: 6 } as const;
export type Surf = (typeof SURF)[keyof typeof SURF];

/** what a car part's colour is made of (the cab and sedan palettes); unknown colours are paint (stripes, liveries) */
const SURF_OF: Record<string, Surf> = {
  '#FFC72C': SURF.paint,
  '#FFFFFF': SURF.paint,
  '#262A30': SURF.plastic,
  '#1B1E23': SURF.plastic,
  '#F5F5F5': SURF.plastic,
  '#C9CED6': SURF.chrome,
  '#2C4258': SURF.glass,
  '#33475C': SURF.glass,
  '#FFF4D6': SURF.lamp,
  '#C62828': SURF.lamp,
  '#3A3F47': SURF.cloth,
  '#4A4F57': SURF.cloth,
  '#1E2228': SURF.rubber,
};
export function surfFor(color: string): Surf {
  return SURF_OF[color.toUpperCase()] ?? SURF.paint;
}

/** roughness and metalness of each surface (paint comes from the material's own uniforms) */
export const SURF_PBR: Record<Surf, [number, number]> = {
  [SURF.paint]: [0.4, 0],
  [SURF.plastic]: [0.55, 0],
  [SURF.rubber]: [0.95, 0],
  [SURF.chrome]: [0.18, 1],
  [SURF.glass]: [0.05, 0],
  [SURF.lamp]: [0.15, 0],
  [SURF.cloth]: [0.9, 0],
};

const f = (n: number) => n.toFixed(3);
const CAR_FRAG = /* glsl */ `
float surfK = floor(vSurf + 0.5);
if (surfK < 0.5) { roughnessFactor = uPaintRough; metalnessFactor = uPaintMetal; }
else if (surfK < 1.5) { roughnessFactor = ${f(SURF_PBR[1][0])}; metalnessFactor = ${f(SURF_PBR[1][1])}; }
else if (surfK < 2.5) { roughnessFactor = ${f(SURF_PBR[2][0])}; metalnessFactor = ${f(SURF_PBR[2][1])}; }
else if (surfK < 3.5) { roughnessFactor = ${f(SURF_PBR[3][0])}; metalnessFactor = ${f(SURF_PBR[3][1])}; }
else if (surfK < 4.5) { roughnessFactor = ${f(SURF_PBR[4][0])}; metalnessFactor = ${f(SURF_PBR[4][1])}; }
else if (surfK < 5.5) { roughnessFactor = ${f(SURF_PBR[5][0])}; metalnessFactor = ${f(SURF_PBR[5][1])}; }
else { roughnessFactor = ${f(SURF_PBR[6][0])}; metalnessFactor = ${f(SURF_PBR[6][1])}; }`;

// the sky in the paint is kept down (uPaintEnv) so the cab stays taxi yellow; chrome and glass take it all
const CAR_ENV = /* glsl */ `
{
  float envK = surfK < 0.5 ? uPaintEnv : 1.0;
  radiance *= envK;
  #ifdef USE_CLEARCOAT
  clearcoatRadiance *= envK;
  #endif
}`;

function surfShader(mat: THREE.MeshStandardMaterial, paintRough: number, paintMetal: number, paintEnv: number, key: string) {
  const uPaintRough = { value: paintRough };
  const uPaintMetal = { value: paintMetal };
  const uPaintEnv = { value: paintEnv };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uPaintRough = uPaintRough;
    sh.uniforms.uPaintMetal = uPaintMetal;
    sh.uniforms.uPaintEnv = uPaintEnv;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSurf;\nvarying float vSurf;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = aSurf;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSurf;\nuniform float uPaintRough;\nuniform float uPaintMetal;\nuniform float uPaintEnv;')
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>${CAR_FRAG}`)
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>${CAR_ENV}`)
      // the clearcoat is on the paint only
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= step(floor(vSurf + 0.5), 0.5);\n#endif');
  };
  mat.customProgramCacheKey = () => `surf-${key}`;
  return mat;
}

/**
 * The tablet car shader: Lambert lighting as before, plus one environment read where the part is shiny, weighted by
 * a Fresnel term per surface (reflectance head-on, at grazing, blur, metal). About a tenth of a PBR material's work,
 * which matters because the cab fills a good part of the screen.
 */
// [head-on, grazing, blur, metal]; paint's grazing value comes from uPaintEnv
const LAMBERT_SURF: Record<Surf, [number, number, number, number]> = {
  [SURF.paint]: [0.04, -1, 0.1, 0],
  [SURF.plastic]: [0.03, 0.22, 0.45, 0],
  [SURF.rubber]: [0, 0, 0, 0],
  [SURF.chrome]: [0.7, 0.95, 0.12, 1],
  [SURF.glass]: [0.1, 0.85, 0.03, 0],
  [SURF.lamp]: [0.05, 0.45, 0.08, 0],
  [SURF.cloth]: [0, 0, 0, 0],
};
const v4 = (k: Surf) => `vec4(${LAMBERT_SURF[k].map((n, i) => (n < 0 && i === 1 ? 'uPaintEnv' : f(n))).join(', ')})`;
const CAR_LAMBERT = /* glsl */ `
#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV ) && defined( ENV_WORLDPOS )
{
  float sk = floor(vSurf + 0.5);
  vec4 sp = sk < 0.5 ? ${v4(SURF.paint)} : sk < 1.5 ? ${v4(SURF.plastic)} : sk < 2.5 ? ${v4(SURF.rubber)} : sk < 3.5 ? ${v4(SURF.chrome)} : sk < 4.5 ? ${v4(SURF.glass)} : sk < 5.5 ? ${v4(SURF.lamp)} : ${v4(SURF.cloth)};
  if (sp.y > 0.0) {
    vec3 cV = normalize(vWorldPosition - cameraPosition);
    vec3 cN = inverseTransformDirection(normal, viewMatrix);
    vec3 cEnv = textureCubeUV(envMap, envMapRotation * reflect(cV, cN), sp.z).rgb * envMapIntensity;
    float cK = mix(sp.x, sp.y, pow(1.0 - clamp(dot(-cV, cN), 0.0, 1.0), 5.0));
    outgoingLight = mix(outgoingLight, mix(cEnv, cEnv * diffuseColor.rgb, sp.w), cK);
  }
}
#endif`;

function surfLambert(params: THREE.MeshLambertMaterialParameters, paintEnv: number) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...params });
  const uPaintEnv = { value: paintEnv };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPaintEnv = uPaintEnv;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSurf;\nvarying float vSurf;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = aSurf;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSurf;\nuniform float uPaintEnv;')
      .replace('#include <envmap_fragment>', `${CAR_LAMBERT}\n#include <envmap_fragment>`);
  };
  m.customProgramCacheKey = () => 'surf-lambert';
  return usesEnvironment(m);
}

/** the taxi's body and wheels: clearcoat paint on high, Lambert with reflections on mid, the original on low */
export function taxiBodyMaterial(): THREE.Material {
  if (tier === 'low') return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  if (tier === 'mid') return surfLambert({}, 0.45);
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, flatShading: true, roughness: 0.4, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06 });
  return usesEnvironment(surfShader(m, 0.42, 0, 0.4, 'taxi'));
}

/** the taxi's glass house: tinted, see-through, reflecting the sky */
export function taxiGlassMaterial(opacity: number): THREE.Material {
  if (tier === 'low') return new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity, depthWrite: false });
  if (tier === 'mid') return surfLambert({ transparent: true, opacity: Math.min(1, opacity + 0.08), depthWrite: false, flatShading: false }, 0.45);
  // a little metalness raises the reflectance so the sky reads on the glass even through the transparency
  return usesEnvironment(new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: Math.min(1, opacity + 0.08), depthWrite: false, roughness: 0.05, metalness: 0.35 }));
}

let npcMat: { tier: Quality; mat: THREE.Material } | null = null;
/** one material for every traffic car (body and detail, all instanced): one program for the whole traffic */
export function trafficMaterial(): THREE.Material {
  if (npcMat && npcMat.tier === tier) return tier === 'low' ? npcMat.mat : usesEnvironment(npcMat.mat);
  const mat =
    tier === 'low'
      ? new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
      : tier === 'mid'
        ? surfLambert({}, 0.55)
        : surfShader(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.4, metalness: 0.1 }), 0.36, 0.12, 0.6, 'npc');
  npcMat = { tier, mat };
  return tier === 'low' ? mat : usesEnvironment(mat);
}

// ---------------------------------------------------------------------------------------------------------------
// glass towers

export const GLASS_REFL = { value: 0.8 };

/**
 * The environment chunk for the glass curtain walls; needs buildingMaterial's varyings (vW, vNW, vOrg, vRoof). Whether
 * a building is a glass tower is the same for the whole instance, so the vertex shader decides it (vGlass) and the
 * fragment shader only pays for the reflection on glass.
 */
export const GLASS_TOWER_GLSL = /* glsl */ `
#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
if (vGlass > 0.5 && abs(vNW.y) < 0.5 && vW.y - vOrg.y > 4.4 && vRoof - vW.y > 0.9) {
  vec3 gV = normalize(vW - cameraPosition);
  vec3 gN = normalize(vNW);
  vec3 gEnv = textureCubeUV(envMap, envMapRotation * reflect(gV, gN), 0.06).rgb * envMapIntensity;
  float gK = uGlassRefl * (0.16 + 0.5 * pow(1.0 - abs(dot(gV, gN)), 3.0));
  // lit windows and lobbies (the emissive part) stay as they are; only the lit glass gives way to the reflection
  outgoingLight = mix(outgoingLight - totalEmissiveRadiance, gEnv, gK) + totalEmissiveRadiance;
}
#endif
`;

const GLASS_VERT = /* glsl */ `
#ifdef USE_INSTANCING
vGlass = facadeIsGlass(aLook, (modelMatrix * instanceMatrix * vec4(0.0, -0.5, 0.0, 1.0)).xyz) ? 1.0 : 0.0;
#else
vGlass = 0.0;
#endif
`;

/** adds environment reflections to the glass towers of a material made by buildingMaterial(), after its own hook */
export function withGlassReflection<M extends THREE.Material>(mat: M): M {
  const prev = mat.onBeforeCompile;
  const prevSrc = prev.toString();
  const keyBefore = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.uniforms.uGlassRefl = GLASS_REFL;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\nvarying float vGlass;${FACADE_DECODE_GLSL}`).replace('#include <project_vertex>', `${GLASS_VERT}\n#include <project_vertex>`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGlass;\nuniform float uGlassRefl;').replace('#include <envmap_fragment>', `${GLASS_TOWER_GLSL}\n#include <envmap_fragment>`);
  };
  mat.customProgramCacheKey = () => `${keyBefore}|${prevSrc}|glass`;
  return tier === 'low' ? mat : usesEnvironment(mat);
}

// ---------------------------------------------------------------------------------------------------------------
// roads, pavement and paint; wet mode

/** wetness of the streets, 0 (dry, the default) … 1 (after a downpour) */
export const WET = { value: 0 };
/** the low tier's road materials and their dry colours (a handful per game) */
const roadBase = new Map<THREE.MeshLambertMaterial, THREE.Color>();
export function setWet(v: number) {
  WET.value = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
  // low has no road shader: the streets just darken
  for (const [m, base] of roadBase) m.color.copy(base).multiplyScalar(1 - 0.35 * WET.value);
}

/**
 * One tiny tiling noise texture shared by every road material, 128 px over 48 m, with three scales baked into its
 * channels so 'mid' needs a single read: r aggregate (a texel, 0.375 m), g worn patches (3 m), b puddle blobs (8 m).
 */
export const NOISE_SIZE = 128;
export const NOISE_SPAN = 48;
let noiseTex: THREE.DataTexture | null = null;
export function roadNoiseData(seed = 1234567) {
  const N = NOISE_SIZE;
  const data = new Uint8Array(N * N * 4);
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) >>> 8) / 16777216;
  const grid = (cells: number) => Array.from({ length: cells * cells }, rnd);
  // smooth value noise that tiles with the texture
  const smooth = (g: number[], cells: number, x: number, y: number) => {
    const fx = (x / N) * cells,
      fy = (y / N) * cells;
    const x0 = Math.floor(fx),
      y0 = Math.floor(fy);
    const tx = fx - x0,
      ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx),
      sy = ty * ty * (3 - 2 * ty);
    const at = (i: number, j: number) => g[(j % cells) * cells + (i % cells)];
    return (at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy;
  };
  const patches = grid(16),
    blobs = grid(6);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      data[i] = Math.round(rnd() * 255);
      data[i + 1] = Math.round(smooth(patches, 16, x, y) * 255);
      data[i + 2] = Math.round(smooth(blobs, 6, x, y) * 255);
      data[i + 3] = Math.round(rnd() * 255); // a second grain for the fine read on 'high'
    }
  return data;
}
export function roadNoise() {
  if (noiseTex) return noiseTex;
  noiseTex = new THREE.DataTexture(roadNoiseData(), NOISE_SIZE, NOISE_SIZE, THREE.RGBAFormat);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.magFilter = THREE.LinearFilter;
  noiseTex.minFilter = THREE.LinearMipmapLinearFilter;
  noiseTex.generateMipmaps = true;
  noiseTex.needsUpdate = true;
  return noiseTex;
}

export type RoadKind = 'asphalt' | 'pavement' | 'paint';
/** shine (Phong specular strength), shininess and grain per kind */
export const ROAD_LOOK: Record<RoadKind, { spec: number; shin: number; grain: number }> = {
  asphalt: { spec: 0.16, shin: 14, grain: 1 },
  pavement: { spec: 0.07, shin: 10, grain: 0.6 },
  paint: { spec: 0.32, shin: 36, grain: 0.35 },
};

const ROAD_FRAG_HEAD = /* glsl */ `
varying vec3 vRw;
uniform sampler2D uRoadNoise;
uniform float uWet;
uniform float uGrain;
uniform float uShine;`;

// the read is turned off the grid (so the 48 m repeat does not line up with the streets)
const ROAD_COLOR = /* glsl */ `
vec2 rgp = mat2(0.96, -0.28, 0.28, 0.96) * vRw.xz / ${NOISE_SPAN.toFixed(1)};
vec4 rN = texture2D(uRoadNoise, rgp);
float rFine = 0.5;
#ifdef ROAD_FINE
rFine = texture2D(uRoadNoise, rgp * 23.0 + 0.37).a;  // millimetre grain up close, mipmapped away further out
#endif
float rPuddle = smoothstep(0.56, 0.72, rN.b + 0.22 * (rN.g - 0.5)) * uWet;
diffuseColor.rgb *= (0.94 + 0.1 * (rN.g - 0.5) + uGrain * (0.06 * (rN.r - 0.5) + 0.06 * (rFine - 0.5))) * (1.0 - 0.36 * uWet - 0.22 * rPuddle);`;

const ROAD_SPEC = /* glsl */ `
specularStrength = mix(uShine * (0.55 + 0.9 * rN.g * rN.r), 1.0, max(rPuddle, 0.35 * uWet));`;

const ROAD_ENV = /* glsl */ `
#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
if (uWet > 0.001) {
  vec3 rV = normalize(vRw - cameraPosition);
  vec3 rR = reflect(rV, vec3(0.0, 1.0, 0.0));
  vec3 rEnv = textureCubeUV(envMap, envMapRotation * rR, mix(0.3, 0.02, rPuddle)).rgb * envMapIntensity;
  float rF = 0.04 + 0.96 * pow(1.0 - abs(rV.y), 5.0);
  outgoingLight = mix(outgoingLight, rEnv, clamp(rF * (0.25 * uWet + 0.65 * rPuddle) + 0.25 * rPuddle, 0.0, 0.9));
}
#endif`;

/**
 * Street surfaces with no textures but one shared 128 px noise: asphalt grain and worn patches with a shine that
 * varies across them, pavement with a finer grain, and road paint with a satin sheen ('high'; 'mid' keeps Lambert
 * and gets the grain and patches from a single noise read). `setWet` darkens them and (mid and high) adds puddles
 * that mirror the environment.
 * Works for plain and instanced meshes.
 */
export function roadMaterial(color: string | THREE.Color | null, kind: RoadKind, params: THREE.MeshPhongMaterialParameters = {}): THREE.Material {
  const base = color === null ? new THREE.Color('#FFFFFF') : new THREE.Color(color);
  if (tier === 'low') {
    const m = new THREE.MeshLambertMaterial({ color: base, flatShading: true, ...(params as THREE.MeshLambertMaterialParameters) });
    roadBase.set(m, base.clone());
    return m;
  }
  const look = ROAD_LOOK[kind];
  // 'high': Phong, so the shine can vary (worn patches, satin paint); 'mid': Lambert with the grain only
  const shiny = tier === 'high';
  const m = shiny
    ? new THREE.MeshPhongMaterial({ color: base, specular: '#FFFFFF', shininess: look.shin, flatShading: true, ...params })
    : new THREE.MeshLambertMaterial({ color: base, flatShading: true, ...(params as THREE.MeshLambertMaterialParameters) });
  if (shiny) m.defines = { ROAD_FINE: '' };
  const uGrain = { value: look.grain },
    uShine = { value: look.spec };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRoadNoise = { value: roadNoise() };
    sh.uniforms.uWet = WET;
    sh.uniforms.uGrain = uGrain;
    sh.uniforms.uShine = uShine;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRw;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n{ vec4 rw = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nrw = instanceMatrix * rw;\n#endif\nvRw = (modelMatrix * rw).xyz; }');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>${ROAD_FRAG_HEAD}`)
      .replace('#include <color_fragment>', `#include <color_fragment>${ROAD_COLOR}`)
      .replace('#include <envmap_fragment>', `${ROAD_ENV}\n#include <envmap_fragment>`);
    if (shiny) sh.fragmentShader = sh.fragmentShader.replace('#include <specularmap_fragment>', `#include <specularmap_fragment>${ROAD_SPEC}`);
  };
  m.customProgramCacheKey = () => `road-${tier}`;
  return usesEnvironment(m);
}

// ---------------------------------------------------------------------------------------------------------------
// water

/** the planar reflection's texture and projection (world → texture), filled by WaterMirror on 'high' */
export const MIRROR = { uMirror: { value: null as THREE.Texture | null }, uMirrorMat: { value: new THREE.Matrix4() }, uMirrorOn: { value: 0 } };

/**
 * Where a ray reflected off the water at (px, pz), going (rx, ry, rz) with ry > 0, meets the bank of a rectangular
 * water body [x0, x1] × [z0, z1]: the horizontal distance and the height above the water there. The water shader
 * draws the bank (a darker band) where that height is under the bank's height, the sky above it. (Twin of the GLSL.)
 */
export function bankRise(px: number, pz: number, rx: number, ry: number, rz: number, box: [number, number, number, number]) {
  const hl = Math.max(Math.hypot(rx, rz), 1e-4);
  const dx = rx / hl,
    dz = rz / hl;
  const tx = dx > 1e-4 ? (box[1] - px) / dx : dx < -1e-4 ? (box[0] - px) / dx : 1e6;
  const tz = dz > 1e-4 ? (box[3] - pz) / dz : dz < -1e-4 ? (box[2] - pz) / dz : 1e6;
  const dist = Math.max(0, Math.min(tx, tz));
  return { dist, rise: (dist * Math.max(ry, 0)) / hl };
}

export const WATER_HEAD = /* glsl */ `
uniform vec4 uWaterBox;
uniform float uBankH;
uniform float uReflK;
#ifdef WATER_MIRROR
uniform sampler2D uMirror;
uniform mat4 uMirrorMat;
uniform float uMirrorOn;
#endif`;

export const WATER_REFLECT = /* glsl */ `
#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
{
  vec3 wN = normalize(inverseTransformDirection(normal, viewMatrix));
  vec3 wV = normalize(vWp - cameraPosition);
  vec3 wR = reflect(wV, wN);
  wR.y = abs(wR.y) + 0.01;
  wR = normalize(wR);
  vec3 refl = textureCubeUV(envMap, envMapRotation * wR, 0.03).rgb * envMapIntensity;
  // the bank: walls, palms and houses along the water, as a darker band low in the reflection
  float hl = max(length(wR.xz), 1e-4);
  vec2 hd = wR.xz / hl;
  float tx = hd.x > 1e-4 ? (uWaterBox.y - vWp.x) / hd.x : hd.x < -1e-4 ? (uWaterBox.x - vWp.x) / hd.x : 1e6;
  float tz = hd.y > 1e-4 ? (uWaterBox.w - vWp.z) / hd.y : hd.y < -1e-4 ? (uWaterBox.z - vWp.z) / hd.y : 1e6;
  float bd = max(0.0, min(tx, tz));
  float rise = bd * wR.y / hl;
  vec3 bankCol = vec3(0.30, 0.33, 0.30);
  #if defined( USE_FOG ) && ! defined( FOG_EXP2 )
    bankCol = mix(fogColor * vec3(0.46, 0.5, 0.47), fogColor, smoothstep(fogNear, fogFar, bd + length(vWp - cameraPosition)));
  #endif
  refl = mix(refl, bankCol, (1.0 - smoothstep(uBankH * 0.55, uBankH, rise)) * step(bd, 5000.0));
  #ifdef WATER_MIRROR
  if (uMirrorOn > 0.5) {
    vec4 mp = uMirrorMat * vec4(vWp, 1.0);
    vec2 muv = mp.xy / mp.w + wN.xz * 0.05;
    if (muv.x > 0.0 && muv.x < 1.0 && muv.y > 0.0 && muv.y < 1.0) refl = texture2D(uMirror, muv).rgb;
  }
  #endif
  float wF = 0.02 + 0.98 * pow(1.0 - clamp(dot(-wV, wN), 0.0, 1.0), 5.0);
  float wK = clamp(uReflK * (0.1 + 0.9 * wF), 0.0, 0.85);
  // the sun's glints stay on top of the reflection
  vec3 wSpec = reflectedLight.directSpecular;
  outgoingLight = mix(outgoingLight - wSpec, refl, wK) + wSpec;
}
#endif`;
