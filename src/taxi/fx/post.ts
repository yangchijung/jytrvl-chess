// Rush Taxi: the post-processing pipeline per quality tier (see quality.ts).
//   high  render → probe → GTAO (half resolution, depth only) → bloom → depth of field (menu / results only) →
//         output (sRGB) → grade + vignette → SMAA
//   mid   no composer: the canvas MSAA and the fake contact shade in the world shaders (fakeAO.ts)
//   low   no composer
// The scene is drawn once per frame on every tier: GTAO and the depth of field read the depth texture the first
// render already wrote, so neither re-renders the city. The probe pass notes the renderer's counters right after the
// scene, so `scene` holds the city's own draw calls (the X-13 budget) and `post` the composer's full-screen passes.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { BokehShader } from 'three/examples/jsm/shaders/BokehShader.js';
import type { Quality } from './quality';
import { GRADE_GLSL, dofAperture } from './grade';
import { setFakeAO } from './fakeAO';

export interface PostFrame {
  /** depth of field on (the menu orbit and the results screen; never while driving) */
  dof: boolean;
  /** metres from the lens to what should be sharp */
  focus: number;
  /** how fast the camera moves (m/s): the blur grows a little with it */
  camSpeed: number;
}

export interface RenderCount {
  calls: number;
  triangles: number;
}

export interface Post {
  readonly tier: Quality;
  readonly composer: EffectComposer | null;
  /** the passes that ran in the last frame, in order (empty without a composer) */
  passes(): string[];
  render(dt: number, f: PostFrame): void;
  setSize(w: number, h: number): void;
  /** the city's own draw calls and triangles in the last frame */
  readonly scene: RenderCount;
  /** the composer's own work in the last frame (full-screen passes) */
  readonly post: RenderCount;
  /** test hook: the colour grade on or off (high only) */
  setGrade(on: boolean): void;
  dispose(): void;
}

/** notes the counters after the scene render and hands the depth texture of the buffer it drew into to later passes */
class ProbePass extends Pass {
  depth: THREE.DepthTexture | null = null;
  constructor(private readonly info: THREE.WebGLInfo, private readonly out: RenderCount) {
    super();
    this.needsSwap = false;
  }
  render(_r: THREE.WebGLRenderer, _w: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    this.out.calls = this.info.render.calls;
    this.out.triangles = this.info.render.triangles;
    this.depth = read.depthTexture as THREE.DepthTexture | null;
  }
}

/** GTAO at half resolution, fed from the scene render's depth (normals rebuilt from depth: no second scene pass) */
class HalfGTAO extends GTAOPass {
  constructor(scene: THREE.Scene, cam: THREE.PerspectiveCamera, private readonly probe: ProbePass) {
    super(scene, cam, 256, 256);
    // radius in metres: building joints, kerbs and the cab's footprint; a short thickness so the skyline does not halo
    this.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 1.6, scale: 1.1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    this.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    this.blendIntensity = 0.85;
  }
  bindDepth(t: THREE.DepthTexture) {
    // switch to the outside depth buffer once (defines change: recompiles once), then only swap the texture
    if (this.depthTexture !== t && (this as unknown as { _renderGBuffer: boolean })._renderGBuffer) this.setGBuffer(t, undefined);
    this.gtaoMaterial.uniforms.tDepth.value = t;
    this.pdMaterial.uniforms.tDepth.value = t;
    this.depthTexture = t;
  }
  setSize(w: number, h: number) {
    super.setSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
    (this as unknown as { normalRenderTarget: THREE.WebGLRenderTarget }).normalRenderTarget.setSize(1, 1); // unused: depth comes from the scene render
  }
  render(r: THREE.WebGLRenderer, w: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget, dt: number, mask: boolean) {
    if (this.probe.depth) this.bindDepth(this.probe.depth);
    super.render(r, w, read, dt, mask);
  }
}

const GRADE_SHADER = {
  uniforms: { tDiffuse: { value: null }, uAspect: { value: 1 }, uOn: { value: 1 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: GRADE_GLSL,
};

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.PerspectiveCamera, tier: Quality): Post {
  const scn: RenderCount = { calls: 0, triangles: 0 };
  const pst: RenderCount = { calls: 0, triangles: 0 };
  setFakeAO(tier === 'mid');
  if (tier !== 'high') {
    return {
      tier,
      composer: null,
      passes: () => [],
      render() {
        renderer.render(scene, cam);
        scn.calls = renderer.info.render.calls;
        scn.triangles = renderer.info.render.triangles;
        pst.calls = pst.triangles = 0;
      },
      setSize() {},
      scene: scn,
      post: pst,
      setGrade() {},
      dispose() {},
    };
  }

  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(Math.max(1, size.x), Math.max(1, size.y)) });
  rt.texture.name = 'post.rt';
  const composer = new EffectComposer(renderer, rt);
  const probe = new ProbePass(renderer.info, scn);
  const gtao = new HalfGTAO(scene, cam, probe);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.22, 0.35, 0.93);
  const dof = new ShaderPass({ ...BokehShader, defines: { ...BokehShader.defines, DEPTH_PACKING: 0 } }, 'tColor');
  dof.uniforms.maxblur.value = 0.006;
  const grade = new ShaderPass(GRADE_SHADER);
  const smaa = new SMAAPass();
  const named: [string, Pass][] = [
    ['render', new RenderPass(scene, cam)],
    ['probe', probe],
    ['gtao', gtao],
    ['bloom', bloom],
    ['dof', dof],
    ['output', new OutputPass()],
    ['grade', grade],
    ['smaa', smaa],
  ];
  for (const [, p] of named) composer.addPass(p);
  dof.enabled = false;

  return {
    tier,
    composer,
    passes: () => named.filter(([, p]) => p.enabled).map(([n]) => n),
    render(dt, f) {
      dof.enabled = f.dof;
      if (f.dof) {
        const u = dof.uniforms;
        u.tDepth.value = probe.depth;
        u.focus.value = f.focus;
        u.aperture.value = dofAperture(f.camSpeed);
        u.nearClip.value = cam.near;
        u.farClip.value = cam.far;
        u.aspect.value = cam.aspect;
      }
      grade.uniforms.uAspect.value = cam.aspect;
      composer.render(dt);
      pst.calls = renderer.info.render.calls - scn.calls;
      pst.triangles = renderer.info.render.triangles - scn.triangles;
    },
    setSize(w, h) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
    },
    scene: scn,
    post: pst,
    setGrade(on) {
      grade.uniforms.uOn.value = on ? 1 : 0;
    },
    dispose() {
      for (const [, p] of named) p.dispose();
      composer.renderTarget1.depthTexture?.dispose();
      composer.renderTarget2.depthTexture?.dispose();
      composer.dispose();
    },
  };
}
