// Rush Taxi — the street detail that makes the city read as a Taiwanese harbour town: building fronts drawn in the
// shader (windows with iron grilles, the shaded arcade at street level, glass towers, corrugated warehouses),
// rooftop water tanks and sheet-metal sheds, air conditioners, vertical shop signboards, rows of parked scooters,
// street lamps, painted kerbs, traffic lights that change, palms along the Love River, cruise boats, a sky with
// clouds and moving water. Everything is instanced or merged so the whole city stays at a few dozen draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Decor, Level } from './level';
import { SHOP_WORDS, SIGN_COLORS } from './city';
import { lightFor } from './traffic';

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const one = new THREE.Vector3(1, 1, 1);

function colored(g: THREE.BufferGeometry, color: string) {
  const c = new THREE.Color(color);
  const g2 = g.index ? g.toNonIndexed() : g;
  const n = g2.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g2.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g2.getAttribute('uv')) g2.deleteAttribute('uv');
  return g2;
}
const bx = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) => colored(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);
const cyl = (r0: number, r1: number, h: number, x: number, y: number, z: number, color: string, seg = 10) => colored(new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y, z), color);
const vc = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

type Item = { x: number; y: number; z: number; yaw?: number; s?: THREE.Vector3; color?: string };
/** one instanced mesh per 230 m tile, so the parts of the city behind the camera are skipped (frustum culling) */
const TILE = 230;
function tiles<T extends { x: number; z: number }>(items: T[]) {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const k = `${Math.floor(it.x / TILE)},${Math.floor(it.z / TILE)}`;
    (map.get(k) ?? map.set(k, []).get(k)!).push(it);
  }
  return [...map.values()];
}
function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, items: Item[], shadow = true) {
  if (!items.length) return null;
  const group = new THREE.Group();
  for (const part of items.length > 120 ? tiles(items) : [items]) {
    const mesh = new THREE.InstancedMesh(geo, mat, part.length);
    part.forEach((it, i) => {
      m4.compose(new THREE.Vector3(it.x, it.y, it.z), q.setFromAxisAngle(UP, it.yaw ?? 0), it.s ?? one);
      mesh.setMatrixAt(i, m4);
      if (it.color) mesh.setColorAt(i, new THREE.Color(it.color));
    });
    mesh.computeBoundingSphere();
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/**
 * Building walls: the instance colour is the paint; the shader adds floors and windows by world position, so it
 * works on every box size without textures. aLook: 0 house (small windows with iron grilles, an arcade at street
 * level), 1 glass tower, 2 hall, 3 corrugated warehouse with roller doors.
 */
export function buildingMaterial() {
  const mat = new THREE.MeshLambertMaterial({ flatShading: true });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aLook;
        varying vec3 vW; varying vec3 vNW; varying float vRoof; varying float vLook;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 wpos = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vW = wpos.xyz;
        vNW = normalize(mat3(modelMatrix * instanceMatrix) * normal);
        vRoof = (modelMatrix * instanceMatrix * vec4(0.0, 0.5, 0.0, 1.0)).y;
        vLook = aLook;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vW; varying vec3 vNW; varying float vRoof; varying float vLook;
        float hsh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float box2(vec2 p, vec2 a, vec2 b) { vec2 s = step(a, p) * step(p, b); return s.x * s.y; }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 paint = diffuseColor.rgb;
          if (abs(vNW.y) > 0.5) {
            // flat roof: concrete, a little darker, with a faint slab grid
            vec2 g = fract(vW.xz / 4.0);
            diffuseColor.rgb = mix(vec3(0.62, 0.63, 0.62), paint, 0.25) * (0.92 + 0.08 * step(0.03, min(g.x, g.y)));
          } else {
            float u = abs(vNW.x) > 0.5 ? vW.z : vW.x;
            float v = vW.y;
            int look = int(vLook + 0.5);
            vec3 glass = vec3(0.26, 0.36, 0.46);
            float top = vRoof - v;
            if (look == 3) {
              // warehouse: corrugated sheet, roller doors at street level, a strip of high windows
              float rib = 0.9 + 0.1 * step(0.5, fract(u / 0.7));
              diffuseColor.rgb = paint * rib;
              vec2 dc = vec2(fract(u / 9.0), v);
              if (box2(dc, vec2(0.18, 0.0), vec2(0.82, 4.6)) > 0.5) diffuseColor.rgb = vec3(0.72, 0.74, 0.76) * (0.92 + 0.08 * step(0.5, fract(v / 0.35)));
              if (top > 0.8 && top < 1.8 && fract(u / 3.0) > 0.25) diffuseColor.rgb = glass;
            } else {
              float fh = look == 1 ? 3.6 : look == 2 ? 3.8 : 3.0;
              float cw = look == 1 ? 1.8 : look == 2 ? 3.0 : 2.4;
              float ground = look == 1 ? 4.2 : 3.4;
              if (v < ground) {
                // street level: the shaded arcade (騎樓) with lit shop fronts between columns
                float col = fract(u / 4.0);
                diffuseColor.rgb = col < 0.12 ? paint * 0.9 : mix(vec3(0.18, 0.2, 0.22), vec3(0.85, 0.78, 0.6), step(0.6, v) * step(v, ground - 0.9) * 0.55);
              } else {
                vec2 cell = vec2(u / cw, (v - ground) / fh);
                vec2 f = fract(cell);
                float r = hsh(floor(cell) + vLook * 17.0);
                vec2 a = look == 1 ? vec2(0.06, 0.1) : look == 2 ? vec2(0.16, 0.3) : vec2(0.2, 0.28);
                vec2 b = look == 1 ? vec2(0.94, 0.92) : look == 2 ? vec2(0.84, 0.85) : vec2(0.8, 0.82);
                if (box2(f, a, b) > 0.5) {
                  vec3 w = glass * (0.82 + 0.4 * r) + (look == 1 ? vec3(0.08, 0.1, 0.12) * f.y : vec3(0.0));
                  // iron window grilles on the houses
                  if (look == 0) w *= 0.78 + 0.22 * step(0.22, fract(f.y * 6.0)) * step(0.18, fract(f.x * 5.0));
                  diffuseColor.rgb = w;
                } else if (look == 1) diffuseColor.rgb = paint * 0.85;
              }
              // parapet band under the roof edge
              if (top < 0.55) diffuseColor.rgb = paint * 1.12;
            }
          }
        }`,
      );
  };
  return mat;
}

/** the vertical signboards' text atlas: white words on black, one column per word, used as a mask */
function signAtlas() {
  const cw = 96,
    ch = 320,
    cols = 8,
    rows = Math.ceil(SHOP_WORDS.length / cols);
  const c = document.createElement('canvas');
  c.width = cw * cols;
  c.height = ch * rows;
  const x = c.getContext('2d')!;
  x.fillStyle = '#000';
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#FFF';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  SHOP_WORDS.forEach((w, i) => {
    const cx = (i % cols) * cw + cw / 2,
      cy = Math.floor(i / cols) * ch;
    const chars = [...w];
    const size = chars.length > 2 ? 70 : 78;
    x.font = `900 ${size}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif`;
    const step = (ch - 40) / chars.length;
    chars.forEach((k, j) => x.fillText(k, cx, cy + 20 + step * (j + 0.5)));
  });
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return { t, cols, rows };
}

export function drawDecor(scene: THREE.Scene, level: Level) {
  const d = level.decor as Decor;
  const mats: THREE.Material[] = [];
  const add = (o: THREE.Object3D | null) => o && scene.add(o);

  // ---------- rooftops ----------
  const tankGeo = mergeGeometries([cyl(0.62, 0.62, 1.3, 0, 1.45, 0, '#C9CED6', 12), cyl(0.64, 0.64, 0.08, 0, 2.12, 0, '#AEB4BC', 12), ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => bx(0.08, 0.8, 0.08, sx * 0.45, 0.4, sz * 0.45, '#5D6B78')))]);
  add(instanced(tankGeo, vc(), d.tanks));
  add(instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ flatShading: true }), d.sheds.map((s) => ({ x: s.x, y: s.y, z: s.z, s: new THREE.Vector3(s.w, s.h, s.d), color: s.color }))));
  // ---------- walls: air conditioners (a dark fan on the front) ----------
  const acGeo = mergeGeometries([bx(0.8, 0.55, 0.42, 0, 0, 0, '#D5D8DC'), colored(new THREE.CircleGeometry(0.2, 10).translate(0.12, 0, 0.215), '#4A4F57')]);
  add(instanced(acGeo, vc(), d.acs, false));

  // ---------- vertical shop signboards: coloured board, word in the contrasting colour (both faces) ----------
  if (d.shopSigns.length) {
    const { t, cols, rows } = signAtlas();
    const parts: THREE.BufferGeometry[] = [];
    for (const s of d.shopSigns) {
      const [bg, fg] = SIGN_COLORS[s.color];
      const u0 = (s.word % cols) / cols,
        u1 = u0 + 1 / cols;
      const v1 = 1 - Math.floor(s.word / cols) / rows,
        v0 = v1 - 1 / rows;
      for (const back of [0, 1]) {
        const g = new THREE.PlaneGeometry(0.9, 3);
        const uv = g.getAttribute('uv') as THREE.BufferAttribute;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) ? u1 : u0, uv.getY(k) ? v1 : v0);
        g.rotateY(s.yaw + (back ? Math.PI : 0));
        g.translate(s.x + Math.sin(s.yaw) * (back ? -0.06 : 0.06), s.y, s.z + Math.cos(s.yaw) * (back ? -0.06 : 0.06));
        const n = g.getAttribute('position').count;
        const cb = new THREE.Color(bg),
          cf = new THREE.Color(fg);
        g.setAttribute('aBg', new THREE.BufferAttribute(new Float32Array(Array.from({ length: n }, () => [cb.r, cb.g, cb.b]).flat()), 3));
        g.setAttribute('aFg', new THREE.BufferAttribute(new Float32Array(Array.from({ length: n }, () => [cf.r, cf.g, cf.b]).flat()), 3));
        parts.push(g);
      }
      // the board's edge frame
      const f = new THREE.BoxGeometry(Math.abs(Math.cos(s.yaw)) * 0.96 + 0.1, 3.08, Math.abs(Math.sin(s.yaw)) * 0.96 + 0.1);
      f.translate(s.x, s.y, s.z);
      const n = f.getAttribute('position').count;
      f.setAttribute('aBg', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.25), 3));
      f.setAttribute('aFg', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.25), 3));
      parts.push(f.toNonIndexed());
    }
    const geo = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
    const mat = new THREE.MeshBasicMaterial({ map: t });
    // board colour and ink colour come per vertex; the atlas only says where the ink is
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aFg; attribute vec3 aBg; varying vec3 vFg; varying vec3 vBg;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFg = aFg; vBg = aBg;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFg; varying vec3 vBg;')
        .replace('#include <map_fragment>', '#ifdef USE_MAP\nfloat ink = texture2D(map, vMapUv).r;\ndiffuseColor.rgb = mix(vBg, vFg, ink);\n#endif');
    };
    mats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
  }

  // ---------- scooters: painted body (per scooter colour) + dark parts ----------
  const paintGeo = mergeGeometries([new THREE.BoxGeometry(0.42, 0.42, 1.0).translate(0, 0.5, -0.1), new THREE.BoxGeometry(0.46, 0.75, 0.16).translate(0, 0.72, 0.5)].map((g) => g.toNonIndexed()));
  add(instanced(paintGeo, new THREE.MeshLambertMaterial({ flatShading: true }), d.scooters.map((s) => ({ x: s.x, y: 0, z: s.z, yaw: s.yaw, color: s.color })), false));
  const darkGeo = mergeGeometries([bx(0.12, 0.46, 0.46, 0, 0.23, 0.66, '#1E2228'), bx(0.12, 0.46, 0.46, 0, 0.23, -0.6, '#1E2228'), bx(0.36, 0.12, 0.7, 0, 0.78, -0.25, '#2B2F36'), bx(0.62, 0.06, 0.06, 0, 1.12, 0.52, '#2B2F36')]);
  add(instanced(darkGeo, vc(), d.scooters.map((s) => ({ x: s.x, y: 0, z: s.z, yaw: s.yaw })), false));

  // ---------- street lamps: pole, an arm over the road, the lamp ----------
  const lampGeo = mergeGeometries([cyl(0.09, 0.12, 6.4, 0, 3.2, 0, '#5D6B78', 8), bx(0.08, 0.08, 1.8, 0, 6.3, 0.85, '#5D6B78'), bx(0.36, 0.14, 0.6, 0, 6.2, 1.75, '#EEEEEE')]);
  add(instanced(lampGeo, vc(), d.lamps.map((l) => ({ x: l.x, y: 0, z: l.z, yaw: l.yaw }))));
  // ---------- kerbs ----------
  add(instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ flatShading: true }), d.curbs.map((c) => ({ x: c.x, y: 0.07, z: c.z, s: new THREE.Vector3(c.w, 0.14, c.d), color: c.color })), false));

  // ---------- traffic lights: pole + housing (instanced) and three lamps per head (colours change) ----------
  const sigGeo = mergeGeometries([cyl(0.1, 0.12, 5.6, 0, 2.8, 0, '#4A4F57', 8), bx(0.62, 0.3, 0.26, 0, 5.15, 0.15, '#23272D')]);
  add(instanced(sigGeo, vc(), d.signals.map((s) => ({ x: s.x, y: 0, z: s.z, yaw: s.yaw }))));
  const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.16, 0.05), new THREE.MeshBasicMaterial(), d.signals.length * 3);
  d.signals.forEach((s, i) => {
    for (let k = 0; k < 3; k++) {
      // red, yellow, green from left to right as seen by the drivers
      const local = new THREE.Vector3((k - 1) * 0.19, 5.15, 0.29).applyAxisAngle(UP, s.yaw);
      m4.compose(new THREE.Vector3(s.x + local.x, local.y, s.z + local.z), q.setFromAxisAngle(UP, s.yaw), one);
      lamps.setMatrixAt(i * 3 + k, m4);
      lamps.setColorAt(i * 3 + k, new THREE.Color('#333'));
    }
  });
  if (d.signals.length) scene.add(lamps);
  const LIT = [new THREE.Color('#FF3B30'), new THREE.Color('#FFC107'), new THREE.Color('#34C759')];
  const OFF = [new THREE.Color('#4A1E1E'), new THREE.Color('#4A3D16'), new THREE.Color('#173A22')];
  let lastPhase = '';

  // ---------- palms ----------
  if (d.palms.length) {
    const trunk = cyl(0.16, 0.26, 1, 0, 0.5, 0, '#8D6E63', 7);
    const fronds = mergeGeometries(
      Array.from({ length: 7 }, (_, k) => {
        const g = new THREE.BoxGeometry(0.5, 0.06, 2.4).translate(0, 0, 1.2);
        g.rotateX(0.45);
        g.rotateY((k / 7) * Math.PI * 2);
        return colored(g, k % 2 ? '#2E7D32' : '#43A047');
      }),
    );
    add(instanced(trunk, vc(), d.palms.map((p) => ({ x: p.x, y: 0, z: p.z, s: new THREE.Vector3(1, p.h, 1) }))));
    add(instanced(fronds, vc(), d.palms.map((p) => ({ x: p.x, y: p.h, z: p.z, yaw: p.x * 0.7 }))));
  }

  // ---------- Love River cruise boats ----------
  const boats = d.boats.map((b) => {
    const g = mergeGeometries([bx(2.6, 0.9, 7, 0, 0.2, 0, '#FAFAFA'), bx(2.2, 0.08, 4.6, 0, 1.75, -0.4, b.color), ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => bx(0.08, 1.1, 0.08, sx * 1.0, 1.15, -0.4 + sz * 2.1, '#5D6B78'))), bx(2.62, 0.18, 7.02, 0, 0.55, 0, b.color)]);
    g.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(g, vc());
    m.castShadow = true;
    scene.add(m);
    return { m, b, x: b.x0 + (b.x1 - b.x0) * (b.speed % 1), dir: 1 };
  });

  return {
    update(t: number, dt: number) {
      // traffic lights follow the same clock as the traffic
      const px = lightFor('x', t),
        pz = lightFor('z', t);
      const phase = px + pz;
      if (phase !== lastPhase && d.signals.length) {
        lastPhase = phase;
        d.signals.forEach((s, i) => {
          const st = s.axis === 'x' ? px : pz;
          const lit = st === 'red' ? 0 : st === 'yellow' ? 1 : 2;
          for (let k = 0; k < 3; k++) lamps.setColorAt(i * 3 + k, k === lit ? LIT[k] : OFF[k]);
        });
        if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
      }
      const water = level.water;
      for (const b of boats) {
        b.x += b.dir * b.b.speed * dt;
        if (b.x > b.b.x1) b.dir = -1;
        if (b.x < b.b.x0) b.dir = 1;
        b.m.position.set(b.x, (water?.y ?? -1.4) + 0.2 + Math.sin(t * 1.3 + b.b.z) * 0.06, b.b.z);
        b.m.rotation.y = b.dir > 0 ? 0 : Math.PI;
      }
    },
  };
}

/** water that moves: soft bands drifting across the surface (river and sea) */
export function waterMaterial(color: string) {
  // Phong for a sun glint; the ripple tilts the normal a little so the glint breaks into sparkles
  const mat = new THREE.MeshPhongMaterial({ color, specular: '#CFE6F2', shininess: 70 });
  const uTime = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp; uniform float uTime;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      float w = sin(vWp.x * 0.35 + uTime * 1.2) * sin(vWp.z * 0.5 - uTime * 0.8) + sin((vWp.x + vWp.z) * 0.9 + uTime * 2.0) * 0.4;
      diffuseColor.rgb *= 0.95 + 0.08 * w;
      diffuseColor.rgb += vec3(0.22, 0.26, 0.28) * smoothstep(1.15, 1.35, w);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
      vec2 rip = vec2(cos(vWp.x * 0.9 + uTime * 1.7) + 0.6 * cos((vWp.x + vWp.z) * 1.7 + uTime * 2.3), cos(vWp.z * 1.1 - uTime * 1.3) + 0.6 * cos((vWp.x - vWp.z) * 1.5 - uTime * 1.9));
      normal = normalize(normal + (viewMatrix * vec4(rip.x * 0.09, 0.0, rip.y * 0.09, 0.0)).xyz);`,
      );
  };
  return { mat, uTime };
}

