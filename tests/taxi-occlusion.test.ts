import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { addOcclusionFade, occlusionFade, OCC_MAX, OCC_MAX_NEAR, OCC_NEAR, OCC_NEAR_BOARD } from '../src/taxi/fx/occlusion';

const cam = new THREE.Vector3(0, 3.2, -8);
const car = new THREE.Vector3(0, 0.9, 0);
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

describe('chase camera occlusion fade', () => {
  it('fades a board on the line between the camera and the car', () => {
    const mid = cam.clone().lerp(car, 0.5);
    expect(occlusionFade(mid, cam, car, OCC_NEAR)).toBeCloseTo(OCC_MAX, 5);
    expect(occlusionFade(mid, cam, car, 0)).toBeCloseTo(OCC_MAX, 5);
  });
  it('leaves things beside the line, behind the camera and beyond the car alone', () => {
    expect(occlusionFade(v(6, 2, -4), cam, car, 0)).toBe(0);
    expect(occlusionFade(v(0, 3.2, -20), cam, car, 0)).toBe(0);
    expect(occlusionFade(v(0, 0.9, 6), cam, car, OCC_NEAR)).toBe(0); // the road ahead is never touched
  });
  it('the cone widens towards the car so the whole cab stays clear', () => {
    // 1.2 m off the axis: outside the cone near the lens, inside it nearer the car
    const nearCam = cam.clone().lerp(car, 0.1).add(v(1.2, 0, 0));
    const nearCar = cam.clone().lerp(car, 0.6).add(v(1.2, 0, 0));
    expect(occlusionFade(nearCam, cam, car, 0)).toBe(0);
    expect(occlusionFade(nearCar, cam, car, 0)).toBeGreaterThan(0.5);
  });
  it('building walls stop short of the car (no hole in a wall the cab drives along)', () => {
    const beside = car.clone().add(v(1.6, 0.3, -0.3));
    expect(occlusionFade(beside, cam, car, 0)).toBe(0);
    expect(occlusionFade(beside, cam, car, OCC_NEAR)).toBeGreaterThan(0);
  });
  it('boards right in front of the lens fade, with a soft edge, only for near materials', () => {
    const overhead = cam.clone().add(v(-1.5, 1.2, 0.5)); // a blade sign hanging over the camera (the 郵局 shot)
    expect(occlusionFade(overhead, cam, car, OCC_NEAR)).toBeCloseTo(OCC_MAX_NEAR, 5);
    expect(occlusionFade(overhead, cam, car, 0)).toBe(0);
    const edge = cam.clone().add(v(-OCC_NEAR * 0.8, 0, 0));
    const f = occlusionFade(edge, cam, car, OCC_NEAR);
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThan(OCC_MAX_NEAR);
    expect(occlusionFade(cam.clone().add(v(-OCC_NEAR - 0.1, 0, 0)), cam, car, OCC_NEAR)).toBe(0);
  });
  it('name boards fade from further away than landmark walls (the 郵局 board filling a corner at 8 m)', () => {
    const board = cam.clone().add(v(-5, 2.5, 6)); // ~8 m up and to the left, well off the line to the car
    expect(occlusionFade(board, cam, car, 0)).toBe(0);
    expect(occlusionFade(board, cam, car, OCC_NEAR)).toBe(0);
    expect(occlusionFade(board, cam, car, OCC_NEAR_BOARD)).toBeGreaterThan(0.5);
    expect(occlusionFade(cam.clone().add(v(0, 3, 14.5)), cam, car, OCC_NEAR_BOARD)).toBe(0); // readable from afar
  });
  it('wraps an existing onBeforeCompile and keeps a distinct program key', () => {
    const calls: string[] = [];
    const a = new THREE.MeshLambertMaterial();
    a.onBeforeCompile = (sh) => {
      calls.push('own');
      sh.fragmentShader += '\n// own';
    };
    const b = new THREE.MeshLambertMaterial();
    addOcclusionFade(a);
    addOcclusionFade(b, { near: OCC_NEAR });
    const sh = {
      uniforms: {} as Record<string, THREE.IUniform>,
      vertexShader: '#include <common>\nvoid main(){\n#include <project_vertex>\n}',
      fragmentShader: '#include <common>\nvoid main(){\n#include <clipping_planes_fragment>\n}',
    } as unknown as THREE.WebGLProgramParametersWithUniforms;
    a.onBeforeCompile(sh, {} as THREE.WebGLRenderer);
    expect(calls).toEqual(['own']);
    expect(sh.fragmentShader).toContain('// own');
    expect(sh.fragmentShader).toContain('discard');
    expect(sh.vertexShader).toContain('vOccW');
    expect(sh.uniforms.uOccCam).toBeDefined();
    expect(a.customProgramCacheKey()).not.toBe(b.customProgramCacheKey());
  });
});
