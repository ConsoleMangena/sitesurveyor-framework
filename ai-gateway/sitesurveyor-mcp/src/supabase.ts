// Minimal Supabase PostgREST client used by the SiteSurveyor MCP tools.
// Ports the behaviour of the shared `ai-agent.ts` supabaseFetch so results are
// byte-compatible with the cloud agent. Uses the service-role key and the same
// timeout + content-range behaviour.

export interface DbFetchOpts {
  supabaseUrl: string;
  serviceKey: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  preferCount?: boolean;
}

export interface DbResult {
  ok: boolean;
  status: number;
  json: unknown;
  count: number | null;
}

const SUPABASE_TIMEOUT_MS = 15_000;

export async function supabaseFetch(opts: DbFetchOpts): Promise<DbResult> {
  const headers: Record<string, string> = {
    apikey: opts.serviceKey,
    Authorization: `Bearer ${opts.serviceKey}`,
    "Content-Type": "application/json",
  };
  if (opts.preferCount) headers.Prefer = "count=exact";
  if (opts.method !== "GET") {
    headers.Prefer = opts.preferCount ? headers.Prefer : "return=representation";
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${opts.supabaseUrl}/rest/v1/${opts.path}`, {
      method: opts.method,
      headers,
      body: opts.body == null ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  const contentRange = res.headers.get("content-range");
  let count: number | null = null;
  if (contentRange) {
    const total = contentRange.split("/")[1];
    count = total && total !== "*" ? Number(total) : null;
  }
  return { ok: res.ok, status: res.status, json, count };
}
