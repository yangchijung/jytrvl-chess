// Crazy Bumper — the main loop: Three.js renderer, the Rapier world, a fixed 1/60 s physics step with an
// accumulator, and drawing interpolated between the last two steps. Also the frame counters for
// window.__GAME_STATS__ and the quality level.
//
// Quality: phones/tablets and software WebGL (SwiftShader, llvmpipe: headless test browsers, old PCs without a
// GPU driver) get a lower render resolution and a smaller shadow map. If a device still runs slow, the resolution
// steps down further (never below half); devices that keep up are never touched.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export const STEP = 1 / 60;

export interface Quality {
  software: boolean;
  lowPower: boolean;
  pixelRatio: number;
  shadowSize: number;
  floorTexture: number;
  particles: number;
}

/** looks at the WebGL renderer string without keeping a context */
function probeSoftware(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch {
    return false;
  }
}

export function pickQuality(lowPower: boolean): Quality {
  const software = probeSoftware();
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  if (software) return { software, lowPower, pixelRatio: 0.6, shadowSize: 512, floorTexture: 512, particles: 200 };
  if (lowPower) return { software, lowPower, pixelRatio: Math.min(dpr, 2), shadowSize: 1024, floorTexture: 1024, particles: 260 };
  return { software, lowPower, pixelRatio: Math.min(dpr, 2), shadowSize: 2048, floorTexture: 2048, particles: 320 };
}

export interface FrameCounters {
  fps: number;
  avgFps: number;
  frameCount: number;
}

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly world: RAPIER.World;
  readonly events: RAPIER.EventQueue;
  readonly sun: THREE.DirectionalLight;
  readonly R = RAPIER;
  /** 1 = normal; the result slow motion lowers it to 0 */
  timeScale = 1;
  paused = false;
  readonly counters: FrameCounters = { fps: 60, avgFps: 60, frameCount: 0 };
  private raf = 0;
  private acc = 0;
  private last = 0;
  private winFrames = 0;
  private winStart = 0;
  private avgFrames = 0;
  private avgStart = 0;
  private slowFor = 0;
  private ratio: number;

  private constructor(
    private canvas: HTMLCanvasElement,
    readonly quality: Quality,
  ) {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = STEP;
    this.events = new RAPIER.EventQueue(true);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !quality.software && !quality.lowPower, powerPreference: 'high-performance' });
    this.ratio = quality.pixelRatio;
    this.renderer.setPixelRatio(this.ratio);
    this.renderer.shadowMap.enabled = true;
    // three r185 folded PCFSoftShadowMap into PCFShadowMap (soft by default; the old constant only warns)
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.info.autoReset = false;
    this.scene.background = new THREE.Color('#A8E1FF');
    this.scene.fog = new THREE.Fog('#A8E1FF', 70, 170);
    // spec 4.1: warm key light and a sky/ground hemisphere so shadows stay soft, never black
    this.scene.add(new THREE.HemisphereLight('#80D8FF', '#FFE082', 0.9));
    this.sun = new THREE.DirectionalLight('#FFF8E7', 1.8);
    this.sun.position.set(-14, 36, -10);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
    this.sun.shadow.radius = 3;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -28;
    sc.right = sc.top = 28;
    sc.near = 5;
    sc.far = 80;
    this.scene.add(this.sun, this.sun.target);
  }

  static async create(canvas: HTMLCanvasElement, opts: { lowPower: boolean }): Promise<Engine> {
    await RAPIER.init();
    return new Engine(canvas, pickQuality(opts.lowPower));
  }

  /** starts the loop: step() runs at 60 Hz of game time, draw() once per frame with the blend factor */
  start(step: (dt: number) => void, draw: (alpha: number, realDt: number) => void) {
    this.last = this.winStart = this.avgStart = performance.now();
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.count(now);
      if (!this.paused) {
        this.acc += dt * this.timeScale;
        let n = 0;
        while (this.acc >= STEP && n < 5) {
          step(STEP);
          this.acc -= STEP;
          n++;
        }
        if (n === 5) this.acc = 0; // too slow to keep up: drop time rather than spiral
      }
      draw(this.acc / STEP, this.paused ? 0 : dt);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private count(now: number) {
    const c = this.counters;
    c.frameCount++;
    this.winFrames++;
    this.avgFrames++;
    const win = now - this.winStart;
    if (win >= 500) {
      c.fps = Math.round((this.winFrames * 10000) / win) / 10;
      this.winFrames = 0;
      this.winStart = now;
      this.adapt(c.fps, win / 1000);
    }
    const span = now - this.avgStart;
    if (span > 250) c.avgFps = Math.round((this.avgFrames * 10000) / span) / 10;
  }

  /** a running average from now on (the start of each round) */
  resetAverage() {
    this.avgFrames = 0;
    this.avgStart = performance.now();
  }

  /** steps the resolution down while frames stay slow; never below half */
  private adapt(fps: number, secs: number) {
    if (fps >= 50 || document.hidden) {
      this.slowFor = 0;
      return;
    }
    this.slowFor += secs;
    if (this.slowFor >= 1.5 && this.ratio > 0.5) {
      this.slowFor = 0;
      this.ratio = Math.max(0.5, Math.round((this.ratio - 0.1) * 100) / 100);
      this.renderer.setPixelRatio(this.ratio);
      this.resize();
    }
  }

  get pixelRatio() {
    return this.ratio;
  }

  resize() {
    const w = this.canvas.clientWidth,
      h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    return w / Math.max(1, h);
  }

  render(cam: THREE.Camera) {
    this.renderer.info.reset();
    this.renderer.render(this.scene, cam);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
    this.events.free();
    this.world.free();
  }
}
