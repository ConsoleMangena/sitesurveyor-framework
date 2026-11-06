import { useState } from "react";
import {
  ExternalLink,
  Loader,
  PlugZap,
  Puzzle,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { DashboardCard } from "@/components/dashboard/DashboardCard.tsx";
import {
  DashboardHeader,
  DashboardShell,
  PanelMeta,
} from "@/components/dashboard/DashboardShell.tsx";
import ErrorNotice from "@/components/errors/ErrorNotice.tsx";
import { getNavIcon } from "@/components/workspace/navIcons.tsx";
import { useAsyncAction } from "@/hooks/useAsyncAction.ts";

import {
  createEngineClient,
  EngineError,
  type EngineHealth,
} from "../../features/extensions/engine/client.ts";
import {
  retryLoadExtensions,
  entriesFor,
  loadExtensions,
  setExtensionEnabled,
  setExtensionEndpoint,
  setExtensionInstalled,
  useExtensions,
} from "../../features/extensions/store.ts";
import type { ExtensionEntry } from "../../features/extensions/types.ts";

interface ExtensionsPageProps {
  workspaceId: string;
  onNavigate?: (view: string) => void;
}

type Probe =
  | { state: "idle" }
  | { state: "probing" }
  | { state: "online"; health: EngineHealth }
  | { state: "offline"; error: EngineError };

/**
 * Configure and verify the runtime an extension calls.
 *
 * The test uses whatever is in the field, saved or not, so an operator can
 * confirm an address before committing the workspace to it. The engine's own
 * answer is reported — version, projection, and whether its disk survives a
 * redeploy — rather than a bare tick.
 */
function EndpointPanel({ entry }: { entry: ExtensionEntry }) {
  const manifest = entry.manifest;
  const [url, setUrl] = useState(entry.endpoint);
  const [probe, setProbe] = useState<Probe>({ state: "idle" });
  const [saved, setSaved] = useState(false);
  const config = manifest.endpoint;
  if (!config) return null;

  const effective = url.trim() || config.defaultUrl || "";
  const example = config.placeholder;

  async function test() {
    if (!effective) {
      setProbe({
        state: "offline",
        error: new EngineError("unreachable", "No engine URL to test.", {
          hint: `Type the base URL, e.g. ${example}.`,
        }),
      });
      return;
    }
    setProbe({ state: "probing" });
    setSaved(false);
    try {
      setProbe({ state: "online", health: await createEngineClient(effective).health() });
    } catch (error) {
      setProbe({
        state: "offline",
        error:
          error instanceof EngineError
            ? error
            : new EngineError("unreachable", "The engine did not answer."),
      });
    }
  }

  async function save() {
    setSaved(await setExtensionEndpoint(manifest.id, url));
  }

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-2">
        <div className="min-w-0 flex-1">
          <Label htmlFor={`endpoint-${manifest.id}`} className="text-xs font-medium">
            {config.label}
          </Label>
          <Input
            id={`endpoint-${manifest.id}`}
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setProbe({ state: "idle" });
              setSaved(false);
            }}
            placeholder={config.placeholder}
            spellCheck={false}
            autoComplete="off"
            className="mt-1.5 font-mono text-xs"
          />
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {config.hint}
            {entry.usesDefaultEndpoint && config.defaultUrl
              ? " Currently the build default; saving an override replaces it."
              : null}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void test()}
            disabled={probe.state === "probing"}
          >
            {probe.state === "probing" ? (
              <Loader className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <PlugZap className="size-4" aria-hidden="true" />
            )}
            Test connection
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void save()}
            disabled={!url.trim() || url.trim() === entry.endpoint}
          >
            <Save className="size-4" aria-hidden="true" />
            Save
          </Button>
        </div>
      </div>

      {probe.state === "online" ? (
        <div className="flex flex-col gap-1.5 text-xs">
          <p className="flex flex-wrap items-center gap-2 font-medium text-success">
            <ShieldCheck className="size-4" aria-hidden="true" />
            {probe.health.service} · v{probe.health.version}
          </p>
          <p className="text-muted-foreground">
            Projection {probe.health.crs} · last AOI {probe.health.active_aoi}
          </p>
          {!probe.health.state_dir_persistent ? (
            <p className="text-warning">
              This instance has no persistent disk: its survey cache and every
              deliverable link are lost on restart.
            </p>
          ) : null}
        </div>
      ) : null}

      {probe.state === "offline" ? (
        <ErrorNotice tone="warning" title={probe.error.message}>
          {probe.error.hint ??
            "The engine gave no further detail. Check the URL and that this app's origin is allowlisted."}
        </ErrorNotice>
      ) : null}

      {saved ? (
        <p className="text-xs text-success" role="status">
          Engine URL saved for this workspace.
        </p>
      ) : null}
    </div>
  );
}

