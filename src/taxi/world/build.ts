// Rush Taxi — makes a level real: Rapier colliders for everything solid, and a Three.js scene drawn in very few
// draw calls (one instanced mesh for all plain boxes, one merged mesh with vertex colours for all landmark shapes,
// one merged mesh for all name boards from a single text atlas, instanced lots, road marks and trees).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { wedgePoints } from './greybox';
import type { Level, Prim, Shape } from './level';
import { buildingMaterial, drawDecor, waterMaterial } from './decor';

type R = typeof RAPIER_NS;
const rotY = (yaw = 0) => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
export const LOOK = { asphalt: '#3A3F47', grass: '#7DA453', sea: '#1E88E5', river: '#2B8FD6', trunk: '#6D4C41', crown: '#4CAF50', ink: '#23303F' };

/** colliders for the whole level; returns the handles that never count as a crash and the moving props */
export function buildPhysics(RAPIER: R, world: RAPIER_NS.World, level: Level) {
  const soft = new Set<number>();
  for (const g of level.ground) soft.add(world.createCollider(RAPIER.ColliderDesc.cuboid(g.size[0] / 2, g.size[1] / 2, g.size[2] / 2).setTranslation(...g.p).setFriction(1)).handle);
  if (level.water) {
    const w = level.water;
    soft.add(world.createCollider(RAPIER.ColliderDesc.cuboid((w.x1 - w.x0) / 2, 0.5, (w.z1 - w.z0) / 2 + 1).setTranslation((w.x0 + w.x1) / 2, w.floor - 0.5, (w.z0 + w.z1) / 2).setFriction(0.6)).handle);
  }
  const dynamics: { b: RAPIER_NS.RigidBody; s: Extract<Shape, { kind: 'box' }> }[] = [];
  for (const s of level.shapes) {
    if (s.kind === 'box' && s.dynamic) {
      const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...s.p));
      soft.add(world.createCollider(RAPIER.ColliderDesc.cuboid(s.size[0] / 2, s.size[1] / 2, s.size[2] / 2).setDensity(40).setRestitution(0.3), b).handle);
      dynamics.push({ b, s });
    } else if (s.kind === 'box') {
      const flat = s.size[1] <= 0.7 && s.p[1] <= 0; // bridge decks: part of the road
      const c = world.createCollider(RAPIER.ColliderDesc.cuboid(s.size[0] / 2, s.size[1] / 2, s.size[2] / 2).setTranslation(...s.p).setRotation(rotY(s.yaw)).setRestitution(0.2).setFriction(flat ? 1 : 0.4));
      if (flat) soft.add(c.handle);
    } else if (s.kind === 'wedge') {
      const d = RAPIER.ColliderDesc.convexHull(new Float32Array(wedgePoints(s.size).flat()));
      if (d) soft.add(world.createCollider(d.setTranslation(...s.p).setRotation(rotY(s.yaw)).setFriction(1)).handle);
    } else if (s.kind === 'cyl') world.createCollider(RAPIER.ColliderDesc.cylinder(s.h / 2, s.r).setTranslation(...s.p).setRestitution(0.2).setFriction(0.4));
    else world.createCollider(RAPIER.ColliderDesc.ball(s.r).setTranslation(...s.p).setRestitution(0.2).setFriction(0.4));
  }
  for (const t of level.trees) world.createCollider(RAPIER.ColliderDesc.cylinder(2, 0.45).setTranslation(t.x, 2, t.z).setRestitution(0.2));
  return { soft, dynamics };
}

