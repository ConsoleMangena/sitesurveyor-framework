import { Bot, X } from "lucide-react";

import { CadCommandBridge } from "./CadCommandBridge.tsx";
import type { UseCadModel } from "./useCadModel.ts";
import AssistantPage from "../../../../pages/shared/AssistantPage.tsx";

interface CadChatPanelProps {
  projectId: string;
  cad: UseCadModel;
  onClose: () => void;
}

/**
 * Chat side panel for the CAD workspace: embeds the assistant beside the
 * canvas. `[CAD]` command cards render INLINE under the message that proposed
 * them (so they scroll away with the conversation instead of squatting at the
 * bottom while typing), skinned with the CAD shell's `--cad-*` tokens.
 */
export function CadChatPanel({ projectId, cad, onClose }: CadChatPanelProps) {
  return (
    <div
      className="flex h-full flex-col border-l bg-[var(--cad-bg-2)] text-[var(--cad-text)]"
      style={{ borderColor: "var(--cad-border)" }}
      aria-label="SiteSurveyor AI panel"
    >
      <header
        className="flex h-10 shrink-0 items-center justify-between gap-2 border-b px-2.5"
        style={{ borderColor: "var(--cad-border)", background: "var(--cad-panel)" }}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden
            className="flex size-5 shrink-0 items-center justify-center rounded-md"
            style={{ background: "var(--cad-accent-bg)", color: "var(--cad-accent)" }}
          >
            <Bot className="size-3" />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[11px] font-semibold tracking-wide text-[var(--cad-text-hi)]">
              SiteSurveyor AI
            </p>
            <p className="truncate text-[10px] text-[var(--cad-text-dim)]">
              Drawing & data assistant
            </p>
          </div>
        </div>
        <button
          type="button"
          className="cad-settings-btn shrink-0"
          onClick={onClose}
          title="Close assistant panel"
          aria-label="Close assistant panel"
        >
          <X className="size-3.5" />
        </button>
      </header>

      {/* AssistantPage fills height via its own h-full root, so the embedded
          chat scrolls internally instead of stretching the panel. */}
      <div className="min-h-0 flex-1 overflow-hidden p-2 [&>*]:h-full">
        <AssistantPage
          embedded
          context="cad"
          contextProjectId={projectId}
          renderCadCommands={(messageText) => (
            <CadCommandBridge messageText={messageText} cad={cad} />
          )}
        />
      </div>
    </div>
  );
}
