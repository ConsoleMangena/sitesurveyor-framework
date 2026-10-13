import { useEffect, useState } from "react";
import { getDatabaseSize, getTablesSize, bytesToGB } from "../supabase/getDatabaseSize.ts";

interface DatabaseStats {
  totalSizeGB: number;
  tablesSizeGB: number;
  loading: boolean;
  error: string | null;
}

export function useDatabaseStats(): DatabaseStats {
  const [stats, setStats] = useState<DatabaseStats>({
    totalSizeGB: 0,
    tablesSizeGB: 0,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchStats() {
      try {
        const [totalSize, tablesSize] = await Promise.all([
          getDatabaseSize(),
          getTablesSize(),
        ]);

        if (!cancelled) {
          setStats({
            totalSizeGB: bytesToGB(totalSize),
            tablesSizeGB: bytesToGB(tablesSize),
            loading: false,
            error: null,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setStats({
            totalSizeGB: 0,
            tablesSizeGB: 0,
            loading: false,
            error: err instanceof Error ? err.message : "Failed to fetch database stats",
          });
        }
      }
    }

    fetchStats();

    return () => {
      cancelled = true;
    };
  }, []);

  return stats;
}
