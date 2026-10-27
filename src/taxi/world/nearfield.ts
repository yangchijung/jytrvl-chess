// Rush Taxi: "near-field" instancing for small, numerous street detail (rooftop tanks and sheds, air conditioners,
// balconies). One InstancedMesh holds every item, but only the items within `radius` of the camera are copied into
// its instance buffer; the set is refreshed when the camera has moved `margin` metres. The whole city's detail then
// costs one draw call per kind and only the triangles near the camera, with no popping inside the radius.
import * as THREE from 'three';

export interface NearItem {
  x: number;
  y: number;
  z: number;
  yaw?: number;
  /** then a tip about the item's own x axis (radians) */
  tilt?: number;
  /** scale (default 1, 1, 1) */
  s?: THREE.Vector3;
  color?: string;
}

const CELL = 64;

/** the indices of the items within `r` of (x, z), using a cell grid built by `nearGrid` (pure, for tests) */
export function nearIndices(grid: Map<number, number[]>, xs: Float32Array, zs: Float32Array, x: number, z: number, r: number): number[] {
  const out: number[] = [];
  const r2 = r * r;
  for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++)
    for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++)
      for (const k of grid.get((i + 1000) * 4096 + (j + 1000)) ?? []) {
        const dx = xs[k] - x,
          dz = zs[k] - z;
        if (dx * dx + dz * dz <= r2) out.push(k);
      }
  return out;
}
export function nearGrid(xs: Float32Array, zs: Float32Array) {
  const grid = new Map<number, number[]>();
  for (let k = 0; k < xs.length; k++) {
    const key = (Math.floor(xs[k] / CELL) + 1000) * 4096 + (Math.floor(zs[k] / CELL) + 1000);
    (grid.get(key) ?? grid.set(key, []).get(key)!).push(k);
  }
  return grid;
}

/**
 * @param radius   items within this distance of the camera are drawn
 * @param opts.shadowOnly  draw nothing in the colour pass, only into the sun's shadow map (a near-field shadow caster
 *                 for meshes that are too big to cast shadows themselves)
 */
export function nearField(geo: THREE.BufferGeometry, mat: THREE.Material, items: NearItem[], radius: number, opts: { shadow?: boolean; margin?: number; shadowOnly?: boolean } = {}) {
  const n = items.length;
  const margin = opts.margin ?? 30;
  const xs = new Float32Array(n),
    zs = new Float32Array(n);
  const mats = new Float32Array(n * 16);
  const cols = items.some((it) => it.color) ? new Float32Array(n * 3) : null;
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0),
    one = new THREE.Vector3(1, 1, 1),
    p = new THREE.Vector3(),
    qt = new THREE.Quaternion(),
    ax = new THREE.Vector3(1, 0, 0),
    c = new THREE.Color();
  items.forEach((it, k) => {
    xs[k] = it.x;
    zs[k] = it.z;
    q.setFromAxisAngle(up, it.yaw ?? 0);
    if (it.tilt) q.multiply(qt.setFromAxisAngle(ax, it.tilt));
    m4.compose(p.set(it.x, it.y, it.z), q, it.s ?? one);
    m4.toArray(mats, k * 16);
    if (cols) {
      c.set(it.color ?? '#FFFFFF');
      cols.set([c.r, c.g, c.b], k * 3);
    }
  });
  const grid = nearGrid(xs, zs);
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
  if (cols) mesh.setColorAt(0, c);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = opts.shadowOnly || (opts.shadow ?? false);
  mesh.receiveShadow = !opts.shadowOnly;
  let cx = Infinity,
    cz = Infinity,
    active = 0,
    pending = -1;
  /** called before each draw: the buffers written on the previous call have been uploaded by now */
  const refresh = (camera: THREE.Camera) => {
    if (pending >= 0) {
      active = pending;
      pending = -1;
    }
    const x = camera.position.x,
      z = camera.position.z;
    if (Math.hypot(x - cx, z - cz) < margin) return;
    cx = x;
    cz = z;
    const idx = nearIndices(grid, xs, zs, x, z, radius + margin);
    const im = mesh.instanceMatrix.array as Float32Array;
    const ic = mesh.instanceColor?.array as Float32Array | undefined;
    idx.forEach((k, i) => {
      im.set(mats.subarray(k * 16, k * 16 + 16), i * 16);
      if (ic && cols) ic.set(cols.subarray(k * 3, k * 3 + 3), i * 3);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // until the upload, draw no more than the instances that are already valid on the GPU
    active = Math.min(active, idx.length);
    pending = idx.length;
  };
  if (opts.shadowOnly) {
    mesh.onBeforeShadow = (_r, _o, camera) => {
      refresh(camera);
      mesh.count = active;
    };
    // no colour-pass draw at all (a zero count issues no draw call)
    mesh.onBeforeRender = () => {
      mesh.count = 0;
    };
  } else
    mesh.onBeforeRender = (_r, _s, camera) => {
      refresh(camera);
      mesh.count = active;
    };
  return mesh;
}
