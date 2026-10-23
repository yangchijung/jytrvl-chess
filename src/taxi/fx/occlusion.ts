// Rush Taxi — keeps the taxi and the road ahead in view: name boards, landmark parts and building corners that sit
// between the chase camera and the car (a cone from the camera to the car), or right in front of the lens, are
// dithered away in their own fragment shader. No extra draw calls, no transparency sorting: a few uniforms and a
// discard. `occlusionFade` is the same test in plain TypeScript, for the unit test and the in-page sight check.
import * as THREE from 'three';

/** shared by every material that fades; the game writes the camera and the car into it once per frame */
export const OCC = {
  uOccCam: { value: new THREE.Vector3(0, -1000, 0) },
  uOccCar: { value: new THREE.Vector3(0, -1000, 0) },
  /** 0 = off (menu orbit, garage), 1 = on */
  uOccOn: { value: 0 },
};

/** the car's body centre sits this far above the physics body's origin (the cab spans about -0.3 … +0.9 m) */
export const OCC_CAR_LIFT = 0.3;
/** the cone: this radius at the camera end, this at the car end (the taxi is ~2 m wide, ~1.6 m tall) */
export const OCC_R_CAM = 0.9;
export const OCC_R_CAR = 2.3;
/**
 * Spheres around the lens: anything this close is faded. Landmark parts use the small one (their walls are big, a
 * hole should only open right at the lens); name boards the large one: a 9 m board hanging over the pavement fills a
 * corner of the screen from 10 m away, and by then the driver has read it (fully faded inside 8 m).
 */
export const OCC_NEAR = 4.5;
export const OCC_NEAR_BOARD = 16;
/**
 * Boards only: something well off the line of sight (up in a corner of the screen) counts as this much closer, so a
 * board looming over the pavement fades from further away than one straight ahead down the road, which stays readable.
 * Applies to near radii above OCC_NEAR (landmark walls keep the plain sphere).
 */
export const OCC_SIDE_SCALE = 0.45;
export const occSide = (near: number) => near > OCC_NEAR;
/**
 * How far along the camera→car line the cone reaches (1 = the car's centre). Boards and landmark parts reach a
 * little past the car; building walls stop short of it, so a wall the taxi drives along never gets a hole beside it.
 */
export const occReach = (near: number) => (near > 0 ? 1.05 : 0.8);
/** the most a fragment fades (1 = gone): a faint trace stays so the player knows something is there */
export const OCC_MAX = 0.9;
/** near the lens a little more of a board stays, so it reads as see-through rather than gone */
export const OCC_MAX_NEAR = 0.8;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * How much a point at `w` fades (0 = drawn, OCC_MAX = almost all of it discarded), given the camera and the car's
 * centre. Mirrors the GLSL below exactly.
 */
export function occlusionFade(w: THREE.Vector3Like, cam: THREE.Vector3Like, car: THREE.Vector3Like, near: number): number {
  const abx = car.x - cam.x,
    aby = car.y - cam.y,
    abz = car.z - cam.z;
  const wx = w.x - cam.x,
    wy = w.y - cam.y,
    wz = w.z - cam.z;
  const len2 = Math.max(1e-6, abx * abx + aby * aby + abz * abz);
  const h = (wx * abx + wy * aby + wz * abz) / len2;
  let f = 0;
  if (h > 0 && h < occReach(near)) {
    const hc = Math.min(1, h);
    const d = Math.hypot(wx - abx * hc, wy - aby * hc, wz - abz * hc);
    const r = OCC_R_CAM + (OCC_R_CAR - OCC_R_CAM) * hc;
    f = (1 - smooth(r * 0.7, r, d)) * (1 - smooth(occReach(near) - 0.15, occReach(near), h));
  }
  const fc = f * OCC_MAX;
  if (near <= 0) return fc;
  const dw = Math.hypot(wx, wy, wz);
  let de = dw;
  if (occSide(near)) {
    const c = (wx * abx + wy * aby + wz * abz) / Math.max(1e-6, dw * Math.sqrt(len2));
    de *= OCC_SIDE_SCALE + (1 - OCC_SIDE_SCALE) * smooth(0.8, 0.93, c);
  }
  return Math.max(fc, (1 - smooth(near * 0.5, near, de)) * OCC_MAX_NEAR);
}

