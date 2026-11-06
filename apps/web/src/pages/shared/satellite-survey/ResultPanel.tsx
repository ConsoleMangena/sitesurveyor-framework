import { useState } from "react";
import { TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge.tsx";
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

import type {
  SurveyRunDetail,
  SurveyScore,
  SurveyTarget,
} from "../../../lib/repositories/satelliteSurveys.ts";
import {
  CATEGORY_LABELS,
  coordText,
  distanceText,
  scoreText,
  type DossierCategory,
} from "../../../lib/surveys/labels.ts";
import DeliverablesPanel from "./DeliverablesPanel.tsx";

/** The four categories a dossier can hold, in the order a reader works through them. */
const DOSSIER_ORDER: DossierCategory[] = [
  "water",
  "minerals",
  "soil_land",
  "hazard_safety",
];

function scoreOf(scores: SurveyScore[], category: string): SurveyScore | undefined {
  return scores.find((score) => score.category === category);
}

function ScoreTile({
  category,
  score,
  count,
}: {
  category: DossierCategory;
  score: SurveyScore | undefined;
  count: number;
}) {
  const label = CATEGORY_LABELS[category];

  if (!score || score.score === null) {
    return (
      <div className="rounded-lg border border-dashed p-3">
        <p className="text-sm font-medium">{label.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">Not scored by this run.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/70 bg-card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-sm font-medium">{label.name}</p>
        <p className="shrink-0 text-lg font-semibold tabular-nums">
          {scoreText(score.score)}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        {score.klass ?? "Unclassified"} · {count} ranked {label.noun}
      </p>
    </div>
  );
}

function TargetTable({
  category,
  targets,
}: {
  category: DossierCategory;
  targets: SurveyTarget[];
}) {
  const noun = CATEGORY_LABELS[category].noun;
  if (!targets.length) {
    return (
      <p className="py-3 text-sm text-muted-foreground">
        This survey produced no ranked {noun}. A category that failed to score leaves an
        empty list rather than a guessed one.
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
            <TableHead>Readout</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {targets.map((target) => (
            <TableRow key={target.id}>
              <TableCell data-label="Rank" className="tabular-nums">
                {target.rank}
              </TableCell>
              <TableCell
                data-label="Coordinates"
                className="font-mono text-xs tabular-nums"
              >
                {coordText(target.latitude)}, {coordText(target.longitude)}
              </TableCell>
              <TableCell data-label="Distance" className="tabular-nums">
                {distanceText(target.distanceKm)}
              </TableCell>
              <TableCell data-label="Score" className="tabular-nums">
                {scoreText(target.score)}
              </TableCell>
              <TableCell data-label="Readout" className="text-xs">
                {target.readout ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ResponsiveTable>
  );
}

/** Everything one finished survey knows about its target. */
export default function ResultPanel({ detail }: { detail: SurveyRunDetail }) {
  const { run, targets, deliverables } = detail;
  const result = run.result;
  const scored = DOSSIER_ORDER.filter((category) => {
    const score = result ? scoreOf(result.scores, category) : undefined;
    return score !== undefined && score.score !== null;
  });
  const [tab, setTab] = useState<string>(scored[0] ?? DOSSIER_ORDER[0]);

  return (
    <div className="flex flex-col gap-4">
      <DashboardCard
        title={run.clientName}
        titleAction={
          <PanelMeta>
            {coordText(run.latitude)}, {coordText(run.longitude)}
          </PanelMeta>
        }
      >
        <p className="text-sm leading-relaxed">
          {result?.summary ??
            "This survey finished without an executive summary — the scores and files below are still what the worker published."}
        </p>
        {result?.target ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Grid cell {result.target.cellM} m · AOI {result.target.utmZone} ·{" "}
            {result.target.crs}
          </p>
        ) : null}
      </DashboardCard>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {DOSSIER_ORDER.map((category) => (
          <ScoreTile
            key={category}
            category={category}
            score={result ? scoreOf(result.scores, category) : undefined}
            count={targets.filter((target) => target.category === category).length}
          />
        ))}
      </div>

      <DashboardCard
        title="Ranked field targets"
        titleAction={<PanelMeta>{scored.length} scored</PanelMeta>}
      >
        <Tabs value={tab} onValueChange={setTab} className="gap-3">
          <TabsList className="h-auto w-full flex-wrap">
            {DOSSIER_ORDER.map((category) => (
              <TabsTrigger key={category} value={category} className="text-xs">
                {CATEGORY_LABELS[category].short}
              </TabsTrigger>
            ))}
          </TabsList>
          {DOSSIER_ORDER.map((category) => (
            <div key={category} hidden={tab !== category}>
              <TargetTable
                category={category}
                targets={targets.filter((target) => target.category === category)}
              />
            </div>
          ))}
        </Tabs>
      </DashboardCard>

      <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        <div className="min-w-0 text-xs leading-relaxed">
          <p className="font-medium text-foreground">What these numbers claim</p>
          <p className="mt-1 text-muted-foreground">
            {result?.claimCeiling ??
              "The worker published no claim ceiling for this survey."}
          </p>
          <p className="mt-1 text-muted-foreground">
            Score basis:{" "}
            {result?.scoreBasis === "relative_to_aoi_percentile"
              ? "percentile rank inside this study area only — a 61.4 here is not comparable to a 61.4 at another site."
              : (result?.scoreBasis ?? "not stated")}
          </p>
        </div>
      </div>

      {result && Object.keys(result.dataSources).length ? (
        <DashboardCard title="Coverage used">
          <ul className="flex flex-wrap gap-2">
            {Object.entries(result.dataSources).map(([layer, source]) => (
              <li key={layer}>
                <Badge variant="outline" className="text-xs">
                  {layer}: {source}
                </Badge>
              </li>
            ))}
          </ul>
        </DashboardCard>
      ) : null}

      <DeliverablesPanel deliverables={deliverables} />
    </div>
  );
}
