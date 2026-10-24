// Rush Taxi: the 'mid' tier's contact shade, a few shader instructions instead of a post pass. Walls darken towards
// the ground they stand on ('base', by world height, faces that look up are left alone) and flat lots darken along their own edges where they meet the
// kerb and the road ('edge', by distance to the instance's rim in metres). Works for any building or lot from the
// level data: nothing is positioned by hand. One shared uniform switches it: on for 'mid', off for 'high' (GTAO does
// the real thing there) and 'low'. No extra draw calls, no textures; the same program for every tier.
import * as THREE from 'three';

export const FAKE_AO = { uFakeAO: { value: 0 } };
/** how dark the very foot of a wall gets, and how high the shade reaches (m) */
export const AO_BASE = { dark: 0.68, height: 2.6 };
/** how dark the rim of a lot gets, and how far in the shade reaches (m) */
export const AO_EDGE = { dark: 0.76, width: 0.9 };

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** the shade factor at a wall point `y` metres above the ground (1 = untouched); mirrors the GLSL */
export function baseShade(y: number): number {
  return AO_BASE.dark + (1 - AO_BASE.dark) * smooth(0, AO_BASE.height, y);
}
/** the shade factor at a lot point `d` metres in from its edge; mirrors the GLSL */
export function edgeShade(d: number): number {
  return AO_EDGE.dark + (1 - AO_EDGE.dark) * smooth(0, AO_EDGE.width, d);
}

export function setFakeAO(on: boolean) {
  FAKE_AO.uFakeAO.value = on ? 1 : 0;
}

const vert = (mode: 'base' | 'edge') =>
  mode === 'base'
    ? /* glsl */ `
{
  vec4 aoP = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  aoP = instanceMatrix * aoP;
  #endif
  vAoY = (modelMatrix * aoP).y;
}`
    : /* glsl */ `
{
  vAoL = position.xz;
  #ifdef USE_INSTANCING
  vAoS = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[2].xyz));
  #else
  vAoS = vec2(length(modelMatrix[0].xyz), length(modelMatrix[2].xyz));
  #endif
}`;
const head = (mode: 'base' | 'edge') => (mode === 'base' ? 'varying float vAoY;' : 'varying vec2 vAoL; varying vec2 vAoS;');
const frag = (mode: 'base' | 'edge') =>
  mode === 'base'
    ? // walls only: roofs, decks and kerb tops facing the sky stay as they are
      `if (uFakeAO > 0.5) {
  float aoWall = 1.0 - smoothstep(0.5, 0.9, dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz)));
  diffuseColor.rgb *= mix(1.0, mix(${AO_BASE.dark.toFixed(3)}, 1.0, smoothstep(0.0, ${AO_BASE.height.toFixed(3)}, vAoY)), aoWall);
}`
    : `if (uFakeAO > 0.5) { vec2 aoE = (0.5 - abs(vAoL)) * vAoS; diffuseColor.rgb *= mix(${AO_EDGE.dark.toFixed(3)}, 1.0, smoothstep(0.0, ${AO_EDGE.width.toFixed(3)}, min(aoE.x, aoE.y))); }`;

/**
 * Adds the contact shade to a material, after (and without disturbing) any onBeforeCompile it already has, the same
 * way addOcclusionFade chains. 'edge' expects a unit quad in the xz plane (−0.5…0.5) scaled per instance.
 * It darkens diffuseColor just before the emissive chunk, so it lands after every colour_fragment edit (facades)
 * and never dims lit windows.
 */
export function addFakeAO<M extends THREE.Material>(mat: M, mode: 'base' | 'edge'): M {
  const prev = mat.onBeforeCompile;
  const prevSrc = prev.toString();
  const keyBefore = mat.customProgramCacheKey.bind(mat)();
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    Object.assign(sh.uniforms, FAKE_AO);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${head(mode)}`).replace('#include <project_vertex>', `#include <project_vertex>${vert(mode)}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${head(mode)}\nuniform float uFakeAO;`)
      .replace('#include <emissivemap_fragment>', `${frag(mode)}\n#include <emissivemap_fragment>`);
  };
  mat.customProgramCacheKey = () => `${keyBefore}|${prevSrc}|ao-${mode}`;
  return mat;
}
