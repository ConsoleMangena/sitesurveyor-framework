import { useCallback, useMemo, useState } from "react";

export interface ProjectPoint {
  id: string;
  pointNo: string;
  e: number;
  n: number;
  z?: number | null;
  code?: string;
  sectionId?: string | null;
  createdAt: number;
}

export interface CoordinateSection {
  id: string;
  name: string;
  createdAt: number;
}

function storageKey(projectId: string) {
  return `sse:project-points:${projectId}`;
}

function sectionsKey(projectId: string) {
  return `sse:project-coordinate-sections:${projectId}`;
}

export function loadProjectPoints(projectId: string): ProjectPoint[] {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is ProjectPoint => (
      p &&
      typeof p.id === "string" &&
      typeof p.pointNo === "string" &&
      typeof p.e === "number" &&
      typeof p.n === "number"
    ));
  } catch {
    return [];
  }
}

export function saveProjectPoints(projectId: string, points: ProjectPoint[]) {
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify(points));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export function loadSections(projectId: string): CoordinateSection[] {
  try {
    const raw = localStorage.getItem(sectionsKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is CoordinateSection => (
      s &&
      typeof s.id === "string" &&
      typeof s.name === "string"
    ));
  } catch {
    return [];
  }
}

export function saveSections(projectId: string, sections: CoordinateSection[]) {
  try {
    localStorage.setItem(sectionsKey(projectId), JSON.stringify(sections));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export function addCoordinateSection(
  projectId: string,
  name: string,
): CoordinateSection {
  const sections = loadSections(projectId);
  const section: CoordinateSection = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || "Untitled section",
    createdAt: Date.now(),
  };
  saveSections(projectId, [...sections, section]);
  return section;
}

export function updateCoordinateSection(
  projectId: string,
  id: string,
  patch: Partial<Omit<CoordinateSection, "id" | "createdAt">>,
): CoordinateSection | undefined {
  const sections = loadSections(projectId);
  const idx = sections.findIndex((s) => s.id === id);
  if (idx === -1) return undefined;
  const updated = { ...sections[idx], ...patch, name: patch.name?.trim() || sections[idx].name };
  sections[idx] = updated;
  saveSections(projectId, [...sections]);
  return updated;
}

export function deleteCoordinateSection(projectId: string, id: string): void {
  const sections = loadSections(projectId).filter((s) => s.id !== id);
  saveSections(projectId, sections);
  const points = loadProjectPoints(projectId).map((p) =>
    p.sectionId === id ? { ...p, sectionId: null } : p,
  );
  saveProjectPoints(projectId, points);
}

export function nextPointNo(points: ProjectPoint[], fallback = "1"): string {
  let max = 0;
  for (const p of points) {
    const n = parseInt(p.pointNo, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max > 0 ? String(max + 1) : fallback;
}

export function addProjectPoint(
  projectId: string,
  partial: Omit<ProjectPoint, "id" | "createdAt" | "pointNo"> & { pointNo?: string },
): ProjectPoint {
  const points = loadProjectPoints(projectId);
  const pointNo = partial.pointNo?.trim() || nextPointNo(points);

  // Point numbers are the primary key in survey practice: saving a result
  // under an existing number updates that point in place instead of creating
  // a duplicate.
  if (partial.pointNo) {
    const idx = points.findIndex((p) => p.pointNo === pointNo);
    if (idx >= 0) {
      const updated: ProjectPoint = {
        ...points[idx],
        e: partial.e,
        n: partial.n,
        z: partial.z ?? null,
        code: partial.code ?? points[idx].code,
      };
      const next = [...points];
      next[idx] = updated;
      saveProjectPoints(projectId, next);
      return updated;
    }
  }

  const point: ProjectPoint = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    pointNo,
    e: partial.e,
    n: partial.n,
    z: partial.z ?? null,
    code: partial.code ?? "",
    createdAt: Date.now(),
  };
  saveProjectPoints(projectId, [...points, point]);
  return point;
}

export function findProjectPoint(
  projectId: string | undefined,
  pointNo: string,
): ProjectPoint | undefined {
  if (!projectId) return undefined;
  return loadProjectPoints(projectId).find((p) => p.pointNo === pointNo.trim());
}

/**
 * One-time key migration: points were once stored under the project's short
 * display id (`code ?? uuid-prefix`), which collides across projects. Move
 * any legacy-key data under the stable database id. No-op when both keys
 * match or nothing is stored.
 */
export function migrateProjectPointsKey(
  projectId: string,
  legacyId?: string | null,
): void {
  if (!legacyId || legacyId === projectId) return;
  try {
    for (const keyFn of [storageKey, sectionsKey]) {
      const oldKey = keyFn(legacyId);
      const newKey = keyFn(projectId);
      const legacy = localStorage.getItem(oldKey);
      if (legacy != null) {
        if (localStorage.getItem(newKey) == null) {
          localStorage.setItem(newKey, legacy);
        }
        localStorage.removeItem(oldKey);
      }
    }
  } catch {
    // Storage unavailable (private mode) — migration is best-effort.
  }
}

export function exportPointsCsv(points: ProjectPoint[], decimals = 3): string {
  const header = "Point,Easting,Northing,RL,Code\n";
  const rows = points
    .sort((a, b) => {
      const na = parseInt(a.pointNo, 10);
      const nb = parseInt(b.pointNo, 10);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return a.pointNo.localeCompare(b.pointNo);
    })
    .map((p) => [
      p.pointNo,
      p.e.toFixed(decimals),
      p.n.toFixed(decimals),
      p.z == null ? "" : p.z.toFixed(decimals),
      p.code ?? "",
    ].join(","))
    .join("\n");
  return header + rows;
}

export function useProjectPoints(projectId: string | undefined) {
  const [tick, setTick] = useState(0);

  const points = useMemo(
    () => (projectId ? loadProjectPoints(projectId) : []),
    // tick is a manual refresh pulse; it intentionally does not appear in the compute body.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, tick],
  );

  const sections = useMemo(
    () => (projectId ? loadSections(projectId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, tick],
  );

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  const add = useCallback(
    (partial: Omit<ProjectPoint, "id" | "createdAt" | "pointNo"> & { pointNo?: string }) => {
      if (!projectId) return undefined;
      const point = addProjectPoint(projectId, partial);
      refresh();
      return point;
    },
    [projectId, refresh],
  );

  const remove = useCallback(
    (id: string) => {
      if (!projectId) return;
      const next = loadProjectPoints(projectId).filter((p) => p.id !== id);
      saveProjectPoints(projectId, next);
      refresh();
    },
    [projectId, refresh],
  );

  const update = useCallback(
    (id: string, patch: Partial<Omit<ProjectPoint, "id" | "createdAt">>) => {
      if (!projectId) return;
      const next = loadProjectPoints(projectId).map((p) =>
        p.id === id ? { ...p, ...patch } : p,
      );
      saveProjectPoints(projectId, next);
      refresh();
    },
    [projectId, refresh],
  );

  const addSection = useCallback(
    (name: string) => {
      if (!projectId) return undefined;
      const section = addCoordinateSection(projectId, name);
      refresh();
      return section;
    },
    [projectId, refresh],
  );

  const updateSection = useCallback(
    (id: string, patch: Partial<Omit<CoordinateSection, "id" | "createdAt">>) => {
      if (!projectId) return undefined;
      const section = updateCoordinateSection(projectId, id, patch);
      refresh();
      return section;
    },
    [projectId, refresh],
  );

  const removeSection = useCallback(
    (id: string) => {
      if (!projectId) return;
      deleteCoordinateSection(projectId, id);
      refresh();
    },
    [projectId, refresh],
  );

  const setPointSection = useCallback(
    (id: string, sectionId: string | null) => {
      if (!projectId) return;
      const next = loadProjectPoints(projectId).map((p) =>
        p.id === id ? { ...p, sectionId } : p,
      );
      saveProjectPoints(projectId, next);
      refresh();
    },
    [projectId, refresh],
  );

  const pointNos = useMemo(
    () => points.map((p) => p.pointNo).sort((a, b) => a.localeCompare(b)),
    [points],
  );

  return {
    points,
    sections,
    pointNos,
    refresh,
    add,
    remove,
    update,
    addSection,
    updateSection,
    removeSection,
    setPointSection,
    next: useMemo(() => nextPointNo(points), [points]),
  };
}
