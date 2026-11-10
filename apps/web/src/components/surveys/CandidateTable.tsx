import { X } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import type { MapCandidate } from "../../lib/surveys/workbench.ts";
import { coordText, distanceText, scoreText, type DossierCategory } from "../../lib/surveys/labels.ts";
import { BlockTitle } from "./BlockTitle.tsx";

/** The ranked targets behind the map markers, in one sortable-free table.
 *
 * Rows are clickable because the fastest way to understand a candidate is to be put on
 * top of it: clicking flies the map to the point and opens its popup, which is where the
 * readout — the sentence the engine wrote about this site — lives.
 */
export default function CandidateTable({
  rows,
  selectedKey,
  onFocus,
  activeDossierCategory,
  onClose,
}: {
  rows: MapCandidate[];
  selectedKey: string | null;
  onFocus: (candidate: MapCandidate) => void;
  activeDossierCategory?: DossierCategory;
  /** Present when the table is docked under the canvas, where it needs its own way out. */
  onClose?: () => void;
}) {
  const displayRows = activeDossierCategory
    ? rows.filter((r) => r.category === activeDossierCategory)
    : rows;

  return (
    <section className="sw-block px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <BlockTitle count={displayRows.length}>Candidate attributes</BlockTitle>
        {onClose ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={onClose}
            title="Close the attribute table"
          >
            <X className="size-3.5" aria-hidden="true" />
            <span className="sr-only">Close the attribute table</span>
          </Button>
        ) : null}
      </div>

      <div className="sw-attr-scroll mt-2 rounded-md border border-input">
        <table className="sw-attr-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Type</th>
              <th scope="col">Score</th>
              <th scope="col">Dist km</th>
              <th scope="col">Lat</th>
              <th scope="col">Lon</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-muted-foreground">
                  No candidates yet.
                </td>
              </tr>
            ) : (
              displayRows.map((row) => (
                <tr
                  key={row.key}
                  role="button"
                  tabIndex={0}
                  data-selected={row.key === selectedKey}
                  aria-label={`Show ${row.kind} ${row.rank} on the map`}
                  onClick={() => onFocus(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onFocus(row);
                    }
                  }}
                >
                  <td>
                    <span className="sw-rank" style={{ background: row.color }}>
                      {row.letter}
                    </span>
                  </td>
                  <td className="text-[11px]">{row.kind}</td>
                  <td className="sw-num">{scoreText(row.score)}</td>
                  <td className="sw-num">{distanceText(row.distanceKm)}</td>
                  <td className="sw-num">{coordText(row.latitude)}</td>
                  <td className="sw-num">{coordText(row.longitude)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
