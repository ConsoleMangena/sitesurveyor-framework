/* eslint-disable react-refresh/only-export-components */
// ^ view registries export render helper functions, not components. Lazy page
// components defined here are only consumed inside this file.
import { lazy, Suspense } from "react";
import { Puzzle } from "lucide-react";

import PageLoader from "@/components/PageLoader.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import type { WorkspaceView } from "../workspace/types.ts";
import { extensionForView } from "./registry.ts";
import { extensionEntry, useExtensions } from "./store.ts";

const SatelliteSurveyPage = lazy(() => import("../../pages/shared/satellite-survey/index.tsx"));

/** Which extension owns each contributed view. */
const VIEW_TO_EXTENSION: Partial<Record<WorkspaceView, string>> = {
  satellite: "satellite-intelligence",
};

interface ExtensionViewProps {
  endpoint: string;
  onNavigate?: (view: string) => void;
}

function ExtensionPage({ view, endpoint, onNavigate }: ExtensionViewProps & { view: WorkspaceView }) {
  if (view === "satellite") {
    return (
      <Suspense fallback={<PageLoader />}>
        <SatelliteSurveyPage endpoint={endpoint} onNavigate={onNavigate} />
      </Suspense>
    );
  }
  return null;
}

/**
 * Stops a contributed view from opening when its extension is switched off.
 *
 * A saved last view or a `?view=satellite` link can outlive the decision that
 * made it reachable, so the page names the extension that is off and offers the
 * switch instead of rendering a survey console with nowhere to send requests.
 */
function ExtensionViewBoundary({
  view,
  onNavigate,
}: {
  view: WorkspaceView;
  onNavigate?: (view: string) => void;
}) {
  const state = useExtensions();
  const extensionId = VIEW_TO_EXTENSION[view];
  const entry = extensionId ? extensionEntry(state, extensionId) : undefined;

  if (entry && entry.state.installed && entry.state.enabled) {
    return (
      <ExtensionPage view={view} endpoint={entry.endpoint} onNavigate={onNavigate} />
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg pt-10">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Puzzle />
          </EmptyMedia>
          <EmptyTitle>
            {entry ? entry.manifest.name : "This extension"} is switched off
          </EmptyTitle>
          <EmptyDescription>
            {entry
              ? `${entry.manifest.tagline}. Turn it on to use this page.`
              : "No extension in this build contributes that page."}
          </EmptyDescription>
        </EmptyHeader>
        <Button onClick={() => onNavigate?.("extensions")}>Open Extensions</Button>
      </Empty>
    </div>
  );
}

/**
 * Render the page an extension contributes, or null when no extension owns
 * this view. Both workspace view registries call this before their fallback,
 * which is what lets an extension add a page without editing the registries.
 */
export function renderExtensionView(
  activeView: WorkspaceView,
  options: { onNavigate?: (view: string) => void } = {},
) {
  if (!extensionForView(activeView)) return null;
  return (
    <ExtensionViewBoundary
      view={activeView}
      onNavigate={options.onNavigate}
    />
  );
}
