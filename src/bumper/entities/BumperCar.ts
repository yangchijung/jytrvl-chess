// Crazy Bumper — one bumper car's rigid body (spec 5.2). Physics only, so the unit tests can drive it without a
// renderer; the toy look lives in CarModel.ts.
//
// Never flips: the body may only turn about the vertical axis (X/Z rotation locked) and its height is locked too
// (a flat arena, no ramps in P1), so no bounce can lift it or roll it over. The centre of mass still sits 0.5 m
// below the body origin as specified, which matters again if P2 ever unlocks tilt. The tilt you see after a hit
// is drawn by CarModel only.
import type RAPIER_NS from '@dimforge/rapier3d-compat';

type Rapier = typeof RAPIER_NS;

export const CAR = {
  mass: 150,
  /** u/s the motor pushes to; dashes and bounces can go faster for a moment */
  topSpeed: 28,
  linearDamping: 1.2,
  angularDamping: 3.5,
  ringRestitution: 1.15,
  friction: 0.3,
  /** centre of mass, below the body origin (m) */
  comY: -0.5,
  ringRadius: 1.55,
  ringHalfHeight: 0.32,
  /** the ring's centre height above the floor */
  rideY: 0.42,
  /** extra push at a standstill (×), fading out by top speed: a quick, high-torque start */
  launch: 0.6,
  /** fastest turn while steering (rad/s) */
  turnRate: 5.2,
  /** how fast sideways sliding is removed while driving (1/s); low = slippery arcade feel */
  grip: 2.4,
  /** after a hard hit the driver has no grip or steering for this long (s): the bounce plays out */
  stunTime: 0.32,
  /** forward speed change of a dash (u/s) */
  dash: 15,
  dashCooldown: 2.5,
  /** how long a dash counts as "dashing" for trails and (P2) heavy hits */
  dashTime: 0.55,
} as const;

/** what a driver (child or bot) asks for: a world direction on the floor and how hard to push (0–1) */
export interface DriveInput {
  x: number;
  z: number;
  thrust: number;
  dash: boolean;
}
export const NO_INPUT: DriveInput = { x: 0, z: 0, thrust: 0, dash: false };

