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
/** the culling squares: 230 m from the origin (grid city), or the real-map city's 2 × 2 data tiles (set by drawDecor) */
let chunk = { size: TILE, x0: 0, z0: 0, far: Infinity };
/** chunks hidden beyond `far` metres from the camera (real-map city: small street furniture is not drawn far off) */
let farChunks: { mesh: THREE.Object3D; sphere: THREE.Sphere; far: number }[] = [];
function tiles<T extends { x: number; z: number }>(items: T[]) {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const k = `${Math.floor((it.x - chunk.x0) / chunk.size)},${Math.floor((it.z - chunk.z0) / chunk.size)}`;
    (map.get(k) ?? map.set(k, []).get(k)!).push(it);
  }
  return [...map.values()];
}
function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, items: Item[], shadow = true, far = chunk.far) {
  if (!items.length) return null;
  const group = new THREE.Group();
  for (const part of items.length > (chunk.far < Infinity ? 0 : 120) ? tiles(items) : [items]) {
    const mesh = new THREE.InstancedMesh(geo, mat, part.length);
    part.forEach((it, i) => {
      m4.compose(new THREE.Vector3(it.x, it.y, it.z), q.setFromAxisAngle(UP, it.yaw ?? 0), it.s ?? one);
      mesh.setMatrixAt(i, m4);
      if (it.color) mesh.setColorAt(i, new THREE.Color(it.color));
    });
    mesh.computeBoundingSphere();
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    if (far < Infinity) farChunks.push({ mesh, sphere: mesh.boundingSphere!, far });
    group.add(mesh);
  }
  return group;
}

/**
 * Building walls, drawn in the shader by world position so every box size works without textures. The instance
 * colour is the paint; everything else comes from `aLook` (see facade.ts):
 *
 *   aLook = style + variant
 *     style   = floor(aLook): 0 house, 1 tower, 2 hall, 3 warehouse
 *     variant = fract(aLook) in (0, 1): seeds r1..r9 below; 0 (a plain integer, the old encoding) means
 *               "derive it from the building's position", so older callers still get varied facades.
 *
 *   house     painted render or 二丁掛 tile (cream, brick red, mint, grey, beige) with a running-bond grid; window
 *             width, bay and floor height vary; painted iron window cages (鐵窗); balcony slabs with rails; the
 *             arcade (騎樓) at street level with shop fronts: awnings, roller shutters, lit interiors
 *   tower     62 %: glass curtain wall (tint, mullion pitch, spandrel bands, sky reflected more up high and at
 *             grazing angles, a lit lobby); otherwise a punched or ribbon-window concrete office
 *   hall      brick, tile or paint; tall or wide windows; a glazed entrance level
 *   warehouse corrugated sheet in faded colours, mismatched replacement sheets, rust streaks under the roof edge,
 *             roller doors (some open), a strip of high windows or translucent panels
 *   all       per-building hue and brightness jitter, dark streaks under windows, grime at the base
 *
 * Cost: no texture reads, one material, the same single instanced draw call. Fine lines fade to their average
 * once they get thinner than a pixel or two, so distant facades do not shimmer.
 */
