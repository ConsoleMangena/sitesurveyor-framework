import { useState } from "react";
import { FileText, Image, Loader, MapPin } from "lucide-react";

import type { SurveyDeliverable } from "../../lib/repositories/satelliteSurveys.ts";
import { deliverableUrl } from "../../lib/repositories/satelliteSurveys.ts";
import { CATEGORY_EXPORTS, CATEGORY_LABELS } from "../../lib/surveys/labels.ts";
import { DOSSIER_ORDER } from "../../lib/surveys/workbench.ts";
import { BlockTitle } from "./BlockTitle.tsx";

/** The files a finished survey left behind, opened out of this workspace's storage.
 *
 * The engine's export list was a link per deliverable; here a deliverable only exists if
 * the worker uploaded it, so a row a survey did not produce is a disabled button with a
 * reason rather than a link that would 404 in another person's browser.
 */
export default function ExportsPanel({
  deliverables,
  surveyed,
}: {
  deliverables: SurveyDeliverable[];
  /** False when nothing is on screen, so the note says so instead of blaming the files. */
  surveyed: boolean;
}) {
  const [opening, setOpening] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const byKind = new Map(deliverables.map((file) => [file.kind, file]));
  const ready = DOSSIER_ORDER.filter((category) => {
    const kinds = CATEGORY_EXPORTS[category];
    return byKind.has(kinds.map) || byKind.has(kinds.kmz);
  }).length;
  const dossier = byKind.get("master_json_dossier") ?? null;

  async function open(file: SurveyDeliverable | null, label: string) {
    if (!file) return;
    setOpening(file.id);
    setProblem(null);
    const url = await deliverableUrl(file);
    setOpening(null);
    if (!url) {
      setProblem(`${label} is listed but its file is not in storage.`);
      return;
    }
    window.open(url, "_blank", "noreferrer");
  }

  return (
    <section className="sw-block px-4 py-3.5">
      <BlockTitle count={`${ready} of ${DOSSIER_ORDER.length}`}>Exports</BlockTitle>

      <div className="mt-2 space-y-2">
        {DOSSIER_ORDER.map((category) => {
          const kinds = CATEGORY_EXPORTS[category];
          const map = byKind.get(kinds.map) ?? null;
          const kmz = byKind.get(kinds.kmz) ?? null;
          return (
            <div
              key={category}
              className="flex items-center justify-between gap-2 rounded-md border border-input px-2.5 py-1.5"
            >
              <span className="min-w-0 truncate text-[11.5px] font-medium">
                {CATEGORY_LABELS[category].name}
              </span>
              <span className="flex shrink-0 gap-1.5">
                <ExportButton
                  label="Map"
                  icon="image"
                  file={map}
                  opening={opening}
                  disabled={opening !== null}
                  onOpen={() => void open(map, `${CATEGORY_LABELS[category].name} map`)}
                  title={map ? "Open the classified map" : "No map for this category yet"}
                />
                <ExportButton
                  label="KMZ"
                  icon="gps"
                  file={kmz}
                  opening={opening}
                  disabled={opening !== null}
                  onOpen={() => void open(kmz, `${CATEGORY_LABELS[category].name} KMZ`)}
                  title={kmz ? "Download the Google Earth KMZ" : "No KMZ for this category yet"}
                />
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        Whole workspace
      </p>
      <div className="mt-1.5">
        <ExportButton
          label="Master JSON dossier"
          icon="file"
          file={dossier}
          wide
          opening={opening}
          disabled={opening !== null}
          onOpen={() => void open(dossier, "Executive dossier")}
          title={dossier ? "Every category in one machine-readable file" : "A completed survey writes this"}
        />
      </div>

      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        {problem
          ? problem
          : dossier
            ? "The master JSON dossier covers all four categories at once; a category export covers only its own. Files sit in this workspace’s private storage, and the link a click mints expires after half an hour."
            : surveyed
              ? "This survey published no files — a category that is skipped produces no map or KMZ for it."
              : "No survey has finished here, so there is nothing to export yet; the rows above stay disabled until one does."}
      </p>
    </section>
  );
}

function ExportButton({
  label,
  icon,
  file,
  opening,
  disabled,
  wide,
  title,
  onOpen,
}: {
  label: string;
  icon: "image" | "gps" | "file";
  file: SurveyDeliverable | null;
  opening: string | null;
  disabled: boolean;
  wide?: boolean;
  title: string;
  onOpen: () => void;
}) {
  const Glyph = icon === "file" ? FileText : icon === "gps" ? MapPin : Image;
  return (
    <button
      type="button"
      className={`sw-export ${wide ? "w-full justify-center" : ""}`}
      disabled={file === null || disabled}
      title={file ? title : `${title} — nothing to open yet`}
      onClick={onOpen}
    >
      {opening === file?.id ? (
        <Loader className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Glyph className="size-3.5" aria-hidden="true" />
      )}
      {label}
    </button>
  );
}
