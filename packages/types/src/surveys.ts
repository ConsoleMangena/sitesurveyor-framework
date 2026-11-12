/**
 * Earth Observation and satellite survey pipeline categories.
 */
export type SurveyCategory =
  | 'water'
  | 'minerals'
  | 'soil'
  | 'hazard'
  | 'topography';

/**
 * Execution status for satellite survey runs.
 */
export type SurveyRunStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Common bounding box coordinates [minLon, minLat, maxLon, maxLat].
 */
export type BoundingBox = [number, number, number, number];

/**
 * Core survey job contract shared across engine, Edge Functions, and web app.
 */
export interface SurveyJobDescriptor {
  id: string;
  workspaceId: string;
  projectId?: string;
  title: string;
  category: SurveyCategory;
  bbox: BoundingBox;
  status: SurveyRunStatus;
  creditCost: number;
  createdAt: string;
  updatedAt?: string;
}

