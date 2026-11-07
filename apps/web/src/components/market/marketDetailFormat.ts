export function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function hireWindow(from: string | null, to: string | null): string | null {
  const start = formatDay(from);
  const end = formatDay(to);
  if (start && end) return `${start} → ${end}`;
  return start ? `From ${start}` : end ? `Until ${end}` : null;
}
