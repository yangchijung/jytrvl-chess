// WebSocket connection to an arena room (Snake Arena / Block Puzzle Battle) with reconnect and the
// shared lobby commands. Game-specific clients receive the other messages through `onGame`.
import type { ArenaClientMsg, ArenaLevel, ArenaLobbyMsg, ArenaServerMsg } from '../../realtime/src/arena/protocol';

export class ArenaSocket {
  lobby: ArenaLobbyMsg | null = null;
  conn: 'connecting' | 'open' | 'reconnecting' | 'closed' = 'connecting';
  error: string | null = null;
  private ws: WebSocket | null = null;
  private retry = 0;
  private disposed = false;
  private ping: ReturnType<typeof setInterval>;
  /** round-trip estimate in ms */
  rtt = 80;
  private pingAt = 0;

  constructor(
    private path: string,
    private guestName: string,
    private onGame: (m: ArenaServerMsg) => void,
    private onChange: () => void,
    private onOpen?: () => void,
  ) {
    this.connect();
    this.ping = setInterval(() => {
      this.pingAt = performance.now();
      this.send({ t: 'ping' });
    }, 10000);
  }

  private connect() {
    if (this.disposed) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}${this.path}?name=${encodeURIComponent(this.guestName)}`);
    this.ws = ws;
    ws.onopen = () => {
      this.conn = 'open';
      this.retry = 0;
      this.pingAt = performance.now();
      this.send({ t: 'ping' });
      this.onOpen?.();
      this.onChange();
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data) as ArenaServerMsg;
      if (m.t === 'pong') {
        if (this.pingAt) this.rtt = this.rtt * 0.7 + (performance.now() - this.pingAt) * 0.3;
        return;
      }
      if (m.t === 'lobby') this.lobby = m;
      if (m.t === 'error') this.error = m.code;
      this.onGame(m);
      this.onChange();
    };
    ws.onclose = (e) => {
      if (this.disposed) return;
      if (e.code === 1000 && e.reason === 'expired') {
        this.conn = 'closed';
        this.error = 'room_not_found';
        this.onChange();
        return;
      }
      if (!this.lobby && this.retry >= 2) {
        this.conn = 'closed';
        this.error = 'room_not_found';
        this.onChange();
        return;
      }
      this.conn = 'reconnecting';
      this.onChange();
      setTimeout(() => this.connect(), Math.min(8000, 400 * 2 ** this.retry++));
    };
  }

  send(m: ArenaClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }
  start() {
    this.send({ t: 'start' });
  }
  addBot(level: ArenaLevel) {
    this.send({ t: 'bot', op: 'add', level });
  }
  removeBot(seat: number) {
    this.send({ t: 'bot', op: 'remove', seat });
  }
  again() {
    this.send({ t: 'again' });
  }
  dispose() {
    this.disposed = true;
    clearInterval(this.ping);
    this.ws?.close();
  }
}