export function buildingMaterial() {
  const mat = new THREE.MeshLambertMaterial({ flatShading: true });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aLook;
        varying vec3 vW; varying vec3 vNW; varying float vRoof; varying float vLook; varying vec3 vOrg; varying vec3 vExt;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        mat4 bm = modelMatrix * instanceMatrix;
        vec4 wpos = bm * vec4(position, 1.0);
        vW = wpos.xyz;
        vNW = normalize(mat3(bm) * normal);
        vRoof = (bm * vec4(0.0, 0.5, 0.0, 1.0)).y;
        vOrg = (bm * vec4(0.0, -0.5, 0.0, 1.0)).xyz;
        vExt = vec3(abs(bm[0].x) + abs(bm[2].x), length(bm[1].xyz), abs(bm[0].z) + abs(bm[2].z));
        vLook = aLook;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vW; varying vec3 vNW; varying float vRoof; varying float vLook; varying vec3 vOrg; varying vec3 vExt;
        float hsh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float box2(vec2 p, vec2 a, vec2 b) { vec2 s = step(a, p) * step(p, b); return s.x * s.y; }
        // a line of half-width w at every integer of q; fq = fwidth(q). Fades to its average coverage when small.
        float line1(float q, float w, float fq) {
          float d = min(fract(q), 1.0 - fract(q));
          return mix(1.0 - smoothstep(w - fq, w + fq, d), 2.0 * w, smoothstep(0.15, 0.4, fq));
        }
        vec3 pick4(float r, vec3 a, vec3 b, vec3 c, vec3 d) { return r < 0.25 ? a : r < 0.5 ? b : r < 0.75 ? c : d; }
        vec3 pick5(float r, vec3 a, vec3 b, vec3 c, vec3 d, vec3 e) { return r < 0.2 ? a : r < 0.4 ? b : r < 0.6 ? c : r < 0.8 ? d : e; }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 paint = diffuseColor.rgb;
          float sty = floor(vLook + 0.0005);
          float vr = vLook - sty;
          if (vr < 0.001) vr = hsh(floor(vOrg.xz * 2.0 + 0.5) * 0.173 + 5.3);
          // quantise: interpolated varyings wobble in the last bits, and the hash would turn that into pixel noise
          vr = floor(vr * 997.0 + 0.5) / 997.0;
          int look = int(sty);
          float r1 = hsh(vec2(vr * 97.3, 1.7)), r2 = hsh(vec2(vr * 61.1, 4.3)), r3 = hsh(vec2(vr * 43.7, 8.9));
          float r4 = hsh(vec2(vr * 29.9, 2.1)), r5 = hsh(vec2(vr * 83.3, 6.7)), r6 = hsh(vec2(vr * 17.9, 9.5));
          float r7 = hsh(vec2(vr * 71.3, 3.9)), r8 = hsh(vec2(vr * 37.1, 7.3)), r9 = hsh(vec2(vr * 53.9, 5.1));
          // per-building hue and brightness jitter, so neighbours never match
          paint *= (0.88 + 0.2 * r1) * mix(vec3(1.05, 1.0, 0.93), vec3(0.94, 1.0, 1.06), r2);
          bool xFace = abs(vNW.x) > 0.5;
          float W = xFace ? vExt.z : vExt.x;
          float u = (xFace ? vW.z - vOrg.z : vW.x - vOrg.x) + 0.5 * W; // 0..W along the face
          float y = vW.y - vOrg.y;                                       // above the building's foot
          float top = vRoof - vW.y;
          vec2 fuv = fwidth(vec2(u, y)) + 1e-4;
          vec3 glow = vec3(0.0);
          vec3 sky = vec3(0.70, 0.80, 0.90);
          vec3 glass = vec3(0.26, 0.36, 0.46);
          bool wallFace = abs(vNW.y) < 0.5;
          if (!wallFace) {
            // flat roof: concrete (some old-town roofs in green or grey waterproof paint), warehouses in sheet
            vec3 conc = vec3(0.62, 0.63, 0.62) * (0.9 + 0.16 * r3);
            if (look == 0 && r4 < 0.3) conc = r5 < 0.5 ? vec3(0.42, 0.56, 0.47) : vec3(0.53, 0.57, 0.59);
            vec2 g = fract(vW.xz / 4.0);
            float rib = look == 3 ? mix(0.9 + 0.1 * step(0.5, fract(u / 0.7)), 0.95, smoothstep(0.1, 0.3, fuv.x / 0.7))
                                  : 0.92 + 0.08 * step(0.03, min(g.x, g.y));
            diffuseColor.rgb = mix(conc, paint, 0.22) * rib;
          } else if (look == 3) {
            // warehouse: sun-faded corrugated sheet
            vec3 faded = r4 < 0.5 ? pick5(r5, vec3(0.42, 0.60, 0.60), vec3(0.47, 0.58, 0.70), vec3(0.68, 0.45, 0.33), vec3(0.82, 0.79, 0.70), vec3(0.52, 0.63, 0.50)) : paint;
            vec3 wall = mix(faded, vec3(0.78, 0.77, 0.73), 0.15 + 0.25 * r6);
            float rw = 0.3 + 0.25 * r7;
            wall *= mix(0.88 + 0.12 * (0.5 + 0.5 * sin(u / rw * 6.2832)), 0.94, smoothstep(0.15, 0.4, fuv.x / rw));
            float hs = hsh(vec2(floor(u / 1.1), vr * 13.0)); // a few replaced sheets that do not match
            if (hs < 0.08) wall *= 1.12; else if (hs > 0.93) wall = mix(wall, vec3(0.72, 0.74, 0.75), 0.6);
            float col = floor(u / rw);
            float len = 0.6 + 3.5 * hsh(vec2(col, vr * 3.0 + 1.0));
            float rust = step(0.62, hsh(vec2(col, vr * 7.0))) * (1.0 - smoothstep(0.0, len, top)) * (0.4 + 0.4 * r8);
            wall = mix(wall, vec3(0.45, 0.27, 0.17), rust);
            if (y < 0.6) wall = vec3(0.55, 0.55, 0.53); // concrete plinth
            // roller doors, fitted to the facade
            float nb = max(1.0, floor(W / (8.0 + 3.0 * r3)));
            float bi = floor(u / (W / nb)), bf = fract(u / (W / nb));
            float dh = 4.0 + 0.8 * r5;
            if (W > 6.0 && vExt.y > dh + 1.4 && bf > 0.18 && bf < 0.82 && y < dh + 0.25) {
              vec3 door = mix(pick4(hsh(vec2(bi, vr * 11.0)), vec3(0.74, 0.76, 0.78), vec3(0.42, 0.55, 0.66), vec3(0.45, 0.58, 0.45), vec3(0.80, 0.55, 0.32)), vec3(0.75), 0.2);
              door *= 1.0 - 0.1 * line1(y / 0.3, 0.2, fuv.y / 0.3);
              bool opened = hsh(vec2(bi, vr * 5.0 + 2.0)) < 0.22;
              wall = opened ? vec3(0.13, 0.13, 0.12) : door;
              if (bf < 0.2 || bf > 0.8 || y > dh) wall = vec3(0.36, 0.37, 0.38); // frame and header
            }
            // a strip of high windows or translucent panels
            if (r6 < 0.75 && top > 0.8 && top < 1.6 && fract(u / 3.0) > 0.25) wall = r7 < 0.5 ? mix(glass, sky, 0.3) : vec3(0.80, 0.82, 0.74);
            diffuseColor.rgb = wall;
          } else if (look == 1 && r3 < 0.62) {
            // glass tower: tinted curtain wall, mullions, floor bands, the sky reflected
            vec3 tint = pick5(r4, vec3(0.24, 0.35, 0.46), vec3(0.20, 0.38, 0.40), vec3(0.36, 0.32, 0.27), vec3(0.19, 0.24, 0.30), vec3(0.36, 0.45, 0.44));
            float ground = 4.4;
            float fh = 3.5 + 0.6 * r5;
            float mw = W / max(1.0, floor(W / (1.2 + 0.9 * r6)));
            vec3 V = normalize(vW - cameraPosition);
            float fres = pow(1.0 - abs(dot(V, vNW)), 3.0);
            float hgt = clamp(y / max(vExt.y, 1.0), 0.0, 1.0);
            vec2 cell = vec2(u / mw, (y - ground) / fh);
            vec3 g = tint * (0.9 + 0.18 * hsh(floor(cell) + vr * 31.0));
            g = mix(g, sky, 0.1 + 0.25 * hgt + 0.45 * fres);
            float band = 0.25 + 0.65 * r7;
            float fy = fract(cell.y) * fh;
            vec3 spandrel = r9 < 0.5 ? mix(tint, paint, 0.55) * 0.8 : tint * 0.62;
            g = mix(g, spandrel, 1.0 - smoothstep(band - fuv.y, band + fuv.y, fy));
            vec3 frame = r8 < 0.5 ? vec3(0.72, 0.74, 0.76) : paint * 0.72;
            g = mix(g, frame, line1(cell.x, 0.035, fuv.x / mw));
            if (y < ground) {
              // lobby: lit glass behind columns, a canopy
              g = fract(u / 6.0) < 0.1 ? paint * 0.8 : mix(vec3(0.86, 0.82, 0.68), tint, 0.3);
              if (fract(u / 6.0) >= 0.1) glow = vec3(0.07, 0.06, 0.04);
              if (y > ground - 0.6) g = paint * 0.7;
            }
            if (top < 0.9) g = paint * 1.05;
            diffuseColor.rgb = g;
          } else {
            // punched windows: houses, halls, concrete offices
            float ground = look == 1 ? 4.2 : 3.4;
            float fh, cw; vec2 wa, wb;
            if (look == 0) {
              fh = 2.95 + 0.35 * r5; cw = 1.7 + 1.5 * r6;
              float ww = 0.42 + 0.3 * r7;
              wa = vec2(0.5 - 0.5 * ww, 0.32); wb = vec2(0.5 + 0.5 * ww, 0.84);
            } else if (look == 2) {
              fh = 3.6 + 0.5 * r5; cw = 2.4 + 1.8 * r6;
              if (r7 < 0.5) { wa = vec2(0.3, 0.18); wb = vec2(0.7, 0.88); } else { wa = vec2(0.08, 0.35); wb = vec2(0.92, 0.78); }
            } else {
              fh = 3.5 + 0.4 * r5; cw = 1.6 + 0.8 * r6;
              if (r7 < 0.5) { wa = vec2(-0.1, 0.32); wb = vec2(1.1, 0.86); } else { wa = vec2(0.1, 0.15); wb = vec2(0.9, 0.9); }
            }
            cw = W / max(1.0, floor(W / cw));
            // wall finish: paint, or 二丁掛 tile in a running bond
            bool tile = look == 1 ? r4 < 0.4 : r3 < 0.6;
            vec3 wall = paint;
            if (tile) {
              vec3 tc = pick5(r4, vec3(0.87, 0.81, 0.68), vec3(0.64, 0.32, 0.25), vec3(0.63, 0.79, 0.71), vec3(0.64, 0.65, 0.66), vec3(0.82, 0.70, 0.63));
              wall = mix(tc, paint, 0.2) * (0.94 + 0.12 * r1);
              vec2 tq = vec2(u / 0.48, y / 0.16);
              tq.x += 0.5 * step(0.5, fract(tq.y * 0.5));
              vec2 fq = fuv / vec2(0.48, 0.16);
              wall *= 1.0 - 0.13 * max(line1(tq.x, 0.05, fq.x), line1(tq.y, 0.08, fq.y));
            }
            vec3 c = wall;
            if (y < ground) {
              // street level: the arcade (騎樓) with shop fronts between the columns
              float nbay = max(1.0, floor(W / 3.8));
              float bi = floor(u / (W / nbay)), bf = fract(u / (W / nbay));
              float hb = hsh(vec2(bi, vr * 7.0 + 1.0)), hb2 = hsh(vec2(bi, vr * 9.0 + 4.0));
              if (bf < 0.07 || bf > 0.93) c = wall * 0.9;
              else if (y > ground - 0.55) c = wall * 0.72; // arcade beam in shade
              else if (look == 0 && y > ground - 0.95) {
                // awning or shop sign band, sometimes striped
                vec3 aw = pick5(hb2, vec3(0.72, 0.22, 0.20), vec3(0.22, 0.50, 0.32), vec3(0.20, 0.38, 0.62), vec3(0.88, 0.55, 0.18), vec3(0.90, 0.88, 0.80));
                c = hb < 0.45 ? mix(aw, vec3(0.92, 0.91, 0.88), step(0.5, fract(u / 0.5))) : aw;
              } else if (look != 2 && hb < 0.3) {
                // roller shutter pulled down
                c = pick4(hb2, vec3(0.70, 0.72, 0.73), vec3(0.40, 0.56, 0.46), vec3(0.45, 0.53, 0.62), vec3(0.83, 0.80, 0.70));
                c *= (1.0 - 0.12 * line1(y / 0.12, 0.2, fuv.y / 0.12)) * 0.85;
              } else {
                // open shop, lit inside: warm or cool light, shelves, a darker floor
                vec3 lit = hb2 < 0.6 ? vec3(0.95, 0.85, 0.62) : vec3(0.86, 0.91, 0.93);
                if (look == 2) lit = mix(glass, vec3(0.85, 0.88, 0.86), 0.5);
                c = lit * 0.82 * (1.0 - 0.25 * line1(y / 0.65, 0.04, fuv.y / 0.65)) * (y < 0.3 ? 0.55 : 1.0);
                glow = lit * 0.07;
              }
            } else {
              vec2 cell = vec2(u / cw, (y - ground) / fh);
              vec2 f = fract(cell), ci = floor(cell);
              bool balc = look == 0 ? r8 < 0.45 : look == 2 ? r8 < 0.2 : false;
              if (box2(f, wa, wb) > 0.5) {
                float pr = hsh(ci + vr * 17.0);
                vec3 w = glass * (0.8 + 0.35 * pr);
                float rc = hsh(ci + vr * 5.0 + 0.5);
                if (rc < 0.3) w = mix(w, pick4(hsh(ci + vr * 9.0), vec3(0.85, 0.80, 0.66), vec3(0.72, 0.78, 0.80), vec3(0.80, 0.66, 0.60), vec3(0.90, 0.90, 0.86)), 0.45);
                w = mix(w, sky, 0.1 + 0.2 * (f.y - wa.y) / (wb.y - wa.y));
                if (look == 1) w = mix(w, wall * 0.8, line1(u / 1.2, 0.04, fuv.x / 1.2)); // mullions on ribbons
                c = w;
              } else {
                // dark streaks washed down from the sills
                float below = (wa.y - f.y) * fh;
                if (f.x > wa.x && f.x < wb.x && below > 0.0 && !(balc && f.y < 0.28)) {
                  float st = hsh(vec2(floor(u * 5.0), vr * 3.0 + ci.y));
                  c *= 1.0 - 0.16 * (1.0 - smoothstep(0.0, 1.3, below)) * st * (0.4 + 0.6 * r9);
                }
              }
              if (balc) {
                // balcony slab and rail along the foot of each floor, shade under the next slab
                if (f.y < 0.28) {
                  c = mix(wall, vec3(0.86, 0.86, 0.84), 0.35);
                  if (r6 < 0.5 && f.y > 0.06) c *= 1.0 - 0.45 * line1(u / 0.16, 0.12, fuv.x / 0.16);
                  if (f.y > 0.25) c *= 1.08;
                } else if (f.y > 0.95) c *= 0.8;
              }
              // 鐵窗: painted iron window cages
              bool hasCage = look == 0 ? r2 > 0.3 : look == 2 ? r2 > 0.85 : false;
              vec2 ca = wa - vec2(0.05, 0.04), cb = wb + vec2(0.05, 0.03);
              if (hasCage && hsh(ci + vr * 3.0 + 0.7) > 0.15 && box2(f, ca, cb) > 0.5) {
                vec3 cage = pick5(r9, vec3(0.86, 0.87, 0.85), vec3(0.56, 0.27, 0.21), vec3(0.30, 0.50, 0.38), vec3(0.33, 0.46, 0.60), vec3(0.70, 0.72, 0.72));
                vec2 p = (f - ca) / (cb - ca);
                vec2 fp = fuv / (vec2(cw, fh) * (cb - ca));
                float bars = max(line1(p.x * 7.0, 0.09, fp.x * 7.0), line1(p.y * 3.0, 0.07, fp.y * 3.0));
                float edge = 1.0 - box2(p, vec2(0.04), vec2(0.96));
                c = mix(c * 0.85, cage, max(bars, edge));
              }
            }
            // parapet band under the roof edge, a dark coping on top
            if (top < 0.55) c = wall * 1.1 * (top < 0.1 ? 0.75 : 1.0);
            diffuseColor.rgb = c;
          }
          // grime at the base
          if (wallFace) diffuseColor.rgb *= 1.0 - 0.2 * (1.0 - smoothstep(0.0, 1.1, y)) * (0.6 + 0.4 * hsh(vec2(floor(u * 1.3), vr)));
          totalEmissiveRadiance += glow;
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
  const osmTile = level.osm?.surfaces.tile;
  chunk = osmTile ? { size: osmTile[2], x0: osmTile[3], z0: osmTile[4], far: 300 } : { size: TILE, x0: 0, z0: 0, far: Infinity };
  farChunks = [];
  const mats: THREE.Material[] = [];
  const add = (o: THREE.Object3D | null) => o && scene.add(o);
  const __before = scene.children.length; // TEMP-MEASURE

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
  add(instanced(paintGeo, new THREE.MeshLambertMaterial({ flatShading: true }), d.scooters.map((s) => ({ x: s.x, y: 0, z: s.z, yaw: s.yaw, color: s.color })), false, chunk.far * 0.6));
  const darkGeo = mergeGeometries([bx(0.12, 0.46, 0.46, 0, 0.23, 0.66, '#1E2228'), bx(0.12, 0.46, 0.46, 0, 0.23, -0.6, '#1E2228'), bx(0.36, 0.12, 0.7, 0, 0.78, -0.25, '#2B2F36'), bx(0.62, 0.06, 0.06, 0, 1.12, 0.52, '#2B2F36')]);
  add(instanced(darkGeo, vc(), d.scooters.map((s) => ({ x: s.x, y: 0, z: s.z, yaw: s.yaw })), false, chunk.far * 0.6));

  // ---------- street lamps: pole, an arm over the road, the lamp ----------
  const lampGeo = mergeGeometries([cyl(0.09, 0.12, 6.4, 0, 3.2, 0, '#5D6B78', 8), bx(0.08, 0.08, 1.8, 0, 6.3, 0.85, '#5D6B78'), bx(0.36, 0.14, 0.6, 0, 6.2, 1.75, '#EEEEEE')]);
  // (the real-map city has thousands: no shadows from them, the chunks are too big for the shadow camera to cull)
  add(instanced(lampGeo, vc(), d.lamps.map((l) => ({ x: l.x, y: 0, z: l.z, yaw: l.yaw })), !level.osm));
  // ---------- kerbs ----------
  // (the real-map city draws its kerbs merged with the light rail: drawGround)
  if (!level.osm) add(instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ flatShading: true }), d.curbs.map((c) => ({ x: c.x, y: 0.07, z: c.z, s: new THREE.Vector3(c.w, 0.14, c.d), color: c.color })), false));

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
    add(instanced(trunk, vc(), d.palms.map((p) => ({ x: p.x, y: 0, z: p.z, s: new THREE.Vector3(1, p.h, 1) })), !level.osm, chunk.far * 1.5));
    add(instanced(fronds, vc(), d.palms.map((p) => ({ x: p.x, y: p.h, z: p.z, yaw: p.x * 0.7 })), !level.osm, chunk.far * 1.5));
  }

  // ---------- Love River cruise boats ----------
  const boats = d.boats.filter((b) => !b.path).map((b) => {
    const g = mergeGeometries([bx(2.6, 0.9, 7, 0, 0.2, 0, '#FAFAFA'), bx(2.2, 0.08, 4.6, 0, 1.75, -0.4, b.color), ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => bx(0.08, 1.1, 0.08, sx * 1.0, 1.15, -0.4 + sz * 2.1, '#5D6B78'))), bx(2.62, 0.18, 7.02, 0, 0.55, 0, b.color)]);
    g.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(g, vc());
    m.castShadow = true;
    scene.add(m);
    return { m, b, x: b.x0 + (b.x1 - b.x0) * (b.speed % 1), dir: 1 };
  });

  // ---------- real-map city: boats along the river, 路名牌, light rail ----------
  const pathBoats = drawPathBoats(scene, d, level);
  drawStreetSigns(scene, d);
  if (level.osm) drawGround(scene, d);
  hideFarChunks(scene, farChunks);
  (globalThis as any).__decorObjs = scene.children.slice(__before); // TEMP-MEASURE

  return {
    update(t: number, dt: number) {
      pathBoats?.(t, dt);
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

/** before each frame: hide the chunks whose nearest point is more than their `far` from the camera */
function hideFarChunks(scene: THREE.Scene, list: typeof farChunks) {
  if (!list.length) return;
  const prev = scene.onBeforeRender;
  scene.onBeforeRender = function (renderer, sc, camera, ...rest) {
    prev.call(this, renderer, sc, camera, ...rest);
    for (const { mesh, sphere, far } of list) mesh.visible = sphere.center.distanceTo(camera.position) - sphere.radius < far;
  };
}

/** Love River boats that follow a polyline (real-map city): low tour boats, so they pass under the bridge decks,
 * going back and forth along the river's centre line. One instanced mesh for the white parts, one for the paint. */
function drawPathBoats(scene: THREE.Scene, d: Decor, level: Level) {
  const list = d.boats.filter((b) => b.path && b.path.length > 1);
  if (!list.length) return null;
  const hull = mergeGeometries([bx(2.4, 0.7, 7, 0, 0, 0, '#F4F4F2'), bx(1.9, 0.3, 4.4, 0, 0.45, -0.3, '#7B5E45'), ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => bx(0.07, 0.75, 0.07, sx * 0.95, 0.72, -0.3 + sz * 2.1, '#5D6B78')))]);
  const paint = mergeGeometries([new THREE.BoxGeometry(2.1, 0.07, 4.8).translate(0, 1.1, -0.3), new THREE.BoxGeometry(2.42, 0.14, 7.02).translate(0, 0.28, 0)].map((g) => g.toNonIndexed()));
  const white = new THREE.InstancedMesh(hull, vc(), list.length);
  const coloured = new THREE.InstancedMesh(paint, new THREE.MeshLambertMaterial({ flatShading: true }), list.length);
  list.forEach((b, i) => coloured.setColorAt(i, new THREE.Color(b.color)));
  // they move: cull them with a sphere round the whole river instead of their own
  const box = new THREE.Box3();
  for (const b of list) for (const [x, z] of b.path!) box.expandByPoint(new THREE.Vector3(x, 0, z));
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  sphere.radius += 8;
  white.boundingSphere = sphere;
  coloured.boundingSphere = sphere.clone();
  scene.add(white, coloured);
  const runs = list.map((b) => {
    const pts = b.path!;
    const acc = [0];
    for (let k = 1; k < pts.length; k++) acc.push(acc[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    const L = acc[acc.length - 1];
    return { b, pts, acc, L, s: L * (b.phase ?? 0), dir: 1 };
  });
  const wy = level.water?.y ?? -1.4;
  const pos = new THREE.Vector3();
  return (t: number, dt: number) => {
    runs.forEach((r, i) => {
      r.s += r.dir * r.b.speed * dt;
      if (r.s > r.L) (r.s = r.L), (r.dir = -1);
      if (r.s < 0) (r.s = 0), (r.dir = 1);
      let k = 1;
      while (k < r.acc.length - 1 && r.acc[k] < r.s) k++;
      const [ax, az] = r.pts[k - 1];
      const [bx2, bz2] = r.pts[k];
      const f = (r.s - r.acc[k - 1]) / (r.acc[k] - r.acc[k - 1] || 1);
      pos.set(ax + (bx2 - ax) * f, wy + 0.15 + Math.sin(t * 1.3 + i * 2) * 0.05, az + (bz2 - az) * f);
      const yaw = Math.atan2((bx2 - ax) * r.dir, (bz2 - az) * r.dir);
      m4.compose(pos, q.setFromAxisAngle(UP, yaw), one);
      white.setMatrixAt(i, m4);
      coloured.setMatrixAt(i, m4);
    });
    white.instanceMatrix.needsUpdate = true;
    coloured.instanceMatrix.needsUpdate = true;
  };
}

/** the 路名牌 atlas: one cell per street, white zh name above the en name on Taiwan road-sign green; the last
 * cell is plain green (for the board edges) */
export const STREET_SIGN = { green: '#00663A', w: 2.8, h: 0.9 } as const;
function streetSignAtlas(names: { zh: string; en: string }[]) {
  const cw = 256,
    ch = 82,
    cols = 8,
    rows = Math.ceil((names.length + 1) / cols);
  const c = document.createElement('canvas');
  c.width = cw * cols;
  c.height = ch * rows;
  const x = c.getContext('2d')!;
  x.fillStyle = STREET_SIGN.green;
  x.fillRect(0, 0, c.width, c.height);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const fit = (text: string, weight: number, size: number, max: number) => {
    const font = (s: number) => `${weight} ${s}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif`;
    x.font = font(size);
    while (x.measureText(text).width > max && size > 10) x.font = font((size -= 2));
  };
  names.forEach((n, i) => {
    const cx = (i % cols) * cw,
      cy = Math.floor(i / cols) * ch;
    x.strokeStyle = '#FFFFFF';
    x.lineWidth = 3;
    x.strokeRect(cx + 5, cy + 5, cw - 10, ch - 10);
    x.fillStyle = '#FFFFFF';
    fit(n.zh, 900, 40, cw - 30);
    x.fillText(n.zh, cx + cw / 2, cy + 32);
    fit(n.en, 700, 17, cw - 26);
    x.fillText(n.en, cx + cw / 2, cy + 62);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, cols, rows };
}

/** 路名牌: a pole (instanced) and the boards (one merged mesh on one atlas), both faces readable */
function drawStreetSigns(scene: THREE.Scene, d: Decor) {
  const list = d.streetSigns ?? [];
  if (!list.length) return;
  const pole = cyl(0.07, 0.08, 5.2, 0, 2.6, 0, '#7D868F', 6);
  scene.add(instanced(pole, vc(), list.map((s) => ({ x: s.x, y: 0, z: s.z })), false)!);
  const keys: string[] = [];
  const names: { zh: string; en: string }[] = [];
  for (const s of list)
    for (const b of s.boards) {
      const k = `${b.zh}|${b.en}`;
      if (!keys.includes(k)) keys.push(k), names.push({ zh: b.zh, en: b.en });
    }
  const { tex, cols, rows } = streetSignAtlas(names);
  const cell = (i: number) => {
    const u0 = (i % cols) / cols,
      v1 = 1 - Math.floor(i / cols) / rows;
    return { u0, u1: u0 + 1 / cols, v0: v1 - 1 / rows, v1 };
  };
  const edge = cell(names.length);
  const eu = (edge.u0 + edge.u1) / 2,
    ev = (edge.v0 + edge.v1) / 2;
  const parts: THREE.BufferGeometry[] = [];
  const { w, h } = STREET_SIGN;
  for (const s of list)
    for (const b of s.boards) {
      const c = cell(keys.indexOf(`${b.zh}|${b.en}`));
      // the board's centre sits beside the pole (its near edge at the pole)
      const fx = Math.sin(b.yaw),
        fz = Math.cos(b.yaw);
      const ax = Math.cos(b.yaw),
        az = -Math.sin(b.yaw); // along the board
      const cx = s.x + ax * (w / 2 - 0.1),
        cz = s.z + az * (w / 2 - 0.1);
      for (const back of [0, 1]) {
        const g = new THREE.PlaneGeometry(w, h);
        const uv = g.getAttribute('uv') as THREE.BufferAttribute;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) ? c.u1 : c.u0, uv.getY(k) ? c.v1 : c.v0);
        g.rotateY(b.yaw + (back ? Math.PI : 0));
        g.translate(cx + fx * (back ? -0.035 : 0.035), b.y, cz + fz * (back ? -0.035 : 0.035));
        parts.push(g.toNonIndexed());
      }
      // the edge: a thin green box between the faces
      const e = new THREE.BoxGeometry(w + 0.04, h + 0.04, 0.06);
      const uv = e.getAttribute('uv') as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, eu, ev);
      e.rotateY(b.yaw);
      e.translate(cx, b.y, cz);
      parts.push(e.toNonIndexed());
    }
  const mesh = new THREE.Mesh(mergeGeometries(parts.map((g) => (g.deleteAttribute('normal'), g))), new THREE.MeshBasicMaterial({ map: tex }));
  mesh.name = 'street-signs';
  scene.add(mesh);
}

