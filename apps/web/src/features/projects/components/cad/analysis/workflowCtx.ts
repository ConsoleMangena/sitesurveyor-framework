import type {
  CadModelState,
  LayerId,
  SurveyLinework,
  SurveyPoint,
  SurveySurface,
  SurveyText,
} from "../cadModel.ts";

export interface WorkflowDialogs {
  prompt(message: string, defaultValue?: string): Promise<string | null>;
  select(message: string, options: string[]): Promise<string | null>;
}

export interface WorkflowApi {
  ensureLayerById(id: LayerId): unknown;
  addLinework(l: Omit<SurveyLinework, "id" | "layerId"> & { layerId?: LayerId }): SurveyLinework;
  updateLinework(id: string, patch: Partial<SurveyLinework>): void;
  deleteLinework(id: string): void;
  addPoint(p: Omit<SurveyPoint, "id" | "layerId"> & { layerId?: LayerId }): SurveyPoint;
  updatePoint(id: string, patch: Partial<SurveyPoint>): void;
  deletePoint(id: string): void;
  updateText(id: string, patch: Partial<SurveyText>): void;
  addSurface(s: Omit<SurveySurface, "id" | "layerId" | "visible"> & { layerId?: LayerId; visible?: boolean }): SurveySurface;
  updateSurface(id: string, patch: Partial<SurveySurface>): void;
  deleteSurface(id: string): void;
  beginTransaction(): void;
  endTransaction(): void;
}

/** Draft for archiving a generated artifact into the project outputs store. */
export interface ProjectOutputDraft {
  label: string;
  description?: string;
  mimeType: string;
  fileName: string;
  content: string;
}

export interface WorkflowServices {
  dialog: WorkflowDialogs;
  log(text: string, kind?: "info" | "error"): void;
  fitExtents(): void;
  show3d(): void;
  openReport(title: string, bodyHtml: string): void;
  downloadCsv(filename: string, rows: (string | number)[][]): void;
  projectName: string;
  /** Project display id (sheet code) shown in report headers. */
  projectId: string;
  /** Stable database id used for output file names and storage keys. */
  projectDbId: string;
  /** Archive a generated artifact into the project outputs store. */
  addOutput(draft: ProjectOutputDraft): void;
}

/** 3D points usable for a surface: those with an elevation. */
export function surfacePointsOf(model: CadModelState): { n: number; e: number; z: number }[] {
  return model.points
    .filter((p) => p.z != null && Number.isFinite(p.z))
    .map((p) => ({ n: p.n, e: p.e, z: p.z as number }));
}

export async function pickSurface(
  surfaces: SurveySurface[],
  dialog: WorkflowDialogs,
  title: string,
): Promise<SurveySurface | null> {
  if (surfaces.length === 1) return surfaces[0];
  const options = surfaces.map((s, i) => `${i + 1}. ${s.name}`);
  const raw = await dialog.select(title, options);
  if (raw == null) return null;
  const idx = parseInt(raw, 10) - 1;
  return surfaces[idx] ?? null;
}
