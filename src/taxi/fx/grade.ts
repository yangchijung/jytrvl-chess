// Rush Taxi: the 'high' tier's colour grade and vignette, as GLSL for the post pass and the same maths in TypeScript
// for the tests. Works on display (sRGB) values after the output conversion. A gentle S-curve for depth, a touch of
// warmth in the shade, slightly richer colour; colours close to the taxi yellow (#FFC72C) are left as they are, so the
// cab reads the same on every tier.

export const TAXI_YELLOW: readonly [number, number, number] = [0xff / 255, 0xc7 / 255, 0x2c / 255];
export const GRADE = {
  /** 0 = straight line, 1 = full smoothstep S-curve */
  contrast: 0.1,
  /** added to dark pixels (scaled by (1 − luma)²): warm, never blue shadows */
  shadowTint: [0.01, 0.004, -0.008] as const,
  saturation: 1.06,
  /** within this chromaticity distance of the taxi yellow the grade is off; it is fully on past `protectTo` */
  protectFrom: 0.1,
  protectTo: 0.28,
  /** how much the corners darken (0 = none) */
  vignette: 0.16,
};

const LUMA = [0.2126, 0.7152, 0.0722] as const;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** the grade of one display colour (0..1 per channel); mirrors GRADE_GLSL exactly */
export function gradeColour(c: readonly [number, number, number]): [number, number, number] {
  const luma = c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2];
  const k = (1 - luma) * (1 - luma);
  let g = c.map((v, i) => {
    const s = v * v * (3 - 2 * v);
    return v + (s - v) * GRADE.contrast + GRADE.shadowTint[i] * k;
  });
  const gl = g[0] * LUMA[0] + g[1] * LUMA[1] + g[2] * LUMA[2];
  g = g.map((v) => clamp01(gl + (v - gl) * GRADE.saturation));
  // by chromaticity (the colour divided by its brightest channel), so the cab in sun and in shade both count
  const m = Math.max(c[0], c[1], c[2], 1e-3);
  const d = Math.hypot(c[0] / m - TAXI_YELLOW[0], c[1] / m - TAXI_YELLOW[1], c[2] / m - TAXI_YELLOW[2]);
  const protect = (1 - smooth(GRADE.protectFrom, GRADE.protectTo, d)) * smooth(0.15, 0.35, m);
  return [0, 1, 2].map((i) => g[i] + (c[i] - g[i]) * protect) as [number, number, number];
}

/** how much a pixel at uv (0..1) is kept by the vignette; the middle of the screen is untouched */
export function vignetteAt(u: number, v: number, aspect: number): number {
  const x = (u - 0.5) * Math.min(aspect, 2),
    y = v - 0.5;
  const r = Math.hypot(x, y) / Math.hypot(Math.min(aspect, 2) * 0.5, 0.5);
  return 1 - GRADE.vignette * smooth(0.55, 1, r);
}

const f = (x: number) => x.toFixed(4);
export const GRADE_GLSL = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uAspect;
uniform float uOn;
varying vec2 vUv;
void main() {
  vec4 tex = texture2D(tDiffuse, vUv);
  vec3 c = clamp(tex.rgb, 0.0, 1.0);
  const vec3 LW = vec3(${LUMA.map(f).join(', ')});
  float luma = dot(c, LW);
  float k = (1.0 - luma) * (1.0 - luma);
  vec3 s = c * c * (3.0 - 2.0 * c);
  vec3 g = c + (s - c) * ${f(GRADE.contrast)} + vec3(${GRADE.shadowTint.map(f).join(', ')}) * k;
  float gl = dot(g, LW);
  g = clamp(vec3(gl) + (g - vec3(gl)) * ${f(GRADE.saturation)}, 0.0, 1.0);
  float m = max(max(c.r, c.g), max(c.b, 0.001));
  float protect = (1.0 - smoothstep(${f(GRADE.protectFrom)}, ${f(GRADE.protectTo)}, distance(c / m, vec3(${TAXI_YELLOW.map(f).join(', ')})))) * smoothstep(0.15, 0.35, m);
  vec3 outc = mix(g, c, protect);
  float a = min(uAspect, 2.0);
  float r = length(vec2((vUv.x - 0.5) * a, vUv.y - 0.5)) / length(vec2(a * 0.5, 0.5));
  outc *= 1.0 - ${f(GRADE.vignette)} * smoothstep(0.55, 1.0, r);
  gl_FragColor = vec4(mix(tex.rgb, outc, uOn), tex.a);
}`;

/**
 * Depth of field strength for the menu orbit and the results screen: a little more blur while the camera moves
 * (the orbit drifts at ~13 m/s), none at rest beyond a faint base. Returns the BokehShader aperture.
 */
export function dofAperture(camSpeed: number): number {
  const v = Math.min(30, Math.max(0, Number.isFinite(camSpeed) ? camSpeed : 0));
  return 0.00002 + v * 0.000003;
}