/** the sky: a dome from the pale horizon haze (the fog colour), through a warm low glow, to deep blue overhead,
 * and some low-poly clouds */
export function drawSky(scene: THREE.Scene, horizon: string, zenith: string, glow = horizon) {
  const g = new THREE.SphereGeometry(850, 32, 16);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = skyColour(pos.getY(i) / 850, horizon, glow, zenith);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const dome = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.renderOrder = -1;
  // the sky moves with the camera, so it is always the same distance away
  const sky = new THREE.Group();
  sky.add(dome);
  scene.add(sky);
  const clouds = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: '#FFFFFF', fog: false, flatShading: true, emissive: '#B4C3D2' }), 36);
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2 + Math.sin(i * 7.1) * 0.2;
    const r = 560 + ((i * 53) % 160);
    const s = 30 + ((i * 37) % 40);
    m4.compose(new THREE.Vector3(Math.cos(a) * r, 110 + ((i * 29) % 90), Math.sin(a) * r), q.setFromAxisAngle(UP, a), new THREE.Vector3(s * 1.8, s * 0.45, s));
    clouds.setMatrixAt(i, m4);
  }
  sky.add(clouds);
  return sky;
}

/** the sky dome's colour at height `y` (−1 … 1 on the dome): the horizon colour at and below 0 (it matches the fog,
 * so the ground melts into it), a warm glow just above, then blue that deepens towards the top */
export function skyColour(y: number, horizon: string, glow: string, zenith: string) {
  const t = Math.max(0, y);
  const c = new THREE.Color(horizon).lerp(new THREE.Color(glow), Math.min(1, t / 0.05));
  return c.lerp(new THREE.Color(zenith), Math.pow(Math.min(1, Math.max(0, (t - 0.04) / 0.96)), 0.55));
}
