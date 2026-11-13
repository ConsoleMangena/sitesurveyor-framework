import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";

import { cn } from "@/lib/utils.ts";
import { Button } from "@/components/ui/button.tsx";
import "../../styles/workbench-register.css";

/**
 * The workbench register grammar: one dense table of records, a left rail that
 * filters, an optional right rail that inspects the selected row, and a status
 * strip underneath. Shared by Jobs and ProjectHub so both surfaces read as the
 * same instrument the survey workbench already is.
 */

export function RegisterWorkspace({
  railCollapsed,
  inspectorOpen,
  children,
  className,
}: {
  railCollapsed?: boolean;
  inspectorOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("wr-workspace", className)}
      data-rail={railCollapsed ? "collapsed" : undefined}
      data-inspector={inspectorOpen ? "open" : undefined}
    >
      {children}
    </div>
  );
}

export function RegisterPanel({
  title,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("wr-panel", className)}>
      <div className="wr-panel__header">
        <span className="wr-panel__title">{title}</span>
        <span className="ml-auto flex items-center gap-1">{actions}</span>
      </div>
      <div className={cn("wr-panel__body", bodyClassName)}>{children}</div>
    </section>
  );
}

export function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="wr-filter-group">
      <span className="wr-filter-label">{label}</span>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export function FilterRow({
  label,
  count,
  active,
  onClick,
  icon,
}: {
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
  icon?: ReactNode;
}) {
  return (
    <button type="button" className="wr-filter-row" data-active={active || undefined} onClick={onClick}>
      <span className="flex min-w-0 items-center gap-2">
        {icon}
        <span className="truncate">{label}</span>
      </span>
      {count !== undefined ? <span className="wr-filter-row__count">{count}</span> : null}
    </button>
  );
}

export function InspectorPanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <RegisterPanel
      title={title}
      className="wr-inspector"
      actions={
        <Button type="button" variant="ghost" size="icon" className="size-7" onClick={onClose} title="Close inspector">
          <X className="size-4" aria-hidden="true" />
          <span className="sr-only">Close inspector</span>
        </Button>
      }
    >
      {children}
    </RegisterPanel>
  );
}

export function InspectorSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="wr-inspector__section">
      {title ? <span className="wr-filter-label">{title}</span> : null}
      {children}
    </div>
  );
}

export function KeyValues({ rows }: { rows: { label: string; value: ReactNode; mono?: boolean }[] }) {
  return (
    <dl className="wr-kv">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt>{row.label}</dt>
          <dd className={row.mono ? "wr-num" : undefined}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RegisterStatus({
  total,
  shown,
  noun,
  detail,
}: {
  total: number;
  shown: number;
  noun: string;
  detail?: ReactNode;
}) {
  return (
    <footer className="wr-status">
      <span className="wr-status__dot" aria-hidden="true" />
      <span>
        <strong>{shown}</strong> of <strong>{total}</strong> {noun}
      </span>
      {detail ? <span className="ml-auto">{detail}</span> : null}
    </footer>
  );
}

export function RailCollapseButton({
  collapsed,
  onClick,
}: {
  collapsed: boolean;
  onClick: () => void;
}) {
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7"
      aria-expanded={!collapsed}
      onClick={onClick}
      title={collapsed ? "Show filters" : "Hide filters"}
    >
      <Icon className="size-4" aria-hidden="true" />
      <span className="sr-only">{collapsed ? "Show filters" : "Hide filters"}</span>
    </Button>
  );
}

export function RegisterPagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
      <span className="font-mono text-[11px] text-muted-foreground">
        Page {page} / {totalPages}
      </span>
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="icon" className="size-7" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" className="size-7" onClick={() => onPage(page + 1)} disabled={page >= totalPages} aria-label="Next page">
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
