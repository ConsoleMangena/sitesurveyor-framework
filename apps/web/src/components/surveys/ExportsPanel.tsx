import { useState } from "react";
import { FileText, Image, Loader, MapPin } from "lucide-react";

import type { SurveyDeliverable } from "../../lib/repositories/satelliteSurveys.ts";
import { deliverableUrl } from "../../lib/repositories/satelliteSurveys.ts";
import { CATEGORY_EXPORTS, CATEGORY_LABELS } from "../../lib/surveys/labels.ts";
import type { DossierCategory } from "../../lib/surveys/labels.ts";
import { DOSSIER_ORDER } from "../../lib/surveys/workbench.ts";
import { BlockTitle } from "./BlockTitle.tsx";

/** The files a finished survey left behind. Only exports for the job's category are shown. */
export default function ExportsPanel({
  deliverables,
  surveyed,
  activeDossierCategory,
}: {
  deliverables: SurveyDeliverable[];
  /** False when nothing is on screen, so the note says so instead of blaming the files. */
  surveyed: boolean;
  activeDossierCategory?: DossierCategory;
}) {
  const [opening, setOpening] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const byKind = new Map(deliverables.map((file) => [file.kind, file]));
  const categoriesToShow: DossierCategory[] = activeDossierCategory
    ? [activeDossierCategory]
    : DOSSIER_ORDER;

  const ready = categoriesToShow.filter((category) => {
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
      <BlockTitle count={`${ready} of ${categoriesToShow.length}`}>Exports</BlockTitle>

      <div className="mt-2 space-y-2">
        {categoriesToShow.map((category) => {
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
        <button
          type="button"
          onClick={() => void open(dossier, "Master dossier JSON")}
          disabled={dossier === null || opening !== null}
          className={`flex w-full items-center justify-between gap-2 rounded-md border border-input px-2.5 py-1.5 text-left text-[11.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            dossier ? "hover:bg-accent/60" : "opacity-45 cursor-not-allowed"
          }`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">Master dossier (raw scores, candidate geojson)</span>
          </span>
          <span className="sw-num shrink-0 text-[10.5px] text-muted-foreground">
            {dossier ? "JSON" : surveyed ? "writing…" : "not run"}
          </span>
        </button>
      </div>

      {problem ? (
        <p role="alert" className="mt-2 text-[11px] text-destructive">
          {problem}
        </p>
      ) : null}
    </section>
  );
}

function ExportButton({
  label,
  icon,
  file,
  opening,
  disabled,
  title,
  onOpen,
}: {
  label: string;
  icon: "image" | "gps";
  file: SurveyDeliverable | null;
  opening: string | null;
  disabled: boolean;
  title: string;
  onOpen: () => void;
}) {
  const isOpening = file !== null && opening === file.id;
  const isAvailable = file !== null;

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled || !isAvailable}
      title={title}
      className={`sw-btn sw-btn--xs gap-1 ${
        isAvailable ? "hover:bg-accent hover:text-accent-foreground" : "opacity-40 cursor-not-allowed"
      }`}
    >
      {isOpening ? (
        <Loader className="size-3 animate-spin" aria-hidden="true" />
      ) : icon === "image" ? (
        <Image className="size-3" aria-hidden="true" />
      ) : (
        <MapPin className="size-3" aria-hidden="true" />
      )}
      <span>{label}</span>
    </button>
  );
}
