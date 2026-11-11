import * as React from 'react';
import { Boxes, Loader2, NotebookPen, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { DashboardCard } from '../../../components/dashboard/DashboardCard.tsx';
import { KpiCard, KpiGrid, type KpiTone } from '../../../components/dashboard/KpiCard.tsx';
import { PanelMeta } from '../../../components/dashboard/DashboardShell.tsx';

import type { ProjectActivity } from '../../../lib/repositories/projects.ts';
import type { AssetRow } from '../../../lib/repositories/assets.ts';

interface ProjectDashboardProps {
  kpiData: Array<{
    label: string;
    value: string;
    /** Only facts the label and value cannot carry. */
    sub?: string;
    icon?: React.ReactNode;
    tone?: KpiTone;
  }>;
  timelineSummary: { notes: number; actions: number; system: number };
  recentActivities: ProjectActivity[];
  recentActivitySections: ProjectActivity[][];
  overviewActivitySectionIndex: number;
  setOverviewActivitySectionIndex: React.Dispatch<React.SetStateAction<number>>;
  newActivityText: string;
  setNewActivityText: React.Dispatch<React.SetStateAction<string>>;
  submittingActivity: boolean;
  deletingActivityId: string | null;
  deployedAssets: AssetRow[];
  handleAddActivity: (e: React.FormEvent) => Promise<void>;
  handleDeleteActivity: (id: string) => Promise<void>;
  onUndeployAsset?: (assetId: string) => Promise<void>;
}

function activityBadgeVariant(type: string) {
  switch (type) {
    case 'system':
      return 'default' as const;
    case 'action':
      return 'secondary' as const;
    default:
      return 'outline' as const;
  }
}

export function ProjectDashboard({
  kpiData,
  timelineSummary,
  recentActivities,
  recentActivitySections,
  overviewActivitySectionIndex,
  setOverviewActivitySectionIndex,
  newActivityText,
  setNewActivityText,
  submittingActivity,
  deletingActivityId,
  deployedAssets,
  handleAddActivity,
  handleDeleteActivity,
  onUndeployAsset,
}: ProjectDashboardProps) {
  const currentSection = recentActivitySections[overviewActivitySectionIndex];
  const deployingCount = deployedAssets?.length ?? 0;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <KpiGrid>
        {kpiData.map((kpi) => (
          <KpiCard
            key={kpi.label}
            title={kpi.label}
            value={kpi.value}
            subtext={kpi.sub}
            icon={kpi.icon}
            tone={kpi.tone}
          />
        ))}
      </KpiGrid>

      {/* Activity leads the page; deployed instruments sit beside it on wide
          screens instead of stacking as a second full-width band. */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-3">
        <DashboardCard
          title="Activity"
          icon={<NotebookPen />}
          className="xl:col-span-2"
          titleAction={
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">Notes {timelineSummary.notes}</Badge>
              <Badge variant="outline">Actions {timelineSummary.actions}</Badge>
              <Badge variant="outline">System {timelineSummary.system}</Badge>
            </div>
          }
        >
          <form onSubmit={handleAddActivity} className="mb-4 flex gap-2">
            <Input
              placeholder="Add a short update..."
              aria-label="Add a short update"
              value={newActivityText}
              onChange={e => setNewActivityText(e.target.value)}
              className="h-9 text-sm"
            />
            <Button
              type="submit"
              size="sm"
              disabled={submittingActivity || !newActivityText.trim()}
            >
              {submittingActivity ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
            </Button>
          </form>

          {recentActivities.length > 0 ? (
            <div className="flex flex-col gap-3">
              {currentSection && (
                <>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <PanelMeta>{currentSection.length} items</PanelMeta>
                    <span className="ml-auto tabular-nums">
                      {overviewActivitySectionIndex + 1} / {recentActivitySections.length}
                    </span>
                  </div>
                  <ul className="flex flex-col divide-y divide-border/60">
                    {currentSection.map(log => (
                      <li key={log.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={activityBadgeVariant(log.activity_type)}>
                              {log.activity_type}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {log.user_name}
                            </span>
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {new Date(log.created_at).toLocaleDateString()}{' '}
                              {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-sm leading-relaxed text-foreground">
                            {log.content}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteActivity(log.id)}
                          disabled={deletingActivityId === log.id}
                          className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label={`Delete activity: ${log.content}`}
                        >
                          {deletingActivityId === log.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {recentActivitySections.length > 1 && (
                <div className="flex items-center justify-between gap-3 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setOverviewActivitySectionIndex(prev => Math.max(0, prev - 1))}
                    disabled={overviewActivitySectionIndex <= 0}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setOverviewActivitySectionIndex(prev => Math.min(recentActivitySections.length - 1, prev + 1))}
                    disabled={overviewActivitySectionIndex >= recentActivitySections.length - 1}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Empty className="border-none py-8">
              <EmptyHeader>
                <EmptyDescription>
                  No activity yet. Add your first project update.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </DashboardCard>

        <DashboardCard
          title="Deployed instruments"
          icon={<Boxes />}
          titleAction={deployingCount > 0 ? <PanelMeta>{deployingCount}</PanelMeta> : undefined}
        >
          {deployingCount > 0 ? (
            <ul className="flex flex-col divide-y divide-border/60">
              {deployedAssets.map(asset => (
                <li key={asset.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <strong className="block truncate text-sm font-semibold text-foreground">
                      {asset.name}
                    </strong>
                    <span className="text-xs text-muted-foreground">
                      {asset.category || asset.kind}
                      {' · '}
                      <code className="rounded bg-muted px-1 font-mono text-xs">{asset.serial_number || 'N/A'}</code>
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {onUndeployAsset && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onUndeployAsset(asset.id)}
                        className="h-7 px-2 text-xs"
                      >
                        Check in
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty className="border-none py-8">
              <EmptyHeader>
                <EmptyDescription>
                  No instruments currently deployed to this project.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </DashboardCard>
      </div>
    </div>
  );
}
