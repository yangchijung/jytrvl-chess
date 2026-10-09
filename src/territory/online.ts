// Online Territory Rush client: mirrors the authoritative TerritoryRoom state.
// Only steering input is sent; the server owns positions, trails, land and results.
// Latency handling: entity interpolation between server ticks for everyone, plus an immediate local
// turn preview for your own runner (the server confirms on the next tick).
import { TerritoryGame, type Dir } from '../../shared/territory/engine';
import type { BotLevel } from '../../shared/territory/ai';
import type { TClientMsg, TLobbyMsg, TServerMsg } from '../../realtime/src/territoryProtocol';
import { TerritoryClient } from './client';

export class OnlineTerritory extends TerritoryClient {
  lobby: TLobbyMsg | null = null;
  conn: 'connecting' | 'open' | 'reconnecting' | 'closed' = 'connecting';
  error: string | null = null;
  recorded = false;
  private ws: WebSocket | null = null;
  private retry = 0;
  private disposed = false;
  private ping: ReturnType<typeof setInterval>;
  private lastSent: Dir | null = null;

  constructor(
    private path: string, // e.g. /api/territory/rooms/ABCD12/ws
    private guestName: string,
    private onMatched?: (room: string) => void,
  ) {
    super();
    this.connect();
    this.ping = setInterval(() => this.send({ t: 'ping' }), 20000);
  }

  private connect() {
    if (this.disposed) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}${this.path}?name=${encodeURIComponent(this.guestName)}`);
    this.ws = ws;
    ws.onopen = () => {
      this.conn = 'open';
      this.retry = 0;
      this.emit();
    };
    ws.onmessage = (e) => this.onMessage(JSON.parse(e.data) as TServerMsg);
    ws.onclose = (e) => {
      if (this.disposed) return;
      if (e.code === 1000 && (e.reason === 'matched' || e.reason === 'expired')) {
        this.conn = 'closed';
        if (e.reason === 'expired') this.error = 'room_not_found';
        this.emit();
        return;
      }
      if (!this.lobby && this.retry >= 2) {
        this.conn = 'closed';
        this.error = 'room_not_found';
        this.emit();
        return;
      }
      this.conn = 'reconnecting';
      this.emit();
      setTimeout(() => this.connect(), Math.min(8000, 400 * 2 ** this.retry++));
    };
  }

  private onMessage(m: TServerMsg) {
    const now = performance.now();
    switch (m.t) {
      case 'lobby':
        this.lobby = m;
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
        const g = TerritoryGame.fromSnapshot(m.snap);
        this.game = g;
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
        for (let i = 0; i < m.tc.length; i += 2) g.trail[m.tc[i]] = m.tc[i + 1];
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

  steer(_slot: number, d: Dir) {
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

  update() {
    /* server-driven */
  }

  dispose() {
    this.disposed = true;
    clearInterval(this.ping);
    this.ws?.close();
  }
}
