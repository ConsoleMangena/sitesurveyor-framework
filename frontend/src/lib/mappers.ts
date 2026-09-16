import type { ContactWithOrg } from "./repositories/contacts.ts";
import type { AssetRow } from "./repositories/assets.ts";
import type { Tables } from "./supabase/types.ts";

type CalibrationRow = Tables<"asset_calibrations">;
type MaintenanceEventRow = Tables<"asset_maintenance_events">;

const STATUS_MAP: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  completed: "Completed",
  on_hold: "On Hold",
  archived: "Archived",
  available: "Available",
  deployed: "Deployed",
  maintenance: "Maintenance",
  retired: "Retired",
  sent: "Sent",
  accepted: "Accepted",
  rejected: "Rejected",
  expired: "Expired",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
  scheduled: "Scheduled",
  passed: "Passed",
  failed: "Failed",
};

const REVERSE_STATUS_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_MAP).map(([k, v]) => [v, k]),
);

export function mapStatus(dbStatus: string): string {
  return STATUS_MAP[dbStatus] ?? dbStatus;
}

export function reverseStatus(uiStatus: string): string {
  return REVERSE_STATUS_MAP[uiStatus] ?? uiStatus.toLowerCase().replace(/ /g, "_");
}

export function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  if (diffHrs < 24) return `${diffHrs} hour${diffHrs === 1 ? "" : "s"} ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffWeeks < 5) return `${diffWeeks} week${diffWeeks === 1 ? "" : "s"} ago`;

  return new Date(isoDate).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export interface UiContact {
  id: string;
  dbId: string;
  name: string;
  company: string;
  title: string;
  type: string;
  email: string;
  phone: string;
  lastContact: string;
}

export function mapContactRowToUi(row: ContactWithOrg): UiContact {
  return {
    id: row.id,
    dbId: row.id,
    name: row.full_name,
    company: row.organization_name ?? "",
    title: row.title ?? "",
    type: row.contact_type ?? "Client",
    email: row.email ?? "",
    phone: row.phone ?? "",
    lastContact: row.last_contact_at
      ? formatRelativeTime(row.last_contact_at)
      : "Never",
  };
}

export type CrsType = 'local' | 'projected' | 'other';

export interface UiHubProject {
  id: string;
  dbId: string;
  name: string;
  client: string;
  organizationId: string | null;
  description: string;
  phase: string;
  datum: string;
  axisConvention: "yx" | "xy";
  crsType: CrsType;
  crsEpsg: string;
  localOriginE: number;
  localOriginN: number;
  bearingFormat: string;
  angleEntry: string;
  coordDecimals: number;
  points: number;
  progress: number;
  status: string;
  members: { name: string; email: string; role: string; status: string }[];
  createdAt: string;
  lastActivity: string;
}

export interface ProjectWithOrg {
  id: string;
  workspace_id: string;
  organization_id: string | null;
  code: string | null;
  name: string;
  description: string | null;
  phase: string | null;
  datum: string | null;
  axis_convention: string | null;
  crs_type: string | null;
  crs_epsg: string | null;
  local_origin_e: number | null;
  local_origin_n: number | null;
  bearing_format: string | null;
  angle_entry: string | null;
  coord_decimals: number | null;
  progress: number;
  points: number;
  status: string;
  starts_on: string | null;
  ends_on: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  organization_name: string | null;
}

export interface ProjectMemberInfo {
  full_name: string | null;
  email: string | null;
  role: string;
}

export function mapProjectRowToHubProject(
  row: ProjectWithOrg,
  members: ProjectMemberInfo[],
): UiHubProject {
  return {
    id: row.code ?? row.id.slice(0, 8).toUpperCase(),
    dbId: row.id,
    name: row.name,
    client: row.organization_name ?? "Unspecified",
    organizationId: row.organization_id,
    description: row.description ?? "",
    phase: row.phase ?? "",
    datum: row.datum ?? "",
    axisConvention: row.axis_convention === "xy" ? "xy" : "yx",
    crsType: (row.crs_type === 'projected' || row.crs_type === 'other') ? row.crs_type : 'local',
    crsEpsg: row.crs_epsg ?? '',
    localOriginE: row.local_origin_e ?? 0,
    localOriginN: row.local_origin_n ?? 0,
    bearingFormat: row.bearing_format ?? 'azimuth',
    angleEntry: row.angle_entry ?? 'packed',
    coordDecimals: row.coord_decimals ?? 3,
    points: row.points,
    progress: Number(row.progress),
    status: row.archived_at ? "Archived" : mapStatus(row.status),
    members: members.map((m) => ({
      name: m.full_name ?? "Unknown",
      email: m.email ?? "",
      role: m.role,
      status: "active" as const,
    })),
    createdAt: new Date(row.created_at).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    lastActivity: formatRelativeTime(row.updated_at),
  };
}

export interface UiInstrument {
  id: string;
  dbId: string;
  name: string;
  make: string;
  model: string;
  serial: string;
  type: string;
  kind: string;
  status: string;
  purchaseDate: string;
  purchaseCost: number;
  currentValue: number;
  assignedTo: string;
  assignedProject: string;
  lastCalibration: string;
  nextCalibration: string;
  calibrationCert: string;
  maintenanceLog: { date: string; description: string; cost: number }[];
  metadata: Record<string, unknown>;
}

export function mapAssetRowToInstrument(
  row: AssetRow,
  calibrations: CalibrationRow[],
  maintenance: MaintenanceEventRow[],
): UiInstrument {
  const latest = calibrations[0];
  const metadata = (row.metadata as Record<string, unknown>) || {};
  const currentProjectName =
    typeof metadata.current_project_name === "string" ? metadata.current_project_name : "";
  return {
    id: row.asset_code ?? row.id.slice(0, 8).toUpperCase(),
    dbId: row.id,
    name: row.name,
    make: row.make ?? "",
    model: row.model ?? "",
    serial: row.serial_number ?? "",
    type: row.category ?? mapStatus(row.kind),
    kind: row.kind,
    status: mapStatus(row.status),
    purchaseDate: row.purchase_date ?? "",
    purchaseCost: Number(row.purchase_cost ?? 0),
    currentValue: Number(row.current_value ?? 0),
    assignedTo: "\u2014",
    assignedProject: currentProjectName || "\u2014",
    lastCalibration: latest?.calibration_date ?? "",
    nextCalibration: latest?.next_calibration_date ?? "",
    calibrationCert: latest?.certificate_number ?? "",
    maintenanceLog: maintenance.map((m) => ({
      date: m.serviced_on,
      description: m.description,
      cost: Number(m.cost),
    })),
    metadata,
  };
}

export interface UiQuote {
  id: string;
  dbId: string;
  client: string;
  clientId: string | null;
  project: string;
  projectId: string | null;
  date: string;
  expiresOn: string | null;
  status: string;
  notes: string;
  items: { id: string; description: string; qty: number; unit: string; rate: number }[];
}

export interface QuoteWithDetails {
  id: string;
  quote_number: string;
  issue_date: string;
  status: string;
  organization_name: string | null;
  project_name: string | null;
  [key: string]: unknown;
}

export function mapQuoteRowToUi(
  row: QuoteWithDetails,
  items: Tables<"quote_items">[],
): UiQuote {
  return {
    id: row.quote_number,
    dbId: row.id,
    client: row.organization_name ?? "Unspecified",
    clientId: (row.organization_id as string | null) ?? null,
    project: row.project_name ?? "",
    projectId: (row.project_id as string | null) ?? null,
    date: row.issue_date,
    expiresOn: (row.expires_on as string | null) ?? null,
    status: mapStatus(row.status),
    notes: (row.notes as string | null) ?? "",
    items: items.map((item) => ({
      id: item.id,
      description: item.description,
      qty: Number(item.qty),
      unit: item.unit ?? "",
      rate: Number(item.rate),
    })),
  };
}

export interface UiInvoice {
  id: string;
  dbId: string;
  client: string;
  clientId: string | null;
  project: string;
  projectId: string | null;
  date: string;
  dueDate: string | null;
  status: string;
  notes: string;
  items: { id: string; description: string; qty: number; unit: string; rate: number }[];
}

export interface InvoiceWithDetails {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  status: string;
  organization_id: string | null;
  organization_name: string | null;
  project_id: string | null;
  project_name: string | null;
  [key: string]: unknown;
}

export function mapInvoiceRowToUi(
  row: InvoiceWithDetails,
  items: Tables<"invoice_items">[],
): UiInvoice {
  return {
    id: row.invoice_number,
    dbId: row.id,
    client: row.organization_name ?? "Unspecified",
    clientId: row.organization_id ?? null,
    project: row.project_name ?? "",
    projectId: row.project_id ?? null,
    date: row.issue_date,
    dueDate: row.due_date ?? null,
    status: mapStatus(row.status),
    notes: (row.notes as string | null) ?? "",
    items: items.map((item) => ({
      id: item.id,
      description: item.description,
      qty: Number(item.qty),
      unit: item.unit ?? "",
      rate: Number(item.rate),
    })),
  };
}
