import { ChevronRight, Puzzle } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { DashboardCard } from "@/components/dashboard/DashboardCard.tsx";
import { PanelMeta } from "@/components/dashboard/DashboardShell.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { getNavIcon } from "@/components/workspace/navIcons.tsx";
import { cn } from "@/lib/utils";
import { useAsyncAction } from "@/hooks/useAsyncAction.ts";

import { EngineStatusChip } from "../../features/extensions/engine/status.tsx";
import { useEngineConnection } from "../../features/extensions/engine/useEngine.ts";
import { entriesFor, loadExtensions, useExtensions } from "../../features/extensions/store.ts";
import type { ExtensionEntry } from "../../features/extensions/types.ts";

interface ExtensionsCardProps {
  workspaceId: string;
  onNavigate?: (view: string) => void;
}

/**
 * One row per extension.
 *
 * An extension with a runtime asks it what it is, so the dashboard says
 * "Connected · v2.0.0" instead of "Installed" — the difference between a tool
 * that is switched on and one that can actually take a survey.
 */
function ExtensionRow({
  entry,
  onNavigate,
}: {
  entry: ExtensionEntry;
  onNavigate?: (view: string) => void;
}) {
  const { manifest, state } = entry;
  const connection = useEngineConnection(
    manifest.endpoint && state.installed && state.enabled ? entry.endpoint : "",
  );
  const target =
    state.installed && state.enabled && manifest.contributes
      ? manifest.contributes.view
      : "extensions";

  return (
    <button
      type="button"
      onClick={() => onNavigate?.(target)}
      className={cn(
        "group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
        "hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
      aria-label={`${manifest.name}: ${state.installed ? (state.enabled ? "on" : "installed, switched off") : "not installed"}`}
    >
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/40 text-muted-foreground [&>svg]:size-4"
      >
        {getNavIcon(manifest.icon)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{manifest.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {manifest.tagline}
        </span>
      </span>
      {manifest.endpoint && state.installed && state.enabled ? (
        <EngineStatusChip
          status={connection.status}
          health={connection.health}
          error={connection.error}
          className="hidden sm:inline-flex"
        />
      ) : (
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            state.installed && state.enabled
              ? "border-success/30 bg-success/10 text-success"
              : "border-border/70 bg-muted/40 text-muted-foreground",
          )}
        >
          {state.installed ? (state.enabled ? "On" : "Off") : "Not installed"}
        </span>
      )}
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </button>
  );
}

/**
 * Dashboard presence for the extension system: what this workspace has turned
 * on, whether each one is answering, and a route to the switch itself.
 */
export default function ExtensionsCard({
  workspaceId,
  onNavigate,
}: ExtensionsCardProps) {
  const state = useExtensions();
  useAsyncAction(() => loadExtensions(workspaceId), [workspaceId]);

  const entries = entriesFor(state);
  const loading = state.status === "idle" || state.status === "loading";
  const activeCount = entries.filter(
    (entry) => entry.state.installed && entry.state.enabled,
  ).length;

  return (
    <DashboardCard
      title="Extensions"
      icon={<Puzzle />}
      titleAction={
        <PanelMeta>
          {loading ? "…" : `${activeCount} of ${entries.length} on`}
        </PanelMeta>
      }
      footer={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onNavigate?.("extensions")}
        >
          Manage extensions
        </Button>
      }
      contentClassName="flex flex-col gap-1"
    >
      {loading ? (
        <>
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </>
      ) : entries.length === 0 ? (
        <p className="px-2 py-3 text-sm text-muted-foreground">
          No extension is available in this build.
        </p>
      ) : (
        entries.map((entry) => (
          <ExtensionRow key={entry.manifest.id} entry={entry} onNavigate={onNavigate} />
        ))
      )}
      {state.notice ? (
        <p className="px-2 pt-1 text-xs leading-relaxed text-muted-foreground">
          {state.notice}
        </p>
      ) : null}
    </DashboardCard>
  );
}
