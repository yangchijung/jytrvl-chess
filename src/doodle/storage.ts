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
  | "noStorage";
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
export function loadSave(given?: Pick<Storage, "getItem" | "setItem">): Loaded {
  let store: Pick<Storage, "getItem" | "setItem">;
  try {
    store = given ?? window.localStorage; // can throw when site data is blocked
  } catch {
    return { s: blankSave(), target: null, notice: "noStorage", oldRaw: null };
  }
  const r = readSave(() => store.getItem(KEY));
  if (r.kind === "ok")
    return { s: r.save, target: KEY, notice: null, oldRaw: null };
  if (r.kind === "empty")
    return { s: blankSave(), target: KEY, notice: null, oldRaw: null };
  if (r.kind === "noStorage")
    return { s: blankSave(), target: null, notice: "noStorage", oldRaw: null };
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
  if (kept) return { s: blankSave(), target: KEY, notice, oldRaw: r.raw };
  // could not keep a copy: leave the main key alone; continue a drawing already saved in the alternate place
  const alt = readSave(() => store.getItem(ALT));
  const target = alt.kind === "ok" || alt.kind === "empty" ? ALT : null;
  return {
    s: alt.kind === "ok" ? alt.save : blankSave(),
    target,
    notice: target ? "brokenNoBackup" : "brokenNoSave",
    oldRaw: r.raw,
  };
}
