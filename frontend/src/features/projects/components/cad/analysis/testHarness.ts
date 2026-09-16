// analysis/testHarness.ts (shared by Tasks 4-8 tests)
import { vi } from "vitest";
import type { CadModelState, SurveyLinework, SurveySurface } from "../cadModel.ts";
import { emptyModel } from "../cadModel.ts";
import type { WorkflowApi, WorkflowDialogs, WorkflowServices } from "./workflowCtx.ts";

let seq = 0;
export function fakeModel(patch: Partial<CadModelState> = {}): CadModelState {
  return { ...emptyModel(), ...patch };
}
export function fakeApi(_model: CadModelState) {
  const calls: { op: string; args: unknown[] }[] = [];
  const api: WorkflowApi = {
    ensureLayerById: (id) => { calls.push({ op: "ensureLayer", args: [id] }); return id; },
    addLinework: (l) => {
      calls.push({ op: "addLinework", args: [l] });
      seq += 1;
      return { id: `lw-${seq}`, layerId: l.layerId ?? "0", ...l } as SurveyLinework;
    },
    updateLinework: (id, patch) => calls.push({ op: "updateLinework", args: [id, patch] }),
    deleteLinework: (id) => calls.push({ op: "deleteLinework", args: [id] }),
    addPoint: (p) => { calls.push({ op: "addPoint", args: [p] }); seq += 1; return { id: `pt-${seq}`, layerId: p.layerId ?? "0", ...p }; },
    updatePoint: (id, patch) => calls.push({ op: "updatePoint", args: [id, patch] }),
    deletePoint: (id) => calls.push({ op: "deletePoint", args: [id] }),
    updateText: (id, patch) => calls.push({ op: "updateText", args: [id, patch] }),
    addSurface: (s) => {
      calls.push({ op: "addSurface", args: [s] });
      seq += 1;
      return { id: `sf-${seq}`, visible: true, layerId: s.layerId ?? "0", name: s.name, points: s.points, triangles: s.triangles } as unknown as SurveySurface;
    },
    updateSurface: (id, patch) => calls.push({ op: "updateSurface", args: [id, patch] }),
    deleteSurface: (id) => calls.push({ op: "deleteSurface", args: [id] }),
    beginTransaction: () => calls.push({ op: "beginTx", args: [] }),
    endTransaction: () => calls.push({ op: "endTx", args: [] }),
  };
  return { api, calls };
}
export function fakeServices(dialogs: Partial<WorkflowDialogs> = {}) {
  const log = vi.fn();
  const services: WorkflowServices = {
    dialog: {
      prompt: async () => null,
      select: async () => null,
      ...dialogs,
    } as WorkflowDialogs,
    log,
    fitExtents: vi.fn(),
    show3d: vi.fn(),
    openReport: vi.fn(),
    downloadCsv: vi.fn(),
    projectName: "Test Project",
    projectId: "test-project-id",
    projectDbId: "db-test-project",
    addOutput: vi.fn(),
  };
  return { services, log };
}
