import { Puzzle, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { DashboardCard } from "@/components/dashboard/DashboardCard.tsx";
import {
  DashboardHeader,
  DashboardShell,
} from "@/components/dashboard/DashboardShell.tsx";
import ErrorNotice from "@/components/errors/ErrorNotice.tsx";

import { SurveyResultPanel } from "../../../features/extensions/engine/SurveyResultPanel.tsx";
import { EngineStatusChip } from "../../../features/extensions/engine/status.tsx";
import {
  useEngineConnection,
  useSurveyJob,
} from "../../../features/extensions/engine/useEngine.ts";
import ProgressPanel from "./ProgressPanel.tsx";
import TargetForm from "./TargetForm.tsx";

interface SatelliteSurveyPageProps {
  endpoint: string;
  onNavigate?: (view: string) => void;
}

export default function SatelliteSurveyPage({
  endpoint,
  onNavigate,
}: SatelliteSurveyPageProps) {
  const connection = useEngineConnection(endpoint);
  const run = useSurveyJob(connection.client);

  const busy = run.phase === "submitting" || run.phase === "running";
  const result = run.phase === "succeeded" ? run.job?.result ?? null : null;

  if (!endpoint) {
    return (
      <DashboardShell>
        <DashboardHeader
          title="Satellite Survey"
          description="Screen a coordinate for groundwater, minerals, soil capability and site safety."
        />
        <div className="mx-auto w-full max-w-lg pt-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Puzzle />
              </EmptyMedia>
              <EmptyTitle>No engine address</EmptyTitle>
              <EmptyDescription>
                This extension calls a running SiteSurveyor AI engine. Save its base
                URL in Extensions and this page starts taking surveys.
              </EmptyDescription>
            </EmptyHeader>
            <Button onClick={() => onNavigate?.("extensions")}>Open Extensions</Button>
          </Empty>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <DashboardHeader
        title="Satellite Survey"
        description="Screen a coordinate for groundwater, minerals, soil capability and site safety."
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <EngineStatusChip
              status={connection.status}
              health={connection.health}
              error={connection.error}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => void connection.check()}
            >
              Re-check
            </Button>
          </span>
        }
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onNavigate?.("extensions")}
          >
            <Puzzle className="size-4" aria-hidden="true" />
            Engine settings
          </Button>
        }
      />

      {connection.status === "offline" ? (
        <ErrorNotice
          tone="warning"
          title="The engine is not answering"
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void connection.check()}
            >
              Try again
            </Button>
          }
        >
          {connection.error?.hint ??
            connection.error?.message ??
            "Surveys cannot start until the engine responds to /health."}
        </ErrorNotice>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <div className="lg:col-span-3">
          <TargetForm
            activeAoi={connection.health?.active_aoi ?? null}
            busy={busy}
            unavailable={connection.status !== "online"}
            showClear={run.phase !== "idle"}
            onClear={run.reset}
            onSubmit={(input) => void run.start(input)}
          />
        </div>

        <div className="flex flex-col gap-4 lg:col-span-4">
          {run.phase === "failed" ? (
            <ErrorNotice
              tone="danger"
              title="The survey did not complete"
              action={
                <Button type="button" variant="outline" size="sm" onClick={run.reset}>
                  Dismiss
                </Button>
              }
            >
              {run.error?.message ?? "The engine stopped without a result."}
              {run.error?.code ? ` (code ${run.error.code})` : ""}
              {run.error?.hint ? ` ${run.error.hint}` : ""}
            </ErrorNotice>
          ) : null}

          {busy ? (
            <ProgressPanel
              submitting={run.phase === "submitting"}
              stage={run.job?.stage ?? ""}
              progress={run.job?.progress ?? 0}
              estimatedMinutes={run.estimatedMinutes}
            />
          ) : result ? (
            <SurveyResultPanel result={result} client={connection.client} />
          ) : (
            <DashboardCard title="Result" icon={<TriangleAlert />}>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Nothing has been surveyed in this session yet. Give the engine a
                coordinate and it downloads the Sentinel-2, Copernicus DEM, ALOS
                PALSAR, Landsat WOfS, ESA WorldCover and CHIRPS layers covering it,
                scores a 30 m grid across the study area, and returns ranked field
                targets with maps and KMZ files.
              </p>
            </DashboardCard>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
