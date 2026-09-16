import { describe, expect, it, vi } from "vitest";
import { emptyModel, type CadModelState, type CadSelection } from "../cadModel.ts";
import type { UseCadModel } from "../useCadModel.ts";
import type { WorkflowDialogs } from "../analysis/workflowCtx.ts";
import { handleToolPick, type PickFlowCtx } from "./pickFlows.ts";

type NE = { n: number; e: number };

const A: NE = { n: 0, e: 0 };
const B: NE = { n: 30, e: 40 };

/** React-setter emulation so updater-function branches can be observed. */
function fakePending() {
  let verts: NE[] = [];
  const set = vi.fn((update: NE[] | ((v: NE[]) => NE[])) => {
    verts = typeof update === "function" ? update(verts) : update;
  });
  return {
    set,
    get: () => verts,
  };
}

function fakePointForm() {
  let form: {
    open: boolean;
    world: NE | null;
    pointNo: string;
    code: string;
    elev: string;
    layerId: string;
    title: string;
  } = {
    open: false,
    world: null,
    pointNo: "1",
    code: "",
    elev: "",
    layerId: "POINTS",
    title: "Place Survey Point",
  };
  const set = vi.fn(
    (
      update:
        | typeof form
        | ((prev: typeof form) => typeof form),
    ) => {
      form = typeof update === "function" ? update(form) : update;
    },
  );
  return { set, get: () => form };
}

function fakeControlPointForm() {
  let form = { open: false, pointNo: "1", code: "CP" };
  const set = vi.fn(
    (
      update:
        | typeof form
        | ((prev: typeof form) => typeof form),
    ) => {
      form = typeof update === "function" ? update(form) : update;
    },
  );
  return { set, get: () => form };
}

function fakeCad(model: CadModelState) {
  return {
    model,
    selection: { type: null, id: null, items: [] } as CadSelection,
    layerById: vi.fn((id: string) => model.layers.find((l) => l.id === id)),
    nextPointNo: vi.fn(() => "7"),
    ensureLayerById: vi.fn((id: string) => ({ id, name: id, color: "#000000", visible: true, locked: false })),
    addText: vi.fn(() => ({ id: "tx1" })),
    addCircle: vi.fn(() => ({ id: "ci1" })),
    addArc: vi.fn(() => ({ id: "ar1" })),
    addDimension: vi.fn(() => ({ id: "dim1" })),
    setSelection: vi.fn(),
    transformSelection: vi.fn(() => 2),
    mapSelection: vi.fn(() => 3),
    offsetLinework: vi.fn(),
  };
}

interface CtxOptions {
  tool: PickFlowCtx["tool"];
  world?: NE;
  model?: Partial<CadModelState>;
  cadPatch?: Record<string, unknown>;
  dialog?: Partial<WorkflowDialogs>;
  pending?: NE[];
}

function makeCtx(opts: CtxOptions) {
  const model: CadModelState = { ...emptyModel(), ...opts.model };
  const cad = Object.assign(fakeCad(model), opts.cadPatch);
  const pending = fakePending();
  if (opts.pending) {
    // Seed via the setter so the emulation state matches.
    pending.set(opts.pending);
  }
  const pointForm = fakePointForm();
  const controlPointForm = fakeControlPointForm();
  const log = vi.fn();
  const dialog = {
    prompt: vi.fn(async () => null),
    select: vi.fn(async () => null),
    ...opts.dialog,
  };
  const ctx: PickFlowCtx = {
    world: opts.world ?? A,
    tool: opts.tool,
    cad: cad as unknown as UseCadModel,
    model,
    dialog,
    log,
    activeColor: null,
    pendingVertices: pending.get(),
    setPendingVertices: pending.set,
    setPointForm: pointForm.set,
    setControlPointForm: controlPointForm.set,
    coordDecimals: 3,
  };
  return { ctx, cad, pending, pointForm, controlPointForm, log, dialog };
}

