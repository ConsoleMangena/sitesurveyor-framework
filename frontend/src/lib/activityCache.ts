import type { ProjectActivity } from "./repositories/projects.ts";

const CACHE_KEY = (projectId: string) => `ss:activities:v1:${projectId}`;
const QUEUE_KEY = (projectId: string) => `ss:activityQueue:v1:${projectId}`;

export type ActivityType = "note" | "action" | "system";

type PendingCreate = {
  tempId: string;
  content: string;
  type: ActivityType;
  createdAt: string;
  userName: string;
};

export type ActivityQueue = {
  creates: PendingCreate[];
  deletes: string[];
};

export type ActivityWithMeta = ProjectActivity & { queued?: boolean };

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function readCachedActivities(projectId: string): ActivityWithMeta[] {
  return safeParse(localStorage.getItem(CACHE_KEY(projectId)), []);
}

export function writeCachedActivities(
  projectId: string,
  activities: ActivityWithMeta[],
): void {
  try {
    localStorage.setItem(CACHE_KEY(projectId), JSON.stringify(activities));
  } catch {
    // Storage full — cache is best-effort.
  }
}

export function readActivityQueue(projectId: string): ActivityQueue {
  return safeParse(localStorage.getItem(QUEUE_KEY(projectId)), {
    creates: [],
    deletes: [],
  });
}

export function writeActivityQueue(
  projectId: string,
  queue: ActivityQueue,
): void {
  try {
    localStorage.setItem(QUEUE_KEY(projectId), JSON.stringify(queue));
  } catch {
    // Storage full — queue is best-effort.
  }
}

export function clearActivityQueue(projectId: string): void {
  localStorage.removeItem(QUEUE_KEY(projectId));
}

export function buildPendingActivity(
  projectId: string,
  tempId: string,
  content: string,
  type: ActivityType,
  userName: string,
): ActivityWithMeta {
  const now = new Date().toISOString();
  return {
    id: tempId,
    project_id: projectId,
    user_id: null,
    user_name: userName,
    content,
    activity_type: type,
    created_at: now,
    queued: true,
  } as ActivityWithMeta;
}

export function mergeActivities(
  projectId: string,
  remote: ProjectActivity[],
  queue: ActivityQueue,
): ActivityWithMeta[] {
  const deleteSet = new Set(queue.deletes);
  // Pending creates are ALSO prepended to the persistent cache by the offline
  // add-note/quick-action flows, so `remote` may already contain them —
  // exclude those ids or the same pending entry renders twice.
  const pendingIds = new Set(queue.creates.map((c) => c.tempId));
  const base = remote
    .filter((a) => !deleteSet.has(a.id) && !pendingIds.has(a.id))
    .map((a) => ({ ...a, queued: false }));

  const pending = queue.creates.map((c) =>
    buildPendingActivity(projectId, c.tempId, c.content, c.type, c.userName),
  );
  // Pending creates are shown at the top of the timeline.
  return [...pending, ...base];
}

export function queueActivityCreate(
  projectId: string,
  tempId: string,
  content: string,
  type: ActivityType,
  userName: string,
): void {
  const queue = readActivityQueue(projectId);
  queue.creates.push({ tempId, content, type, createdAt: new Date().toISOString(), userName });
  writeActivityQueue(projectId, queue);
}

export function queueActivityDelete(
  projectId: string,
  activityId: string,
): void {
  const queue = readActivityQueue(projectId);
  const createIndex = queue.creates.findIndex((c) => c.tempId === activityId);
  if (createIndex >= 0) {
    // Deleting a not-yet-synced create: drop it from the create queue.
    queue.creates.splice(createIndex, 1);
  } else if (!queue.deletes.includes(activityId)) {
    queue.deletes.push(activityId);
  }
  writeActivityQueue(projectId, queue);
}
