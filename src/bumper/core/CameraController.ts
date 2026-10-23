// Crazy Bumper — the camera: a high three-quarter view that never turns with the car (so "up" on the stick is
// always "away from me" for a child), following the player on a critically damped spring, shaking on hits, a
// slow orbit over the arena on the title screen and a push-in on the player when the round ends.
import * as THREE from 'three';

export type CamMode = 'title' | 'follow' | 'result';

/** the camera looks towards +z; this is its fixed heading */
const CAM_YAW = 0;

export class CameraController {
  readonly cam: THREE.PerspectiveCamera;
  mode: CamMode = 'title';
  /** 0..1, screen shake; decays by itself */
  private trauma = 0;
  private pos = new THREE.Vector3(0, 30, -40);
  private vel = new THREE.Vector3();
  private look = new THREE.Vector3();
  private lookVel = new THREE.Vector3();
  private orbit = 0;
  private push = 0;
  private time = 0;
  /** reduced motion: no shake, slower moves */
  motion = 1;
  private portrait = false;

  constructor(aspect: number) {
    this.cam = new THREE.PerspectiveCamera(48, aspect, 0.5, 400);
    this.setAspect(aspect);
  }

  setAspect(aspect: number) {
    this.cam.aspect = aspect;
    this.portrait = aspect < 0.85;
    // a tall phone sees less width: widen the view so the arena around the car still fits
    this.cam.fov = this.portrait ? 62 : 46;
    this.cam.updateProjectionMatrix();
  }

  /** stick/keys on the screen → a direction on the floor */
  screenToWorld(sx: number, sy: number): { x: number; z: number } {
    const fx = Math.sin(CAM_YAW),
      fz = Math.cos(CAM_YAW);
    return { x: fx * sy - fz * sx, z: fz * sy + fx * sx };
  }

  shake(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** where the result camera looks from (car heading = in front of the driver's face) */
  heading = 0;

  /** at the end of a round: the angle nearest the driver's face from which no post or rail blocks the view */
  chooseResultView(car: { x: number; z: number }, yaw: number, posts: readonly { x: number; z: number }[], postRadius: number, arenaRadius: number) {
    const dist = this.portrait ? 9.5 : 8.5;
    for (const d of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2, 2.6, -2.6, Math.PI]) {
      const a = yaw + d;
      const cx = car.x + Math.sin(a) * dist,
        cz = car.z + Math.cos(a) * dist;
      // behind the rail the rail would hide the car
      const blocked = Math.hypot(cx, cz) > arenaRadius - 2 || posts.some((p) => {
        // distance from the post centre to the segment camera→car (on the floor plane)
        const vx = car.x - cx,
          vz = car.z - cz;
        const t = Math.max(0, Math.min(1, ((p.x - cx) * vx + (p.z - cz) * vz) / (vx * vx + vz * vz)));
        return Math.hypot(cx + vx * t - p.x, cz + vz * t - p.z) < postRadius + 1.2;
      });
      if (!blocked) {
        this.heading = a;
        return;
      }
    }
    this.heading = yaw;
  }

  /** the player's size (giant mode backs the camera off) */
  zoom = 1;
  private zoomNow = 1;

  private offset(): THREE.Vector3 {
    const far = (this.portrait ? new THREE.Vector3(0, 26, -19) : new THREE.Vector3(0, 17, -15)).multiplyScalar(1 + (this.zoomNow - 1) * 0.55);
    if (this.mode === 'result') {
      // swing from the usual view to a close view in front of the car (the shorter way round)
      const front = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)).multiplyScalar(this.portrait ? 9.5 : 8.5).setY(this.portrait ? 6.5 : 4.6);
      const a0 = Math.atan2(far.x, far.z),
        a1 = Math.atan2(front.x, front.z);
      const da = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
      const k = this.push * this.push * (3 - 2 * this.push);
      const a = a0 + da * k;
      const r = THREE.MathUtils.lerp(Math.hypot(far.x, far.z), Math.hypot(front.x, front.z), k);
      return new THREE.Vector3(Math.sin(a) * r, THREE.MathUtils.lerp(far.y, front.y, k), Math.cos(a) * r);
    }
    return far;
  }

  /** jump straight to the right place (start of a round) */
  snap(target: THREE.Vector3) {
    this.pos.copy(target).add(this.offset());
    this.vel.set(0, 0, 0);
    this.look.copy(target);
    this.lookVel.set(0, 0, 0);
  }

  /** dt is real time (the result slow motion does not slow the camera) */
  update(target: THREE.Vector3, lead: THREE.Vector3, dt: number) {
    this.time += dt;
    this.zoomNow += (this.zoom - this.zoomNow) * Math.min(1, dt * 4);
    let want: THREE.Vector3;
    let lookAt: THREE.Vector3;
    let stiff = 18;
    if (this.mode === 'title') {
      this.orbit += dt * 0.12 * (this.motion < 1 ? 0.5 : 1);
      const r = this.portrait ? 44 : 38;
      want = new THREE.Vector3(Math.sin(this.orbit) * r, this.portrait ? 40 : 27, Math.cos(this.orbit) * r);
      lookAt = new THREE.Vector3(0, 0, this.portrait ? 0 : 2);
      stiff = 3;
    } else {
      if (this.mode === 'result') this.push = Math.min(1, this.push + dt / 1.2);
      else this.push = 0;
      // look a little ahead of where the car is going; keep the far rail in view near the edge
      const ahead = this.mode === 'follow' ? lead.clone().multiplyScalar(0.22).clampLength(0, 5) : new THREE.Vector3();
      lookAt = target.clone().add(ahead);
      if (this.mode === 'follow') {
        lookAt.x *= 0.9;
        lookAt.z *= 0.9;
      } else {
        // aim below the car so it sits in the upper half, above the result card
        lookAt.y -= (this.portrait ? 3.2 : 0.7) * this.push;
      }
      want = lookAt.clone().add(this.offset());
      if (this.mode === 'result') stiff = 6;
    }
    // critically damped spring (x'' = -k(x - want) - 2√k x')
    const k = stiff * stiff;
    const c = 2 * stiff;
    const step = (x: THREE.Vector3, v: THREE.Vector3, w: THREE.Vector3) => {
      const n = Math.max(1, Math.ceil(dt / (1 / 120)));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        v.x += (-k * (x.x - w.x) - c * v.x) * h;
        v.y += (-k * (x.y - w.y) - c * v.y) * h;
        v.z += (-k * (x.z - w.z) - c * v.z) * h;
        x.addScaledVector(v, h);
      }
    };
    step(this.pos, this.vel, want);
    step(this.look, this.lookVel, lookAt);
    this.cam.position.copy(this.pos);
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const s = this.trauma * this.trauma * this.motion;
    if (s > 0) {
      const t = this.time * 38;
      this.cam.position.x += (Math.sin(t * 1.1) + Math.sin(t * 2.3) * 0.5) * 0.5 * s;
      this.cam.position.y += Math.sin(t * 1.7 + 1) * 0.4 * s;
      this.cam.position.z += Math.sin(t * 1.3 + 2) * 0.5 * s;
    }
    this.cam.lookAt(this.look);
  }
}
