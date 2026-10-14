// Connection phases shown to players during online play (docs/handoff/CHATGPT_PRODUCT_FOLLOWUP.md):
//   reconnecting → syncing → synced. "synced" is only reported after a valid room snapshot has been
//   applied (seat or spectator role restored). After MAX_RETRIES failed attempts the client stops and
//   offers "try again" / "leave".
export type ConnPhase = 'connecting' | 'syncing' | 'synced' | 'reconnecting' | 'failed' | 'closed';
export const MAX_RETRIES = 6;

export class ConnTracker {
  phase: ConnPhase = 'connecting';
  /** true after the first drop, until the room state has been restored */
  recovering = false;
  /** performance.now() when the state was restored after a drop (for the brief "synced" notice) */
  recoveredAt = 0;
  retries = 0;

  opened() {
    this.phase = 'syncing';
  }
  /** a valid room snapshot (lobby / game state) has been applied */
  synced() {
    if (this.phase === 'syncing' || this.phase === 'connecting' || this.phase === 'reconnecting') {
      if (this.recovering) this.recoveredAt = performance.now();
      this.recovering = false;
      this.retries = 0;
      this.phase = 'synced';
    }
  }
  /** connection lost; returns the delay before the next attempt, or null when giving up */
  dropped(): number | null {
    this.recovering = true;
    if (this.retries >= MAX_RETRIES) {
      this.phase = 'failed';
      return null;
    }
    this.phase = 'reconnecting';
    return Math.min(10000, 500 * 2 ** this.retries++);
  }
  manualRetry() {
    this.retries = 0;
    this.phase = 'reconnecting';
  }
  closed() {
    this.phase = 'closed';
  }
}
