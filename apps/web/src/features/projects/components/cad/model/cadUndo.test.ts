import { describe, expect, it } from "vitest";
import { emptyModel } from "../cadModel";
import {
  applyRedo, applyUndo, beginTx, createCadHistoryState, discardTx, endTx,
  HISTORY_LIMIT, recordCommit,
} from "./cadUndo";

const m = (tag: string): ReturnType<typeof emptyModel> =>
  ({ ...emptyModel(), activeLayerId: tag } as ReturnType<typeof emptyModel>);

describe("cadUndo machine", () => {
  it("recordCommit pushes prev and clears future; applyUndo/applyRedo swap stacks", () => {
    const h = createCadHistoryState();
    const a = m("a"), b = m("b"), c = m("c");
    recordCommit(h, a, b);
    recordCommit(h, b, c);
    expect(h.past).toEqual([a, b]);
    expect(applyUndo(h, c)).toBe(b);
    expect(applyUndo(h, b)).toBe(a);
    expect(applyUndo(h, a)).toBeNull();
    expect(applyRedo(h, a)).toBe(b);
    expect(applyRedo(h, b)).toBe(c);
    expect(applyRedo(h, c)).toBeNull();
  });

  it("a new commit after undo clears the redo stack", () => {
    const h = createCadHistoryState();
    const a = m("a"), b = m("b");
    recordCommit(h, a, b);
    applyUndo(h, b);
    recordCommit(h, a, m("z"));
    expect(h.future).toEqual([]);
  });

  it("transaction collapses commits into one entry and honours HISTORY_LIMIT shift", () => {
    const h = createCadHistoryState();
    const base = m("base");
    beginTx(h, base);
    recordCommit(h, base, m("t1"));
    recordCommit(h, m("t1"), m("t2"));
    endTx(h);
    expect(h.past).toEqual([base]); // ONE entry despite two commits
    // Limit: fill past beyond HISTORY_LIMIT and check the shift cap.
    let cur = m("cur");
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      const next = m(`n${i}`);
      recordCommit(h, cur, next);
      cur = next;
    }
    expect(h.past.length).toBeLessThanOrEqual(HISTORY_LIMIT);
  });

  it("discardTx pops only its own entry and returns the tx base", () => {
    const h = createCadHistoryState();
    const a = m("a");
    recordCommit(h, a, m("b"));          // committed step
    const txBase = m("txbase");
    beginTx(h, txBase);
    recordCommit(h, txBase, m("t1"));
    expect(discardTx(h)).toBe(txBase);   // returns base to restore
    expect(h.past).toEqual([a]);         // tx entry gone, earlier commit intact
    expect(discardTx(h)).toBeNull();     // no open tx → null
  });
});
