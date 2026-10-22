// Rush Taxi — third-person chase camera: a damped spring behind the car, wider field of view with speed
// (60° → 75°), looks a little towards the nose's turn while drifting so the exit of the corner is visible, pulls
// back in the air, a short shake on hard landings, and never through a wall (a ray from the car pulls it in).
import * as THREE from 'three';

export interface CamTarget {
  pos: THREE.Vector3;
  fwd: THREE.Vector3;
  vel: THREE.Vector3;
  kmh: number;
  drifting: boolean;
  steer: number;
  airborne: boolean;
}

export class ChaseCam {
  cam: THREE.PerspectiveCamera;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private shake = 0;
  private first = true;
  private dir = new THREE.Vector3(0, 0, 1);

  constructor(aspect: number) {
    this.cam = new THREE.PerspectiveCamera(60, aspect, 0.3, 900);
  }
  /** jump straight to the chase position next update (after a reset) */
  snap() {
    this.first = true;
  }
  bump(strength: number) {
    this.shake = Math.min(0.6, this.shake + strength);
  }

  /**
   * @param occlude returns how far the camera can be from `from` towards `to` before something is in the way
   */
  update(t: CamTarget, dt: number, occlude: (from: THREE.Vector3, to: THREE.Vector3) => number) {
    // follow the heading, leaning towards the velocity when moving (a drift shows where the car is going)
    const flat = new THREE.Vector3(t.fwd.x, 0, t.fwd.z).normalize();
    const v = new THREE.Vector3(t.vel.x, 0, t.vel.z);
    const sp = v.length();
    const want = flat.clone();
    if (sp > 3) want.lerp(v.normalize(), t.drifting ? 0.25 : 0.5).normalize();
    if (t.drifting) want.applyAxisAngle(new THREE.Vector3(0, 1, 0), -t.steer * 0.35); // look into the corner
    this.dir.lerp(want, 1 - Math.exp(-dt * (t.drifting ? 3 : 5))).normalize();

    const back = 7.5 + Math.min(2, t.kmh / 70) + (t.airborne ? 2.5 : 0);
    const height = 3.2 + (t.airborne ? 1.2 : 0);
    const goal = t.pos.clone().addScaledVector(this.dir, -back).add(new THREE.Vector3(0, height, 0));
    const lookAt = t.pos.clone().addScaledVector(this.dir, 4).add(new THREE.Vector3(0, 1.2, 0));
    // keep the camera out of walls: from the car's roof towards the goal
    const head = t.pos.clone().add(new THREE.Vector3(0, 1.6, 0));
    const full = goal.distanceTo(head);
    const free = occlude(head, goal);
    if (free < full) {
      // something behind the car: first try rising over the car (closer and higher, still showing the road ahead);
      // only if that is blocked too, pull in along the ray
      const high = t.pos.clone().addScaledVector(this.dir, -back * 0.55).add(new THREE.Vector3(0, height + 4, 0));
      const freeHigh = occlude(head, high);
      if (freeHigh >= high.distanceTo(head) - 0.01) goal.copy(high);
      else if (freeHigh > free) goal.copy(head).addScaledVector(high.sub(head).normalize(), Math.max(1.5, freeHigh - 0.4));
      else goal.copy(head).addScaledVector(goal.clone().sub(head).normalize(), Math.max(1.5, free - 0.4));
    }

    if (this.first) {
      this.dir.copy(want);
      goal.copy(t.pos).addScaledVector(this.dir, -back).add(new THREE.Vector3(0, height, 0));
      this.pos.copy(goal);
      this.look.copy(lookAt);
      this.first = false;
    }
    // stiffer at speed so the taxi does not shrink into the distance on a long straight
    const k = 1 - Math.exp(-dt * (8 + t.kmh / 20));
    this.pos.lerp(goal, k);
    this.look.lerp(lookAt, 1 - Math.exp(-dt * 12));
    this.cam.position.copy(this.pos);
    if (this.shake > 0.001) {
      this.cam.position.y += (Math.random() - 0.5) * this.shake;
      this.cam.position.x += (Math.random() - 0.5) * this.shake * 0.5;
      this.shake *= Math.exp(-dt * 9);
    }
    this.cam.lookAt(this.look);
    const fov = 60 + 15 * Math.min(1, t.kmh / 140);
    if (Math.abs(this.cam.fov - fov) > 0.05) {
      this.cam.fov += (fov - this.cam.fov) * (1 - Math.exp(-dt * 4));
      this.cam.updateProjectionMatrix();
    }
  }
}
