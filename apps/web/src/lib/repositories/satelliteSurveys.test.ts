import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  InsufficientCreditsError,
  parseSurveyResult,
  startSurvey,
  surveyTilesSource,
  toSurveyRun,
  type SurveyDeliverable,
} from "./satelliteSurveys.ts";
import { supabase } from "../supabase/client.ts";

vi.mock("../supabase/client.ts", () => ({
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  supabase: {
    auth: { getSession: vi.fn() },
    functions: { invoke: vi.fn() },
    from: vi.fn(),
    rpc: vi.fn(),
    storage: { from: vi.fn(() => ({ createSignedUrl: vi.fn() })) },
  },
}));

const invokeMock = vi.mocked(supabase.functions.invoke);

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "0f0f0f0f-0000-4000-8000-000000000001",
    workspace_id: "0f0f0f0f-0000-4000-8000-000000000002",
    status: "succeeded",
    stage: "done",
    progress: 100,
    latitude: -19.50487,
    longitude: 29.84598,
    half_deg: 0.12,
    categories: ["water", "minerals"],
    client_name: "Kopje Farm",
    address: null,
    estimated_minutes: 7,
    error_message: null,
    created_at: "2026-11-06T10:00:00Z",
    completed_at: "2026-11-06T10:07:00Z",
    result: null,
    ...overrides,
  };
}

describe("parseSurveyResult", () => {
  it("reads the four dossier categories in order", () => {
    const parsed = parseSurveyResult({
      executive_summary: "Two targets worth walking to.",
      claim_ceiling: "Priority only.",
      score_basis: "relative_to_aoi_percentile",
      data_sources: {
        selectable: {
          dem: { coverage: "dem_cop_30", label: "Copernicus DEM 30 m" },
          optical: {
            coverage: "s2_l2a",
            label: "Sentinel-2 L2A (clear-scene composite), dry season 2023",
            credit: "Copernicus Sentinel-2",
          },
        },
        fixed: { rainfall: "CHIRPS monthly rainfall, 24-month mean" },
      },
      scores: {
        groundwater: { cell_score: 61.4, cell_class: "Moderate" },
        minerals: { cell_score: 12.5, cell_class: "Low" },
        soil_land: { cell_score: 44, cell_class: "Moderate" },
        hazard_safety: { safety_score: 78, hazard_class: "Safe" },
      },
    });

    expect(parsed?.scores.map((score) => score.category)).toEqual([
      "water",
      "minerals",
      "soil_land",
      "hazard_safety",
    ]);
    expect(parsed?.scores[0]).toMatchObject({ score: 61.4, klass: "Moderate" });
    // Hazard answers with the safety score, not the hazard index.
    expect(parsed?.scores[3]).toMatchObject({ score: 78, klass: "Safe" });
    expect(parsed?.dataSources.selectable.optical).toMatchObject({
      coverage: "s2_l2a",
      credit: "Copernicus Sentinel-2",
    });
    expect(parsed?.dataSources.fixed).toEqual({
      rainfall: "CHIRPS monthly rainfall, 24-month mean",
    });
  });

  it("names the coverage a layer was read from, not the one the form asked for", () => {
    // A cache hit on an older raster is the case provenance exists for: the label the
    // workbench prints has to be the pixels the score came from.
    const parsed = parseSurveyResult({
      data_sources: {
        selectable: { optical: { coverage: "gm_s2_annual", label: "Sentinel-2 Annual GeoMAD" } },
      },
    });

    expect(parsed?.dataSources.selectable.optical?.label).toBe("Sentinel-2 Annual GeoMAD");
  });

  it("reads a bare coverage id as both id and name", () => {
    const parsed = parseSurveyResult({ data_sources: { selectable: { dem: "srtm" } } });

    expect(parsed?.dataSources.selectable.dem).toEqual({
      coverage: "srtm",
      label: "srtm",
      credit: null,
    });
  });

  it("leaves a category it was never scored on unscored rather than at zero", () => {
    const parsed = parseSurveyResult({ scores: { groundwater: { cell_score: 30 } } });

    expect(parsed?.scores[0].score).toBe(30);
    expect(parsed?.scores.map((score) => score.score).slice(1)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("survives a result the engine changed shape underneath", () => {
    expect(parseSurveyResult(null)).toBeNull();
    expect(parseSurveyResult("a string")).toBeNull();
    expect(parseSurveyResult({})).toMatchObject({
      summary: null,
      claimCeiling: null,
      dataSources: { selectable: {}, fixed: {} },
      target: null,
    });
  });

  it("keeps a numeric string that PostgREST would have handed back", () => {
    const parsed = parseSurveyResult({ scores: { minerals: { cell_score: "41.5" } } });

    expect(parsed?.scores[1].score).toBe(41.5);
  });
});

describe("toSurveyRun", () => {
  it("flags only the statuses a worker can still move", () => {
    expect(toSurveyRun(runRow({ status: "surveying" }) as never).active).toBe(true);
    expect(toSurveyRun(runRow({ status: "queued" }) as never).active).toBe(true);
    expect(toSurveyRun(runRow({ status: "succeeded" }) as never).active).toBe(false);
    expect(toSurveyRun(runRow({ status: "cancelled" }) as never).active).toBe(false);
  });

  it("treats a status the app has never seen as finished, not as forever running", () => {
    const run = toSurveyRun(runRow({ status: "exploding" }) as never);

    expect(run.status).toBe("failed");
    expect(run.active).toBe(false);
  });

  it("parses the result blob it carries", () => {
    const run = toSurveyRun(
      runRow({ result: { executive_summary: "Water at 61.4" } }) as never,
    );

    expect(run.result?.summary).toBe("Water at 61.4");
  });
});

describe("startSurvey", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  const input = {
    workspaceId: "0f0f0f0f-0000-4000-8000-000000000002",
    latitude: -19.5,
    longitude: 29.8,
    halfDeg: 0.12,
    categories: ["water"] as const,
    clientName: "Kopje Farm",
    address: "",
  };

  it("returns the row the platform queued", async () => {
    invokeMock.mockResolvedValue({
      data: { run: runRow({ status: "queued" }), creditsCharged: 20, remainingBalance: 180 },
      error: null,
    } as never);

    const outcome = await startSurvey(input as never);

    expect(outcome.run.status).toBe("queued");
    expect(outcome.creditsCharged).toBe(20);
    expect(outcome.remainingBalance).toBe(180);
  });

  it("turns a refusal into something only Billing can answer", async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: "Failed to fetch", context: { status: 402 } },
    } as never);

    await expect(startSurvey(input as never)).rejects.toBeInstanceOf(
      InsufficientCreditsError,
    );
  });

  it("carries the reason the platform gave", async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: {
        message: "error",
        context: {
          status: 400,
          json: () => Promise.resolve({ error: "Pick at least one category." }),
        },
      },
    } as never);

    await expect(startSurvey(input as never)).rejects.toThrow(
      "Pick at least one category.",
    );
  });
});

