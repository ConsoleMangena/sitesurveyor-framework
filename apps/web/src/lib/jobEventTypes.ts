/** Canonical job-event types — the values the schedule editor actually writes.
 *  The dashboards and the calendar must label and colour the same type alike. */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  boundary: "Boundary survey",
  topo: "Topographic",
  construction: "Construction",
  pegging: "Stand pegging",
  note: "Note",
  other: "Other",
};

/** Dot colour per type, drawn from the theme's semantic tones. */
export const EVENT_TYPE_DOTS: Record<string, string> = {
  boundary: "bg-accent-purple",
  topo: "bg-info",
  construction: "bg-warning",
  pegging: "bg-success",
  note: "bg-muted-foreground/60",
  other: "bg-muted-foreground/60",
};

export function eventTypeLabel(type: string | null): string {
  if (!type) return EVENT_TYPE_LABELS.other;
  return EVENT_TYPE_LABELS[type] ?? type.replace(/_/g, " ");
}

export function eventTypeDot(type: string | null): string {
  if (!type) return EVENT_TYPE_DOTS.other;
  return EVENT_TYPE_DOTS[type] ?? EVENT_TYPE_DOTS.other;
}
