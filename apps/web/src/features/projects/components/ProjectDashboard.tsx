import * as React from 'react';
import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DashboardCard } from '../../../components/dashboard/DashboardCard.tsx';
import { KpiCard } from '../../../components/dashboard/KpiCard.tsx';

import type { ProjectActivity } from '../../../lib/repositories/projects.ts';
import type { ProjectTool } from '../tools/toolRegistry.ts';
import type { AssetRow } from '../../../lib/repositories/assets.ts';

interface ProjectDashboardProps {
  kpiData: Array<{ label: string; value: string; sub: string; icon?: React.ReactNode; accentColor: string }>;
  activities: ProjectActivity[];
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
  handleQuickAction: (action: string) => Promise<void>;
  handleDeleteActivity: (id: string) => Promise<void>;
  onUndeployAsset?: (assetId: string) => Promise<void>;
  pinnedTools?: ProjectTool[];
  comingSoonTools?: ProjectTool[];
  onOpenTool?: (toolId: string) => void;
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
  activities,
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
  handleQuickAction,
  handleDeleteActivity,
  onUndeployAsset,
  pinnedTools = [],
  comingSoonTools = [],
  onOpenTool,
}: ProjectDashboardProps) {
  return (
    <div className="flex flex-col gap-5 min-w-0">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiData.map((kpi) => (
          <KpiCard
            key={kpi.label}
            title={kpi.label}
            value={kpi.value}
            subtext={kpi.sub}
            icon={kpi.icon}
          />
        ))}
      </div>

      <DashboardCard title="Quick Actions">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <Button onClick={() => handleQuickAction('New Field Session')}>
            <span>New Field Session</span>
            <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
              {activities.find(a => a.content.includes('Field Session')) ? 'Running' : 'Start'}
            </Badge>
          </Button>
          <Button variant="outline" onClick={() => handleQuickAction('Run Transformation')}>
            <span>Run Transformation</span>
            <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
              {activities.filter(a => a.content.includes('Transformation')).length} runs
            </Badge>
          </Button>
          <Button variant="outline" onClick={() => handleQuickAction('Validate QA')}>
            <span>Validate QA</span>
            <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
              {Math.max(0, 12 - activities.filter(a => a.content.includes('Validate')).length)} left
            </Badge>
          </Button>
          <Button variant="outline" onClick={() => handleQuickAction('Prepare Deliverable')}>
            <span>Prepare Deliverable</span>
            <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
              v1.{activities.filter(a => a.content.includes('Deliverable')).length}
            </Badge>
          </Button>
        </div>
      </DashboardCard>

      {pinnedTools.length > 0 && (
        <DashboardCard
          title="Pinned Tools"
          titleAction={<Badge variant="default">Quick access</Badge>}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {pinnedTools.map(tool => {
              const Icon = tool.icon;
              const disabled = tool.behavior.kind === 'soon';
              return (
                <Button
                  key={tool.id}
                  variant="outline"
                  disabled={disabled}
                  className="justify-start h-auto py-3 px-3 text-left"
                  onClick={() => { if (!disabled && onOpenTool) onOpenTool(tool.id); }}
                >
                  <span className="inline-flex shrink-0 text-muted-foreground">
                    <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <span className="flex-1 truncate">
                    {tool.label}
                  </span>
                </Button>
              );
            })}
          </div>
        </DashboardCard>
      )}

      <DashboardCard
        title="Activity Feed"
        titleAction={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">Notes {timelineSummary.notes}</Badge>
            <Badge variant="secondary">Actions {timelineSummary.actions}</Badge>
            <Badge variant="outline">System {timelineSummary.system}</Badge>
          </div>
        }
      >
        <form onSubmit={handleAddActivity} className="flex gap-2 mb-4">
          <Input
            placeholder="Add a short update..."
            value={newActivityText}
            onChange={e => setNewActivityText(e.target.value)}
            className="h-9 text-sm"
          />
          <Button
            type="submit"
            size="sm"
            disabled={submittingActivity || !newActivityText.trim()}
          >
            {submittingActivity ? <Loader2 size={14} className="animate-spin" /> : 'Add'}
          </Button>
        </form>

        {recentActivities.length > 0 ? (
          <div className="flex flex-col gap-4">
            {recentActivitySections[overviewActivitySectionIndex] && (
              <div className="rounded-none border border-border/60 bg-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="default">Section {overviewActivitySectionIndex + 1}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {recentActivitySections[overviewActivitySectionIndex].length} items
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {overviewActivitySectionIndex + 1} / {recentActivitySections.length}
                  </span>
                </div>
                <div className="flex flex-col gap-3">
                  {recentActivitySections[overviewActivitySectionIndex].map(log => (
                    <article
                      key={log.id}
                      className="rounded-none border border-border/40 bg-muted/30 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <Badge variant={activityBadgeVariant(log.activity_type)}>
                          {log.activity_type}
                        </Badge>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground">
                            {new Date(log.created_at).toLocaleDateString()} {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteActivity(log.id)}
                            disabled={deletingActivityId === log.id}
                            className="h-7 px-2 text-xs"
                          >
                            {deletingActivityId === log.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Trash2 size={12} />
                            )}
                          </Button>
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-foreground leading-relaxed">
                        {log.content}
                      </p>
                      <span className="text-xs text-muted-foreground">{log.user_name}</span>
                    </article>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
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
          </div>
        ) : (
          <div className="py-8 text-center rounded-none border border-dashed border-border/60 bg-muted/20">
            <p className="text-sm text-muted-foreground">
              No activity yet. Add your first project update.
            </p>
          </div>
        )}
      </DashboardCard>

      {comingSoonTools.length > 0 && (
        <DashboardCard
          title="Coming Soon"
          titleAction={<Badge variant="outline">Roadmap</Badge>}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {comingSoonTools.map(tool => {
              const Icon = tool.icon;
              return (
                <div
                  key={tool.id}
                  className="flex items-center gap-3 rounded-none border border-dashed border-border/60 bg-muted/30 p-3 opacity-75"
                >
                  <span className="inline-flex text-muted-foreground">
                    <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground truncate">
                      {tool.label}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {tool.description}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">Soon</Badge>
                </div>
              );
            })}
          </div>
        </DashboardCard>
      )}

      <DashboardCard title="Deployed Instruments">
        {deployedAssets && deployedAssets.length > 0 ? (
          <div className="flex flex-col gap-3">
            {deployedAssets.map(asset => (
              <article
                key={asset.id}
                className="flex items-center justify-between gap-4 rounded-none border border-border/40 bg-muted/30 p-3"
              >
                <div className="min-w-0">
                  <strong className="block text-sm font-semibold text-foreground truncate">
                    {asset.name}
                  </strong>
                  <span className="text-xs text-muted-foreground">
                    {asset.category || asset.kind} &middot; <code className="font-mono text-xs bg-muted px-1 rounded">{asset.serial_number || 'N/A'}</code>
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="default">Deployed</Badge>
                  {onUndeployAsset && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onUndeployAsset(asset.id)}
                      className="h-7 px-2 text-xs"
                    >
                      Check In
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center rounded-none border border-dashed border-border/60 bg-muted/20">
            <p className="text-sm text-muted-foreground">
              No instruments currently deployed to this project.
            </p>
          </div>
        )}
      </DashboardCard>
    </div>
  );
}