describe("handleToolPick — draw tools", () => {
  it("point opens the point form with nextPointNo and the active layer", async () => {
    const t = makeCtx({ tool: "point", world: { n: 5, e: 6 } });
    await expect(handleToolPick(t.ctx)).resolves.toBe(true);
    expect(t.pointForm.get()).toEqual({
      open: true,
      world: { n: 5, e: 6 },
      pointNo: "7",
      code: "",
      elev: "",
      layerId: "0",
      title: "Place Survey Point",
    });
  });

  it("control-point ensures the CONTROL layer and opens its form", async () => {
    const t = makeCtx({ tool: "control-point" });
    await handleToolPick(t.ctx);
    expect(t.cad.ensureLayerById).toHaveBeenCalledWith("CONTROL");
    expect(t.controlPointForm.get()).toEqual({ open: true, pointNo: "7", code: "CP" });
  });

  it("text prompts for annotation and places trimmed text with the active colour", async () => {
    const t = makeCtx({
      tool: "text",
      world: { n: 1, e: 2 },
      dialog: { prompt: vi.fn(async () => "  BM 12  ") },
    });
    await handleToolPick(t.ctx);
    expect(t.cad.addText).toHaveBeenCalledWith({ n: 1, e: 2, text: "BM 12", color: null });
    expect(t.log).toHaveBeenCalledWith(`Text placed: "BM 12"`);
  });

  it("line and boundary picks append to pendingVertices", async () => {
    const line = makeCtx({ tool: "line", world: B });
    await handleToolPick(line.ctx);
    expect(line.pending.get()).toEqual([B]);

    const boundary = makeCtx({ tool: "boundary", world: A });
    await handleToolPick(boundary.ctx);
    expect(boundary.pending.get()).toEqual([A]);
  });

  it("circle pick 1 appends the centre and prompts for the rim", async () => {
    const t = makeCtx({ tool: "circle" });
    await handleToolPick(t.ctx);
    expect(t.pending.get()).toEqual([A]);
    expect(t.log).toHaveBeenCalledWith("Specify point on circumference:");
    expect(t.cad.addCircle).not.toHaveBeenCalled();
  });

  it("circle pick 2 with radius > 0 adds a circle with hypot radius and selects it", async () => {
    const t = makeCtx({ tool: "circle", world: B, pending: [A] });
    await handleToolPick(t.ctx);
    expect(t.cad.addCircle).toHaveBeenCalledWith({ center: A, radius: 50, color: null });
    expect(t.cad.setSelection).toHaveBeenCalledWith({ type: "circle", id: "ci1" });
    expect(t.log).toHaveBeenCalledWith("Circle created — radius 50.000 m.");
    expect(t.pending.get()).toEqual([]);
  });

  it("circle radius 0 logs an error and resets pending", async () => {
    const t = makeCtx({ tool: "circle", world: A, pending: [A] });
    await handleToolPick(t.ctx);
    expect(t.cad.addCircle).not.toHaveBeenCalled();
    expect(t.log).toHaveBeenCalledWith("Circle: radius must be greater than zero.", "error");
    expect(t.pending.get()).toEqual([]);
  });

  it("arc through three collinear points errors and resets pending", async () => {
    const t = makeCtx({ tool: "arc", world: { n: 20, e: 0 }, pending: [A, { n: 10, e: 0 }] });
    await expect(handleToolPick(t.ctx)).resolves.toBe(true);
    expect(t.cad.addArc).not.toHaveBeenCalled();
    expect(t.log).toHaveBeenCalledWith("Arc: three selected points are collinear or coincident.", "error");
    expect(t.pending.get()).toEqual([]);
  });
});

