import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createEngineClient,
  EngineError,
  relink,
} from "./client.ts";
import { COVERAGE, outsideCoverage } from "./coverage.ts";

const BASE = "https://engine.test";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function lastCall(): { url: string; init: RequestInit } {
  const call = vi.mocked(fetch).mock.calls.at(-1);
  if (!call) throw new Error("fetch was never called");
  return { url: String(call[0]), init: (call[1] ?? {}) as RequestInit };
}

function sentBody(): Record<string, unknown> {
  const { init } = lastCall();
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("survey", () => {
  it("always runs asynchronously and passes the engine's own field names", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        job_id: "j1",
        status: "queued",
        poll_url: "/api/jobs/j1",
        poll_after_ms: 1500,
        estimated_minutes: 9,
      }),
    );

    const accepted = await createEngineClient(BASE).survey({
      latitude: -19.5,
      longitude: 29.8,
      categories: ["water", "hazard"],
      clientName:  "Kopje Farm",
      address: "Masvingo",
      halfDeg: 0.12,
    });

    expect(lastCall().url).toBe(`${BASE}/api/survey`);
    expect(sentBody()).toEqual({
      latitude: -19.5,
      longitude: 29.8,
      categories: ["water", "hazard"],
      client_name: "Kopje Farm",
      address: "Masvingo",
      half_deg: 0.12,
      async_mode: true,
    });
    expect(accepted.job_id).toBe("j1");
  });

  it("asks for every category when the caller selected none", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ job_id: "j1" }));

    await createEngineClient(BASE).survey({
      latitude: 0,
      longitude: 0,
      categories: [],
      clientName: "x",
      address: "",
      halfDeg: 0.05,
    });

    expect(sentBody().categories).toEqual(["all"]);
  });

  it("polls the job id it was given", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: "j/1", status: "running" }));

    await createEngineClient(BASE).job("j/1");

    expect(lastCall().url).toBe(`${BASE}/api/jobs/j%2F1`);
  });
});

describe("errors", () => {
  it("carries the engine's own code, message and hint", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        {
          detail: {
            code: "outside_coverage",
            message: "No satellite coverage for that point.",
            hint: "Pick a site inside sub-Saharan Africa.",
          },
        },
        422,
      ),
    );

    const error = await createEngineClient(BASE).dossier().catch((e) => e);

    expect(error).toBeInstanceOf(EngineError);
    expect(error).toMatchObject({
      kind: "http",
      status: 422,
      code: "outside_coverage",
      message: "No satellite coverage for that point.",
      hint: "Pick a site inside sub-Saharan Africa.",
    });
  });

  it("reads a FastAPI validation array", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ detail: [{ msg: "value is not a valid number" }] }, 422),
    );

    const error = await createEngineClient(BASE)
      .health()
      .then(() => null)
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ kind: "http", message: "value is not a valid number" });
  });

  it("names the CORS/allowlist cause a browser cannot report", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));

    const error = await createEngineClient(BASE)
      .health()
      .then<EngineError | null>(() => null)
      .catch((e: unknown) => e as EngineError);

    expect(error).toMatchObject({ kind: "unreachable" });
    expect(error?.hint).toContain("ALLOWED_ORIGINS");
  });

  it("reports a body that is not JSON as an unusable answer", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("<html>502 bad gateway</html>", { status: 200 }),
    );

    const error = await createEngineClient(BASE)
      .inventory()
      .then(() => null)
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ kind: "unreachable" });
  });
});

describe("artefact links", () => {
  it("re-points an engine URL at the address this client was configured with", () => {
    expect(relink(BASE, "http://127.0.0.1:8000/outputs/groundwater_potential_map.png")).toBe(
      `${BASE}/outputs/groundwater_potential_map.png`,
    );
    expect(relink(BASE, "/outputs/master_site_dossier.json")).toBe(
      `${BASE}/outputs/master_site_dossier.json`,
    );
    expect(relink("https://engine.test/", "https://elsewhere.test/a.kmz")).toBe(
      "https://engine.test/a.kmz",
    );
    expect(relink(BASE, null)).toBeNull();
  });

  it("builds report, viewer and bundle paths per category", () => {
    const client = createEngineClient(`${BASE}/`);

    expect(client.reportUrl("water")).toBe(`${BASE}/api/report/water`);
    expect(client.viewerUrl("soil_land")).toBe(`${BASE}/api/raster/soil_land`);
    expect(client.bundleUrl("minerals")).toBe(`${BASE}/api/export/minerals`);
  });
});

describe("coverage", () => {
  it("accepts the box the engine can read and rejects outside it", () => {
    expect(outsideCoverage(-19.5, 29.8)).toBe(false);
    expect(outsideCoverage(COVERAGE.latMin, COVERAGE.lonMin)).toBe(false);
    expect(outsideCoverage(51.5, -0.1)).toBe(true);
    expect(outsideCoverage(0, 100)).toBe(true);
  });
});
