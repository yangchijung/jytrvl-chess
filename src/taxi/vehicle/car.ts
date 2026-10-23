// Rush Taxi — the car: a Rapier raycast vehicle (DynamicRayCastVehicleController) with arcade help on top.
// Local frame: +z forward, +y up, so +x is the car's LEFT; positive wheel steering turns left.
// Each fixed step: read the controls → set engine, brake and steering per wheel → arcade helpers (rush start,
// drift, air control, self-righting, drag) → the controller updates the wheels → the world steps (by the caller).
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import type { Controls } from '../core/input';
import { TUNING, type Tuning } from './tuning';

type R = typeof RAPIER_NS;
type V3 = { x: number; y: number; z: number };
type Q = { x: number; y: number; z: number; w: number };

export const HALF = { x: 0.9, y: 0.38, z: 2.05 };
const WHEELS: [number, number][] = [
  [0.82, 1.35], // front left
  [-0.82, 1.35], // front right
  [0.82, -1.35], // rear left
  [-0.82, -1.35], // rear right
];
const FRONT = [0, 1];
const REAR = [2, 3];

export const rotate = (q: Q, v: V3): V3 => {
  // v' = q v q*
  const ix = q.w * v.x + q.y * v.z - q.z * v.y,
    iy = q.w * v.y + q.z * v.x - q.x * v.z,
    iz = q.w * v.z + q.x * v.y - q.y * v.x,
    iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return { x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y, y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z, z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x };
};
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const yawQuat = (yaw: number): Q => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });

export interface CarEvents {
  rush: number;
  driftTime: number;
  airTime: number;
  longestAir: number;
  landings: number;
  flips: number;
  /** strength of the last landing (m/s down), for the camera shake */
  lastLanding: number;
  /** how long the last flight lasted (s) */
  lastAir: number;
}

export class Car {
  body: RAPIER_NS.RigidBody;
  collider: RAPIER_NS.Collider;
  vehicle: RAPIER_NS.DynamicRayCastVehicleController;
  t: Tuning;
  steer = 0;
  drifting = false;
  airborne = false;
  /** seconds left of the rush boost */
  rushLeft = 0;
  private rushCool = 0;
  private gasWas = false;
  private gasReleasedAt = -9;
  private brakeStart = -9;
  private flick = 0;
  private driftEntry = 0;
  private tilt = 0;
  private airFor = 0;
  private now = 0;
  private spawn: { p: V3; yaw: number };
  ev: CarEvents = { rush: 0, driftTime: 0, airTime: 0, longestAir: 0, landings: 0, flips: 0, lastLanding: 0, lastAir: 0 };

  constructor(
    private R: R,
    private world: RAPIER_NS.World,
    spawn: V3,
    yaw = 0,
    tuning: Tuning = { ...TUNING },
  ) {
    this.t = tuning;
    this.spawn = { p: spawn, yaw };
    this.body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(spawn.x, spawn.y, spawn.z).setRotation(yawQuat(yaw)).setCanSleep(false).setCcdEnabled(true).setAngularDamping(0.4));
    this.collider = world.createCollider(this.colliderDesc(), this.body);
    this.vehicle = world.createVehicleController(this.body);
    this.vehicle.indexUpAxis = 1;
    this.vehicle.setIndexForwardAxis = 2;
    for (const [x, z] of WHEELS) this.vehicle.addWheel({ x, y: -0.15, z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, this.t.suspRest, this.t.wheelRadius);
    this.applyTuning();
  }

