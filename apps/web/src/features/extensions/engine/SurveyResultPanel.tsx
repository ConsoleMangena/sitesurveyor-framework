import { useState } from "react";
import { Download, FileText, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { DashboardCard } from "@/components/dashboard/DashboardCard.tsx";
import { PanelMeta } from "@/components/dashboard/DashboardShell.tsx";
import {
  ResponsiveTable,
} from "@/components/ui/responsive-table.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";

import {
  CATEGORY_LABELS,
  DELIVERABLE_LABELS,
  coordText,
  deliverableGroup,
  distanceText,
  scoreText,
  SURVEY_CATEGORIES,
} from "./labels.ts";
import type { EngineClient, IntelligenceCategory, SurveyResult } from "./client.ts";

/** Only the three columns every category really has; extras go in the detail row. */
function CandidateTable({ category, rows }: { category: IntelligenceCategory; rows: SurveyResult["candidates"][IntelligenceCategory] }) {
  const noun = CATEGORY_LABELS[category].noun;
  if (!rows || rows.length === 0) {
    return (
      <p className="py-3 text-sm text-muted-foreground">
        This run produced no ranked {noun}. A category that failed to score leaves
        an empty list rather than a guessed one.
      </p>
    );
  }

  return (
    <ResponsiveTable records>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Rank</TableHead>
            <TableHead>Coordinates</TableHead>
            <TableHead>Distance</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Class</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={`${row.latitude},${row.longitude},${index}`}>
              <TableCell data-label="Rank" className="tabular-nums">
                {row.rank ?? index + 1}
              </TableCell>
              <TableCell data-label="Coordinates" className="font-mono text-xs tabular-nums">
                {coordText(row.latitude)}, {coordText(row.longitude)}
              </TableCell>
              <TableCell data-label="Distance" className="tabular-nums">
                {distanceText(row.distance_from_target_km)}
              </TableCell>
              <TableCell data-label="Score" className="tabular-nums">
                {scoreText(row.potential_score)}
              </TableCell>
              <TableCell data-label="Class">
                {row.class_name ? <Badge variant="outline">{row.class_name}</Badge> : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ResponsiveTable>
  );
}

function ScoreTile({
  option,
  result,
}: {
  option: (typeof SURVEY_CATEGORIES)[number];
  result: SurveyResult;
}) {
  const score = result.scores[option.scoreKey];
  const label = CATEGORY_LABELS[option.category];
  const count = result.candidates[option.category]?.length ?? 0;

  if (!score) {
    return (
      <div className="rounded-lg border border-dashed p-3">
        <p className="text-sm font-medium">{label.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Not scored by this run.
        </p>
      </div>
    );
  }

  const primary =
    option.category === "hazard_safety"
      ? `${scoreText(score.safety_score)} safety / ${scoreText(score.hazard_score)} hazard`
      : scoreText(score.cell_score);

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/70 bg-card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-sm font-medium">{label.name}</p>
        <p className="shrink-0 text-lg font-semibold tabular-nums">{primary}</p>
      </div>
      <p className="text-xs text-muted-foreground">
        {option.category === "hazard_safety"
          ? score.hazard_class ?? "Unclassified"
          : score.cell_class ?? "Unclassified"}{" "}
        · {count} ranked {label.noun}
      </p>
    </div>
  );
}

export function DeliverablesPanel({
  result,
  client,
}: {
  result: SurveyResult;
  client: EngineClient | null;
}) {
  const urls = result.download_urls ?? {};
  const missing = new Set(result.deliverables_missing ?? []);
  const keys = Object.keys(DELIVERABLE_LABELS);
  const groups = new Map<string, string[]>();

  for (const key of keys) {
    const group = deliverableGroup(key);
    groups.set(group, [...(groups.get(group) ?? []), key]);
  }

  return (
    <div className="flex flex-col gap-4">
      {[...groups.entries()].map(([group, keysInGroup]) => (
        <div key={group} className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group}
          </p>
          <ul className="flex flex-wrap gap-2">
            {keysInGroup.map((key) => {
              const href = client?.absolute(urls[key] ?? null) ?? null;
              return (
                <li key={key}>
                  {href ? (
                    <Button
                      asChild
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2 text-xs"
                    >
                      <a href={href} target="_blank" rel="noreferrer">
                        {key.endsWith(".html") || key.endsWith("json_dossier") ? (
                          <FileText className="size-3.5" aria-hidden="true" />
                        ) : (
                          <Download className="size-3.5" aria-hidden="true" />
                        )}
                        {DELIVERABLE_LABELS[key]}
                      </a>
                    </Button>
                  ) : (
                    <span
                      className="inline-flex items-center gap-2 rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground"
                      title="This run did not produce this file."
                    >
                      {DELIVERABLE_LABELS[key]}
                      {missing.has(key) ? null : "· not produced"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Files are served by the engine from its own output workspace, so a link
        works while that instance still holds the survey. Download what a decision
        depends on.
      </p>
    </div>
  );
}

export function SurveyResultPanel({
  result,
  client,
}: {
  result: SurveyResult;
  client: EngineClient | null;
}) {
  const scored = SURVEY_CATEGORIES.filter((option) => result.scores[option.scoreKey]);
  const [tab, setTab] = useState<string>(scored[0]?.category ?? "water");

  return (
    <div className="flex flex-col gap-4">
      <DashboardCard
        title="Executive summary"
        titleAction={
          <PanelMeta>
            {result.target
              ? `${coordText(result.target.latitude)}, ${coordText(result.target.longitude)}`
              : "no target"}
          </PanelMeta>
        }
      >
        <p className="text-sm leading-relaxed">{result.executive_summary}</p>
        {result.target ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Grid cell {result.target.cell_m} m · AOI {result.target.utm_zone} ·{" "}
            {result.target.crs}
          </p>
        ) : null}
      </DashboardCard>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SURVEY_CATEGORIES.map((option) => (
          <ScoreTile key={option.category} option={option} result={result} />
        ))}
      </div>

      <DashboardCard
        title="Ranked field targets"
        titleAction={<PanelMeta>{scored.length} scored</PanelMeta>}
      >
        <Tabs value={tab} onValueChange={setTab} className="gap-3">
          <TabsList className="h-auto w-full flex-wrap">
            {SURVEY_CATEGORIES.map((option) => (
              <TabsTrigger key={option.category} value={option.category} className="text-xs">
                {CATEGORY_LABELS[option.category].short}
              </TabsTrigger>
            ))}
          </TabsList>
          {SURVEY_CATEGORIES.map((option) => (
            <div key={option.category} hidden={tab !== option.category}>
              <CandidateTable category={option.category} rows={result.candidates[option.category]} />
            </div>
          ))}
        </Tabs>
      </DashboardCard>

      <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        <div className="min-w-0 text-xs leading-relaxed">
          <p className="font-medium text-foreground">What these numbers claim</p>
          <p className="mt-1 text-muted-foreground">{result.claim_ceiling}</p>
          <p className="mt-1 text-muted-foreground">
            Score basis:{" "}
            {result.score_basis === "relative_to_aoi_percentile"
              ? "percentile rank inside this AOI only — a 61.4 here is not comparable to a 61.4 at another site."
              : result.score_basis}
          </p>
        </div>
      </div>

      <DashboardCard title="Deliverables">
        <DeliverablesPanel result={result} client={client} />
      </DashboardCard>
    </div>
  );
}
