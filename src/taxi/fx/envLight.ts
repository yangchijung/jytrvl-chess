// Rush Taxi: the environment map. A tiny copy of the sky (the live dome and clouds, sharing their buffers and
// materials), a ring of far city blocks and the ground, lit by copies of the scene's own lights and hazed by the
// scene's own fog, is rendered into a PMREM once and set as `scene.environment`. Physical materials (the cabs) and
// the reflection chunks (glass towers, water, wet roads) sample it. Call `refresh()` only when the sky or the
// light changes (time of day): it costs six tiny cube renders and a PMREM blur, a few milliseconds.
//
// The hemisphere light stays the scene's ambient term. three r185 also feeds scene.environment into the diffuse
// light of every Lambert, Phong and Standard material, which would add a second, brighter ambient on top of the
// tuned afternoon balance (and an extra texture read on every pixel of the city). `keepHemisphereAmbient()` gates
// that behind ENV_IBL_DIFFUSE, so the environment only brings reflections.
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
  /** the current PMREM (also scene.environment) */
  readonly texture: THREE.Texture | null;
  /** re-render the environment from the live sky, lights and fog */
  refresh(): void;
  dispose(): void;
}

const TONES = ['#C9C4B6', '#B7BCC0', '#D8CDB8', '#9FA9B2', '#C7B7A6', '#7F8E9C'].map((c) => new THREE.Color(c));

export function createEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene, sky: THREE.Object3D | null, size = 64): Environment {
  keepHemisphereAmbient();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();

  // the far city and the ground, drawn only here
  const blocks = farCityRing();
  const ringMat = new THREE.MeshLambertMaterial({ flatShading: true });
  const ring = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), ringMat, blocks.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  blocks.forEach((b, i) => {
    m4.compose(new THREE.Vector3(b.x, -2, b.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(b.x, b.z)), new THREE.Vector3(b.w, b.h, b.d));
    ring.setMatrixAt(i, m4);
    ring.setColorAt(i, TONES[Math.floor(b.tone * TONES.length)]);
  });
  ring.frustumCulled = false;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(1000, 24).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#5E6066' }));
  ground.position.y = -2;
  env.add(ring, ground);

  // proxies of the live sky: same geometry and material, so a recoloured sky shows up on the next refresh
  const proxies = new Map<THREE.Mesh, THREE.Mesh>();
  const rel = new THREE.Matrix4();
  const inv = new THREE.Matrix4();
  let lights: THREE.Light[] = [];
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
  const syncLights = () => {
    for (const l of lights) env.remove(l);
    lights = [];
    for (const o of scene.children) {
      const l = o as THREE.Light;
      if (!l.isLight || !l.visible) continue;
      let c: THREE.Light | null = null;
      if ((l as THREE.HemisphereLight).isHemisphereLight) c = new THREE.HemisphereLight(l.color, (l as THREE.HemisphereLight).groundColor, l.intensity);
      else if ((l as THREE.AmbientLight).isAmbientLight) c = new THREE.AmbientLight(l.color, l.intensity);
      else if ((l as THREE.DirectionalLight).isDirectionalLight) {
        const d = l as THREE.DirectionalLight;
        const dl = new THREE.DirectionalLight(d.color, d.intensity);
        const dir = d.position.clone().sub(d.target.position);
        dl.position.copy(dir.lengthSq() > 1e-6 ? dir.normalize().multiplyScalar(100) : new THREE.Vector3(0, 100, 0));
        c = dl;
      }
      if (c) {
        lights.push(c);
        env.add(c);
      }
    }
  };

  return {
    get texture() {
      return rt?.texture ?? null;
    },
    refresh() {
      syncSky();
      syncLights();
      env.fog = scene.fog;
      env.background = scene.background instanceof THREE.Color ? scene.background : null;
      const next = pmrem.fromScene(env, 0, 1, 1200, { size });
      scene.environment = next.texture;
      rt?.dispose();
      rt = next;
    },
    dispose() {
      if (scene.environment === rt?.texture) scene.environment = null;
      rt?.dispose();
      rt = null;
      pmrem.dispose();
      ring.geometry.dispose();
      ringMat.dispose();
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
    },
  };
}
