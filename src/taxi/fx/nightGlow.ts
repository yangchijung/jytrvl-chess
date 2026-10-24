// Rush Taxi: the city's lights after dark. One shared uniform, `uNight` (0 = day, 1 = full night, from
// timeOfDay's `lights`), drives every emissive term, so the whole city switches on together and costs no extra
// draw calls by day:
//   glowVertexColours  Lambert vertex-colour meshes: parts whose colour matches a mask glow (lamp heads, car lights)
//   brightenBasic      unlit meshes (shop signs, name boards, signal lamps) get brighter, so desktop bloom catches them
//   lightPools         soft additive pools of light on the road under the street lamps (one instanced quad mesh)
//   headlightBeams     the taxi's headlight beams on the road ahead and a red tail-light glow behind (one mesh)
// No real point lights: a light per lamp would recompile and slow down every material in the city.
import * as THREE from 'three';

export const uNight = { value: 0 };

type Patchable = THREE.Material & { onBeforeCompile: THREE.Material['onBeforeCompile'] };

function chain<M extends Patchable>(mat: M, tag: string, patch: (sh: THREE.WebGLProgramParametersWithUniforms) => void) {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey.bind(mat);
  const before = prevKey();
  const prevSrc = prev.toString();
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.uniforms.uNight = uNight;
    if (!/uniform float uNight;/.test(sh.fragmentShader)) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;');
    patch(sh);
  };
  mat.customProgramCacheKey = () => `${before}|${prevSrc}|${tag}`;
  return mat;
}

/**
 * Lambert (or any lit) material with vertex colours: adds `colour × mask × uNight × gain` to the emissive light.
 * `mask` is a GLSL float expression of `vColor` (linear RGB), e.g. the near-white lamp heads.
 */
export function glowVertexColours<M extends Patchable>(mat: M, rules: { mask: string; gain: number; tint?: string }[]): M {
  const body = rules.map((r) => `totalEmissiveRadiance += ${r.tint ? `vec3(${r.tint})` : 'vColor'} * (${r.mask}) * uNight * ${r.gain.toFixed(3)};`).join('\n');
  return chain(mat, `glowvc:${body}`, (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n#ifdef USE_COLOR\n${body}\n#endif`);
  });
}

/** the traffic sedans' lamps (taxiModel's sedanGeometry): head lamps #FFF4D6 (linear ≈ 1, 0.91, 0.67) and tail
 * lamps #C62828 (≈ 0.56, 0.02, 0.02); no other part of the car is that bright or that red */
export const CAR_LIGHT_GLOW = [
  { mask: 'step(0.95, vColor.r) * step(0.85, vColor.g)', gain: 1.4 },
  { mask: 'step(0.4, vColor.r) * step(vColor.g, 0.06) * step(vColor.b, 0.06)', gain: 2.2 },
];

/** an unlit material gets up to `1 + gain` times brighter at night (values above 1 feed the desktop bloom) */
export function brightenBasic<M extends Patchable>(mat: M, gain: number): M {
  return chain(mat, `bright${gain}`, (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `outgoingLight *= 1.0 + uNight * ${gain.toFixed(3)};\n#include <opaque_fragment>`);
  });
}

