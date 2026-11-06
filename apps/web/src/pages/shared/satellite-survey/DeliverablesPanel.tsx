import { useState } from "react";
import { Download, FileText, Loader } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { DashboardCard } from "@/components/dashboard/DashboardCard.tsx";
import { PanelMeta } from "@/components/dashboard/DashboardShell.tsx";
import ErrorNotice from "@/components/errors/ErrorNotice.tsx";

import {
  deliverableUrl,
  type SurveyDeliverable,
} from "../../../lib/repositories/satelliteSurveys.ts";
import { DELIVERABLE_LABELS, deliverableGroup } from "../../../lib/surveys/labels.ts";

function sizeText(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes)) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The files of one survey, opened straight out of the platform's storage.
 *
 * A signed link is minted when a row is clicked rather than when the panel renders:
 * a survey publishes up to seventeen files, and minting seventeen URLs to show a list
 * is a lot of work for the three a reader actually opens.
 */
export default function DeliverablesPanel({
  deliverables,
}: {
  deliverables: SurveyDeliverable[];
}) {
  const [opening, setOpening] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const groups = new Map<string, SurveyDeliverable[]>();
  for (const file of deliverables) {
    const group = deliverableGroup(file.kind);
    groups.set(group, [...(groups.get(group) ?? []), file]);
  }

  async function open(file: SurveyDeliverable) {
    setOpening(file.id);
    setProblem(null);
    const url = await deliverableUrl(file);
    setOpening(null);
    if (!url) {
      setProblem(
        `${DELIVERABLE_LABELS[file.kind] ?? file.kind} is listed but its file is not in storage.`,
      );
      return;
    }
    window.open(url, "_blank", "noreferrer");
  }

  return (
    <DashboardCard
      title="Deliverables"
      titleAction={<PanelMeta>{deliverables.length} files</PanelMeta>}
    >
      <div className="flex flex-col gap-4">
        {deliverables.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This survey published no files. A category that is skipped produces no map,
            report or KMZ for it.
          </p>
        ) : (
          [...groups.entries()].map(([group, files]) => (
            <div key={group} className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group}
              </p>
              <ul className="flex flex-wrap gap-2">
                {files.map((file) => {
                  const label = DELIVERABLE_LABELS[file.kind] ?? file.kind;
                  const size = sizeText(file.sizeBytes);
                  return (
                    <li key={file.id}>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2 text-xs"
                        disabled={opening !== null}
                        onClick={() => void open(file)}
                      >
                        {opening === file.id ? (
                          <Loader className="size-3.5 animate-spin" aria-hidden="true" />
                        ) : file.kind.endsWith("dossier") || file.kind.endsWith("viewer") ? (
                          <FileText className="size-3.5" aria-hidden="true" />
                        ) : (
                          <Download className="size-3.5" aria-hidden="true" />
                        )}
                        {label}
                        {size ? (
                          <span className="text-muted-foreground">{size}</span>
                        ) : null}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
        {problem ? (
          <ErrorNotice tone="danger" title="That file could not be opened">
            {problem}
          </ErrorNotice>
        ) : null}
        <p className="text-xs leading-relaxed text-muted-foreground">
          Files live in this workspace&apos;s private storage, so only its members can
          open them, and the link a click produces expires after half an hour.
        </p>
      </div>
    </DashboardCard>
  );
}
