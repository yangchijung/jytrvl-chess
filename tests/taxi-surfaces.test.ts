import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { parseQuality, qualityFor } from '../src/taxi/fx/quality';
import { bankRise, bindEnvironment, NOISE_SIZE, roadMaterial, roadNoiseData, ROAD_LOOK, roadNoise, setSurfaceQuality, setWet, SURF, surfFor, taxiBodyMaterial, taxiGlassMaterial, trafficMaterial, WET, withGlassReflection } from '../src/taxi/fx/surfaces';
import { farCityRing, keepHemisphereAmbient, lightLevel } from '../src/taxi/fx/envLight';
import { colored, sedanGeometry } from '../src/taxi/fx/taxiModel';
import { buildingMaterial, waterMaterial } from '../src/taxi/world/decor';
import { FACADE_DECODE_GLSL, GLASS_TOWER_SHARE, LOOK_TOWER } from '../src/taxi/world/facade';

/** run a material's onBeforeCompile on the real three.js shader source, as the renderer would */
function compile(mat: THREE.Material, lib: keyof typeof THREE.ShaderLib) {
  const sh = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib[lib].vertexShader, fragmentShader: THREE.ShaderLib[lib].fragmentShader, defines: {} } as unknown as THREE.WebGLProgramParametersWithUniforms;
  mat.onBeforeCompile(sh, null as unknown as THREE.WebGLRenderer);
  return sh;
}

afterEach(() => {
  bindEnvironment(null);
  setSurfaceQuality('low');
  setWet(0);
});

describe('quality tier', () => {
  it('reads ?q= and falls back by device', () => {
    expect(parseQuality('HIGH')).toBe('high');
    expect(parseQuality('ultra')).toBeNull();
    expect(parseQuality(null)).toBeNull();
    expect(qualityFor(false, 1080)).toBe('high');
    expect(qualityFor(true, 820)).toBe('mid'); // the e2e's tablet
    expect(qualityFor(true, 390)).toBe('low');
  });
});

describe('environment map', () => {
  it('keeps the hemisphere light as the only ambient (no image-based diffuse) and patches only once', () => {
    expect(keepHemisphereAmbient()).toBe(true);
    const src = THREE.ShaderChunk.lights_fragment_maps;
    expect(src).toContain('defined( ENV_IBL_DIFFUSE )');
    expect(src).not.toContain('defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG )');
    expect(keepHemisphereAmbient()).toBe(true);
    expect(THREE.ShaderChunk.lights_fragment_maps).toBe(src);
  });
  it('goes only to the materials that reflect, before and after it exists, and unbinds', () => {
    setSurfaceQuality('mid');
    const early = roadMaterial('#525459', 'asphalt') as THREE.MeshLambertMaterial;
    const plain = new THREE.MeshLambertMaterial();
    const tex = new THREE.Texture();
    tex.mapping = THREE.CubeUVReflectionMapping;
    bindEnvironment(tex);
    const late = taxiBodyMaterial() as THREE.MeshStandardMaterial;
    expect(early.envMap).toBe(tex);
    expect(late.envMap).toBe(tex);
    expect(plain.envMap).toBeNull();
    bindEnvironment(null);
    expect(early.envMap).toBeNull();
    setSurfaceQuality('low');
    expect((roadMaterial('#525459', 'asphalt') as THREE.MeshLambertMaterial).envMap).toBeNull();
  });
  it('the light level is 1 for the afternoon set-up and falls with the light', () => {
    const day = [
      { kind: 'hemi' as const, color: new THREE.Color('#CFE8FF').lerp(new THREE.Color('#8C7B5E'), 0.3), intensity: 1.15 },
      { kind: 'sun' as const, color: new THREE.Color('#FFEACB'), intensity: 2.6 },
    ];
    expect(lightLevel(day)).toBeGreaterThan(0.85);
    expect(lightLevel(day)).toBeLessThan(1.15);
    expect(lightLevel([{ ...day[0], intensity: 0.2 }])).toBeLessThan(0.2);
  });
  it('the far city ring is deterministic and stays below the sky dome', () => {
    const a = farCityRing(),
      b = farCityRing();
    expect(a).toEqual(b);
    for (const k of a) {
      const r = Math.hypot(k.x, k.z);
      expect(r).toBeGreaterThan(200);
      expect(r).toBeLessThan(480);
      expect(k.h).toBeLessThan(140);
    }
  });
});