describe("surveyTilesSource", () => {
  const deliverable: SurveyDeliverable = {
    id: "0f0f0f0f-0000-4000-8000-000000000003",
    runId: "0f0f0f0f-0000-4000-8000-000000000001",
    kind: "groundwater_tiles",
    storagePath: "0f0f0f0f-0000-4000-8000-000000000002/0f0f0f0f-0000-4000-8000-000000000001/groundwater_potential_zones_tiles.pmtiles",
    contentType: "application/octet-stream",
    sizeBytes: 48691,
  };

  const fetchMock = vi.fn();
  const sessionMock = vi.mocked(supabase.auth.getSession);

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    sessionMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serves one byte slice through the range proxy with the live token", async () => {
    sessionMock.mockResolvedValue({
      data: { session: { access_token: "token-1" } as never },
    } as never);
    fetchMock.mockResolvedValue(
      new Response(new ArrayBuffer(10), { status: 206 }),
    );

    const source = surveyTilesSource(deliverable);
    const { data } = await source.getBytes(16384, 512);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/functions/v1/deliverable-file?path=" +
        encodeURIComponent(deliverable.storagePath),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token-1",
          Range: "bytes=16384-16895",
        }),
        cache: "no-store",
      }),
    );
    expect(data.byteLength).toBe(10);
  });

  it("falls back to slicing when a hop ignored the Range header", async () => {
    // A 200 for a range request means something between the reader and
    // Storage chose to mail the entire file; the reader cannot digest a
    // directory window made of the wrong bytes.
    sessionMock.mockResolvedValue({
      data: { session: { access_token: "token-1" } as never },
    } as never);
    const whole = new Uint8Array(100).map((_, index) => index).buffer;
    fetchMock.mockResolvedValue(new Response(whole, { status: 200 }));

    const source = surveyTilesSource(deliverable);
    const { data } = await source.getBytes(10, 4);

    expect(data.byteLength).toBe(4);
    expect(new DataView(data).getUint8(0)).toBe(10);
  });

  it("refuses to read anything without a signed-in session", async () => {
    sessionMock.mockResolvedValue({ data: { session: null } } as never);

    const source = surveyTilesSource(deliverable);
    await expect(source.getBytes(0, 16)).rejects.toThrow("Sign in");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a failing proxy as an error the overlay can fall back on", async () => {
    sessionMock.mockResolvedValue({
      data: { session: { access_token: "token-1" } as never },
    } as never);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Deliverable not found." }), { status: 404 }),
    );

    const source = surveyTilesSource(deliverable);
    await expect(source.getBytes(0, 16)).rejects.toThrow("404");
  });

  it("keys the reader's cache by the exact object it reads", () => {
    const source = surveyTilesSource(deliverable);
    expect(source.getKey()).toBe(`survey-deliverables/${deliverable.storagePath}`);
  });
});
