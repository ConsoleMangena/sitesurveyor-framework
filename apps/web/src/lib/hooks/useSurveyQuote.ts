import { useEffect, useState } from "react";

import {
  quoteSurvey,
  type SurveyCategory,
} from "../repositories/satelliteSurveys.ts";
import { type SurveyQuote } from "../surveys/pricing.ts";

export interface SurveyQuoteRequest {
  categories: SurveyCategory[];
  halfDeg: number;
  latitude: number;
}

const CATEGORY_IDS: readonly string[] = ["water", "minerals", "soil", "hazard"];

/**
 * What a survey of this specification costs, and whether it is still being asked for.
 *
 * The price comes from the platform, so the number shown is the number that will be
 * charged. It is asked for on a delay because a specification is typed, and every
 * keystroke would otherwise be a pricing request.
 *
 * The answer is keyed to the specification that asked for it, so a reply for a
 * specification the user has already moved on from is discarded rather than shown
 * against the new one.
 *
 * The effect depends on the specification's parts rather than on the object that carries
 * them: the caller builds that object afresh on every render, and depending on it would
 * start a pricing request per render.
 */
export function useSurveyQuote(request: SurveyQuoteRequest | null): {
  quote: SurveyQuote | null;
  loading: boolean;
} {
  const [state, setState] = useState<{ key: string; quote: SurveyQuote | null } | null>(null);

  const categoriesKey = request?.categories.join(",") ?? "";
  const halfDeg = request?.halfDeg ?? 0;
  const latitude = request?.latitude ?? 0;
  const key = request === null ? null : `${categoriesKey}:${halfDeg}:${latitude}`;

  useEffect(() => {
    if (key === null) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void quoteSurvey({
        categories: categoriesKey
          .split(",")
          .filter((id) => CATEGORY_IDS.includes(id)) as SurveyCategory[],
        halfDeg,
        latitude,
      })
        .then((next) => {
          if (active) setState({ key, quote: next });
        })
        .catch(() => {
          if (active) setState({ key, quote: null });
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [key, categoriesKey, halfDeg, latitude]);

  const quote = state !== null && state.key === key ? state.quote : null;
  return { quote, loading: key !== null && state?.key !== key };
}