export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class BumperCar {
  readonly body: RAPIER_NS.RigidBody;
  readonly collider: RAPIER_NS.Collider;
  cooldown = 0;
  dashing = 0;
  stun = 0;
  dashCount = 0;
  /** velocity before the last world step (impacts are measured with it) */
  readonly before = { x: 0, z: 0 };
  /** size multiplier (P2 giant mode sets it; P1 keeps 1) */
  scale = 1;
  /** the mass the driving forces use (Rapier only reports body.mass() after the first world step) */
  mass: number = CAR.mass;

  constructor(
    private R: Rapier,
    world: RAPIER_NS.World,
    p: { x: number; z: number },
    yaw: number,
  ) {
    const desc = R.RigidBodyDesc.dynamic()
      .setTranslation(p.x, CAR.rideY, p.z)
      .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
      .setLinearDamping(CAR.linearDamping)
      .setAngularDamping(CAR.angularDamping)
      .setGravityScale(0)
      .enabledRotations(false, true, false)
      .enabledTranslations(true, false, true)
      .setCcdEnabled(true)
      // a solid disc: I = ½ m r² about the vertical axis
      .setAdditionalMassProperties(CAR.mass, { x: 0, y: CAR.comY, z: 0 }, { x: 0.5 * CAR.mass * CAR.ringRadius ** 2, y: 0.5 * CAR.mass * CAR.ringRadius ** 2, z: 0.5 * CAR.mass * CAR.ringRadius ** 2 }, { x: 0, y: 0, z: 0, w: 1 });
    this.body = world.createRigidBody(desc);
    this.collider = world.createCollider(
      R.ColliderDesc.cylinder(CAR.ringHalfHeight, CAR.ringRadius)
        .setDensity(0)
        .setRestitution(CAR.ringRestitution)
        .setRestitutionCombineRule(R.CoefficientCombineRule.Average)
        .setFriction(CAR.friction)
        .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),
      this.body,
    );
  }

  yaw(): number {
    const r = this.body.rotation();
    // rotation about Y only: q = (0, sin(θ/2), 0, cos(θ/2))
    return 2 * Math.atan2(r.y, r.w);
  }
  forward(): { x: number; z: number } {
    const y = this.yaw();
    return { x: Math.sin(y), z: Math.cos(y) };
  }
  speed(): number {
    const v = this.body.linvel();
    return Math.hypot(v.x, v.z);
  }
  pos(): { x: number; z: number } {
    const t = this.body.translation();
    return { x: t.x, z: t.z };
  }

  /** one fixed step of driving (call before world.step); returns true when a dash fired */
  update(input: DriveInput, dt: number): boolean {
    const m = this.mass;
    const v = this.body.linvel();
    this.before.x = v.x;
    this.before.z = v.z;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.dashing = Math.max(0, this.dashing - dt);
    this.stun = Math.max(0, this.stun - dt);
    const yaw = this.yaw();
    const f = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const thrust = Math.max(0, Math.min(1, input.thrust));
    const steering = thrust > 0.05 && (input.x !== 0 || input.z !== 0);
    let err = 0;
    if (steering) {
      err = wrapAngle(Math.atan2(input.x, input.z) - yaw);
      if (this.stun === 0) {
        const want = Math.max(-CAR.turnRate, Math.min(CAR.turnRate, err * 9));
        const w = this.body.angvel().y;
        this.body.setAngvel({ x: 0, y: w + (want - w) * Math.min(1, dt * 12), z: 0 }, true);
      }
    }
    const vf = v.x * f.x + v.z * f.z;
    if (steering && vf < CAR.topSpeed) {
      // push mostly when facing the way the stick points; turning on the spot first is fine for small hands
      const facing = Math.max(0, Math.min(1, (Math.cos(err) + 0.35) / 1.35));
      const a = CAR.linearDamping * CAR.topSpeed * (1 + CAR.launch * (1 - Math.max(0, vf) / CAR.topSpeed));
      const j = m * a * thrust * facing * dt * (this.stun > 0 ? 0.3 : 1);
      this.body.applyImpulse({ x: f.x * j, y: 0, z: f.z * j }, true);
    }
    if (this.stun === 0 && steering) {
      // remove some sideways slide so the car goes where it points, but not all: it stays a little slippery
      const lx = v.x - f.x * vf,
        lz = v.z - f.z * vf;
      const k = 1 - Math.exp(-CAR.grip * dt);
      this.body.applyImpulse({ x: -lx * m * k, y: 0, z: -lz * m * k }, true);
    }
    if (input.dash && this.cooldown === 0) {
      const j = m * CAR.dash;
      this.body.applyImpulse({ x: f.x * j, y: 0, z: f.z * j }, true);
      this.cooldown = CAR.dashCooldown;
      this.dashing = CAR.dashTime;
      this.dashCount++;
      return true;
    }
    return false;
  }

  /** after a collision: a moment without grip so the bounce plays out */
  hit(strength: number) {
    if (strength > 4) this.stun = Math.max(this.stun, CAR.stunTime * Math.min(1.5, strength / 12));
  }

  /** an extra shove (bumper posts, P2 shields) as a velocity change */
  kick(dx: number, dz: number) {
    const m = this.mass;
    this.body.applyImpulse({ x: dx * m, y: 0, z: dz * m }, true);
  }

  /** P2 giant mode: a bigger ring and a heavier car (scale 1 and 150 kg restore the normal car) */
  setSize(scale: number, mass: number) {
    if (Math.abs(scale - this.scale) > 1e-3) {
      this.scale = scale;
      this.collider.setRadius(CAR.ringRadius * scale);
      this.collider.setHalfHeight(CAR.ringHalfHeight * scale);
    }
    if (mass !== this.mass) {
      this.mass = mass;
      const r = CAR.ringRadius * this.scale;
      const I = 0.5 * mass * r * r;
      this.body.setAdditionalMassProperties(mass, { x: 0, y: CAR.comY, z: 0 }, { x: I, y: I, z: I }, { x: 0, y: 0, z: 0, w: 1 }, true);
    }
  }

  /** P2 shield: a bouncier ring */
  setRestitution(r: number) {
    if (Math.abs(this.collider.restitution() - r) < 1e-6) return;
    this.collider.setRestitution(r);
    // the shield's 1.6 wins over the other car's ring (Max); the normal ring averages
    this.collider.setRestitutionCombineRule(r > CAR.ringRestitution ? this.R.CoefficientCombineRule.Max : this.R.CoefficientCombineRule.Average);
  }

  reset(p: { x: number; z: number }, yaw: number) {
    this.setSize(1, CAR.mass);
    this.setRestitution(CAR.ringRestitution);
    this.body.setTranslation({ x: p.x, y: CAR.rideY, z: p.z }, true);
    this.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.cooldown = 0;
    this.dashing = 0;
    this.stun = 0;
  }
}
