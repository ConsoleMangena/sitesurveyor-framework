import type {
  SurveyCommodity,
  SurveyUnscreenedCommodity,
} from "../../lib/repositories/satelliteSurveys.ts";
import { bandFor } from "../../lib/surveys/workbench.ts";
import { BlockTitle } from "./BlockTitle.tsx";

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
        Mineral systems indicated
      </BlockTitle>
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
  return (
    <article
      className={`sw-accent-left rounded-lg border border-input bg-card px-2.5 py-2 ${
        item.indicated ? "" : "opacity-75"
      }`}
      style={{ borderLeftColor: item.indicated ? "#f59e0b" : "#94a3b8" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11.5px] font-semibold text-foreground">
            {item.color ? (
              <span
                aria-hidden="true"
                className="mr-1.5 inline-block size-2.5 rounded-[3px] border border-black/25 align-[-1px]"
                style={{ background: item.color }}
              />
            ) : null}
            {item.name}
            {item.symbol ? <span className="text-muted-foreground"> ({item.symbol})</span> : null}
          </p>
          <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
            {item.group ? `${item.group} · ` : ""}
            {item.confidence}
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
      {item.mapAreaKm2 !== null ? (
        <p className="sw-mono mt-1 text-[10.5px] leading-snug text-muted-foreground tabular-nums">
          {item.mapAreaKm2 > 0
            ? `owns ${item.mapAreaKm2.toFixed(2)} km² on the map`
            : "never the strongest system on the map"}
          {item.mapSharePct !== null && item.mapAreaKm2 > 0
            ? ` · ${item.mapSharePct < 0.05 ? "<0.1" : item.mapSharePct.toFixed(1)}% of area`
            : ""}
        </p>
      ) : null}
    </article>
  );
}
