import type { CadModelState } from "../cadModel";

export const HISTORY_LIMIT = 100;

export interface CadHistoryState {
  past: CadModelState[];
  future: CadModelState[];
  tx: { entriesPushed: number; base: CadModelState } | null;
}

export function createCadHistoryState(): CadHistoryState {
  return { past: [], future: [], tx: null };
}

/** Standard editor commit: push prev onto past (respecting open transaction + limit), clear future. Returns true if history changed. */
export function recordCommit(h: CadHistoryState, prev: CadModelState, next: CadModelState): boolean {
  if (next === prev) return false; // no-op guard
  const tx = h.tx;
  // Inside a transaction every commit collapses into ONE history entry;
  // outside, each commit is its own step.
  if (!tx || tx.entriesPushed === 0) {
    h.past.push(prev);
    if (h.past.length > HISTORY_LIMIT) h.past.shift();
    if (tx) tx.entriesPushed = 1;
  }
  h.future = [];
  return true;
}

/** Undo: pops past into future. Returns the model to restore, or null if impossible. */
export function applyUndo(h: CadHistoryState, current: CadModelState): CadModelState | null {
  const prev = h.past.pop();
  if (prev === undefined) return null;
  h.future.push(current);
  return prev;
}

/** Redo: pops future into past. Returns the model to restore, or null. */
export function applyRedo(h: CadHistoryState, current: CadModelState): CadModelState | null {
  const next = h.future.pop();
  if (next === undefined) return null;
  h.past.push(current);
  return next;
}

/** Group the following commits into a single undo step (no nesting). */
export function beginTx(h: CadHistoryState, base: CadModelState): void {
  if (h.tx) return;
  h.tx = { entriesPushed: 0, base };
}

/** Close the current transaction; everything since `beginTx` undoes as one step. */
export function endTx(h: CadHistoryState): void {
  h.tx = null;
}

/** Cancel: pops the transaction's pushed entry and returns the base model to restore (or null when no tx was open). */
export function discardTx(h: CadHistoryState): CadModelState | null {
  const tx = h.tx;
  h.tx = null;
  if (!tx) return null;
  if (tx.entriesPushed > 0) h.past.pop();
  h.future = [];
  return tx.base;
}

export function resetHistory(h: CadHistoryState): void {
  h.past = [];
  h.future = [];
  h.tx = null;
}
