// Planet Rescue Crew — online room rules (pure). Used by the RescueRoom Durable Object and unit tests.
// Up to 3 people join with their own account (or guest name) on their own device. Roles are dealt to the
// seats; each person sees only the cards of the roles they hold, and only the holder can confirm a role.
import { ITEMS, ROLES, ROUTE_IDS, run, type Item, type Role, type RunResult, type Trip } from './engine';
import { MISSIONS } from './missions';

export const MAX_SEATS = 3;
export const MIN_TO_GO = 2;

export interface RSeat {
  playerId: string;
  userId: string | null;
  name: string;
}
export interface RescueRoomState {
  id: string;
  hostId: string | null;
  seats: RSeat[];
  /** role → seat index */
  roles: Record<Role, number | null>;
  offset: number;
  missionId: string;
  plan: Trip[];
  oks: Role[];
  result: RunResult | null;
  runId: number;
  done: string[];
}

export type RClientMsg =
  | { t: 'ping' }
  | { t: 'plan'; plan: Trip[] }
  | { t: 'ok'; role: Role; on: boolean }
  | { t: 'go' }
  | { t: 'retry' }
  | { t: 'mission'; id: string }
  | { t: 'rotate' };

export interface RSeatPublic {
  name: string;
  connected: boolean;
  isUser: boolean;
}
export type RServerMsg =
  | { t: 'pong' }
  | { t: 'error'; code: string }
  | {
      t: 'state';
      id: string;
      mySeat: number | null;
      hostSeat: number | null;
      seats: RSeatPublic[];
      roles: Record<Role, number | null>;
      missionId: string;
      plan: Trip[];
      oks: Role[];
      result: RunResult | null;
      runId: number;
      done: string[];
    };

export const missionOf = (id: string) => MISSIONS.find((m) => m.id === id) ?? MISSIONS[0];
export const emptyPlan = (missionId: string): Trip[] => Array.from({ length: missionOf(missionId).time }, () => ({ route: null, cargo: [] }));

export function newRoom(id: string, hostId: string | null, missionId: string): RescueRoomState {
  const m = missionOf(missionId).id;
  return { id, hostId, seats: [], roles: { navigator: null, engineer: null, supplier: null }, offset: 0, missionId: m, plan: emptyPlan(m), oks: [], result: null, runId: 0, done: [] };
}

/** Deal the three roles over the given seats, starting at `offset` (2 seats → one person holds two roles). */
export function deal(seatIdx: number[], offset: number): Record<Role, number | null> {
  const out = { navigator: null, engineer: null, supplier: null } as Record<Role, number | null>;
  if (!seatIdx.length) return out;
  ROLES.forEach((r, i) => (out[r] = seatIdx[(i + offset) % seatIdx.length]));
  return out;
}

export const seatOf = (s: RescueRoomState, playerId: string) => {
  const i = s.seats.findIndex((x) => x.playerId === playerId);
  return i < 0 ? null : i;
};
/** The host's seat; if the host is offline, the first connected seat stands in. */
export function effectiveHost(s: RescueRoomState, connected: number[]): number | null {
  const h = s.hostId ? seatOf(s, s.hostId) : null;
  if (h !== null && (connected.includes(h) || !connected.length)) return h;
  return connected.length ? Math.min(...connected) : h;
}
export const rolesOf = (s: RescueRoomState, seat: number | null): Role[] => (seat === null ? [] : ROLES.filter((r) => s.roles[r] === seat));

/** A newcomer takes a free seat (or the seat of someone who left) and the roles are dealt again. */
export function join(s: RescueRoomState, seat: RSeat, connected: number[] = []): RescueRoomState {
  if (seatOf(s, seat.playerId) !== null) {
    // same person, maybe a new name after signing in
    return { ...s, seats: s.seats.map((x) => (x.playerId === seat.playerId ? { ...x, name: seat.name, userId: seat.userId } : x)) };
  }
  if (s.result) return s; // a run is on screen: watch until the team changes the plan
  if (s.seats.length >= MAX_SEATS) {
    const gone = s.seats.findIndex((_, i) => !connected.includes(i));
    if (gone < 0) return s; // full: watch only
    const seats = s.seats.map((x, i) => (i === gone ? seat : x));
    const hostId = s.hostId === s.seats[gone].playerId ? seat.playerId : s.hostId;
    return { ...s, seats, hostId, oks: [] };
  }
  const seats = [...s.seats, seat];
  return { ...s, seats, hostId: s.hostId ?? seat.playerId, roles: deal(seats.map((_, i) => i), s.offset), oks: [] };
}

function validPlan(p: unknown, time: number): p is Trip[] {
  return (
    Array.isArray(p) &&
    p.length === time &&
    p.every((t) => t && (t.route === null || ROUTE_IDS.includes(t.route)) && Array.isArray(t.cargo) && t.cargo.length <= 5 && t.cargo.every((i: Item) => ITEMS.includes(i)))
  );
}

/**
 * Applies one message from a player. `connected` lists seat indexes with a live connection (used when the
 * host deals roles again, so nobody who left keeps a role).
 */
export function reduce(s: RescueRoomState, playerId: string, m: RClientMsg, connected: number[]): { state: RescueRoomState; error?: string } {
  const seat = seatOf(s, playerId);
  if (seat === null) return { state: s, error: 'not_seated' };
  const isHost = effectiveHost(s, connected) === seat;
  const mission = missionOf(s.missionId);
  switch (m.t) {
    case 'plan':
      if (s.result) return { state: s, error: 'running' };
      if (!validPlan(m.plan, mission.time)) return { state: s, error: 'bad_plan' };
      return { state: { ...s, plan: m.plan.map((t) => ({ route: t.route, cargo: [...t.cargo] })), oks: [] } };
    case 'ok': {
      if (s.result) return { state: s, error: 'running' };
      if (!ROLES.includes(m.role)) return { state: s, error: 'bad_role' };
      if (s.roles[m.role] !== seat) return { state: s, error: 'not_your_role' };
      const oks = m.on ? [...new Set([...s.oks, m.role])] : s.oks.filter((r) => r !== m.role);
      return { state: { ...s, oks } };
    }
    case 'go': {
      if (s.result) return { state: s, error: 'running' };
      if (s.seats.length < MIN_TO_GO) return { state: s, error: 'need_team' };
      if (!ROLES.every((r) => s.oks.includes(r))) return { state: s, error: 'need_confirm' };
      if (!s.plan.some((t) => t.route || t.cargo.length)) return { state: s, error: 'empty_plan' };
      const result = run(mission, s.plan);
      const done = result.ok && !s.done.includes(mission.id) ? [...s.done, mission.id] : s.done;
      return { state: { ...s, result, runId: s.runId + 1, done } };
    }
    case 'retry':
      return { state: { ...s, result: null, oks: [] } };
    case 'mission': {
      if (!isHost) return { state: s, error: 'not_host' };
      const id = missionOf(m.id).id;
      if (id !== m.id) return { state: s, error: 'bad_mission' };
      return { state: { ...s, missionId: id, plan: emptyPlan(id), oks: [], result: null } };
    }
    case 'rotate': {
      if (!isHost) return { state: s, error: 'not_host' };
      const live = connected.length ? connected : s.seats.map((_, i) => i);
      const offset = s.offset + 1;
      return { state: { ...s, offset, roles: deal(live, offset), oks: [] } };
    }
    default:
      return { state: s };
  }
}