  private colliderDesc() {
    const { mass: m, comHeight } = this.t;
    const w = HALF.x * 2,
      h = HALF.y * 2,
      l = HALF.z * 2;
    const inertia = { x: (m / 12) * (h * h + l * l), y: (m / 12) * (w * w + l * l), z: (m / 12) * (w * w + h * h) };
    return this.R.ColliderDesc.cuboid(HALF.x, HALF.y, HALF.z)
      .setMassProperties(m, { x: 0, y: comHeight, z: 0 }, inertia, { x: 0, y: 0, z: 0, w: 1 })
      .setFriction(this.t.bodyFriction)
      .setRestitution(this.t.bodyRestitution)
      .setActiveEvents(this.R.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(this.t.crashForce);
  }

  /** push the tuning numbers into Rapier (called after the dev panel changes something) */
  applyTuning() {
    const v = this.vehicle;
    for (let i = 0; i < 4; i++) {
      v.setWheelSuspensionRestLength(i, this.t.suspRest);
      v.setWheelRadius(i, this.t.wheelRadius);
      v.setWheelSuspensionStiffness(i, this.t.suspStiffness);
      v.setWheelSuspensionCompression(i, this.t.suspCompression);
      v.setWheelSuspensionRelaxation(i, this.t.suspRelaxation);
      v.setWheelMaxSuspensionForce(i, 1e5);
      v.setWheelMaxSuspensionTravel(i, this.t.suspTravel);
      v.setWheelFrictionSlip(i, this.t.grip);
      v.setWheelSideFrictionStiffness(i, this.t.sideStiffness);
    }
    if (this.collider) {
      this.world.removeCollider(this.collider, false);
      this.collider = this.world.createCollider(this.colliderDesc(), this.body);
    }
  }

  forward() {
    return rotate(this.body.rotation(), { x: 0, y: 0, z: 1 });
  }
  up() {
    return rotate(this.body.rotation(), { x: 0, y: 1, z: 0 });
  }
  /** signed speed along the car's nose (m/s) */
  speed() {
    return dot(this.body.linvel(), this.forward());
  }
  kmh() {
    return Math.abs(this.speed()) * 3.6;
  }
  wheelsDown() {
    let n = 0;
    for (let i = 0; i < 4; i++) if (this.vehicle.wheelIsInContact(i)) n++;
    return n;
  }

  reset(p = this.spawn.p, yaw = this.spawn.yaw) {
    this.body.setTranslation(p, true);
    this.body.setRotation(yawQuat(yaw), true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.drifting = false;
    this.rushLeft = 0;
    this.steer = 0;
  }
  /** put the car back on its wheels where it is, facing the way it was heading */
  private rightSelf() {
    const f = this.forward();
    const yaw = Math.atan2(f.x, f.z);
    const p = this.body.translation();
    this.body.setTranslation({ x: p.x, y: p.y + 1.2, z: p.z }, true);
    this.body.setRotation(yawQuat(yaw), true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    const lv = this.body.linvel();
    this.body.setLinvel({ x: lv.x * 0.3, y: 0, z: lv.z * 0.3 }, true);
    this.ev.flips++;
  }

  /** one fixed step of driving (before world.step) */
  update(c: Controls, dt: number) {
    const t = this.t;
    this.now += dt;
    if (c.reset) this.rightSelfOrRespawn();
    const v = this.vehicle;
    const sp = this.speed();
    const top = t.topSpeedKmh / 3.6;
    const topRev = t.topReverseKmh / 3.6;
    const down = this.wheelsDown();
    const m = t.mass;

    // ---- rush start: let go of the gas and press it again quickly while (nearly) stopped, or press rush
    const gas = c.throttle > 0.5;
    if (!gas && this.gasWas) this.gasReleasedAt = this.now;
    const gasEdge = gas && !this.gasWas;
    this.gasWas = gas;
    this.rushCool = Math.max(0, this.rushCool - dt);
    const slow = Math.abs(sp) < 2.5;
    if (down >= 2 && this.rushCool === 0 && ((gasEdge && slow && this.now - this.gasReleasedAt < t.rushWindow) || (c.rush && Math.abs(sp) < 7))) {
      const f = this.forward();
      this.body.applyImpulse({ x: f.x * m * t.rushBoost, y: 0, z: f.z * m * t.rushBoost }, true);
      this.rushLeft = t.rushTime;
      this.rushCool = 1.5;
      this.ev.rush++;
    }
    this.rushLeft = Math.max(0, this.rushLeft - dt);

    // ---- pedals: gas forward; brake slows, then reverses once stopped; gas while rolling back brakes first
    let engine = 0;
    let brake = 0;
    if (c.brake > 0.5) {
      if (sp > 1.5) brake = t.brakeForce * c.brake;
      else if (sp > -topRev) engine = -t.reverseForce * c.brake;
    }
    if (c.throttle > 0) {
      if (sp < -1.5) brake = t.brakeForce * c.throttle;
      else if (sp < top) engine = t.engineForce * c.throttle * (this.rushLeft > 0 ? 1.6 : 1);
    }
    if (!c.throttle && !c.brake) brake = t.coastBrake;

    // ---- drift: hold the drift key at speed, or flick back to the brake and onto the gas at speed
    if (c.brake > 0.5 && this.brakeStart < 0) this.brakeStart = this.now;
    if (c.brake <= 0.5 && this.brakeStart >= 0) {
      if (gas && this.now - this.brakeStart < 0.35 && sp > 10) this.flick = 0.9;
      this.brakeStart = -9;
    }
    this.flick = Math.max(0, this.flick - dt);
    const wasDrifting = this.drifting;
    this.drifting = (c.drift || this.flick > 0) && Math.abs(sp) > 7 && (down >= 2 || (wasDrifting && down >= 1));
    if (this.drifting) this.ev.driftTime += dt;
    const lvNow = this.body.linvel();
    const flatSpeed = Math.hypot(lvNow.x, lvNow.z);
    if (this.drifting && !wasDrifting) this.driftEntry = flatSpeed;
    if (this.drifting && flatSpeed > 1 && flatSpeed < this.driftEntry * t.driftKeep) {
      // keep the slide's speed: push along the direction of travel, never past the kept share of the entry speed
      const need = Math.min(this.driftEntry * t.driftKeep - flatSpeed, 30 * dt);
      this.body.applyImpulse({ x: (lvNow.x / flatSpeed) * need * m, y: 0, z: (lvNow.z / flatSpeed) * need * m }, true);
    }

    // ---- steering: less lock at speed; the wheels turn at a limited rate (+1 input = right = negative angle)
    const k = Math.min(1, Math.abs(sp) / top);
    const lock = t.steerLow + (t.steerHigh - t.steerLow) * k;
    const want = -c.steer * lock * (this.drifting ? 1.25 : 1);
    const d = want - this.steer;
    this.steer += Math.sign(d) * Math.min(Math.abs(d), t.steerRate * dt);

    for (let i = 0; i < 4; i++) {
      v.setWheelEngineForce(i, engine / 4);
      v.setWheelBrake(i, brake / 4);
    }
    for (const i of FRONT) v.setWheelSteering(i, this.steer);
    for (const i of REAR) {
      v.setWheelFrictionSlip(i, this.drifting ? t.driftGrip : t.grip);
      v.setWheelSideFrictionStiffness(i, this.drifting ? t.driftSideStiffness : t.sideStiffness);
    }
    const up = this.up();
    if (this.drifting) {
      // hold the slide near a target angle (steer × maxDriftAngle): yaw help while short of it, a counter-push
      // and yaw damping past it, so a drift settles at a big but controllable angle instead of spinning out
      const lvd = this.body.linvel();
      const f = this.forward();
      const spd = Math.hypot(lvd.x, lvd.z);
      if (spd > 3) {
        // slip = nose heading − travel heading (+ = nose left of travel); both measured like angvel.y
        const slip = Math.atan2(f.x * lvd.z - f.z * lvd.x, f.x * lvd.x + f.z * lvd.z);
        const target = (-c.steer * t.maxDriftAngle * Math.PI) / 180; // steer right → nose right of travel
        // arcade carve: the direction of travel swings towards the nose at a steady rate, keeping the speed —
        // this is what takes the car round the corner while it slides
        const carve = Math.abs(slip) > 0.08 ? Math.sign(slip) * Math.min(Math.abs(slip), t.driftCarve * dt) : 0;
        if (carve) {
          const cs = Math.cos(carve),
            sn = Math.sin(carve);
          // rotating (x, z) by +carve about +y turns +z towards +x, like angvel.y
          this.body.setLinvel({ x: lvd.x * cs + lvd.z * sn, y: lvd.y, z: -lvd.x * sn + lvd.z * cs }, true);
        }
        const pathRate = carve / dt;
        // the yaw rate follows the path's turning plus a correction that closes the angle error
        const av = this.body.angvel();
        const want = pathRate + (target - slip) * t.driftYawGain;
        const k2 = 1 - Math.exp(-dt * t.driftYawDamp);
        this.body.setAngvel({ x: av.x, y: av.y + (want - av.y) * k2, z: av.z }, true);
      }
    }

    // ---- in the air: steer turns the car, gas dips / brake lifts the nose; roll settles so it lands flat
    const wasAir = this.airborne;
    this.airborne = down === 0;
    if (this.airborne) {
      this.airFor += dt;
      this.ev.airTime += dt;
      this.ev.longestAir = Math.max(this.ev.longestAir, this.airFor);
      const right = rotate(this.body.rotation(), { x: -1, y: 0, z: 0 });
      const yaw = -c.steer * t.airYaw * dt;
      const pitch = (c.brake - c.throttle) * t.airPitch * dt; // gas dips the nose, brake lifts it
      this.body.applyTorqueImpulse({ x: right.x * pitch, y: yaw + right.y * pitch, z: right.z * pitch }, true);
      const av = this.body.angvel();
      const f = this.forward();
      const roll = dot(av, f);
      this.body.setAngvel({ x: av.x - f.x * roll * 0.04, y: av.y - f.y * roll * 0.04, z: av.z - f.z * roll * 0.04 }, true);
    } else {
      if (wasAir && this.airFor > 0.25) {
        this.ev.landings++;
        this.ev.lastLanding = Math.abs(this.body.linvel().y);
        this.ev.lastAir = this.airFor;
      }
      this.airFor = 0;
    }

    // ---- air drag, so top speed is reached smoothly
    const lv = this.body.linvel();
    const vv = Math.hypot(lv.x, lv.z);
    if (vv > 0.1) {
      const f = -t.drag * vv * dt;
      this.body.applyImpulse({ x: lv.x * f, y: 0, z: lv.z * f }, true);
    }

    // ---- self-righting: tilted past the limit for long enough
    const tiltDeg = (Math.acos(Math.max(-1, Math.min(1, up.y))) * 180) / Math.PI;
    this.tilt = tiltDeg > t.flipAngle ? this.tilt + dt : 0;
    if (this.tilt >= t.flipTime) {
      this.tilt = 0;
      this.rightSelf();
    }
    // fell off the world
    if (this.body.translation().y < -20) this.reset();

    v.updateVehicle(dt);
  }

  private rightSelfOrRespawn() {
    if (this.body.translation().y < -5) this.reset();
    else this.rightSelf();
  }
}
