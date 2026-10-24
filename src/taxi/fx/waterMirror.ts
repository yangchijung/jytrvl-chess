// Rush Taxi: a real reflection on the river and the sea ('high' only). three's Reflector does the mirror camera and
// the oblique clip plane; it is never added to the scene, it only renders the city upside down into a target at a
// fraction of the canvas resolution, which the water shader samples (MIRROR in surfaces.ts) and mixes with its
// ripples and glints. Skipped when no water is in view. The extra render happens before the frame's own render
// counters are reset, so the draw-call figures (X-13) still measure the main scene only.
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { MIRROR } from './surfaces';

export class WaterMirror {
  private r: Reflector;
  private frustum = new THREE.Frustum();
  private pm = new THREE.Matrix4();
  private inv = new THREE.Matrix4();
  private camPos = new THREE.Vector3();

  constructor(
    private waters: THREE.Object3D[],
    private y: number,
    private scale = 0.5,
  ) {
    this.r = new Reflector(new THREE.PlaneGeometry(1, 1), { textureWidth: 2, textureHeight: 2, clipBias: 0.003, multisample: 0 });
    this.r.rotation.x = -Math.PI / 2;
    this.r.position.y = y;
    this.r.updateMatrixWorld(true);
    this.inv.copy(this.r.matrixWorld).invert();
    MIRROR.uMirror.value = this.r.getRenderTarget().texture;
    MIRROR.uMirrorOn.value = 0;
  }

  setSize(w: number, h: number) {
    this.r.getRenderTarget().setSize(Math.max(2, Math.round(w * this.scale)), Math.max(2, Math.round(h * this.scale)));
  }

  update(renderer: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.PerspectiveCamera) {
    cam.updateMatrixWorld();
    this.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pm);
    this.camPos.setFromMatrixPosition(cam.matrixWorld);
    const seen = this.camPos.y > this.y + 0.05 && this.waters.some((w) => w.visible && this.frustum.intersectsObject(w));
    if (!seen) {
      MIRROR.uMirrorOn.value = 0;
      return;
    }
    for (const w of this.waters) w.visible = false;
    const mat = this.r.material as THREE.ShaderMaterial;
    this.r.onBeforeRender(renderer, scene, cam, this.r.geometry, mat, null as unknown as THREE.Group);
    for (const w of this.waters) w.visible = true;
    // Reflector's matrix maps the mirror's own space; the water shader works in world space
    MIRROR.uMirrorMat.value.copy(mat.uniforms.textureMatrix.value as THREE.Matrix4).multiply(this.inv);
    MIRROR.uMirrorOn.value = 1;
  }

  dispose() {
    MIRROR.uMirrorOn.value = 0;
    MIRROR.uMirror.value = null;
    this.r.dispose();
  }
}
