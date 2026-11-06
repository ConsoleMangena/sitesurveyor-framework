import { useState } from "react";
import { Satellite, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { DashboardCard } from "@/components/dashboard/DashboardCard.tsx";
import {
  DashboardHeader,
  DashboardShell,
} from "@/components/dashboard/DashboardShell.tsx";
import ErrorNotice from "@/components/errors/ErrorNotice.tsx";

import {
  InsufficientCreditsError,
  cancelSurveyRun,
  startSurvey,
} from "../../../lib/repositories/satelliteSurveys.ts";
import ProgressPanel from "./ProgressPanel.tsx";
import ResultPanel from "./ResultPanel.tsx";
import RunList from "./RunList.tsx";
import TargetForm from "./TargetForm.tsx";
import type { SurveyDraft } from "./model.ts";
import { SurveyStatusChip } from "../../../components/surveys/SurveyStatusChip.tsx";
import { useSurveyDetail, useSurveyRuns } from "../../../lib/hooks/useSatelliteSurveys.ts";

interface SatelliteSurveyPageProps {
  workspaceId: string;
  onNavigate?: (view: string) => void;
}

/** One console for the whole workspace: queue a target, follow it, read the result.
 *
 * There is no address to type and nothing to install. A survey is a row the platform's
 * own worker runs, and this page reads back whatever that worker has published — which is
 * why closing the tab costs a reader nothing but the waiting.
 */
export default function SatelliteSurveyPage({
  workspaceId,
  onNavigate,
}: SatelliteSurveyPageProps) {
  const { runs, error: listError, loaded, refresh, adopt } = useSurveyRuns(workspaceId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [queueing, setQueueing] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  const selected = runs.find((run) => run.id === selectedId) ?? runs[0] ?? null;
  const inFlight = runs.find((run) => run.active) ?? null;
  const { detail, error: detailError } = useSurveyDetail(selected);

  async function submit(draft: SurveyDraft) {
    setQueueing(true);
    setRefused(null);
    try {
      const outcome = await startSurvey({ ...draft, workspaceId });
      adopt(outcome.run);
      setSelectedId(outcome.run.id);
    } catch (err) {
      setRefused(
        err instanceof InsufficientCreditsError
          ? err.message
          : err instanceof Error
            ? err.message
            : "The platform refused the survey.",
      );
    } finally {
      setQueueing(false);
      void refresh();
    }
  }

  async function cancel(runId: string) {
    setCancelling(runId);
    setRefused(null);
    try {
      await cancelSurveyRun(runId);
    } catch (err) {
      setRefused(
        err instanceof Error
          ? `${err.message} A worker may already have picked the survey up.`
          : "The survey could not be cancelled.",
      );
    } finally {
      setCancelling(null);
      void refresh();
    }
  }

  const outOfCredits = refused !== null && refused.includes("AI credits");

  return (
    <DashboardShell>
      <DashboardHeader
        title="Satellite Survey"
        description="Screen a coordinate for groundwater, minerals, soil capability and site safety."
        meta={
          inFlight ? (
            <span className="flex items-center gap-2">
              <SurveyStatusChip status={inFlight.status} />
              <span>
                {inFlight.clientName} — {Math.round(inFlight.progress)}%
              </span>
            </span>
          ) : (
            `${runs.length} survey${runs.length === 1 ? "" : "s"} in this workspace`
          )
        }
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
            Refresh
          </Button>
        }
      />

      {listError ? (
        <ErrorNotice tone="warning" title="The survey queue could not be read">
          {listError}
        </ErrorNotice>
      ) : null}

      {refused ? (
        <ErrorNotice
          tone={outOfCredits ? "warning" : "danger"}
          title={
            outOfCredits ? "This workspace is out of credits" : "The survey was refused"
          }
          action={
            outOfCredits ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onNavigate?.("billing")}
              >
                Open Billing
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRefused(null)}
              >
                Dismiss
              </Button>
            )
          }
        >
          {refused}
        </ErrorNotice>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <div className="flex flex-col gap-4 lg:col-span-3">
          <TargetForm
            busy={queueing}
            disabled={queueing || inFlight !== null}
            onSubmit={(draft) => void submit(draft)}
          />
          <RunList
            runs={runs}
            selectedId={selected?.id ?? null}
            loading={!loaded}
            onSelect={setSelectedId}
          />
        </div>

        <div className="flex flex-col gap-4 lg:col-span-4">
          {selected && selected.active ? (
            <ProgressPanel
              run={selected}
              cancelling={cancelling === selected.id}
              onCancel={(runId) => void cancel(runId)}
            />
          ) : detailError ? (
            <ErrorNotice tone="danger" title="This result could not be loaded">
              {detailError}
            </ErrorNotice>
          ) : detail ? (
            <div className="flex flex-col gap-4">
              {detail.run.status === "failed" ? (
                <ErrorNotice tone="danger" title="The survey did not complete">
                  {detail.run.errorMessage ??
                    "The worker stopped without recording a reason, and the credits were returned."}
                </ErrorNotice>
              ) : null}
              {detail.run.status === "cancelled" ? (
                <ErrorNotice tone="info" title="Cancelled before a worker started">
                  The credits this survey was charged with are back in the workspace
                  balance.
                </ErrorNotice>
              ) : null}
              <ResultPanel detail={detail} />
            </div>
          ) : (
            <DashboardCard title="Result" icon={<Satellite />}>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Nothing is open. Give the platform a coordinate and it queues the work for
                its own survey worker, which downloads the Sentinel-2, Copernicus DEM,
                ALOS PALSAR, Landsat WOfS, ESA WorldCover and CHIRPS layers covering that
                point, scores a 30 m grid across the study area, and publishes ranked field
                targets with maps, reports and KMZ files.
              </p>
              <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                Every survey this workspace has run stays readable — pick one on the left
                and its result comes back, however long ago it ran.
              </p>
            </DashboardCard>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
