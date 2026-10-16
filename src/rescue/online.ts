// Planet Rescue Crew — online room client. Mirrors the RescueRoom Durable Object; every change is sent to the
// server and only shown once the server's state comes back (the server is the single source of truth).
import type { RClientMsg, RServerMsg } from '../../shared/rescue/room';
import { ConnTracker } from '../lib/conn';

export type RState = Extract<RServerMsg, { t: 'state' }>;

export class OnlineRescue {
  st: RState | null = null;
  error: string | null = null;
  lastError: string | null = null;
  readonly tracker = new ConnTracker();
  private ws: WebSocket | null = null;
  private listeners = new Set<() => void>();
  private disposed = false;
  private retries = 0;
  private ping: ReturnType<typeof setInterval>;
  private version = 0;

  constructor(
    private path: string, // /api/rescue/rooms/ABCDEF/ws
    private guestName: string,
  ) {
    this.connect();
    this.ping = setInterval(() => this.send({ t: 'ping' }), 20000);
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  snapshot = () => this.version;
  private emit() {
    this.version++;
    for (const l of this.listeners) l();
  }

  private connect() {
    if (this.disposed) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}${this.path}?name=${encodeURIComponent(this.guestName)}`);
    this.ws = ws;
    ws.onopen = () => {
      this.tracker.opened();
      this.emit();
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data) as RServerMsg;
      if (m.t === 'state') {
        this.st = m;
        this.retries = 0;
        this.tracker.synced();
      } else if (m.t === 'error') this.lastError = m.code;
      this.emit();
    };
    ws.onclose = (e) => {
      if (this.disposed) return;
      if ((e.code === 1000 && e.reason === 'expired') || (!this.st && this.retries >= 2)) {
        this.tracker.closed();
        this.error = 'room_not_found';
        this.emit();
        return;
      }
      this.retries++;
      const delay = this.tracker.dropped();
      this.emit();
      if (delay !== null) setTimeout(() => this.connect(), delay);
    };
  }

  retryNow() {
    this.tracker.manualRetry();
    this.emit();
    this.connect();
  }

  send(m: RClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  dispose() {
    this.disposed = true;
    clearInterval(this.ping);
    this.ws?.close(1000, 'leave');
  }
}
