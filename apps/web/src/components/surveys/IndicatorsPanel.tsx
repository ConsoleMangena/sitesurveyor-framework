import type { SurveyScore } from "../../lib/repositories/satelliteSurveys.ts";
import { CATEGORY_LABELS } from "../../lib/surveys/labels.ts";
import type { DossierCategory } from "../../lib/surveys/labels.ts";
import {
  BAND_LABELS,
  CATEGORY_COLORS,
  DOSSIER_ORDER,
  bandFor,
  meterWidth,
  scoreValueText,
} from "../../lib/surveys/workbench.ts";
import { BlockTitle } from "./BlockTitle.tsx";

/** The four domain scores, in the dossier's own order.
 *
 * A card is drawn for every category whether or not the survey scored it, because an
 * absent category is an answer too: the block count says how much of the four was run,
 * and a card that simply vanished would leave a reader guessing.
 */
export default function IndicatorsPanel({
  scores,
  note,
}: {
  scores: SurveyScore[];
  note: string;
}) {
  const byCategory = new Map(scores.map((score) => [score.category, score]));
  const scored = DOSSIER_ORDER.filter(
    (category) => byCategory.get(category)?.score !== null && byCategory.get(category)?.score !== undefined,
  ).length;

  return (
    <section className="sw-block px-4 py-3.5">
      <BlockTitle count={`${scored} / ${DOSSIER_ORDER.length}`}>Indicators</BlockTitle>
      <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">{note}</p>

      <div aria-live="polite" className="mt-2.5 grid gap-2">
        {DOSSIER_ORDER.map((category) => (
          <Indicator
            key={category}
            category={category}
            score={byCategory.get(category)?.score ?? null}
            klass={byCategory.get(category)?.klass ?? null}
            label={byCategory.get(category)?.label ?? CATEGORY_LABELS[category].name}
          />
        ))}
      </div>
    </section>
  );
}

function Indicator({
  category,
  score,
  klass,
  label,
}: {
  category: DossierCategory;
  score: number | null;
  klass: string | null;
  label: string;
}) {
  const band = bandFor(score);
  const color = CATEGORY_COLORS[category];
  return (
    <article
      className="sw-accent-left rounded-lg border border-input bg-card px-2.5 py-2"
      style={{ borderLeftColor: color }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-semibold text-muted-foreground">{label}</span>
        <span className={`sw-band sw-band--${band ?? "none"}`}>
          {klass ?? (band ? BAND_LABELS[band] : "Not run")}
        </span>
      </div>
      <p className="sw-mono mt-1 text-[19px] leading-none font-semibold tabular-nums">
        {scoreValueText(score)}
        <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">/100</span>
      </p>
      <div className="sw-meter mt-2">
        <span style={{ width: meterWidth(score), background: color }} />
      </div>
    </article>
  );
}
