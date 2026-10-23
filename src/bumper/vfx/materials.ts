// Crazy Bumper — shared materials and a tiny geometry builder. Spec 4.1: three-step toon shading for cars, the
// arena and rails; glossy plastic (roughness 0.25, metalness 0.1) for bumper posts and, in P2, boxes and crown.
// Parts of one object are merged into one vertex-coloured mesh so a whole car costs a handful of draw calls.
import * as THREE from 'three';

let ramp: THREE.DataTexture | null = null;
/** the three light steps of the toon look: shadow, mid, lit */
export function toonRamp(): THREE.DataTexture {
  if (ramp) return ramp;
  const data = new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]);
  ramp = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  return ramp;
}

export const toon = (p: THREE.MeshToonMaterialParameters = {}) => new THREE.MeshToonMaterial({ gradientMap: toonRamp(), ...p });
export const glossy = (color: THREE.ColorRepresentation, p: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.1, ...p });

/** collects coloured primitives, then bakes them into one geometry with a colour attribute */
export class Parts {
  private list: { g: THREE.BufferGeometry; c: THREE.Color; uv?: [number, number] }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  add(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, at: { p?: [number, number, number]; r?: [number, number, number]; s?: [number, number, number] } = {}, uv?: [number, number]): this {
    const geo = (g.index ? g.toNonIndexed() : g.clone()) as THREE.BufferGeometry;
    this.e.set(...(at.r ?? [0, 0, 0]));
    this.q.setFromEuler(this.e);
    this.m.compose(new THREE.Vector3(...(at.p ?? [0, 0, 0])), this.q, new THREE.Vector3(...(at.s ?? [1, 1, 1])));
    geo.applyMatrix4(this.m);
    this.list.push({ g: geo, c: new THREE.Color(color), uv });
    return this;
  }

  /** mirrored pair on ±x */
  pair(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, at: { p: [number, number, number]; r?: [number, number, number]; s?: [number, number, number] }): this {
    const [x, y, z] = at.p;
    const [rx, ry, rz] = at.r ?? [0, 0, 0];
    this.add(g, color, { ...at, p: [x, y, z], r: [rx, ry, rz] });
    return this.add(g, color, { ...at, p: [-x, y, z], r: [rx, -ry, -rz] });
  }

  build(): THREE.BufferGeometry {
    const total = this.list.reduce((n, p) => n + p.g.attributes.position.count, 0);
    const pos = new Float32Array(total * 3),
      nor = new Float32Array(total * 3),
      col = new Float32Array(total * 3),
      uv = new Float32Array(total * 2);
    let o = 0;
    for (const p of this.list) {
      const n = p.g.attributes.position.count;
      pos.set(p.g.attributes.position.array as Float32Array, o * 3);
      nor.set(p.g.attributes.normal.array as Float32Array, o * 3);
      for (let i = 0; i < n; i++) {
        col[(o + i) * 3] = p.c.r;
        col[(o + i) * 3 + 1] = p.c.g;
        col[(o + i) * 3 + 2] = p.c.b;
        uv[(o + i) * 2] = p.uv ? p.uv[0] : 0.5;
        uv[(o + i) * 2 + 1] = p.uv ? p.uv[1] : 0.5;
      }
      o += n;
      p.g.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}
