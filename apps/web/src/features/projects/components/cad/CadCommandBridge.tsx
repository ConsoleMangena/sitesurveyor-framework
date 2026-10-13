import { useMemo, useState } from "react";
import { Check, Play, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import {
  executeAiCadCommands,
  extractCadBlocks,
  parseCadCommands,
  type CadExecResult,
} from "./cadAiExecutor.ts";
import type { UseCadModel } from "./useCadModel.ts";

interface CadCommandBridgeProps {
  /** Full assistant reply text — every `[CAD]…[/CAD]` block becomes a card. */
  messageText: string;
  cad: UseCadModel;
  onExecuted?: (results: CadExecResult[]) => void;
}

/**
 * Preview/execute bridge between assistant replies and the CAD model. Each
 * `[CAD]` block renders as a card listing its commands; running a card applies
 * the whole batch as ONE undoable transaction and swaps the Execute action for
 * an outcome chip plus Undo.
 */
export function CadCommandBridge({ messageText, cad, onExecuted }: CadCommandBridgeProps) {
  const blocks = useMemo(() => extractCadBlocks(messageText), [messageText]);

  // Results are stored together with the exact message text that produced
  // them: when a new AI reply arrives the stale results stop matching and the
  // panel silently resets, with no setState-in-render or effect ordering to
  // get wrong.
  const [executedFor, setExecutedFor] = useState<{
    text: string;
    results: Record<number, CadExecResult[]>;
  } | null>(null);
  const executed = executedFor?.text === messageText ? executedFor.results : {};

  if (blocks.length === 0) return null;

  const handleExecute = (index: number) => {
    const block = blocks[index];
    if (block === undefined || executed[index] !== undefined) return;
    const results = executeAiCadCommands(block, cad);
    // The viewport listens for this to zoom to the freshly drawn extents.
    if (parseCadCommands(block).some((line) => line.toUpperCase().startsWith("ZOOM"))) {
      window.dispatchEvent(new CustomEvent("cad:ai-zoom-extents"));
    }
    setExecutedFor({ text: messageText, results: { ...executed, [index]: results } });
    onExecuted?.(results);
  };

  return (
    <div className="space-y-2">
      {blocks.map((block, index) => {
        const commands = parseCadCommands(block);
        if (commands.length === 0) return null;
        const results = executed[index];
        const done = results !== undefined;
        const hasErrors = results !== undefined && results.some((r) => !r.ok);
        const destructive = commands.some((c) => /^(ERASE|DELETE)\b/i.test(c));

        return (
          <section
            key={index}
            aria-label={`CAD command block ${index + 1}`}
            className="space-y-2 rounded-lg border p-2.5"
            style={{
              borderColor: destructive
                ? "var(--cad-error)"
                : "var(--cad-border)",
              background: destructive
                ? "rgba(211, 47, 47, 0.05)"
                : "var(--cad-panel)",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{
                    background: "var(--cad-accent-bg)",
                    color: "var(--cad-accent)",
                  }}
                >
                  CAD · {commands.length}
                </span>
                <span className="truncate text-xs font-semibold" style={{ color: "var(--cad-text-hi)" }}>
                  {commands.length === 1 ? "Command" : "Commands"}
                </span>
                {destructive && (
                  <span className="inline-flex shrink-0 items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                    Destructive
                  </span>
                )}
              </span>
              {done ? (
                <span className="flex shrink-0 items-center gap-1">
                  {hasErrors ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                      <X className="size-3" />
                      Errors
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      <Check className="size-3" />
                      Applied
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => cad.undo()}
                  >
                    <RotateCcw className="size-3.5" />
                    Undo
                  </Button>
                </span>
              ) : (
                <Button
                  size="sm"
                  className="h-7 shrink-0 px-2.5 text-xs"
                  onClick={() => handleExecute(index)}
                >
                  <Play className="size-3.5" />
                  Execute ({commands.length})
                </Button>
              )}
            </div>

            <div className="max-h-40 overflow-auto rounded-md border border-[var(--cad-border)] bg-[var(--cad-bg-2)] p-2 font-mono text-xs leading-relaxed">
              {commands.map((command, j) => {
                const result = results?.[j];
                return (
                  <div key={j} className="flex items-start gap-2 whitespace-pre" style={{ color: "var(--cad-text)" }}>
                    <span
                      aria-hidden
                      className="w-3 shrink-0 text-center"
                      style={{
                        color:
                          result === undefined
                            ? "var(--cad-text-dim)"
                            : result.ok
                              ? "var(--cad-ok)"
                              : "var(--cad-error)",
                      }}
                    >
                      {result === undefined ? "·" : result.ok ? "✓" : "✗"}
                    </span>
                    <span className="min-w-0">{command}</span>
                  </div>
                );
              })}
            </div>

            {results !== undefined && results.length > 0 && (
              <div className="space-y-0.5">
                {results.map((r, j) => (
                  <p
                    key={j}
                    className="text-xs"
                    style={{
                      color: r.ok ? "var(--cad-text-dim)" : "var(--cad-error)",
                    }}
                  >
                    {r.detail}
                  </p>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
