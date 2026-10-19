// Color Doodle — reading the browser save without ever losing a stored drawing (D3, 2026-10-18).
import { blankSave, readSave, type Saved } from "../../shared/doodle/model";

export const KEY = "jy.doodle.v1";
export const ALT = `${KEY}.recovered`;
/**
 * D3: never lose a stored drawing. Where the page may write (`target`) depends on what was found:
 *  - valid / nothing stored → the main key
 *  - unreadable or newer-version save → copied to a backup key first (and the copy read back); then the main key
 *  - unreadable and the copy failed → the main key is never written; this session saves to ALT instead
 *    (or nowhere, when ALT is unusable too)
 *  - storage unavailable → nothing is written; the child is told to save a picture
 */
export type Notice =
  | null
  | "broken"
  | "brokenFuture"
  | "brokenNoBackup"
  | "brokenNoSave"
  | "noStorage"
  | "restored"
  | "altKept";
export interface Loaded {
  s: Saved;
  target: string | null;
  notice: Notice;
  oldRaw: string | null;
}
/** Same unreadable text → same backup key, so reloading many times does not fill the browser with copies. */
export function backupKey(raw: string, key: string = KEY): string {
  let h1 = 0x811c9dc5,
    h2 = raw.length;
  for (let i = 0; i < raw.length; i++) {
    h1 = Math.imul(h1 ^ raw.charCodeAt(i), 16777619);
    h2 = Math.imul(h2 ^ raw.charCodeAt(i), 2246822507);
  }
  return `${key}.backup-${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
}
export type Store = Pick<Storage, "getItem" | "setItem"> &
  Partial<Pick<Storage, "removeItem">>;

/** What a reader returns for one stored text (the main drawing uses readSave; scenes use their own reader). */
export type Read<T> =
  | { kind: "ok"; save: T }
  | { kind: "empty" }
  | { kind: "broken"; raw: string; cause: "json" | "schema" }
  | { kind: "noStorage" };
export interface Keyed<T> {
  key: string;
  read: (get: () => string | null) => Read<T>;
  blank: () => T;
}
export interface LoadedOf<T> {
  s: T;
  target: string | null;
  notice: Notice;
  oldRaw: string | null;
}

/** Writes `text` to `key` and reads it back; true only when the stored text is exactly what was written. */
function writeChecked(store: Store, key: string, text: string): boolean {
  try {
    store.setItem(key, text);
    return store.getItem(key) === text;
  } catch {
    return false;
  }
}

/** Marks the alternate as already moved back to the main key (its text is kept untouched, never deleted). */
export const MOVED = `${ALT}.moved`;

const carriedBy = new Map<
  string,
  { text: string; notice: Notice; oldRaw: string | null }
>();

/**
 * The same protection for every saved kind (main drawing, picture-play scenes): backups before any write, an
 * alternate key when backups fail, moving the alternate back once it is safe, and never letting a leftover
 * alternate replace newer work.
 */
export function loadKeyed<T>(cfg: Keyed<T>, given?: Store): LoadedOf<T> {
  const { key, read, blank } = cfg;
  const alt = `${key}.recovered`;
  const moved = `${alt}.moved`;
  let store: Store;
  try {
    store = given ?? window.localStorage; // can throw when site data is blocked
  } catch {
    return { s: blank(), target: null, notice: "noStorage", oldRaw: null };
  }
  const r = read(() => store.getItem(key));
  if (r.kind === "noStorage")
    return { s: blank(), target: null, notice: "noStorage", oldRaw: null };
  // a drawing kept in the alternate place during an earlier visit (D3-R1)
  let altRaw: string | null = null;
  try {
    altRaw = store.getItem(alt);
  } catch {
    altRaw = null;
  }
  const a = read(() => (altRaw === "" ? null : altRaw));
  const markMoved = () => {
    try {
      store.setItem(moved, backupKey(altRaw!, key));
    } catch {
      /* without the mark the leftover is only offered as a download; the valid main save still wins */
    }
  };
  const isMoved = () => {
    try {
      return altRaw !== null && store.getItem(moved) === backupKey(altRaw, key);
    } catch {
      return false;
    }
  };
  if (r.kind === "ok") {
    // the page can mount twice in one visit; keep the "moved back" notice until the child changes the drawing
    const carried = carriedBy.get(key);
    if (carried && store.getItem(key) === carried.text)
      return {
        s: r.save,
        target: key,
        notice: carried.notice,
        oldRaw: carried.oldRaw,
      };
    // the main save is valid and is newer than any leftover alternate: it wins; a different leftover is offered as a download
    const leftover =
      a.kind === "ok" && altRaw !== store.getItem(key) && !isMoved()
        ? altRaw
        : null;
    return {
      s: r.save,
      target: key,
      notice: leftover ? "altKept" : null,
      oldRaw: leftover,
    };
  }
  if (r.kind === "empty") {
    if (a.kind === "ok" && writeChecked(store, key, JSON.stringify(a.save))) {
      markMoved();
      return { s: a.save, target: key, notice: null, oldRaw: null };
    }
    return {
      s: a.kind === "ok" ? a.save : blank(),
      target: a.kind === "ok" ? alt : key,
      notice: null,
      oldRaw: null,
    };
  }
  const notice =
    r.cause === "schema" && /"schemaVersion"\s*:\s*([2-9]|\d{2,})/.test(r.raw)
      ? "brokenFuture"
      : "broken";
  let kept = false;
  try {
    const bk = backupKey(r.raw, key);
    if (store.getItem(bk) !== r.raw) store.setItem(bk, r.raw);
    kept = store.getItem(bk) === r.raw;
  } catch {
    kept = false;
  }
  if (kept) {
    if (a.kind === "ok") {
      // the unreadable save is now copied aside: move the alternate drawing back to the main key (read back first)
      const text = JSON.stringify(a.save);
      if (writeChecked(store, key, text)) {
        markMoved();
        carriedBy.set(key, { text, notice: "restored", oldRaw: r.raw });
        return { s: a.save, target: key, notice: "restored", oldRaw: r.raw };
      }
      return { s: a.save, target: alt, notice: "restored", oldRaw: r.raw };
    }
    return { s: blank(), target: key, notice, oldRaw: r.raw };
  }
  // could not keep a copy: leave the main key alone; continue a drawing already saved in the alternate place
  const target = a.kind === "ok" || a.kind === "empty" ? alt : null;
  return {
    s: a.kind === "ok" ? a.save : blank(),
    target,
    notice: target ? "brokenNoBackup" : "brokenNoSave",
    oldRaw: r.raw,
  };
}

export function loadSave(given?: Store): Loaded {
  return loadKeyed<Saved>(
    { key: KEY, read: readSave, blank: blankSave },
    given,
  );
}

/**
 * Saves `value` to `target` only when the text is accepted by `accept` and reads back identically
 * ("Saved" is never shown otherwise). Returns false when nothing could be saved.
 */
export function saveChecked(
  target: string | null,
  text: string,
  accept: (x: unknown) => boolean,
): boolean {
  if (!target) return false;
  try {
    if (!accept(JSON.parse(text))) return false;
    localStorage.setItem(target, text);
    return localStorage.getItem(target) === text;
  } catch {
    return false;
  }
}
