import { AlertTriangle, Coins, Loader } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";

import {
  areaText,
  canAfford,
  creditText,
  type SurveyQuote,
} from "../../lib/surveys/pricing.ts";

interface CreditCostPanelProps {
  /** The platform's price for this job. Null when it cannot be read. */
  quote: SurveyQuote | null;
  /** True while the price is being asked for. */
  loading: boolean;
  /** The workspace's credit balance, or null when the platform has not reported one. */
  balance: number | null;
  /** Show the balance and what to do when it is too small. */
  showBalance?: boolean;
  onNavigateBilling?: () => void;
}

/**
 * What this survey costs, and whether the workspace can pay for it.
 *
 * The number is the platform's, priced from the survey type and the ground it covers.
 * It is shown before the job is queued, because a credit spent on a survey the reader
 * could not afford is a credit they did not know they were spending, and it is shown
 * again afterwards, because a charge with no receipt is a charge nobody can reconcile
 * against the ledger.
 *
 * When the price cannot be read the panel says so. A survey that costs something and a
 * panel that says "0 credits" are both lies, and only one of them is obviously wrong.
 */
export default function CreditCostPanel({
  quote,
  loading,
  balance,
  showBalance = true,
  onNavigateBilling,
}: CreditCostPanelProps) {
  const affordable = canAfford(quote, balance);
  const short = quote !== null && !affordable;

  return (
    <div className="rounded-lg border border-border/70 bg-card/60 p-3 shadow-xs">
      <div className="flex items-center gap-2">
        <Coins className="size-3.5 text-primary" aria-hidden="true" />
        <span className="text-[12px] sm:text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Credit cost
        </span>
        {loading ? (
          <Loader className="ml-auto size-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : null}
      </div>

      {quote ? (
        <>
          <p className="mt-1.5 flex items-baseline gap-1.5">
            <span className="font-mono text-xl font-semibold tabular-nums text-foreground">
              {quote.credits.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground">
              {quote.credits === 1 ? "credit" : "credits"}
            </span>
          </p>
          <p className="text-[12.5px] sm:text-[11.5px] leading-snug text-muted-foreground">
            for {areaText(quote)} of ground
          </p>

          <ul className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
            {quote.lines.map((line) => {
              const floored =
                line.credits === line.minimumCredits &&
                line.baseCredits + line.areaCredits <= line.minimumCredits;
              return (
                <li key={line.category} className="flex items-start justify-between gap-3 text-[12.5px] sm:text-[11.5px]">
                  <span className="min-w-0 flex-1">
                    <span className="block text-foreground">{line.label}</span>
                    <span className="block text-[11.5px] sm:text-[10.5px] text-muted-foreground">
                      {line.baseCredits} fixed · {line.areaCredits} for the ground
                      {floored ? ` · floor of ${line.minimumCredits} applies` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono tabular-nums text-foreground">
                    {line.credits}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : loading ? (
        <p className="mt-1.5 text-[12.5px] sm:text-[11.5px] text-muted-foreground">Pricing this survey…</p>
      ) : (
        <p className="mt-1.5 text-[12.5px] sm:text-[11.5px] text-muted-foreground">
          Price unavailable.
        </p>
      )}

      {showBalance ? (
        <div className="mt-2 border-t border-border/60 pt-2">
          <p className="text-[12.5px] sm:text-[11.5px] text-muted-foreground">
            Workspace balance:{" "}
            <span className="font-mono tabular-nums text-foreground">
              {typeof balance === "number" ? balance.toLocaleString() : "—"}
            </span>{" "}
            credits
          </p>

          {short ? (
            <div
              role="alert"
              className="mt-1.5 rounded-md border border-amber-500/35 bg-amber-500/10 px-2.5 py-2 text-[12.5px] sm:text-[11.5px] leading-snug text-amber-700 dark:text-amber-400"
            >
              <p className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  This workspace has {balance?.toLocaleString()} credits and this survey
                  costs {creditText(quote.credits)}. Buy more credits before running it.
                </span>
              </p>
              {onNavigateBilling ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-1.5 h-8 sm:h-7 text-[12px] sm:text-[11px]"
                  onClick={onNavigateBilling}
                >
                  Open Billing
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