const POOL_VERT = /* glsl */ `
  varying vec2 vUv; varying float vDist;
  #ifdef BEAM
  attribute float aBeam; attribute vec3 aTint; varying float vBeam; varying vec3 vTint;
  #endif
  void main() {
    vUv = uv;
    #ifdef BEAM
    vBeam = aBeam; vTint = aTint;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    #else
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    #endif
    vec4 mv = viewMatrix * wp;
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const POOL_FRAG = /* glsl */ `
  uniform float uNight; uniform vec3 uColor; uniform float uStrength; uniform float uFar;
  varying vec2 vUv; varying float vDist;
  #ifdef BEAM
  varying float vBeam; varying vec3 vTint;
  #endif
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float a;
    vec3 col = uColor;
    #ifdef BEAM
    col = vTint;
    if (vBeam > 0.5) {
      // a beam: narrow at the lamps (v = 0), wider and fading out down the road (v = 1)
      float v = vUv.y;
      float w = 0.3 + 0.7 * v;
      a = (1.0 - smoothstep(0.55, 1.0, abs(p.x) / w)) * pow(1.0 - v, 1.4) * smoothstep(0.0, 0.06, v);
    } else
    #endif
    {
      float r = dot(p, p);
      a = 1.0 - smoothstep(0.0, 1.0, r);
      a *= a;
    }
    a *= uNight * uStrength * (1.0 - smoothstep(uFar * 0.6, uFar, vDist));
    gl_FragColor = vec4(col * a, 1.0);
    #include <colorspace_fragment>
  }`;

function poolMaterial(color: string, strength: number, far: number, beam = false) {
  return new THREE.ShaderMaterial({
    uniforms: { uNight, uColor: { value: new THREE.Color(color) }, uStrength: { value: strength }, uFar: { value: far } },
    vertexShader: POOL_VERT,
    fragmentShader: POOL_FRAG,
    defines: beam ? { BEAM: '' } : {},
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    fog: false,
  });
}

/** soft round pools of warm light on the ground, one per lamp head ([x, z]); hidden (no draw call) by day */
export function lightPools(heads: { x: number; z: number }[], radius = 5.5) {
  if (!heads.length) return null;
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mesh = new THREE.InstancedMesh(geo, poolMaterial('#FFD9A0', 0.42, 260), heads.length);
  const m4 = new THREE.Matrix4();
  const s = new THREE.Vector3(radius * 2, 1, radius * 2);
  const q = new THREE.Quaternion();
  heads.forEach((h, i) => mesh.setMatrixAt(i, m4.compose(new THREE.Vector3(h.x, 0.08, h.z), q, s)));
  mesh.computeBoundingSphere();
  mesh.renderOrder = 2;
  mesh.name = 'lamp-pools';
  mesh.visible = false;
  return mesh;
}

/** the taxi's light on the road: two beams ahead, a red glow behind; in the car's frame, at road level (y = 0) */
export function headlightBeams(rearZ: number) {
  const parts: THREE.BufferGeometry[] = [];
  /** a road quad w × l centred at (x, zc); uv.y grows towards +z (away from the front of the car) */
  const quad = (w: number, l: number, x: number, zc: number, beam: boolean, tint: string) => {
    const g = new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2);
    g.translate(x, 0, zc);
    const n = g.getAttribute('position').count;
    const c = new THREE.Color(tint);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    // after rotateX(-90°) the plane's uv.y = 1 edge lies at −z: flip it
    for (let k = 0; k < n; k++) uv.setY(k, 1 - uv.getY(k));
    g.setAttribute('aBeam', new THREE.BufferAttribute(new Float32Array(n).fill(beam ? 1 : 0), 1));
    g.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(Array.from({ length: n }, () => [c.r, c.g, c.b]).flat()), 3));
    return g;
  };
  for (const s of [-1, 1]) parts.push(quad(4.2, 15, s * 0.7, 2.1 + 7.5, true, '#FFF1D0'));
  parts.push(quad(2.2, 1.2, 0, rearZ - 0.45, false, '#8A1A14')); // dim: the camera looks straight at it
  const geo = new THREE.BufferGeometry();
  // merge by hand (tiny): positions, uv, aBeam, aTint, indices
  const attrs = ['position', 'uv', 'aBeam', 'aTint'] as const;
  const out: Record<string, number[]> = { position: [], uv: [], aBeam: [], aTint: [] };
  const idx: number[] = [];
  let base = 0;
  for (const g of parts) {
    for (const a of attrs) out[a].push(...(g.getAttribute(a).array as Float32Array));
    for (const i of g.index!.array) idx.push(i + base);
    base += g.getAttribute('position').count;
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(out.position, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
  geo.setAttribute('aBeam', new THREE.Float32BufferAttribute(out.aBeam, 1));
  geo.setAttribute('aTint', new THREE.Float32BufferAttribute(out.aTint, 3));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, poolMaterial('#FFFFFF', 0.5, 400, true));
  mesh.renderOrder = 3;
  mesh.name = 'headlights';
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
}