function ExtensionDetail({
  entry,
  busy,
  onNavigate,
}: {
  entry: ExtensionEntry;
  busy: boolean;
  onNavigate?: (view: string) => void;
}) {
  const { manifest, state } = entry;
  const contributes = manifest.contributes;

  return (
    <DashboardCard
      title={manifest.name}
      icon={getNavIcon(manifest.icon)}
      titleAction={<PanelMeta>v{manifest.version}</PanelMeta>}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="capitalize">
            {manifest.category}
          </Badge>
          <span className="text-xs text-muted-foreground">{manifest.publisher}</span>
          <span
            className={
              state.installed && state.enabled
                ? "ml-auto rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success"
                : "ml-auto rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
            }
          >
            {state.installed ? (state.enabled ? "Enabled" : "Installed, off") : "Not installed"}
          </span>
        </div>

        <p className="text-sm leading-relaxed">{manifest.tagline}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {manifest.description}
        </p>

        <ul className="grid gap-2 sm:grid-cols-2">
          {manifest.capabilities.map((capability) => (
            <li
              key={capability.label}
              className="rounded-lg border border-border/70 bg-card p-3"
            >
              <p className="text-sm font-medium">{capability.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {capability.detail}
              </p>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-3 border-t pt-3">
          <div className="flex items-center gap-2">
            <Switch
              id={`enabled-${manifest.id}`}
              checked={state.enabled}
              disabled={!state.installed || busy}
              onCheckedChange={(checked) => void setExtensionEnabled(manifest.id, checked)}
            />
            <Label htmlFor={`enabled-${manifest.id}`} className="text-sm">
              Enabled
            </Label>
          </div>

          {state.installed ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void setExtensionInstalled(manifest.id, false)}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Uninstall
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void setExtensionInstalled(manifest.id, true)}
            >
              Install
            </Button>
          )}

          {contributes && state.installed && state.enabled ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onNavigate?.(contributes.view)}
            >
              {getNavIcon(contributes.icon)}
              Open {contributes.label}
            </Button>
          ) : null}

          {manifest.sourceUrl ? (
            <a
              href={manifest.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              Engine source
            </a>
          ) : null}
        </div>

        {busy ? (
          <p className="text-xs text-muted-foreground" role="status">
            Saving for this workspace…
          </p>
        ) : null}

        <EndpointPanel entry={entry} />
      </div>
    </DashboardCard>
  );
}

export default function ExtensionsPage({
  workspaceId,
  onNavigate,
}: ExtensionsPageProps) {
  const state = useExtensions();
  useAsyncAction(() => loadExtensions(workspaceId), [workspaceId]);

  const entries = entriesFor(state);
  const loading = state.status === "idle" || state.status === "loading";
  const enabled = entries.filter((entry) => entry.state.installed && entry.state.enabled);

  return (
    <DashboardShell>
      <DashboardHeader
        title="Extensions"
        description="Add-ons that plug a runtime into this workspace and add their own pages to the navigation."
        meta={
          loading
            ? "Loading extension state…"
            : `${enabled.length} of ${entries.length} enabled · state ${
                state.storage === "database" ? "synced to this workspace" : "saved in this browser"
              }`
        }
        actions={
          <Button type="button" variant="outline" size="sm" onClick={retryLoadExtensions}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Reload
          </Button>
        }
      />

      {state.notice ? (
        <ErrorNotice tone="warning" title="Extension state is limited">
          {state.notice}
        </ErrorNotice>
      ) : null}

      {loading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
          <Puzzle className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            No extension is compiled into this build.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {entries.map((entry) => (
            <ExtensionDetail
              key={entry.manifest.id}
              entry={entry}
              busy={state.saving === entry.manifest.id}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
