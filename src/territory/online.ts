// Online Territory Rush client: mirrors the authoritative TerritoryRoom state.
// Only steering input is sent; the server owns positions, trails, land and results.
// Latency handling: entity interpolation between server ticks for everyone, plus an immediate local
// turn preview for your own runner (the server confirms on the next tick).
// T3: in a 'flow' room the server runs FlowGame; this page sends target angles ('aim', throttled) and mirrors
// the continuous positions from each tick. Four-way ('grid') rooms behave exactly as before.
import { TICK_MS, TerritoryGame, type Dir } from '../../shared/territory/engine';
import { FlowGame, STEP_MS, dirAngle, wrapAngle } from '../../shared/territory/flow';
import type { BotLevel } from '../../shared/territory/ai';
import type { TClientMsg, TLobbyMsg, TServerMsg } from '../../realtime/src/territoryProtocol';
import { TerritoryClient } from './client';
import { ConnTracker } from '../lib/conn';

export class OnlineTerritory extends TerritoryClient {
  lobby: TLobbyMsg | null = null;
  conn: 'connecting' | 'open' | 'reconnecting' | 'closed' = 'connecting';
  error: string | null = null;
  recorded = false;
  private ws: WebSocket | null = null;
  private retry = 0;
  readonly tracker = new ConnTracker();
  private disposed = false;
  private ping: ReturnType<typeof setInterval>;
  private lastSent: Dir | null = null;
  /** continuous steering: last angle sent, when, and an angle waiting for the next send slot */
  private aimSent: number | null = null;
  private aimAt = 0;
  private aimTimer: ReturnType<typeof setTimeout> | null = null;
  private aimNext: number | null = null;

  constructor(
    private path: string, // e.g. /api/territory/rooms/ABCD12/ws
    private guestName: string,
    private onMatched?: (room: string) => void,
    /** colour asked for when joining (palette index); the server keeps it if free or gives the nearest free one */
    private color: number | null = null,
  ) {
    super();
    this.connect();
    this.ping = setInterval(() => this.send({ t: 'ping' }), 20000);
  }

