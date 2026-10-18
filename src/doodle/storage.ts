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
export function backupKey(raw: string): string {
  let h1 = 0x811c9dc5,
    h2 = raw.length;
  for (let i = 0; i < raw.length; i++) {
    h1 = Math.imul(h1 ^ raw.charCodeAt(i), 16777619);
    h2 = Math.imul(h2 ^ raw.charCodeAt(i), 2246822507);
  }
  return `${KEY}.backup-${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
}
type Store = Pick<Storage, "getItem" | "setItem"> &
  Partial<Pick<Storage, "removeItem">>;

/** Reads the alternate key (an empty string counts as nothing stored). */
function readAlt(store: Store) {
  return readSave(() => {
    const v = store.getItem(ALT);
    return v === "" ? null : v;
  });
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
function markAltMoved(store: Store, altRaw: string) {
  try {
    store.setItem(MOVED, backupKey(altRaw));
  } catch {
    /* without the mark the leftover is only offered as a download; the valid main save still wins */
  }
}
const altMoved = (store: Store, altRaw: string | null) => {
  try {
    return altRaw !== null && store.getItem(MOVED) === backupKey(altRaw);
  } catch {
    return false;
  }
};

let carried: { text: string; notice: Notice; oldRaw: string | null } | null =
  null;

export function loadSave(given?: Store): Loaded {
  let store: Store;
  try {
    store = given ?? window.localStorage; // can throw when site data is blocked
  } catch {
    return { s: blankSave(), target: null, notice: "noStorage", oldRaw: null };
  }
  const r = readSave(() => store.getItem(KEY));
  if (r.kind === "noStorage")
    return { s: blankSave(), target: null, notice: "noStorage", oldRaw: null };
  // a drawing kept in the alternate place during an earlier visit (D3-R1)
  let altRaw: string | null = null;
  try {
    altRaw = store.getItem(ALT);
  } catch {
    altRaw = null;
  }
  const alt = readAlt(store);
  if (r.kind === "ok") {
    // the page can mount twice in one visit; keep the "moved back" notice until the child changes the drawing
    if (carried && store.getItem(KEY) === carried.text)
      return {
        s: r.save,
        target: KEY,
        notice: carried.notice,
        oldRaw: carried.oldRaw,
      };
    // the main save is valid and is newer than any leftover alternate: it wins; a different leftover is offered as a download
    const leftover =
      alt.kind === "ok" &&
      altRaw !== store.getItem(KEY) &&
      !altMoved(store, altRaw)
        ? altRaw
        : null;
    return {
      s: r.save,
      target: KEY,
      notice: leftover ? "altKept" : null,
      oldRaw: leftover,
    };
  }
  if (r.kind === "empty") {
    if (
      alt.kind === "ok" &&
      writeChecked(store, KEY, JSON.stringify(alt.save))
    ) {
      markAltMoved(store, altRaw!);
      return { s: alt.save, target: KEY, notice: null, oldRaw: null };
    }
    return {
      s: alt.kind === "ok" ? alt.save : blankSave(),
      target: alt.kind === "ok" ? ALT : KEY,
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
    const bk = backupKey(r.raw);
    if (store.getItem(bk) !== r.raw) store.setItem(bk, r.raw);
    kept = store.getItem(bk) === r.raw;
  } catch {
    kept = false;
  }
  if (kept) {
    if (alt.kind === "ok") {
      // the unreadable save is now copied aside: move the alternate drawing back to the main key (read back first)
      const text = JSON.stringify(alt.save);
      if (writeChecked(store, KEY, text)) {
        markAltMoved(store, altRaw!);
        carried = { text, notice: "restored", oldRaw: r.raw };
        return { s: alt.save, target: KEY, notice: "restored", oldRaw: r.raw };
      }
      return { s: alt.save, target: ALT, notice: "restored", oldRaw: r.raw };
    }
    return { s: blankSave(), target: KEY, notice, oldRaw: r.raw };
  }
  // could not keep a copy: leave the main key alone; continue a drawing already saved in the alternate place
  const target = alt.kind === "ok" || alt.kind === "empty" ? ALT : null;
  return {
    s: alt.kind === "ok" ? alt.save : blankSave(),
    target,
    notice: target ? "brokenNoBackup" : "brokenNoSave",
    oldRaw: r.raw,
  };
}