function primGeometry(p: Prim) {
  let g: THREE.BufferGeometry;
  if (p.t === 'box') g = new THREE.BoxGeometry(p.sx, p.sy, p.sz);
  else if (p.t === 'cyl') g = new THREE.CylinderGeometry(p.r, p.r, p.h, 18);
  else if (p.t === 'cone') {
    g = new THREE.ConeGeometry(p.r, Math.abs(p.h), 18);
    if (p.h < 0) g.rotateX(Math.PI);
  } else if (p.t === 'sph') g = new THREE.SphereGeometry(p.r, 16, 12);
  else {
    g = new THREE.TorusGeometry(p.R, p.tube, 8, 40);
    g.rotateY(p.yaw);
  }
  g.translate(p.x, p.y, p.z);
  const c = new THREE.Color(p.color);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** one text atlas for every board: white bold name on the dark board colour, auto-fitted to the cell */
function signAtlas(names: string[]) {
  const cw = 512,
    ch = 128,
    cols = 4,
    rows = Math.max(1, Math.ceil(names.length / cols));
  const c = document.createElement('canvas');
  c.width = cw * cols;
  c.height = ch * rows;
  const x = c.getContext('2d')!;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  names.forEach((name, i) => {
    const cx = (i % cols) * cw,
      cy = Math.floor(i / cols) * ch;
    x.fillStyle = LOOK.ink;
    x.fillRect(cx + 2, cy + 2, cw - 4, ch - 4);
    x.strokeStyle = '#FFC72C';
    x.lineWidth = 6;
    x.strokeRect(cx + 8, cy + 8, cw - 16, ch - 16);
    let size = 76;
    const font = (s: number) => `900 ${s}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif`;
    x.font = font(size);
    while (x.measureText(name).width > cw - 48 && size > 30) x.font = font((size -= 4));
    x.fillStyle = '#FFFFFF';
    x.fillText(name, cx + cw / 2, cy + ch / 2 + 4);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, cols, rows };
}

export function buildScene(scene: THREE.Scene, level: Level, lang: 'zh' | 'en') {
  const lambert = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);

  const seaWater = waterMaterial(LOOK.sea);
  const riverWater = waterMaterial(LOOK.river);
  // ---------- ground, outside, water ----------
  if (level.id === 'test') {
    const S = level.bounds * 2;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(S, S), lambert(LOOK.asphalt));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    const grid = new THREE.GridHelper(S, S / 10, '#5A616B', '#4A5059');
    grid.position.y = 0.02;
    scene.add(ground, grid);
  } else {
    for (const g of level.ground) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...g.size), lambert(LOOK.asphalt));
      m.position.set(...g.p);
      m.receiveShadow = true;
      scene.add(m);
    }
    // grass all around outside the walls (strips, so nothing covers the river), the sea to the west
    const B = level.bounds + 2,
      far = 1500;
    for (const [x0, x1, z0, z1] of [
      [-B, far, B, far],
      [-B, far, -far, -B],
      [B, far, -B, B],
    ]) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), lambert(LOOK.grass));
      g.rotation.x = -Math.PI / 2;
      g.position.set((x0 + x1) / 2, -0.08, (z0 + z1) / 2);
      scene.add(g);
    }
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(far, far * 2), seaWater.mat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(-B - far / 2, -0.6, 0);
    scene.add(sea);
  }
  if (level.water) {
    const w = level.water;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(w.x1 - w.x0, w.z1 - w.z0), riverWater.mat);
    water.rotation.x = -Math.PI / 2;
    water.position.set((w.x0 + w.x1) / 2, w.y, (w.z0 + w.z1) / 2);
    scene.add(water);
  }

  // ---------- flat patches: block lots and road marks (instanced quads) ----------
  const quads = (rects: Level['lots'], y: number) => {
    if (!rects.length) return;
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial(), rects.length);
    rects.forEach((r, i) => {
      m4.compose(new THREE.Vector3(r.x, y, r.z), q.identity(), new THREE.Vector3(r.w, 1, r.d));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, new THREE.Color(r.color));
    });
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  quads(level.lots, 0.03);
  quads(level.marks, 0.045);

  // ---------- plain boxes (buildings, rails, walls, decks) in one instanced mesh ----------
  const all = level.shapes.filter((s): s is Extract<Shape, { kind: 'box' }> => s.kind === 'box' && !s.dynamic && !s.hidden);
  const boxes = all.filter((s) => s.look === undefined);
  const blds = all.filter((s) => s.look !== undefined);
  if (blds.length) {
    // buildings: windows, arcades and roofs drawn by the shader from each building's look
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.setAttribute('aLook', new THREE.InstancedBufferAttribute(new Float32Array(blds.map((s) => s.look ?? 0)), 1));
    const inst = new THREE.InstancedMesh(geo, buildingMaterial(), blds.length);
    blds.forEach((s, i) => {
      m4.compose(new THREE.Vector3(...s.p), q.setFromAxisAngle(up, s.yaw ?? 0), new THREE.Vector3(...s.size));
      inst.setMatrixAt(i, m4);
      inst.setColorAt(i, new THREE.Color(s.color));
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    scene.add(inst);
  }
  if (boxes.length) {
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ flatShading: true }), boxes.length);
    boxes.forEach((s, i) => {
      m4.compose(new THREE.Vector3(...s.p), q.setFromAxisAngle(up, s.yaw ?? 0), new THREE.Vector3(...s.size));
      inst.setMatrixAt(i, m4);
      inst.setColorAt(i, new THREE.Color(s.color));
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    scene.add(inst);
  }
  // ---------- ramps ----------
  const wedges = level.shapes.filter((s): s is Extract<Shape, { kind: 'wedge' }> => s.kind === 'wedge');
  if (wedges.length) {
    const tri = [0, 2, 4, 1, 5, 3, 0, 4, 5, 0, 5, 1, 2, 3, 5, 2, 5, 4];
    const parts = wedges.map((s) => {
      const pts = wedgePoints(s.size);
      const pos: number[] = [];
      for (const i of tri) pos.push(...pts[i]);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.rotateY(s.yaw ?? 0);
      g.translate(...s.p);
      g.computeVertexNormals();
      const c = new THREE.Color(s.color);
      g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: pos.length / 3 }, () => [c.r, c.g, c.b]).flat(), 3));
      return g;
    });
    const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);
  }
  // ---------- landmarks: one merged mesh with vertex colours ----------
  if (level.prims.length) {
    const mesh = new THREE.Mesh(mergeGeometries(level.prims.map(primGeometry)), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  // ---------- name boards: one atlas, one merged mesh (front and back faces both read correctly) ----------
  if (level.signs.length) {
    const names = [...new Set(level.signs.map((s) => s.name[lang]))];
    const { tex, cols, rows } = signAtlas(names);
    const parts: THREE.BufferGeometry[] = [];
    for (const s of level.signs) {
      const i = names.indexOf(s.name[lang]);
      const u0 = (i % cols) / cols,
        u1 = u0 + 1 / cols;
      const v1 = 1 - Math.floor(i / cols) / rows,
        v0 = v1 - 1 / rows;
      const big = !s.decor;
      for (const back of [false, true]) {
        const g = new THREE.PlaneGeometry(big ? 9 : 5, big ? 2.25 : 1.25);
        const uv = g.getAttribute('uv') as THREE.BufferAttribute;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) ? u1 : u0, uv.getY(k) ? v1 : v0);
        g.rotateY(s.yaw + (back ? Math.PI : 0));
        g.translate(s.x + Math.sin(s.yaw) * (back ? -0.03 : 0.03), s.y, s.z + Math.cos(s.yaw) * (back ? -0.03 : 0.03));
        parts.push(g);
      }
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshBasicMaterial({ map: tex }));
    scene.add(mesh);
  }
  // ---------- trees ----------
  if (level.trees.length) {
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.4, 1, 6), lambert(LOOK.trunk), level.trees.length);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ flatShading: true }), level.trees.length);
    level.trees.forEach((t, i) => {
      const th = t.h * 0.4;
      m4.compose(new THREE.Vector3(t.x, th / 2, t.z), q.identity(), new THREE.Vector3(1, th, 1));
      trunk.setMatrixAt(i, m4);
      const r = t.h * 0.32;
      m4.compose(new THREE.Vector3(t.x, th + r * 0.8, t.z), q.setFromAxisAngle(up, t.x * 0.37), new THREE.Vector3(r, r * 1.1, r));
      crown.setMatrixAt(i, m4);
      crown.setColorAt(i, new THREE.Color().setHSL(0.27 + ((t.x * 7 + t.z * 3) % 10) / 200, 0.5, 0.36 + ((t.z * 5) % 10) / 120));
    });
    trunk.castShadow = crown.castShadow = true;
    scene.add(trunk, crown);
  }
  // ---------- moving props ----------
  const props = level.shapes
    .filter((s): s is Extract<Shape, { kind: 'box' }> => s.kind === 'box' && !!s.dynamic)
    .map((s) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...s.size), lambert(s.color));
      mesh.castShadow = true;
      scene.add(mesh);
      return mesh;
    });
  const decor = level.decor ? drawDecor(scene, level) : null;
  return {
    props,
    /** per frame: moving water, boats, traffic lights (t = the traffic clock) */
    update(t: number, dt: number) {
      seaWater.uTime.value = t;
      riverWater.uTime.value = t;
      decor?.update(t, dt);
    },
  };
}