/**
 * Low things on the ground, real-map city: the painted kerbs (top and both faces, no ends), the light rail's grass or
 * concrete bed and its rails, and the rail's low posts. All of it in one merged mesh with vertex colours per
 * 2 × 2-chunk square, so the whole layer costs a draw call or two in view.
 */
function drawGround(scene: THREE.Scene, d: Decor) {
  const rail = d.rail;
  const kerbs = d.curbs;
  if (!rail?.pieces.length && !kerbs.length) return;
  const size = chunk.size * 2;
  const groups = new Map<string, { pos: number[]; col: number[] }>();
  const group = (x: number, z: number) => {
    const k = `${Math.floor((x - chunk.x0) / size)},${Math.floor((z - chunk.z0) / size)}`;
    return groups.get(k) ?? groups.set(k, { pos: [], col: [] }).get(k)!;
  };
  const C = (h: string) => new THREE.Color(h);
  const grass = C('#6E9F45'),
    walk = C('#B9B2A4'),
    steel = C('#8C9299'),
    post = C('#8E969E');
  type G = { pos: number[]; col: number[] };
  const tri = (g: G, pts: number[][], c: THREE.Color) => {
    for (const p of pts) g.pos.push(p[0], p[1], p[2]), g.col.push(c.r, c.g, c.b);
  };
  /** a flat strip from a to b, `off` to the side and `wdt` wide, at height y (facing up) */
  const strip = (g: G, ax: number, az: number, bx2: number, bz2: number, off: number, wdt: number, y: number, c: THREE.Color) => {
    const L = Math.hypot(bx2 - ax, bz2 - az) || 1;
    const nx = -(bz2 - az) / L,
      nz = (bx2 - ax) / L;
    const p = [
      [ax + nx * (off - wdt / 2), y, az + nz * (off - wdt / 2)],
      [bx2 + nx * (off - wdt / 2), y, bz2 + nz * (off - wdt / 2)],
      [bx2 + nx * (off + wdt / 2), y, bz2 + nz * (off + wdt / 2)],
      [ax + nx * (off + wdt / 2), y, az + nz * (off + wdt / 2)],
    ];
    const cr = (p[1][0] - p[0][0]) * (p[2][2] - p[0][2]) - (p[1][2] - p[0][2]) * (p[2][0] - p[0][0]);
    tri(g, cr > 0 ? [p[0], p[2], p[1], p[0], p[3], p[2]] : [p[0], p[1], p[2], p[0], p[2], p[3]], c);
  };
  /** an upright face from a to b between heights y0 and y1 (drawn double-sided) */
  const wall = (g: G, ax: number, az: number, bx2: number, bz2: number, y0: number, y1: number, c: THREE.Color) =>
    tri(g, [[ax, y0, az], [bx2, y0, bz2], [bx2, y1, bz2], [ax, y0, az], [bx2, y1, bz2], [ax, y1, az]], c);

  // kerbs: a 0.16 m high strip along the road edge
  for (const k of kerbs) {
    const g = group(k.x, k.z);
    const yaw = k.yaw ?? 0;
    const ux = Math.cos(yaw),
      uz = -Math.sin(yaw); // along the kerb
    const vx = -uz,
      vz = ux; // across
    const ax = k.x - (ux * k.w) / 2,
      az = k.z - (uz * k.w) / 2,
      bx2 = k.x + (ux * k.w) / 2,
      bz2 = k.z + (uz * k.w) / 2;
    const c = C(k.color);
    strip(g, ax, az, bx2, bz2, 0, k.d, 0.16, c);
    for (const sd of [-1, 1]) wall(g, ax + vx * sd * (k.d / 2), az + vz * sd * (k.d / 2), bx2 + vx * sd * (k.d / 2), bz2 + vz * sd * (k.d / 2), 0, 0.16, c);
  }
  // light rail
  for (const pc of rail?.pieces ?? []) {
    const g = group((pc.x0 + pc.x1) / 2, (pc.z0 + pc.z1) / 2);
    // heights over the layers of osm/surfaces.ts: road 0.015, lane marks 0.03, sidewalk 0.14
    const bedY = pc.bed === 'walk' ? 0.145 : 0.02;
    const railY = pc.bed === 'road' ? 0.04 : bedY + 0.03;
    if (pc.bed !== 'road') strip(g, pc.x0, pc.z0, pc.x1, pc.z1, 0, 3.0, bedY, pc.bed === 'walk' ? walk : grass);
    for (const off of [-0.72, 0.72]) strip(g, pc.x0, pc.z0, pc.x1, pc.z1, off, 0.11, railY, steel);
  }
  // the rail's low posts: square, 2.2 m
  for (const p of rail?.poles ?? []) {
    const g = group(p.x, p.z);
    const h = 0.09;
    const c4 = [
      [p.x - h, p.z - h],
      [p.x + h, p.z - h],
      [p.x + h, p.z + h],
      [p.x - h, p.z + h],
    ];
    for (let i = 0; i < 4; i++) wall(g, c4[i][0], c4[i][1], c4[(i + 1) % 4][0], c4[(i + 1) % 4][1], 0, 2.2, post);
    strip(g, p.x - h, p.z, p.x + h, p.z, 0, 2 * h, 2.2, post);
  }
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  for (const [, g] of groups) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    m.name = 'ground-decor';
    if (chunk.far < Infinity) farChunks.push({ mesh: m, sphere: geo.boundingSphere!, far: chunk.far });
    scene.add(m);
  }
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
      diffuseColor.rgb += vec3(0.22, 0.26, 0.28) * smoothstep(1.15, 1.35, w) * (1.0 - smoothstep(150.0, 450.0, length(vViewPosition)));`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
      vec2 rip = vec2(cos(vWp.x * 0.9 + uTime * 1.7) + 0.6 * cos((vWp.x + vWp.z) * 1.7 + uTime * 2.3), cos(vWp.z * 1.1 - uTime * 1.3) + 0.6 * cos((vWp.x - vWp.z) * 1.5 - uTime * 1.9));
      rip *= 0.09 * (1.0 - smoothstep(120.0, 420.0, length(vViewPosition))); // calm far away: no glitter at the horizon
      normal = normalize(normal + (viewMatrix * vec4(rip.x, 0.0, rip.y, 0.0)).xyz);`,
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

/** the sky dome's colour at height `y` (−1 … 1 on the dome, 0 = eye level): the horizon colour at and below 0 (it
 * matches the fog, so the ground melts into it), a thin warm glow just above, then blue that deepens towards the top */
export function skyColour(y: number, horizon: string, glow: string, zenith: string) {
  const t = Math.max(0, y);
  const mid = new THREE.Color(zenith).lerp(new THREE.Color('#FFFFFF'), 0.45); // the paler blue low in the sky
  if (t < 0.03) return new THREE.Color(horizon).lerp(new THREE.Color(glow), t / 0.03);
  if (t < 0.14) return new THREE.Color(glow).lerp(mid, (t - 0.03) / 0.11);
  return mid.lerp(new THREE.Color(zenith), Math.pow(Math.min(1, (t - 0.14) / 0.56), 0.8));
}
