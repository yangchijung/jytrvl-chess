// Rush Taxi — the taxi itself: a low-poly Taiwanese cab (taxi yellow #FFC72C, black trim, roof sign) built from an
// extruded side profile with wheel arches, a tinted glass house with yellow pillars and roof, bumpers, grille,
// lights (the tail lights glow brighter when braking), mirrors, door seams and plates. The driver sits on the left
// and sways with the car: leans out in corners, sinks back on the gas, rocks on landings. Few draw calls: one
// merged mesh with vertex colours for the paint and trim, one for the glass, one for the lights.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const C = { paint: '#FFC72C', trim: '#262A30', grille: '#1B1E23', chrome: '#C9CED6', glass: '#2C4258', head: '#FFF4D6', tail: '#E53935', plate: '#F5F5F5', skin: '#F1C9A5', shirt: '#F5F5F5', hair: '#2B2B2B', vest: '#1E5AA8' };

export function colored(g: THREE.BufferGeometry, color: string) {
  const c = new THREE.Color(color);
  const g2 = g.index ? g.toNonIndexed() : g;
  const n = g2.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g2.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g2.deleteAttribute('uv');
  return g2;
}
export const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string, rx = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return colored(g, color);
};
/** extrude a side profile drawn in (z, y) across the car's width (x) */
export function sideExtrude(pts: [number, number][], width: number, color: string, arches: [number, number, number][] = [], bevel = 0.04) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (const [z, y] of pts.slice(1)) s.lineTo(z, y);
  // the bottom edge, front to back, with an arch over each wheel: [centre z, centre y, radius]
  const bottom = pts[pts.length - 1][1];
  for (const [cz, cy, r] of arches) {
    const dz = Math.sqrt(Math.max(0, r * r - (bottom - cy) ** 2));
    s.lineTo(cz + dz, bottom);
    const a = Math.atan2(bottom - cy, dz);
    s.absarc(cz, cy, r, a, Math.PI - a, false);
  }
  s.lineTo(pts[0][0], pts[0][1]);
  const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 10 });
  g.rotateY(-Math.PI / 2);
  g.translate(width / 2 - bevel, 0, 0);
  return colored(g, color);
}
/** a thin bar from (z0, y0) to (z1, y1) at side x */
export function pillar(x: number, z0: number, y0: number, z1: number, y1: number, color: string, t = 0.07) {
  const len = Math.hypot(z1 - z0, y1 - y0);
  const g = new THREE.BoxGeometry(t, t, len);
  g.rotateX(-Math.atan2(y1 - y0, z1 - z0));
  g.translate(x, (y0 + y1) / 2, (z0 + z1) / 2);
  return colored(g, color);
}
/** "計程車" on the front doors, like Taiwanese cabs */
function doorTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 72;
  const x = c.getContext('2d')!;
  x.fillStyle = '#23303F';
  x.font = '900 56px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('計程車', 128, 40);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function signTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 80;
  const x = c.getContext('2d')!;
  x.fillStyle = '#FFFFFF';
  x.fillRect(0, 0, 256, 80);
  x.fillStyle = '#23303F';
  x.font = '900 54px system-ui, "Noto Sans TC", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('TAXI', 128, 44);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface TaxiModel {
  group: THREE.Group;
  wheels: THREE.Object3D[];
  /** per frame: steering (−1…1, + = right), throttle (0…1), braking, airborne, a short bump after a landing (0…1) */
  animate(o: { steer: number; throttle: number; braking: boolean; airborne: boolean; bump: number; dt: number }): void;
}

