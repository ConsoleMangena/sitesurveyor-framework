import { useCallback, useState } from "react";
import { Satellite } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { useAsyncAction } from "@/hooks/useAsyncAction.ts";
import { listJobs, type JobWithProject } from "@/lib/repositories/jobs";
import { parseJobSpec } from "@/lib/surveys/jobSpec";

interface ProjectEarthObservationPanelProps {
  workspaceId: string;
  projectId: string;
  onNavigate?: (view: string, context?: Record<string, string>) => void;
}

/** Survey history remains project-scoped even though field jobs have no UI. */
export function ProjectEarthObservationPanel({
  workspaceId,
  projectId,
  onNavigate,
}: ProjectEarthObservationPanelProps) {
  const [surveys, setSurveys] = useState<JobWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const rows = await listJobs(workspaceId);
    setSurveys(rows.filter(
      (job) => job.project_id === projectId && parseJobSpec(job.description) !== null,
    ));
  }, [workspaceId, projectId]);

  useAsyncAction(async () => {
    try {
      setError(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load this project's surveys.");
    } finally {
      setLoading(false);
    }
  }, [load]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Earth Observation</CardTitle>
          <CardDescription>Satellite surveys and saved runs for this project.</CardDescription>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => onNavigate?.("satellite", { projectId })}>
          <Satellite className="size-3.5" /> New survey
        </Button>
      </CardHeader>
      <CardContent>
        {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
        {loading ? (
          <div className="space-y-2 py-2" aria-busy="true">
            {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />)}
          </div>
        ) : surveys.length === 0 ? (
          <Empty className="border border-dashed py-8">
            <EmptyHeader>
              <EmptyTitle>No Earth Observation surveys yet</EmptyTitle>
              <EmptyDescription>Start a survey to analyse this project's area of interest.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="divide-y divide-border">
            {surveys.map((survey) => (
              <div key={survey.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={survey.title}>{survey.title}</p>
                  <p className="mt-0.5 text-xs capitalize text-muted-foreground">{survey.status.replaceAll("_", " ")}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1.5"
                  onClick={() => onNavigate?.("satellite", { projectId, jobId: survey.id })}
                >
                  <Satellite className="size-3.5" /> Open survey
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
