// Rush Taxi — every number that shapes how the car drives, in one place (open the dev panel with ~ to change
// them live). Arcade, not simulation: quick acceleration, ~140 km/h top speed, sharp steering, drifts that are
// easy to start and to hold. Units: metres, seconds, newtons, kilograms, radians.

export interface Tuning {
  /** chassis mass (kg) and where its centre of mass sits below the body centre (m, negative = lower) */
  mass: number;
  comHeight: number;
  /** total engine force spread over the four wheels (N) and the top speed (km/h) */
  engineForce: number;
  topSpeedKmh: number;
  reverseForce: number;
  topReverseKmh: number;
  /** brake impulse per wheel and the gentle rolling brake when no pedal is pressed */
  brakeForce: number;
  coastBrake: number;
  /** steering angle at standstill and at top speed (rad), and how fast the wheels turn (rad/s) */
  steerLow: number;
  steerHigh: number;
  steerRate: number;
  /** tyre grip: friction slip and side stiffness, normal and while drifting (rear wheels) */
  grip: number;
  sideStiffness: number;
  driftGrip: number;
  driftSideStiffness: number;
  /** drift angle control: yaw rate (rad/s) per radian of angle error, and how quickly the rate is reached (1/s) */
  driftYawGain: number;
  /** the slide angle a full steer holds while drifting (deg), how fast the path carves round (rad/s) */
  maxDriftAngle: number;
  driftYawDamp: number;
  driftCarve: number;
  /** share of the entry speed a drift keeps (arcade: sliding does not scrub the speed away) */
  driftKeep: number;
  /** suspension: rest length, stiffness, damping (compression / relaxation), wheel radius, max travel */
  suspRest: number;
  suspStiffness: number;
  suspCompression: number;
  suspRelaxation: number;
  wheelRadius: number;
  suspTravel: number;
  /** rush start: window to press the gas again after letting go (s), the push (m/s) and its extra force time (s) */
  rushWindow: number;
  rushBoost: number;
  rushTime: number;
  /** air control: yaw and pitch torque from the controls while all wheels are off the ground */
  airYaw: number;
  airPitch: number;
  /** self-righting: tilt (deg) held for this long (s) puts the car back on its wheels */
  flipAngle: number;
  flipTime: number;
  /** walls: how bouncy and how slippery the car body is */
  bodyRestitution: number;
  bodyFriction: number;
  /** air drag so the car settles at top speed without a hard wall */
  drag: number;
}

export const TUNING: Tuning = {
  mass: 1200,
  comHeight: -0.35,
  engineForce: 9500,
  topSpeedKmh: 140,
  reverseForce: 5000,
  topReverseKmh: 35,
  brakeForce: 40,
  coastBrake: 4,
  steerLow: 0.6,
  steerHigh: 0.16,
  steerRate: 3.2,
  grip: 6,
  sideStiffness: 1.3,
  driftGrip: 1.6,
  driftSideStiffness: 0.45,
  driftYawGain: 3.5,
  driftKeep: 0.92,
  maxDriftAngle: 38,
  driftYawDamp: 20,
  driftCarve: 1.1,
  suspRest: 0.32,
  suspStiffness: 34,
  suspCompression: 2.6,
  suspRelaxation: 3.4,
  wheelRadius: 0.38,
  suspTravel: 0.28,
  rushWindow: 0.3,
  rushBoost: 9,
  rushTime: 0.9,
  airYaw: 900,
  airPitch: 700,
  flipAngle: 70,
  flipTime: 1,
  bodyRestitution: 0.35,
  bodyFriction: 0.15,
  drag: 0.45,
};

/** ranges for the dev panel sliders */
export const TUNING_RANGE: Partial<Record<keyof Tuning, [number, number, number]>> = {
  mass: [600, 2500, 50],
  comHeight: [-0.8, 0.2, 0.05],
  engineForce: [2000, 20000, 250],
  topSpeedKmh: [60, 220, 5],
  brakeForce: [5, 120, 5],
  steerLow: [0.2, 0.9, 0.02],
  steerHigh: [0.05, 0.5, 0.01],
  steerRate: [0.5, 8, 0.1],
  grip: [1, 15, 0.25],
  sideStiffness: [0.2, 3, 0.05],
  driftGrip: [0.3, 6, 0.1],
  driftSideStiffness: [0.05, 2, 0.05],
  driftYawGain: [0.5, 10, 0.1],
  driftKeep: [0.5, 1, 0.01],
  maxDriftAngle: [10, 70, 1],
  driftYawDamp: [0.5, 40, 0.5],
  driftCarve: [0, 3, 0.05],
  suspStiffness: [8, 80, 1],
  suspCompression: [0.5, 8, 0.1],
  suspRelaxation: [0.5, 8, 0.1],
  rushBoost: [0, 20, 0.5],
  airYaw: [0, 3000, 50],
  airPitch: [0, 3000, 50],
  bodyRestitution: [0, 1, 0.05],
  drag: [0, 2, 0.05],
};
