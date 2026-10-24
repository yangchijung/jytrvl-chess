// Rush Taxi: the environment map. A tiny copy of the sky (the live dome and clouds, sharing their buffers and
// materials), a ring of far city blocks and the ground, hazed by the scene's own fog and shaded by the brightness
// of the scene's own lights, is rendered by a 6-face cube camera and filtered into a PMREM. The PMREM target is
// reused, so its texture object never changes: materials bound to it once (bindEnvironment in surfaces.ts) follow
// every refresh. Call `refresh()` only when the sky or the light changes (time of day): six tiny cube renders and
// a PMREM blur, a few milliseconds.
//
// It is deliberately NOT scene.environment. In three r185 scene.environment also turns on the environment in every
// Lambert and Phong program of the city (the facade, decor, people, kerbs...), each compiled bigger, and it adds a
// second, image-based ambient on top of the hemisphere light. Measured in tablet mode (software WebGL) that made
// the page take about twice as long to become ready. So the environment goes only to the materials that reflect:
// the cabs, the glass towers, the water and the (wet) streets. `keepHemisphereAmbient()` makes sure those keep the
// hemisphere light as their only ambient term.
import * as THREE from 'three';

const IBL_DIFFUSE_LINE = '#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG )';

/** patch three's lights_fragment_maps chunk once (see above); false if the chunk no longer has the expected line */
export function keepHemisphereAmbient(): boolean {
  const chunks = THREE.ShaderChunk as unknown as Record<string, string>;
  const src = chunks.lights_fragment_maps;
  if (src.includes('ENV_IBL_DIFFUSE')) return true;
  if (!src.includes(IBL_DIFFUSE_LINE)) return false;
  chunks.lights_fragment_maps = src.replace(IBL_DIFFUSE_LINE, '#if defined( ENV_IBL_DIFFUSE )');
  return true;
}

/** a deterministic ring of far blocks around the capture point: a skyline below the horizon, not the real city */
export function farCityRing(count = 120, seed = 11) {
  const out: { x: number; z: number; w: number; d: number; h: number; tone: number }[] = [];
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    const a = ((i + rnd() * 0.8) / count) * Math.PI * 2;
    const r = 230 + rnd() * 220;
    // mostly walk-ups and mid-rises, now and then a tower
    const h = rnd() < 0.12 ? 60 + rnd() * 70 : 10 + rnd() * 32;
    out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, w: 16 + rnd() * 26, d: 16 + rnd() * 26, h, tone: rnd() });
  }
  return out;
}

export interface Environment {
  /** the PMREM (CubeUV) texture; the same object for the life of the environment */
  readonly texture: THREE.Texture | null;
  /** re-render the environment from the live sky, lights and fog */
  refresh(): void;
  dispose(): void;
}

const TONES = ['#C9C4B6', '#B7BCC0', '#D8CDB8', '#9FA9B2', '#C7B7A6', '#7F8E9C'].map((c) => new THREE.Color(c));
const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

type LightSample = { kind: 'hemi' | 'ambient' | 'sun'; color: THREE.Color; intensity: number };
const rawLevel = (lights: LightSample[]) => lights.reduce((v, l) => v + l.intensity * lum(l.color) * (l.kind === 'sun' ? 0.45 : 1), 0);
/** the afternoon set-up in game.ts (hemisphere sky 30 % towards its ground colour, as level() samples it) */
const AFTERNOON = rawLevel([
  { kind: 'hemi', color: new THREE.Color('#CFE8FF').lerp(new THREE.Color('#8C7B5E'), 0.3), intensity: 1.15 },
  { kind: 'sun', color: new THREE.Color('#FFEACB'), intensity: 2.6 },
]);
/** how bright the scene's lights make a matte surface, relative to the afternoon set-up (1) */
export function lightLevel(lights: LightSample[]) {
  return rawLevel(lights) / AFTERNOON;
}

