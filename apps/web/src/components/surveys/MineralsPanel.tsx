import type {
  SurveyCommodity,
  SurveyUnscreenedCommodity,
} from "../../lib/repositories/satelliteSurveys.ts";
import { bandFor } from "../../lib/surveys/workbench.ts";
import { BlockTitle } from "./BlockTitle.tsx";

const CONFIDENCE_NOTE: Record<string, string> = {
  High: "Orbit sees this style well",
  Moderate: "Partly visible from orbit",
  Low: "Structural screen only",
};

/**
 * Which minerals this ground is indicated for.
 *
 * The mineral category used to report one number about gold, which reads as "nothing
 * else here". This lists every mineral system the engine screened, and - in the
 * collapsed note - the ones a satellite cannot screen at all, because silence about
 * diamonds or coal is not evidence that they are absent.
 */
export default function MineralsPanel({
  commodities,
  unscreenable,
}: {
  commodities: SurveyCommodity[];
  unscreenable: SurveyUnscreenedCommodity[];
}) {
  if (commodities.length === 0) return null;

  const indicated = commodities.filter((item) => item.indicated);
  const rest = commodities.filter((item) => !item.indicated);

  return (
    <section className="sw-block px-4 py-3.5">
      <BlockTitle count={`${indicated.length} / ${commodities.length}`}>
        Minerals indicated
      </BlockTitle>
      <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">
        Ranked by evidence strength inside this survey area only — not grade, not tonnage,
        and not comparable between properties. A system is indicated when its top decile
        clears the moderate band and the index actually varies across the ground.
      </p>

      {indicated.length > 0 ? (
        <div className="mt-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 text-[11.5px] text-amber-900 dark:text-amber-200">
          <span className="font-semibold">Indicated in survey area: </span>
          {indicated.map((item) => item.name).join(" · ")}
        </div>
      ) : null}

      <div className="mt-2.5 grid gap-2">
        {[...indicated, ...rest].map((item) => (
          <CommodityRow key={item.key} item={item} />
        ))}
      </div>

      {unscreenable.length > 0 ? (
        <details className="mt-2.5 rounded-lg border border-input bg-muted/40 px-2.5 py-2">
          <summary className="cursor-pointer text-[11.5px] font-semibold text-muted-foreground">
            Not screened by this dataset ({unscreenable.length})
          </summary>
          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
            These were not scored. That is not a judgement that they are absent.
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {unscreenable.map((item) => (
              <li key={item.name} className="text-[11px] leading-snug">
                <span className="font-semibold text-foreground">{item.name}</span>
                {item.reason ? <span className="text-muted-foreground"> — {item.reason}</span> : null}
                {item.needs ? (
                  <span className="block text-[10.5px] text-muted-foreground">
                    Would need: {item.needs}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function CommodityRow({ item }: { item: SurveyCommodity }) {
  const band = bandFor(item.areaTopDecile);
  const confidence = CONFIDENCE_NOTE[item.confidence] ?? item.confidence;
  return (
    <article
      className={`sw-accent-left rounded-lg border border-input bg-card px-2.5 py-2 ${
        item.indicated ? "" : "opacity-75"
      }`}
      style={{ borderLeftColor: item.indicated ? "#f59e0b" : "#94a3b8" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11.5px] font-semibold text-foreground">{item.name}</p>
          <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
            {item.group ? `${item.group} · ` : ""}
            {confidence}
          </p>
        </div>
        <span className={`sw-band sw-band--${band ?? "none"} shrink-0`}>
          {item.indicated ? item.areaBand : item.areaBand === "Not indicated" ? "Not indicated" : item.areaBand}
        </span>
      </div>
      <p className="sw-mono mt-1 text-[15px] leading-none font-semibold tabular-nums">
        {item.areaTopDecile === null ? "—" : Math.round(item.areaTopDecile)}
        <span className="ml-0.5 text-[10.5px] font-normal text-muted-foreground">
          /100 top decile
        </span>
      </p>
    </article>
  );
}
