export function toDbValue(key: string, value: unknown): unknown {
  if ((key === "created_at" || key === "updated_at") && typeof value === "string") {
    const ms = Date.parse(value);
    return isNaN(ms) ? Date.now() : ms;
  }
  if (key === "photos" && Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (key === "metadata" && (typeof value === "object" || value === null || value === undefined)) {
    return JSON.stringify(value ?? {});
  }
  return value;
}

export function fromDbValue(key: string, value: unknown): unknown {
  if ((key === "created_at" || key === "updated_at") && typeof value === "number") {
    return new Date(value).toISOString();
  }
  if (key === "metadata" && typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (key === "photos" && typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return value;
}
