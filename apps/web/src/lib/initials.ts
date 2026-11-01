/** Up to two letters for an avatar fallback, ignoring stray whitespace. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  return parts
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