const VERT_HEAD = /* glsl */ `
varying vec3 vOccW;`;
const VERT_BODY = /* glsl */ `
{
  vec4 occP = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  occP = instanceMatrix * occP;
  #endif
  vOccW = (modelMatrix * occP).xyz;
}`;
const FRAG_HEAD = /* glsl */ `
varying vec3 vOccW;
uniform vec3 uOccCam; uniform vec3 uOccCar; uniform float uOccOn;
float occBayer(vec2 p) {
  // 4×4 ordered dither: a stable screen pattern (no shimmer when the camera is still)
  vec2 q = mod(floor(p), 4.0);
  float a = mod(q.x, 2.0), b = mod(q.y, 2.0), c = floor(q.x / 2.0), d = floor(q.y / 2.0);
  float v = 8.0 * mod(a + b, 2.0) + 4.0 * b + 2.0 * mod(c + d, 2.0) + d;
  return (v + 0.5) / 16.0;
}`;
const fragBody = (near: number) => /* glsl */ `
if (uOccOn > 0.5) {
  vec3 ab = uOccCar - uOccCam;
  vec3 w = vOccW - uOccCam;
  float h = dot(w, ab) / max(1e-6, dot(ab, ab));
  float f = 0.0;
  if (h > 0.0 && h < ${occReach(near).toFixed(2)}) {
    float hc = min(1.0, h);
    float r = mix(${OCC_R_CAM.toFixed(3)}, ${OCC_R_CAR.toFixed(3)}, hc);
    f = (1.0 - smoothstep(r * 0.7, r, length(w - ab * hc))) * (1.0 - smoothstep(${(occReach(near) - 0.15).toFixed(2)}, ${occReach(near).toFixed(2)}, h));
  }
  f *= ${OCC_MAX.toFixed(3)};
  ${
    near > 0
      ? `float de = length(w);
  ${occSide(near) ? `de *= mix(${OCC_SIDE_SCALE.toFixed(3)}, 1.0, smoothstep(0.8, 0.93, dot(w, ab) / max(1e-6, length(w) * length(ab))));` : ''}
  f = max(f, (1.0 - smoothstep(${(near * 0.5).toFixed(3)}, ${near.toFixed(3)}, de)) * ${OCC_MAX_NEAR.toFixed(3)});`
      : ''
  }
  if (f > occBayer(gl_FragCoord.xy)) discard;
}`;

/**
 * Adds the fade to a material, after (and without disturbing) any onBeforeCompile it already has. `near` also fades
 * whatever is within a few metres of the lens (boards and landmark parts; not building walls, which the camera's own
 * wall check already keeps out of).
 */
export function addOcclusionFade<M extends THREE.Material>(mat: M, opts: { near?: number } = {}): M {
  const near = opts.near ?? 0;
  const prev = mat.onBeforeCompile;
  const prevSrc = prev.toString();
  const prevKey = mat.customProgramCacheKey.bind(mat);
  const keyBefore = prevKey();
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    Object.assign(sh.uniforms, OCC);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>${VERT_HEAD}`).replace('#include <project_vertex>', `#include <project_vertex>${VERT_BODY}`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>${FRAG_HEAD}`).replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>${fragBody(near)}`);
  };
  // the program cache keys on onBeforeCompile's source, which is this wrapper for every faded material: keep the
  // wrapped material's own key in it so two different shaders never share one program
  mat.customProgramCacheKey = () => `${keyBefore}|${prevSrc}|occ${near}`;
  return mat;
}

/** per frame: where the camera is and the car's body centre; off while the camera is not chasing */
export function updateOcclusion(cam: THREE.Vector3, car: THREE.Vector3, on: boolean) {
  OCC.uOccCam.value.copy(cam);
  OCC.uOccCar.value.copy(car);
  OCC.uOccOn.value = on ? 1 : 0;
}

/**
 * Test hook: casts rays from the camera to points on the taxi's body and counts the hits that would stay opaque
 * (anything solid in front of the car that the fade does not take away). Also counts unfaded board/landmark hits
 * within the lens sphere along a coarse grid of screen rays (the "board fills the corner of the screen" case).
 */
export function sightCheck(scene: THREE.Scene, cam: THREE.Camera, car: THREE.Object3D, faded: Map<THREE.Object3D, number>) {
  const rc = new THREE.Raycaster();
  const carC = car.position.clone().add(new THREE.Vector3(0, OCC_CAR_LIFT, 0));
  const q = car.quaternion;
  const pts = [
    [0, 0.3, 0],
    [0.8, 0.5, -1.8],
    [-0.8, 0.5, -1.8],
    [0.8, 0.5, 1.8],
    [-0.8, 0.5, 1.8],
    [0, 0.85, 0],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z).applyQuaternion(q).add(car.position));
  const skip = new Set<THREE.Object3D>();
  car.traverse((o) => skip.add(o));
  const solid = (o: THREE.Object3D) => {
    if (skip.has(o) || !o.visible) return false;
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (!m || m.transparent || !(o as THREE.Mesh).isMesh) return false;
    let p: THREE.Object3D | null = o;
    while (p) {
      if (p === cam) return false; // speed streaks ride on the camera
      p = p.parent;
    }
    return true;
  };
  const blockers: string[] = [];
  let rays = 0;
  for (const pt of pts) {
    const dir = pt.clone().sub(cam.position);
    const dist = dir.length();
    rc.set(cam.position, dir.normalize());
    rc.far = dist - 0.05;
    rays++;
    for (const h of rc.intersectObjects(scene.children, true)) {
      if (!solid(h.object)) continue;
      const near = faded.get(h.object);
      if (near !== undefined && occlusionFade(h.point, cam.position, carC, near) > 0.5) continue;
      blockers.push(`${h.object.name || h.object.type}@${h.distance.toFixed(1)}`);
      break;
    }
  }
  // near-lens check: a grid of screen rays, anything a fading mesh draws within the lens sphere must be faded
  let nearHits = 0;
  for (let i = -3; i <= 3; i++)
    for (let j = -3; j <= 3; j++) {
      rc.setFromCamera(new THREE.Vector2(i / 3.2, j / 3.2), cam);
      for (const h of rc.intersectObjects([...faded.keys()], false)) {
        const near = faded.get(h.object) ?? 0;
        if (h.distance < near * 0.5 && occlusionFade(h.point, cam.position, carC, near) < 0.5) nearHits++;
        break;
      }
    }
  return { rays, blocked: blockers.length, blockers, nearHits };
}