export function createEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene, sky: THREE.Object3D | null, size = 64): Environment {
  keepHemisphereAmbient();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  const cubeRT = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
  const cubeCam = new THREE.CubeCamera(1, 1200, cubeRT);
  env.add(cubeCam);

  // the far city and the ground, drawn only here, unlit: their colour is set from the scene's light level
  const blocks = farCityRing();
  const ringMat = new THREE.MeshBasicMaterial({ vertexColors: false });
  const ring = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), ringMat, blocks.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  blocks.forEach((b, i) => {
    m4.compose(new THREE.Vector3(b.x, -2, b.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(b.x, b.z)), new THREE.Vector3(b.w, b.h, b.d));
    ring.setMatrixAt(i, m4);
    ring.setColorAt(i, TONES[Math.floor(b.tone * TONES.length)]);
  });
  ring.frustumCulled = false;
  const groundMat = new THREE.MeshBasicMaterial();
  const ground = new THREE.Mesh(new THREE.CircleGeometry(1000, 24).rotateX(-Math.PI / 2), groundMat);
  ground.position.y = -2;
  env.add(ring, ground);

  // proxies of the live sky: same geometry and material, so a recoloured sky shows up on the next refresh
  const proxies = new Map<THREE.Mesh, THREE.Mesh>();
  const rel = new THREE.Matrix4();
  const inv = new THREE.Matrix4();
  let rt: THREE.WebGLRenderTarget | null = null;

  const syncSky = () => {
    if (!sky) return;
    sky.updateMatrixWorld(true);
    inv.copy(sky.matrixWorld).invert();
    sky.traverse((o) => {
      const src = o as THREE.Mesh;
      if (!src.isMesh) return;
      let p = proxies.get(src);
      if (!p) {
        const im = src as THREE.InstancedMesh;
        if (im.isInstancedMesh) {
          const c = new THREE.InstancedMesh(im.geometry, im.material, im.count);
          c.instanceMatrix = im.instanceMatrix;
          if (im.instanceColor) c.instanceColor = im.instanceColor;
          p = c;
        } else p = new THREE.Mesh(src.geometry, src.material);
        p.matrixAutoUpdate = false;
        p.frustumCulled = false;
        proxies.set(src, p);
        env.add(p);
      }
      p.renderOrder = src.renderOrder;
      p.visible = src.visible;
      p.matrix.copy(rel.multiplyMatrices(inv, src.matrixWorld));
      p.matrixWorldNeedsUpdate = true;
    });
  };
  const level = () => {
    const ls: Parameters<typeof lightLevel>[0] = [];
    for (const o of scene.children) {
      const l = o as THREE.Light;
      if (!l.isLight || !l.visible) continue;
      if ((l as THREE.HemisphereLight).isHemisphereLight) ls.push({ kind: 'hemi', color: l.color.clone().lerp((l as THREE.HemisphereLight).groundColor, 0.3), intensity: l.intensity });
      else if ((l as THREE.AmbientLight).isAmbientLight) ls.push({ kind: 'ambient', color: l.color, intensity: l.intensity });
      else if ((l as THREE.DirectionalLight).isDirectionalLight) ls.push({ kind: 'sun', color: l.color, intensity: l.intensity });
    }
    return ls.length ? lightLevel(ls) : 1;
  };

  return {
    get texture() {
      return rt?.texture ?? null;
    },
    refresh() {
      syncSky();
      const k = Math.min(1.3, level());
      ringMat.color.setScalar(0.92 * k);
      groundMat.color.set('#5E6066').multiplyScalar(k);
      env.fog = scene.fog;
      env.background = scene.background instanceof THREE.Color ? scene.background : null;
      cubeCam.update(renderer, env);
      rt = pmrem.fromCubemap(cubeRT.texture, rt);
    },
    dispose() {
      rt?.dispose();
      rt = null;
      cubeRT.dispose();
      pmrem.dispose();
      ring.geometry.dispose();
      ringMat.dispose();
      ground.geometry.dispose();
      groundMat.dispose();
    },
  };
}
