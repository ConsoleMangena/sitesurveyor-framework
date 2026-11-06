import { CircleAlert, CircleCheck, Loader, Satellite } from "lucide-react";

import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils";
import { EngineError, type EngineHealth } from "./client.ts";
import type { ConnectionStatus } from "./useEngine.ts";

/**
 * Whether the engine is reachable, in the engine's own words.
 *
 * Three states are shown rather than two because they need different answers:
 * no URL configured is a setup step, a refused connection is an operator
 * problem, and `checking` must not read as either.
 */
export function EngineStatusChip({
  status,
  health,
  error,
  className,
}: {
  status: ConnectionStatus;
  health: EngineHealth | null;
  error: EngineError | null;
  className?: string;
}) {
  const label =
    status === "online"
      ? `Connected · v${health?.version ?? "?"}`
      : status === "checking"
        ? "Checking engine"
        : status === "unset"
          ? "Engine URL not set"
          : "Engine unreachable";

  const variant =
    status === "online" ? "success" : status === "unset" ? "secondary" : status === "checking" ? "secondary" : "warning";

  const Icon =
    status === "online" ? CircleCheck : status === "checking" ? Loader : status === "unset" ? Satellite : CircleAlert;

  return (
    <Badge
      variant={variant}
      className={cn("gap-1.5 max-w-full", className)}
      title={status === "offline" ? (error?.hint ?? error?.message ?? undefined) : undefined}
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Badge>
  );
}