export function buildTaxi(wheelRadius: number): TaxiModel {
  const group = new THREE.Group();
  const W = 1.8;
  const R = wheelRadius;
  // ---------- paint and trim (one merged mesh) ----------
  const lower = sideExtrude(
    [
      [-2.02, -0.24],
      [-2.08, 0.04],
      [-2.03, 0.27],
      [-1.9, 0.35],
      [-1.25, 0.38],
      [1.0, 0.37],
      [1.78, 0.3],
      [2.05, 0.17],
      [2.08, -0.04],
      [2.02, -0.24],
    ],
    W,
    C.paint,
    [
      [1.35, -0.47, R + 0.08],
      [-1.35, -0.47, R + 0.08],
    ],
  );
  const parts = [lower];
  // glass house frame: roof, A / B / C pillars (yellow), black rubber sills
  const roofY = 0.88;
  parts.push(box(1.62, 0.06, 1.22, 0, roofY + 0.02, -0.28, C.paint));
  for (const s of [-1, 1]) {
    const x = s * 0.79;
    parts.push(pillar(x, 1.0, 0.37, 0.32, roofY, C.paint)); // A
    parts.push(pillar(x, -1.27, 0.37, -0.88, roofY, C.paint)); // C
    parts.push(box(0.07, 0.5, 0.09, x, 0.62, -0.22, C.paint)); // B
    parts.push(box(0.05, 0.04, 2.2, x, 0.38, -0.12, C.trim)); // window sill seal
    // door seams, a side skirt and the mirror
    parts.push(box(0.012, 0.52, 0.012, s * 0.905, 0.08, 0.28, C.trim));
    parts.push(box(0.012, 0.52, 0.012, s * 0.905, 0.08, -0.75, C.trim));
    parts.push(box(0.04, 0.1, 2.0, s * 0.89, -0.24, -0.02, C.trim));
    parts.push(box(0.16, 0.1, 0.22, s * 0.98, 0.42, 0.82, C.paint));
    parts.push(box(0.1, 0.04, 0.03, s * 0.93, 0.42, 0.88, C.trim));
    // door handles
    parts.push(box(0.03, 0.03, 0.14, s * 0.91, 0.24, 0.12, C.trim));
    parts.push(box(0.03, 0.03, 0.14, s * 0.91, 0.24, -0.9, C.trim));
  }
  // bumpers, grille, plates
  parts.push(box(1.84, 0.2, 0.12, 0, -0.16, 2.06, C.trim));
  parts.push(box(1.84, 0.2, 0.12, 0, -0.16, -2.05, C.trim));
  parts.push(box(0.86, 0.14, 0.04, 0, 0.06, 2.07, C.grille));
  parts.push(box(0.44, 0.13, 0.02, 0, -0.16, 2.125, C.plate));
  parts.push(box(0.44, 0.13, 0.02, 0, 0.0, -2.105, C.plate));
  parts.push(box(1.5, 0.012, 0.012, 0, 0.3, -1.6, C.trim)); // trunk lid seam
  // the cabin inside, seen through the glass: dark floor, seats
  parts.push(box(1.58, 0.02, 2.2, 0, 0.385, -0.13, '#3A3F47'));
  parts.push(box(0.5, 0.42, 0.12, 0.38, 0.6, -0.48, '#4A4F57'));
  parts.push(box(0.5, 0.42, 0.12, -0.38, 0.6, -0.48, '#4A4F57'));
  parts.push(box(1.4, 0.4, 0.14, 0, 0.58, -1.08, '#4A4F57'));
  // roof sign base
  parts.push(box(0.5, 0.05, 0.2, 0, roofY + 0.07, -0.28, C.trim));
  const paint = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  paint.castShadow = true;
  paint.receiveShadow = true;

  // ---------- glass: a tinted house you can just see the driver through ----------
  const glass = sideExtrude(
    [
      [-1.24, 0.37],
      [-0.86, roofY - 0.01],
      [0.31, roofY - 0.01],
      [0.99, 0.37],
    ],
    1.56,
    C.glass,
    [],
    0.02,
  );
  const glassMesh = new THREE.Mesh(glass, new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.62, depthWrite: false }));

  // ---------- lights ----------
  const headMat = new THREE.MeshBasicMaterial({ color: C.head });
  const tailMat = new THREE.MeshBasicMaterial({ color: '#9E2A2A' });
  const lights = new THREE.Group();
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.05), headMat);
    h.position.set(s * 0.6, 0.13, 2.065);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.05), tailMat);
    t.position.set(s * 0.62, 0.2, -2.06);
    lights.add(h, t);
  }
  // roof sign with TAXI on front and back
  const tex = signTexture();
  const plain = new THREE.MeshLambertMaterial({ color: '#FFFFFF' });
  const signMat = new THREE.MeshLambertMaterial({ map: tex });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.22, 0.24), [plain, plain, plain, plain, signMat, signMat]);
  sign.position.set(0, roofY + 0.2, -0.28);
  sign.castShadow = true;

  // ---------- the driver (left seat), swaying with the car ----------
  const driver = new THREE.Group();
  driver.position.set(0.38, 0.1, -0.2);
  const dparts = [
    box(0.44, 0.46, 0.28, 0, 0.36, 0, C.shirt),
    box(0.46, 0.2, 0.3, 0, 0.18, 0, C.vest),
    box(0.11, 0.11, 0.42, -0.2, 0.42, 0.24, C.shirt, -0.5),
    box(0.11, 0.11, 0.42, 0.2, 0.42, 0.24, C.shirt, -0.5),
  ];
  const head = new THREE.SphereGeometry(0.14, 10, 8);
  head.translate(0, 0.72, 0.02);
  dparts.push(colored(head, C.skin));
  const hair = new THREE.SphereGeometry(0.145, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.2);
  hair.translate(0, 0.74, -0.005);
  dparts.push(colored(hair, C.hair));
  const wheelRing = new THREE.TorusGeometry(0.17, 0.025, 6, 16);
  wheelRing.rotateX(-0.9);
  wheelRing.translate(0, 0.42, 0.5);
  dparts.push(colored(wheelRing, C.trim));
  const driverMesh = new THREE.Mesh(mergeGeometries(dparts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  driver.add(driverMesh);

  // door lettering, both sides (each reads correctly from its own side)
  const doorMat = new THREE.MeshBasicMaterial({ map: doorTexture(), transparent: true, depthWrite: false });
  for (const s of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.22), doorMat);
    d.position.set(s * 0.915, 0.06, -0.24);
    d.rotation.y = s * Math.PI / 2;
    group.add(d);
  }
  group.add(paint, glassMesh, lights, sign, driver);

  // ---------- wheels: tyre, silver rim, dark hub ----------
  const wparts = [];
  const tyre = new THREE.CylinderGeometry(R, R, 0.26, 18);
  tyre.rotateZ(Math.PI / 2);
  wparts.push(colored(tyre, C.trim));
  for (const s of [-1, 1]) {
    const rim = new THREE.CylinderGeometry(R * 0.62, R * 0.62, 0.02, 12);
    rim.rotateZ(Math.PI / 2);
    rim.translate(s * 0.135, 0, 0);
    wparts.push(colored(rim, C.chrome));
    const hub = new THREE.CylinderGeometry(R * 0.2, R * 0.2, 0.03, 8);
    hub.rotateZ(Math.PI / 2);
    hub.translate(s * 0.145, 0, 0);
    wparts.push(colored(hub, C.grille));
    // five spokes so the wheel visibly turns
    for (let k = 0; k < 5; k++) {
      const sp = new THREE.BoxGeometry(0.025, R * 0.5, 0.05);
      sp.translate(s * 0.14, R * 0.32, 0);
      sp.rotateX((k / 5) * Math.PI * 2);
      wparts.push(colored(sp, C.grille));
    }
  }
  const wheelGeo = mergeGeometries(wparts);
  const wheelMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const wheels = [0, 1, 2, 3].map(() => {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.castShadow = true;
    return w;
  });

  // ---------- motion ----------
  let lean = 0,
    sink = 0;
  const animate: TaxiModel['animate'] = ({ steer, throttle, braking, airborne, bump, dt }) => {
    const k = 1 - Math.exp(-dt * 8);
    // corners push the driver outwards (a right turn leans them left = +x), the gas presses them back
    lean += (steer * 0.22 - lean) * k;
    sink += ((airborne ? -0.1 : throttle * 0.12 - (braking ? 0.1 : 0)) - sink) * k;
    driver.rotation.z = lean;
    driver.rotation.x = -sink;
    driver.position.y = 0.1 + Math.sin(performance.now() / 45) * 0.025 * bump;
    tailMat.color.set(braking ? '#FF3B30' : '#9E2A2A');
  };
  return { group, wheels, animate };
}