  private connect() {
    if (this.disposed) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}${this.path}?name=${encodeURIComponent(this.guestName)}${this.color !== null ? `&color=${this.color}` : ''}`);
    this.ws = ws;
    ws.onopen = () => {
      this.conn = 'open';
      this.retry = 0;
      this.tracker.opened();
      this.emit();
    };
    ws.onmessage = (e) => this.onMessage(JSON.parse(e.data) as TServerMsg);
    ws.onclose = (e) => {
      if (this.disposed) return;
      if (e.code === 1000 && (e.reason === 'matched' || e.reason === 'expired')) {
        this.tracker.closed();
        this.conn = 'closed';
        if (e.reason === 'expired') this.error = 'room_not_found';
        this.emit();
        return;
      }
      if (!this.lobby && this.retry >= 2) {
        this.tracker.closed();
        this.conn = 'closed';
        this.error = 'room_not_found';
        this.emit();
        return;
      }
      this.retry++;
      const delay = this.tracker.dropped();
      this.conn = 'reconnecting';
      this.emit();
      if (delay !== null) setTimeout(() => this.connect(), delay);
    };
  }

  retryNow() {
    this.tracker.manualRetry();
    this.emit();
    this.connect();
  }

  private onMessage(m: TServerMsg) {
    const now = performance.now();
    switch (m.t) {
      case 'lobby':
        this.lobby = m;
        if (m.status === 'lobby') this.tracker.synced();
        if (m.status === 'lobby') {
          this.status = 'lobby';
          this.game = null;
          this.end = null;
        } else if (m.status === 'playing' && this.status === 'countdown') {
          this.status = 'playing';
          this.lastTickAt = now;
        }
        this.me = m.mySeat !== null ? [m.mySeat] : [];
        break;
      case 'snap': {
        this.tracker.synced();
        const g = m.flow ? FlowGame.fromFlowSnapshot(m.snap, m.flow) : TerritoryGame.fromSnapshot(m.snap);
        this.game = g;
        this.tickMs = m.flow ? STEP_MS : TICK_MS;
        this.aimSent = null;
        this.resetBuffers(g);
        this.me = m.mySeat !== null ? [m.mySeat] : [];
        this.status = m.status === 'lobby' ? 'lobby' : m.status;
        this.countdownEnd = now + m.countdownMs;
        this.lastTickAt = now;
        if (m.snap.result) this.end = { result: m.snap.result };
        break;
      }
      case 'tick': {
        const g = this.game;
        if (!g) return;
        if (this.status === 'countdown') this.status = 'playing';
        this.beforeTick(g);
        g.tick = m.n;
        const F = 7;
        g.players.forEach((p, k) => {
          const o = k * F;
          p.x = m.pl[o];
          p.y = m.pl[o + 1];
          p.dir = m.pl[o + 2] as Dir;
          p.alive = m.pl[o + 3] === 1;
          p.land = m.pl[o + 4];
          p.kills = m.pl[o + 5];
          p.bestLand = m.pl[o + 6];
        });
        const changed: number[] = [],
          values: number[] = [];
        for (let i = 0; i < m.oc.length; i += 2) {
          g.owner[m.oc[i]] = m.oc[i + 1];
          changed.push(m.oc[i]);
          values.push(m.oc[i + 1]);
        }
        for (let i = 0; i < m.tc.length; i += 2) {
          const c: number = m.tc[i];
          const v: number = m.tc[i + 1];
          const was: number = g.trail[c];
          // keep each player's trail list in step (the continuous line is drawn while it is non-empty)
          if (was >= 0 && was !== v) {
            const tr = g.players[was]?.trail;
            const at = tr ? tr.indexOf(c) : -1;
            if (at >= 0) tr!.splice(at, 1);
          }
          if (v >= 0 && was !== v) g.players[v]?.trail.push(c);
          g.trail[c] = v;
        }
        if (g instanceof FlowGame && m.fl) g.applyFlowTick(m.fl);
        for (const ev of m.ev) if (ev.type === 'death') g.players[ev.player].killedBy = ev.by ?? null;
        this.afterTick(now, changed, values, m.ev);
        this.lastSent = null;
        break;
      }
      case 'end':
        if (this.game) this.game.result = m.result;
        this.end = { result: m.result, saved: m.recorded };
        this.recorded = m.recorded;
        this.status = 'ended';
        break;
      case 'matched':
        this.onMatched?.(m.room);
        break;
      case 'error':
        this.error = m.code;
        break;
      default:
        return;
    }
    this.emit();
  }

  private send(m: TClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  steer(slot: number, d: Dir) {
    // keys in a continuous room: aim at that direction
    if (this.flow) return this.steerAngle(slot, dirAngle(d));
    if (this.status !== 'playing' && this.status !== 'countdown') return;
    const g = this.game;
    const me = this.me[0];
    if (!g || me === undefined || !g.players[me]?.alive) return;
    const p = g.players[me];
    const cur = this.lastSent ?? p.dir;
    if (d === cur || (d + 2) % 4 === cur) return;
    this.lastSent = d;
    // local preview: show the new heading right away (server confirms next tick)
    p.dir = d;
    this.send({ t: 'dir', d });
  }

  /** Continuous rooms: aim at an angle. Sent at most every 70 ms and only when it changed by more than ~0.6°. */
  steerAngle(_slot: number, angle: number) {
    const g = this.flow;
    const me = this.me[0];
    if (!g || this.status !== 'playing' || me === undefined || !g.players[me]?.alive || !Number.isFinite(angle)) return;
    const a = wrapAngle(angle);
    g.flow[me].target = a; // shown at once; the server's next tick confirms it
    if (this.aimSent !== null && Math.abs(wrapAngle(a - this.aimSent)) < 0.01) return;
    const wait = 70 - (performance.now() - this.aimAt);
    if (wait <= 0) return this.sendAim(a);
    this.aimNext = a;
    if (!this.aimTimer)
      this.aimTimer = setTimeout(() => {
        this.aimTimer = null;
        if (this.aimNext !== null) this.sendAim(this.aimNext);
      }, wait);
  }
  private sendAim(a: number) {
    this.aimNext = null;
    this.aimSent = a;
    this.aimAt = performance.now();
    this.send({ t: 'aim', a: Math.round(a * 1000) / 1000 });
  }

  start() {
    this.send({ t: 'start' });
  }
  addBot(level: BotLevel) {
    this.send({ t: 'bot', op: 'add', level });
  }
  removeBot(seat: number) {
    this.send({ t: 'bot', op: 'remove', seat });
  }
  again() {
    this.send({ t: 'again' });
  }
  /** Lobby: ask for another colour (also used for the next reconnect). */
  setColor(c: number) {
    this.color = c;
    this.send({ t: 'color', c });
  }
  /** colour this page asked for most recently (null = none) */
  get wantedColor() {
    return this.color;
  }

  update() {
    /* server-driven */
  }

  dispose() {
    this.disposed = true;
    clearInterval(this.ping);
    if (this.aimTimer) clearTimeout(this.aimTimer);
    this.ws?.close();
  }
}
