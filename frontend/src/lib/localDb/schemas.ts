/**
 * Local-first document types that mirror the matching Supabase tables.
 * These are intentionally flat because the local store (now WatermelonDB)
 * is a document store; relations are represented by foreign-key strings and
 * joined client-side.
 */

export interface ProjectDocType {
  id: string;
  workspace_id: string;
  organization_id?: string;
  code?: string;
  name: string;
  description?: string;
  phase?: string;
  datum?: string;
  axis_convention?: string;
  crs_type?: string;
  crs_epsg?: string;
  local_origin_e?: number;
  local_origin_n?: number;
  bearing_format?: string;
  angle_entry?: string;
  coord_decimals?: number;
  progress: number;
  points: number;
  status: string;
  starts_on?: string;
  ends_on?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  archived_at?: string;
  _deleted: boolean;
}

export interface OrganizationDocType {
  id: string;
  workspace_id: string;
  name: string;
  organization_type: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country_code: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  archived_at?: string;
  _deleted: boolean;
}

export interface ContactDocType {
  id: string;
  workspace_id: string;
  organization_id?: string;
  full_name: string;
  title?: string;
  contact_type?: string;
  email?: string;
  phone?: string;
  last_contact_at?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  _deleted: boolean;
}

export interface AssetDocType {
  id: string;
  workspace_id: string;
  asset_code?: string;
  name: string;
  kind: string;
  category?: string;
  make?: string;
  model?: string;
  serial_number?: string;
  status: string;
  purchase_date?: string;
  purchase_cost?: number;
  current_value?: number;
  metadata: Record<string, unknown>;
  created_by?: string;
  created_at: string;
  updated_at: string;
  archived_at?: string;
  _deleted: boolean;
}

export interface AssetCalibrationDocType {
  id: string;
  workspace_id: string;
  asset_id: string;
  calibration_date: string;
  next_calibration_date?: string;
  calibration_status: string;
  certificate_number?: string;
  certificate_path?: string;
  provider_name?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  _deleted: boolean;
}

export interface AssetMaintenanceEventDocType {
  id: string;
  workspace_id: string;
  asset_id: string;
  serviced_on: string;
  description: string;
  cost: number;
  provider_name?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  _deleted: boolean;
}

export interface TimeEntryDocType {
  id: string;
  workspace_id: string;
  user_id: string;
  project_id?: string;
  entry_date: string;
  task: string;
  hours: number;
  billable: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
  _deleted: boolean;
}

export interface ExpenseEntryDocType {
  id: string;
  workspace_id: string;
  user_id: string;
  project_id?: string;
  entry_date: string;
  category: string;
  amount: number;
  vendor?: string;
  reimbursable: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
  _deleted: boolean;
}

export interface JobDocType {
  id: string;
  workspace_id: string;
  project_id?: string;
  title: string;
  description?: string;
  job_type?: string;
  location?: string;
  status: string;
  scheduled_start?: string;
  scheduled_end?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  archived_at?: string;
  _deleted: boolean;
}

export interface JobEventDocType {
  id: string;
  workspace_id: string;
  project_id?: string;
  job_id?: string;
  title: string;
  event_type?: string;
  event_date: string;
  start_time?: string;
  end_time?: string;
  location?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  _deleted: boolean;
}

export interface JobAssignmentDocType {
  id: string;
  workspace_id: string;
  project_id?: string;
  job_id?: string;
  assignment_date: string;
  status: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  _deleted: boolean;
}

export interface JobAssignmentMemberDocType {
  id: string;
  workspace_id: string;
  assignment_id: string;
  workspace_member_id: string;
  assignment_role: string | null;
  created_at: string;
  updated_at: string;
  _deleted: boolean;
}

export interface JobAssignmentAssetDocType {
  id: string;
  workspace_id: string;
  assignment_id: string;
  asset_id: string;
  created_at: string;
  updated_at: string;
  _deleted: boolean;
}