/** a plain sedan for the traffic: `paint` is white (the instance colour tints it), `detail` carries its own colours */
export function sedanGeometry() {
  const W = 2.0;
  const paint = [
    sideExtrude(
      [
        [-2.0, -0.5],
        [-2.06, -0.2],
        [-2.0, 0.05],
        [-1.25, 0.1],
        [1.05, 0.1],
        [1.95, 0.02],
        [2.08, -0.2],
        [2.02, -0.5],
      ],
      W,
      '#FFFFFF',
      [
        [1.3, -0.62, 0.42],
        [-1.3, -0.62, 0.42],
      ],
    ),
    box(1.78, 0.06, 1.2, 0, 0.66, -0.25, '#FFFFFF'),
  ];
  for (const s of [-1, 1]) {
    paint.push(pillar(s * 0.86, 1.05, 0.1, 0.35, 0.64, '#FFFFFF'));
    paint.push(pillar(s * 0.86, -1.25, 0.1, -0.85, 0.64, '#FFFFFF'));
  }
  const detail = [
    sideExtrude(
      [
        [-1.24, 0.09],
        [-0.86, 0.63],
        [0.34, 0.63],
        [1.04, 0.09],
      ],
      1.7,
      '#33475C',
      [],
      0.02,
    ),
    box(2.04, 0.22, 0.14, 0, -0.42, 2.05, '#262A30'),
    box(2.04, 0.22, 0.14, 0, -0.42, -2.03, '#262A30'),
  ];
  for (const s of [-1, 1]) {
    detail.push(box(0.4, 0.1, 0.04, s * 0.66, -0.1, 2.075, '#FFF4D6'));
    detail.push(box(0.36, 0.1, 0.04, s * 0.68, -0.05, -2.06, '#C62828'));
    for (const z of [1.3, -1.3]) {
      const t = new THREE.CylinderGeometry(0.36, 0.36, 0.24, 10);
      t.rotateZ(Math.PI / 2);
      t.translate(s * 0.86, -0.62, z);
      detail.push(colored(t, '#1E2228'));
    }
  }
  return { paint: mergeGeometries(paint), detail: mergeGeometries(detail) };
}
