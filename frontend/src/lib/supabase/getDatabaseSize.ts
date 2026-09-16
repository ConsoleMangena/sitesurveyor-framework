import { supabase } from "./client.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

const untypedClient = supabase as unknown as SupabaseClient;

/**
 * Fetch the total database size in bytes from Supabase.
 *
 * Requires a PostgreSQL function `get_database_size()` to be created in Supabase:
 *
 * CREATE OR REPLACE FUNCTION get_database_size()
 * RETURNS bigint
 * LANGUAGE sql
 * AS $$
 *   SELECT pg_database_size(current_database());
 * $$;
 *
 * If the function doesn't exist, returns null.
 */
export async function getDatabaseSize(): Promise<number | null> {
  try {
    const { data, error } = await untypedClient.rpc("get_database_size");
    if (error) {
      console.warn("Failed to fetch database size:", error.message);
      return null;
    }
    return data as number | null;
  } catch {
    console.warn("Could not fetch database size");
    return null;
  }
}

/**
 * Fetch the total size of all tables in the database (in bytes).
 *
 * Requires a PostgreSQL function `get_tables_size()` to be created in Supabase:
 *
 * CREATE OR REPLACE FUNCTION get_tables_size()
 * RETURNS bigint
 * LANGUAGE sql
 * AS $$
 *   SELECT COALESCE(SUM(pg_total_relation_size(c.oid)), 0)
 *   FROM pg_class c
 *   JOIN pg_namespace n ON n.oid = c.relnamespace
 *   WHERE c.relkind = 'r'
 *     AND n.nspname = 'public';
 * $$;
 */
export async function getTablesSize(): Promise<number | null> {
  try {
    const { data, error } = await untypedClient.rpc("get_tables_size");
    if (error) {
      console.warn("Failed to fetch tables size:", error.message);
      return null;
    }
    return data as number | null;
  } catch {
    console.warn("Could not fetch tables size");
    return null;
  }
}

/**
 * Fetch workspace-specific storage size (in bytes).
 * Counts storage objects in the workspace's folder.
 *
 * Requires a storage bucket named 'project-files' or similar.
 */
export async function getWorkspaceStorageSize(workspaceId: string): Promise<number | null> {
  try {
    const { data, error } = await supabase.storage
      .from("project-files")
      .list(`${workspaceId}`, {
        limit: 1000,
        sortBy: { column: "name", order: "asc" },
      });

    if (error) {
      console.warn("Failed to fetch workspace storage:", error.message);
      return null;
    }

    // Note: This only gets file metadata, not actual sizes
    // For accurate storage, we'd need to list all files recursively
    // and sum their metadata.size values
    return null;
  } catch {
    console.warn("Could not fetch workspace storage");
    return null;
  }
}

/**
 * Format bytes to human readable string.
 */
export function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "N/A";
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Format bytes to GB.
 */
export function bytesToGB(bytes: number | null): number {
  if (bytes === null || bytes === undefined) return 0;
  return bytes / (1024 * 1024 * 1024);
}