describe("handleToolPick — modify tools", () => {
  it("move with an empty selection errors before any pick is consumed", async () => {
    const t = makeCtx({ tool: "move" });
    await handleToolPick(t.ctx);
    expect(t.log).toHaveBeenCalledWith("Move: select objects first (use Select), then pick base point.", "error");
    expect(t.cad.transformSelection).not.toHaveBeenCalled();
    expect(t.pending.get()).toEqual([]);
  });

  it("copy applies transformSelection(dn, de, true) on the second pick and logs the count", async () => {
    const t = makeCtx({
      tool: "copy",
      world: B,
      pending: [A],
      cadPatch: {
        selection: { type: "linework", id: "lw1", items: [{ type: "linework", id: "lw1" }] } as CadSelection,
      },
    });
    await handleToolPick(t.ctx);
    expect(t.cad.transformSelection).toHaveBeenCalledWith(30, 40, true);
    expect(t.log).toHaveBeenCalledWith("Copied 2 objects — 50.000 m.");
    expect(t.pending.get()).toEqual([]);
  });

  it("rotate maps the selection by the base→ref angle on the second pick", async () => {
    const t = makeCtx({
      tool: "rotate",
      world: { n: 0, e: 10 },
      pending: [A],
      cadPatch: {
        selection: { type: "linework", id: "lw1", items: [{ type: "linework", id: "lw1" }] } as CadSelection,
        mapSelection: vi.fn(() => 3),
      },
    });
    await handleToolPick(t.ctx);
    expect(t.cad.mapSelection).toHaveBeenCalledTimes(1);
    const [fn, asCopy, ops] = (t.cad.mapSelection as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(asCopy).toBe(false);
    expect(ops).toEqual({ rotateDeg: 0 });
    // Identity check for the 0° rotation around A.
    expect(fn({ n: 5, e: 5 })).toEqual({ e: 5, n: 5 });
    expect(t.log).toHaveBeenCalledWith("Rotated 3 objects 0.000° around base.");
    expect(t.pending.get()).toEqual([]);
  });

  it("scale takes a base point then a prompted factor", async () => {
    const t = makeCtx({
      tool: "scale",
      world: A,
      cadPatch: {
        selection: { type: "linework", id: "lw1", items: [{ type: "linework", id: "lw1" }] } as CadSelection,
        mapSelection: vi.fn(() => 3),
      },
      dialog: { prompt: vi.fn(async () => "2") },
    });
    await handleToolPick(t.ctx);
    expect(t.dialog.prompt).toHaveBeenCalledWith("Scale factor:", "1");
    expect(t.cad.mapSelection).toHaveBeenCalledTimes(1);
    const [fn, asCopy, ops] = (t.cad.mapSelection as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(asCopy).toBe(false);
    expect(ops).toEqual({ scaleFactor: 2 });
    expect(fn({ n: 10, e: 20 })).toEqual({ e: 40, n: 20 });
    expect(t.log).toHaveBeenCalledWith("Enter scale factor after picking the base point.");
    expect(t.log).toHaveBeenCalledWith("Scaled 3 objects by 2.000x.");
    expect(t.pending.get()).toEqual([]);
  });

  it("mirror maps the selection across the two picked points", async () => {
    const t = makeCtx({
      tool: "mirror",
      world: { n: 0, e: 10 },
      pending: [A],
      cadPatch: {
        selection: { type: "linework", id: "lw1", items: [{ type: "linework", id: "lw1" }] } as CadSelection,
        mapSelection: vi.fn(() => 3),
      },
    });
    await handleToolPick(t.ctx);
    const [fn, asCopy, ops] = (t.cad.mapSelection as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(asCopy).toBe(false);
    expect(ops).toEqual({ mirrorAngleDeg: 0 });
    // Mirroring (n=4,e=10) across the picked +E-direction line lands at (n=-4,e=10).
    expect(fn({ n: 4, e: 10 })).toEqual({ e: 10, n: -4 });
    expect(t.log).toHaveBeenCalledWith("Mirrored 3 objects across mirror line.");
    expect(t.pending.get()).toEqual([]);
  });

  it("offset prompts for a distance and offsets the selected polyline", async () => {
    const offsetLinework = vi.fn(() => ({
      id: "lw-off",
      kind: "polyline" as const,
      vertices: [A, { n: 1, e: 1 }, { n: 2, e: 2 }],
      closed: false,
      layerId: "0",
    }));
    const t = makeCtx({
      tool: "offset",
      cadPatch: {
        selection: { type: "linework", id: "lw1", items: [{ type: "linework", id: "lw1" }] } as CadSelection,
        offsetLinework,
      },
      dialog: { prompt: vi.fn(async () => "2.5") },
    });
    await handleToolPick(t.ctx);
    expect(t.dialog.prompt).toHaveBeenCalledWith("Offset distance (positive = left side):", "1");
    expect(offsetLinework).toHaveBeenCalledWith("lw1", 2.5);
    expect(t.log).toHaveBeenCalledWith("Offset 2.500 m created — 3 vertices.");
  });
});

describe("handleToolPick — annotate / measure", () => {
  it("dim-linear creates a linear dimension from two picks on DIMENSIONS", async () => {
    const t = makeCtx({ tool: "dim-linear", world: B, pending: [A] });
    await handleToolPick(t.ctx);
    expect(t.cad.ensureLayerById).toHaveBeenCalledWith("DIMENSIONS");
    expect(t.cad.addDimension).toHaveBeenCalledWith({
      kind: "linear",
      text: "50.000",
      textPosition: { n: 15, e: 20 },
      defPoints: [A, B],
      angle: Math.atan2(40, 30) * (180 / Math.PI),
      color: null,
    });
    expect(t.cad.setSelection).toHaveBeenCalledWith({ type: "dimension", id: "dim1" });
    expect(t.log).toHaveBeenCalledWith("Linear dimension: 50.000 m placed.");
    expect(t.pending.get()).toEqual([]);
  });

  it("spot-height samples the single surface TIN without prompting", async () => {
    const tinSurface = {
      id: "sf1",
      name: "Surface 1",
      layerId: "TOPO",
      visible: true,
      points: [
        { n: 0, e: 0, z: 12.5 },
        { n: 0, e: 100, z: 12.5 },
        { n: 100, e: 0, z: 12.5 },
      ],
      triangles: [{ a: 0, b: 1, c: 2 }],
    };
    const t = makeCtx({
      tool: "spot-height",
      world: { n: 25, e: 25 },
      model: { surfaces: [tinSurface] },
    });
    await handleToolPick(t.ctx);
    expect(t.dialog.prompt).not.toHaveBeenCalled();
    expect(t.cad.ensureLayerById).toHaveBeenCalledWith("SPOT_HEIGHTS");
    expect(t.cad.addText).toHaveBeenCalledWith({
      n: 25,
      e: 25,
      text: "RL 12.500",
      color: null,
      layerId: "SPOT_HEIGHTS",
    });
    expect(t.log).toHaveBeenCalledWith("Spot Height placed: RL 12.500");
  });

  it("spot-height falls back to a manual RL prompt when nothing can be sampled", async () => {
    const t = makeCtx({
      tool: "spot-height",
      world: A,
      dialog: { prompt: vi.fn(async () => "99.5") },
    });
    await handleToolPick(t.ctx);
    expect(t.dialog.prompt).toHaveBeenCalledWith("Spot elevation (RL m):", "");
    expect(t.cad.addText).toHaveBeenCalledWith({
      n: 0,
      e: 0,
      text: "RL 99.500",
      color: null,
      layerId: "SPOT_HEIGHTS",
    });
    expect(t.log).toHaveBeenCalledWith("Spot Height placed: RL 99.500");
  });

  it("measure logs distance/bearing between two picks", async () => {
    const t = makeCtx({ tool: "measure", world: B, pending: [A] });
    await handleToolPick(t.ctx);
    expect(t.log).toHaveBeenCalledWith("Measure: 50.000 m @ 53.1301°  dX:30.000  dY:40.000");
    expect(t.pending.get()).toEqual([]);
  });
});

describe("handleToolPick — dispatch contract", () => {
  it("returns false and does nothing for tools that do not consume picks", async () => {
    const t = makeCtx({ tool: "select" });
    await expect(handleToolPick(t.ctx)).resolves.toBe(false);
    expect(t.log).not.toHaveBeenCalled();
    expect(t.cad.setSelection).not.toHaveBeenCalled();
  });
});