describe('car surfaces', () => {
  it('tells paint, glass, rubber, chrome apart by colour, and tags every part', () => {
    expect(surfFor('#ffc72c')).toBe(SURF.paint);
    expect(surfFor('#33475C')).toBe(SURF.glass);
    expect(surfFor('#1E2228')).toBe(SURF.rubber);
    expect(surfFor('#C9CED6')).toBe(SURF.chrome);
    expect(surfFor('#E53935')).toBe(SURF.paint); // a livery stripe
    const g = colored(new THREE.BoxGeometry(1, 1, 1), '#262A30', SURF.rubber);
    expect(Array.from(g.getAttribute('aSurf').array).every((v) => v === SURF.rubber)).toBe(true);
    const sedan = sedanGeometry();
    expect(sedan.paint.getAttribute('aSurf')).toBeTruthy();
    expect(Array.from(sedan.detail.getAttribute('aSurf').array)).toContain(SURF.glass);
  });
  it('low keeps Lambert; mid gives the taxi glossy paint, high a clearcoat; the traffic shares one standard material', () => {
    expect(taxiBodyMaterial()).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(trafficMaterial()).toBeInstanceOf(THREE.MeshLambertMaterial);
    setSurfaceQuality('mid');
    const gloss = taxiBodyMaterial() as THREE.MeshPhysicalMaterial;
    expect(gloss.isMeshStandardMaterial && !gloss.isMeshPhysicalMaterial).toBe(true);
    expect(compile(gloss, 'standard').fragmentShader).toContain('radiance *= envK');
    setSurfaceQuality('high');
    const body = taxiBodyMaterial() as THREE.MeshPhysicalMaterial;
    expect(body.isMeshPhysicalMaterial).toBe(true);
    expect(body.clearcoat).toBe(1);
    const sh = compile(body, 'physical');
    expect(sh.fragmentShader).toContain('material.clearcoat *= step(floor(vSurf + 0.5), 0.5)');
    expect(sh.fragmentShader).toContain('roughnessFactor = uPaintRough');
    expect(sh.fragmentShader).toContain('radiance *= envK');
    expect(sh.vertexShader).toContain('vSurf = aSurf');
    expect((taxiGlassMaterial(0.62) as THREE.MeshStandardMaterial).isMeshStandardMaterial).toBe(true);
    setSurfaceQuality('mid');
    const npc = trafficMaterial();
    expect(npc).toBe(trafficMaterial());
    expect((npc as THREE.MeshStandardMaterial).isMeshStandardMaterial).toBe(true);
    expect((npc as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial).toBeFalsy();
  });
});

describe('glass towers', () => {
  it('decodes the tower style from facade.ts and adds the reflection beside the facade shader', () => {
    expect(FACADE_DECODE_GLSL).toContain(`== ${LOOK_TOWER}`);
    expect(FACADE_DECODE_GLSL).toContain(GLASS_TOWER_SHARE.toFixed(2));
    const plain = buildingMaterial();
    const mat = withGlassReflection(buildingMaterial());
    expect(mat.customProgramCacheKey()).not.toBe(plain.customProgramCacheKey());
    const sh = compile(mat, 'lambert');
    // the tower decision is per building, made once per vertex; the fragment only reflects on glass
    expect(sh.vertexShader).toContain('vGlass = facadeIsGlass(aLook,');
    expect(sh.vertexShader.indexOf('vGlass = facadeIsGlass')).toBeLessThan(sh.vertexShader.indexOf('#include <project_vertex>'));
    expect(sh.fragmentShader).toContain('if (vGlass > 0.5');
    // the facade shader's own work is untouched and still comes first
    expect(sh.fragmentShader.indexOf('glass tower: tinted curtain wall')).toBeGreaterThan(0);
    expect(sh.fragmentShader.indexOf('if (vGlass > 0.5')).toBeGreaterThan(sh.fragmentShader.indexOf('glass tower: tinted curtain wall'));
    expect(sh.uniforms.uGlassRefl).toBeTruthy();
  });
});

describe('water', () => {
  it('low is the original shader; mid reflects the sky and the bank; high adds the mirror', () => {
    const low = compile(waterMaterial('#2397B8', { tier: 'low' }).mat, 'phong');
    expect(low.fragmentShader).not.toContain('uWaterBox');
    const mid = waterMaterial('#2397B8', { tier: 'mid', box: [-300, 300, -18, 18] });
    const sm = compile(mid.mat, 'phong');
    expect(sm.fragmentShader).toContain('uniform vec4 uWaterBox');
    expect(sm.fragmentShader).toContain('textureCubeUV(envMap');
    expect(mid.mat.defines?.WATER_MIRROR).toBeUndefined();
    const high = waterMaterial('#2397B8', { tier: 'high' });
    expect(high.mat.defines?.WATER_MIRROR).toBe('');
    expect(compile(high.mat, 'phong').uniforms.uMirrorOn).toBeTruthy();
    expect(high.mat.customProgramCacheKey()).not.toBe(mid.mat.customProgramCacheKey());
  });
  it('the bank: a low reflected ray meets the quay below the bank height, a steep one clears it', () => {
    const river: [number, number, number, number] = [-300, 300, -18, 18];
    const low = bankRise(0, 0, 0, 0.1, 1, river);
    expect(low.dist).toBeCloseTo(18, 5);
    expect(low.rise).toBeCloseTo(1.8, 5);
    const steep = bankRise(0, 0, 0, 2, 1, river);
    expect(steep.rise).toBeCloseTo(36, 5);
    // looking along the river the bank is the far end
    expect(bankRise(0, 10, 1, 0.05, 0, river).dist).toBeCloseTo(300, 5);
    // diagonally the nearer edge wins
    const d = bankRise(0, 0, 1, 0.1, 1, river);
    expect(d.dist).toBeCloseTo(18 * Math.SQRT2, 4);
  });
});

describe('roads', () => {
  it('one tiny shared noise texture', () => {
    const t = roadNoise();
    expect(t).toBe(roadNoise());
    expect(t.image.width).toBe(NOISE_SIZE);
    // three scales in one read: the patch and blob channels are smooth (neighbours close), the grain is not
    const d = roadNoiseData();
    const step = (c: number) => Math.max(...Array.from({ length: NOISE_SIZE - 1 }, (_, x) => Math.abs(d[x * 4 + c] - d[(x + 1) * 4 + c])));
    expect(step(1)).toBeLessThan(40);
    expect(step(2)).toBeLessThan(25);
    expect(step(0)).toBeGreaterThan(100);
    // and it tiles: the last column runs smoothly into the first
    expect(Math.abs(d[(NOISE_SIZE - 1) * 4 + 1] - d[1])).toBeLessThan(40);
    expect(t.wrapS).toBe(THREE.RepeatWrapping);
  });
  it('mid: grain from one read on Lambert; high: varied shine and paint sheen on Phong; wet stays off by default', () => {
    setSurfaceQuality('mid');
    expect(WET.value).toBe(0);
    const lm = roadMaterial('#525459', 'asphalt') as THREE.MeshLambertMaterial;
    expect(lm.isMeshLambertMaterial).toBe(true);
    const lsh = compile(lm, 'lambert');
    expect(lsh.fragmentShader.match(/texture2D\( ?uRoadNoise/g)?.length).toBe(2);
    expect(lsh.fragmentShader).toContain('#ifdef ROAD_FINE');
    expect(lm.defines?.ROAD_FINE).toBeUndefined();
    expect(lsh.fragmentShader).not.toContain('uShine * (0.55');
    setSurfaceQuality('high');
    const m = roadMaterial('#525459', 'asphalt') as THREE.MeshPhongMaterial;
    expect(m.isMeshPhongMaterial).toBe(true);
    expect(m.shininess).toBe(ROAD_LOOK.asphalt.shin);
    const sh = compile(m, 'phong');
    expect(sh.fragmentShader).toContain('uShine * (0.55');
    expect(m.defines?.ROAD_FINE).toBe('');
    expect(sh.fragmentShader).toContain('rPuddle');
    expect(sh.vertexShader).toContain('vRw = (modelMatrix * rw).xyz');
    expect(sh.uniforms.uWet).toBe(WET);
    expect(ROAD_LOOK.paint.spec).toBeGreaterThan(ROAD_LOOK.asphalt.spec);
  });
  it('setWet clamps, and on low simply darkens the street colour', () => {
    const m = roadMaterial('#808080', 'asphalt') as THREE.MeshLambertMaterial;
    expect(m.isMeshLambertMaterial).toBe(true);
    const before = m.color.r;
    setWet(2);
    expect(WET.value).toBe(1);
    expect(m.color.r).toBeCloseTo(before * 0.65, 5);
    setWet(Number.NaN);
    expect(WET.value).toBe(0);
    expect(m.color.r).toBeCloseTo(before, 5);
  });
});
