// Crazy Bumper — the combo symbol over the player's car (spec 7.1 rule 3): a drawn star and "x2!" / "x3!"
// (no words), popping up for about a second. One sprite, drawn into a small canvas when a combo happens.
import * as THREE from 'three';

export class ComboPop {
  readonly sprite: THREE.Sprite;
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private t = 9;

  constructor(scene: THREE.Scene) {
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 128;
    this.ctx = cv.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, depthTest: false, transparent: true }));
    this.sprite.renderOrder = 10;
    this.sprite.visible = false;
    scene.add(this.sprite);
  }

  show(n: number) {
    const g = this.ctx;
    g.clearRect(0, 0, 256, 128);
    // star
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 22 : 50;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      g.lineTo(64 + Math.cos(a) * r, 66 + Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = '#FFD600';
    g.fill();
    g.lineWidth = 7;
    g.lineJoin = 'round';
    g.strokeStyle = '#1E2A44';
    g.stroke();
    g.font = '900 72px Inter, system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.lineWidth = 12;
    g.strokeStyle = '#FFFFFF';
    g.strokeText(`x${n}!`, 118, 70);
    g.fillStyle = '#1E2A44';
    g.fillText(`x${n}!`, 118, 70);
    this.tex.needsUpdate = true;
    this.t = 0;
  }

  update(dt: number, at: THREE.Vector3, scale: number) {
    this.t += dt;
    const life = 1.1;
    this.sprite.visible = this.t < life;
    if (!this.sprite.visible) return;
    const pop = Math.min(1, this.t / 0.15);
    const s = (0.6 + 0.4 * pop) * scale;
    this.sprite.scale.set(3.6 * s, 1.8 * s, 1);
    this.sprite.position.set(at.x, at.y + 4.2 * scale + this.t * 0.8, at.z);
    this.sprite.material.opacity = this.t > life - 0.25 ? (life - this.t) / 0.25 : 1;
  }
}
