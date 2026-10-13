import { describe, it, expect, vi } from "vitest";
import { runCommand, type CommandContext } from "./useCadCommands.ts";
import { emptyModel, type CadModelState } from "./cadModel.ts";
import type { UseCadModel } from "./useCadModel.ts";

/**
 * Minimal context focused on routing the AutoCAD-style layout/plot commands.
 * `cad` is a thin stub — the layout commands never touch it, and the few model
 * fields used by unrelated branches are present and empty.
 */
function makeCtx(overrides: Partial<CommandContext["layout"]> = {}) {
  const layout = {
    toModel: vi.fn(),
    toLayout: vi.fn(),
    newLayout: vi.fn(),
    plot: vi.fn(),
    names: vi.fn(() => ["Layout1", "Layout2"]),
    ...overrides,
  };
  const log = vi.fn();
  const ctx: CommandContext = {
    cad: { model: emptyModel(), selection: { type: null, id: null } } as unknown as UseCadModel,
    bearingFormat: "azimuth",
    axisConvention: "yx",
    setTool: vi.fn(),
    log,
    fitExtents: vi.fn(),
    layout,
  };
  return { ctx, layout, log };
}

describe("runCommand — layout / plot", () => {
  it("PLOT triggers the plot flow", () => {
    const { ctx, layout } = makeCtx();
    runCommand("PLOT", ctx);
    expect(layout.plot).toHaveBeenCalledOnce();
  });

  it("PRINT is an alias for PLOT", () => {
    const { ctx, layout } = makeCtx();
    runCommand("print", ctx);
    expect(layout.plot).toHaveBeenCalledOnce();
  });

  it("MODEL / MS switch to model space", () => {
    const { ctx, layout } = makeCtx();
    runCommand("MODEL", ctx);
    runCommand("ms", ctx);
    expect(layout.toModel).toHaveBeenCalledTimes(2);
  });

  it("bare LAYOUT / PS enter paper space", () => {
    const { ctx, layout } = makeCtx();
    runCommand("LAYOUT", ctx);
    runCommand("ps", ctx);
    expect(layout.toLayout).toHaveBeenCalledTimes(2);
  });

  it("LAYOUT NEW creates a layout", () => {
    const { ctx, layout } = makeCtx();
    runCommand("LAYOUT NEW", ctx);
    expect(layout.newLayout).toHaveBeenCalledOnce();
  });

  it("LAYOUT LIST reports the layout names", () => {
    const { ctx, layout, log } = makeCtx();
    runCommand("LAYOUT LIST", ctx);
    expect(layout.names).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Layout1, Layout2"));
  });

  it("reports an error when layout support is unavailable", () => {
    const { ctx, log } = makeCtx();
    const noLayout: CommandContext = { ...ctx, layout: undefined };
    runCommand("PLOT", noLayout);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("unavailable"), "error");
  });
});

describe("runCommand — hatch", () => {
  it("HATCH converts a selected closed boundary into a hatch", () => {
    const model: CadModelState = emptyModel();
    model.linework.push({
      id: "lw1",
      kind: "boundary",
      vertices: [{ n: 0, e: 0 }, { n: 10, e: 0 }, { n: 10, e: 10 }],
      closed: true,
      layerId: "0",
    });
    const log = vi.fn();
    const addHatch = vi.fn((h) => {
      const created = { ...h, id: "h1" };
      model.hatches.push(created);
      return created;
    });
    const ensureLayerById = vi.fn();
    const ctx: CommandContext = {
      cad: {
        model,
        selection: { type: "linework", id: "lw1" },
        addHatch,
        ensureLayerById,
      } as unknown as UseCadModel,
      bearingFormat: "azimuth",
      axisConvention: "yx",
      setTool: vi.fn(),
      log,
      fitExtents: vi.fn(),
    };
    runCommand("HATCH", ctx);
    expect(ensureLayerById).toHaveBeenCalledWith("HATCHES");
    expect(addHatch).toHaveBeenCalledOnce();
    expect(model.hatches).toHaveLength(1);
    expect(model.hatches[0].vertices).toHaveLength(3);
    expect(log).toHaveBeenLastCalledWith(expect.stringContaining("Hatch created"));
  });

  it("HATCH errors without a closed boundary selection", () => {
    const { ctx } = makeCtx();
    ctx.log = vi.fn();
    runCommand("HATCH", ctx);
    expect(ctx.log).toHaveBeenLastCalledWith("HATCH: select a single closed boundary first.", "error");
  });
});
