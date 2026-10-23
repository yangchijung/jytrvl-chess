// Rush Taxi — the minimap: a small round map in the top-left corner (under the clock) that turns with the camera,
// so "up" is always the way the player is looking. It shows the streets, the Love River, the sea and the parks from
// the level data, the cab as an arrow in the middle, the current target (the destination while carrying, otherwise
// the nearest waiting person) pinned to the rim when it is off the map, and the other waiting people as dots.
// The streets are drawn once to an offscreen canvas; each frame (at most ~30 per second) only turns, moves and adds
// the markers on a plain 2D canvas. No WebGL. It never takes touches (pointer-events: none).
import { useEffect, useRef } from 'react';
import type { Game } from '../game';
import type { Level } from '../world/level';
import { BAND_COLOR } from '../gameplay/view';
import { MAP_COLORS, MAP_PX_PER_M, MINIMAP_RANGE, clampToEdge, headingOnMap, mapLayers, staticMapFrame, worldToMap } from './minimapMath';
import './minimap.css';

const statics = new WeakMap<Level, { canvas: HTMLCanvasElement; frame: ReturnType<typeof staticMapFrame> }>();

/** the streets, river, sea and parks, north up, drawn once per level */
function staticMap(level: Level) {
  const hit = statics.get(level);
  if (hit) return hit;
  const frame = staticMapFrame(level);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = frame.size;
  const x = canvas.getContext('2d');
  if (x) {
    const k = MAP_PX_PER_M;
    for (const r of mapLayers(level)) {
      const { u, v } = frame.toPx(r.x, r.z);
      x.fillStyle = MAP_COLORS[r.kind];
      x.fillRect(u - (r.w * k) / 2, v - (r.d * k) / 2, r.w * k, r.d * k);
    }
    // the city walls: where the streets end
    const a = frame.toPx(level.bounds, level.bounds);
    x.strokeStyle = MAP_COLORS.ink;
    x.lineWidth = 3;
    x.strokeRect(a.u, a.v, level.bounds * 2 * k, level.bounds * 2 * k);
  }
  const out = { canvas, frame };
  statics.set(level, out);
  return out;
}

export function Minimap({ game, mode }: { game: () => Game | null; mode: 'arcade' | 'practice' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    let raf = 0,
      last = 0,
      prev = '';
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 32) return; // ~30 updates a second is plenty for a map
      last = now;
      const g = game();
      if (!g) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const css = cv.clientWidth;
      if (!css) return;
      const px = Math.round(css * dpr);
      if (cv.width !== px) cv.width = cv.height = px;
      const R = px / 2;
      const scale = R / MINIMAP_RANGE; // device pixels per metre
      const pose = g.pose();
      const run = g.run();
      const play = run && run.phase === 'play' ? run : null;
      // nothing moved and nobody came or went (paused, waiting at a light): keep the last picture
      const key = `${px}|${pose.x.toFixed(1)}|${pose.z.toFixed(1)}|${pose.yaw.toFixed(3)}|${pose.view.toFixed(3)}|${play?.rider?.id ?? '-'}|${play?.waiting.map((p) => p.id).join(',') ?? ''}`;
      if (key === prev) return;
      prev = key;
      const { canvas: map, frame } = staticMap(g.level);
      const car = frame.toPx(pose.x, pose.z);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, px, px);
      ctx.save();
      ctx.beginPath();
      ctx.arc(R, R, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.translate(R, R);
      ctx.rotate(pose.view);
      ctx.scale(scale / MAP_PX_PER_M, scale / MAP_PX_PER_M);
      ctx.drawImage(map, -car.u, -car.v);
      ctx.restore();

      const at = (x: number, z: number) => worldToMap(x - pose.x, z - pose.z, pose.view, scale);
      // the target: where the guide arrow points
      const target = play ? (play.rider ? { x: play.rider.dest.x, z: play.rider.dest.z, dest: true, color: MAP_COLORS.dest } : [...play.waiting].sort((a, b) => Math.hypot(a.stop.x - pose.x, a.stop.z - pose.z) - Math.hypot(b.stop.x - pose.x, b.stop.z - pose.z)).map((p) => ({ x: p.stop.x, z: p.stop.z, dest: false, color: BAND_COLOR[p.band], id: p.id }))[0]) : undefined;
      const targetId = target && 'id' in target ? target.id : -1;
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeStyle = MAP_COLORS.ink;
      // other waiting people: small dots, only when on the map
      for (const p of play?.waiting ?? []) {
        if (p.id === targetId) continue;
        const o = at(p.stop.x, p.stop.z);
        if (Math.hypot(o.x, o.y) > R - 5 * dpr) continue;
        ctx.beginPath();
        ctx.arc(R + o.x, R + o.y, 3.5 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = BAND_COLOR[p.band];
        ctx.fill();
        ctx.stroke();
      }
      if (target) {
        const o = at(target.x, target.z);
        const m = 8 * dpr;
        const c = clampToEdge(o.x, o.y, R - m - 2 * dpr);
        ctx.fillStyle = target.color;
        ctx.lineWidth = 2.5 * dpr;
        ctx.beginPath();
        // shape, not only colour: the destination is a square, a person to pick up is a circle
        if (target.dest) ctx.rect(R + c.x - m * 0.8, R + c.y - m * 0.8, m * 1.6, m * 1.6);
        else ctx.arc(R + c.x, R + c.y, m * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      // north tick on the rim, with its letter just inside
      const n = worldToMap(0, 1, pose.view, 1);
      ctx.lineWidth = 3 * dpr;
      ctx.beginPath();
      ctx.moveTo(R + n.x * R, R + n.y * R);
      ctx.lineTo(R + n.x * (R - 8 * dpr), R + n.y * (R - 8 * dpr));
      ctx.stroke();
      ctx.fillStyle = MAP_COLORS.ink;
      ctx.font = `800 ${11 * dpr}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('N', R + n.x * (R - 17 * dpr), R + n.y * (R - 17 * dpr));
      // the cab: a yellow arrow in the middle
      ctx.save();
      ctx.translate(R, R);
      ctx.rotate(headingOnMap(pose.yaw, pose.view));
      const a = 9 * dpr;
      ctx.beginPath();
      ctx.moveTo(0, -a);
      ctx.lineTo(a * 0.75, a * 0.8);
      ctx.lineTo(0, a * 0.35);
      ctx.lineTo(-a * 0.75, a * 0.8);
      ctx.closePath();
      ctx.fillStyle = MAP_COLORS.car;
      ctx.lineWidth = 2 * dpr;
      ctx.lineJoin = 'round';
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      cv.dataset.drawn = '1';
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [game]);
  return (
    <div className="taxi-minimap" data-mode={mode} data-testid="taxi-minimap" aria-hidden="true">
      <canvas ref={ref} />
    </div>
  );
}
