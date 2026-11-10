import { supabase } from "../supabase/client.ts";
import type { Database, Tables, TablesInsert, TablesUpdate } from "../supabase/types.ts";
import { attachCoordinates } from "../geo/geocode.ts";

export type MarketJobPostRow = Tables<"market_job_posts">;
export type MarketJobPostInsert = TablesInsert<"market_job_posts">;
export type MarketJobPostUpdate = TablesUpdate<"market_job_posts">;

export type DbPublicJob = Database["public"]["Views"]["public_market_jobs"]["Row"];

export interface VacancyItem {
  id: string;
  title: string;
  company: string | null;
  discipline: string;
  employment_type: string;
  rate: number | null;
  rate_per: string | null;
  currency: string;
  location: string;
  description: string | null;
  requirements: string[];
  benefits: string[];
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string | null;
  status: string;
  closes_at: string | null;
  starts_on: string | null;
  seniority: string | null;
  apply_url: string | null;
  photo_path: string | null;
  is_remote: boolean;
  city: string | null;
  country: string | null;
  saves: number;
  workspace_id?: string | null;
}

export type VacancyCreateInput = {
  title: string;
  company?: string | null;
  discipline: string;
  employment_type: string;
  rate?: number | null;
  rate_per?: string | null;
  currency?: string;
  location: string;
  description?: string | null;
  requirements?: string[];
  benefits?: string[];
  is_global?: boolean;
  is_remote?: boolean;
  closes_at?: string | null;
  starts_on?: string | null;
  seniority?: string | null;
  apply_url?: string | null;
  status?: string;
};

export const VACANCY_DISCIPLINES = [
  "Cadastral",
  "Engineering Survey",
  "Mining",
  "Photogrammetry",
  "GIS",
  "Hydrography",
  "Scanning",
  "Geodesy",
] as const;

export const EMPLOYMENT_TYPES = [
  "contract",
  "permanent",
  "casual",
  "full-time",
  "part-time",
] as const;

export const SENIORITY_LEVELS = [
  "Entry level",
  "Junior",
  "Mid-level",
  "Senior",
  "Lead",
] as const;

export async function listVacancies(): Promise<VacancyItem[]> {
  const { data, error } = await supabase
    .from("public_market_jobs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list vacancies: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id ?? "",
    title: row.title ?? "Untitled Vacancy",
    company: row.company ?? null,
    discipline: row.discipline ?? "Cadastral",
    employment_type: row.employment_type ?? "contract",
    rate: row.rate != null ? Number(row.rate) : null,
    rate_per: row.rate_per ?? "day",
    currency: row.currency ?? "USD",
    location: row.location ?? "",
    description: row.description ?? null,
    requirements: Array.isArray(row.requirements) ? row.requirements : [],
    benefits: Array.isArray(row.benefits) ? row.benefits : [],
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? null,
    status: row.status ?? "open",
    closes_at: row.closes_at ?? null,
    starts_on: row.starts_on ?? null,
    seniority: row.seniority ?? null,
    apply_url: row.apply_url ?? null,
    photo_path: row.photo_path ?? null,
    is_remote: Boolean(row.is_remote),
    city: row.city ?? null,
    country: row.country ?? null,
    saves: row.saves ?? 0,
  }));
}

export async function createVacancy(
  workspaceId: string,
  payload: VacancyCreateInput,
): Promise<VacancyItem> {
  const toInsert = {
    workspace_id: workspaceId,
    title: payload.title,
    company: payload.company || null,
    discipline: payload.discipline,
    employment_type: payload.employment_type || "contract",
    rate: payload.rate ?? null,
    rate_per: payload.rate_per || "day",
    currency: payload.currency || "USD",
    location: payload.location,
    description: payload.description || null,
    requirements: payload.requirements ?? [],
    benefits: payload.benefits ?? [],
    is_global: payload.is_global ?? true,
    is_remote: payload.is_remote ?? false,
    closes_at: payload.closes_at || null,
    starts_on: payload.starts_on || null,
    seniority: payload.seniority || null,
    apply_url: payload.apply_url || null,
    status: payload.status || "open",
  };

  const geoPayload = await attachCoordinates(toInsert);

  const { data, error } = await supabase
    .from("market_job_posts")
    .insert(geoPayload)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create vacancy: ${error.message}`);
  }

  return {
    ...data,
    company: data.company ?? null,
    rate: data.rate != null ? Number(data.rate) : null,
    rate_per: data.rate_per ?? "day",
    currency: data.currency ?? "USD",
    requirements: Array.isArray(data.requirements) ? data.requirements : [],
    benefits: Array.isArray(data.benefits) ? data.benefits : [],
    saves: 0,
    is_remote: Boolean(data.is_remote),
  };
}

export async function updateVacancy(
  id: string,
  patch: Partial<VacancyCreateInput>,
): Promise<void> {
  const geoPatch = await attachCoordinates({
    ...patch,
    updated_at: new Date().toISOString(),
  });

  const { error } = await supabase
    .from("market_job_posts")
    .update(geoPatch)
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to update vacancy: ${error.message}`);
  }
}

export async function deleteVacancy(id: string): Promise<void> {
  const { error } = await supabase
    .from("market_job_posts")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to delete vacancy: ${error.message}`);
  }
}
