import { beforeEach, describe, expect, it, vi } from "vitest";

const listWorkspaceExtensions = vi.hoisted(() => vi.fn());
const saveWorkspaceExtension = vi.hoisted(() => vi.fn());
const isMissingExtensionTable = vi.hoisted(() => vi.fn());

vi.mock("../../lib/repositories/extensions.ts", () => ({
  listWorkspaceExtensions,
  saveWorkspaceExtension,
  isMissingExtensionTable: (error: unknown) =>
    isMissingExtensionTable(error),
}));

import {
  __resetExtensionsForTests,
  entriesFor,
  extensionEntry,
  getExtensionsSnapshot,
  loadExtensions,
  setExtensionEnabled,
  setExtensionEndpoint,
  setExtensionInstalled,
} from "./store.ts";
import { extensionForView } from "./registry.ts";
import { extensionNavGroups } from "./nav.ts";

const EXTENSION_ID = "satellite-intelligence";
const LOCAL_KEY = `sitesurveyor-extensions:ws-1`;

function missingTable() {
  return Object.assign(new Error('relation "workspace_extensions" does not exist'), {
    code: "42P01",
  });
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    extension_id: EXTENSION_ID,
    installed: true,
    enabled: true,
    config: {},
    ...overrides,
  };
}

function stored(): Record<string, { installed?: boolean; enabled?: boolean; endpoint?: string }> {
  return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "{}");
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  __resetExtensionsForTests();
  isMissingExtensionTable.mockImplementation(
    (error: { code?: string } | null) => error?.code === "42P01",
  );
});

describe("loadExtensions", () => {
  it("reads the workspace once even when several panels mount", async () => {
    listWorkspaceExtensions.mockResolvedValue([]);

    await Promise.all([loadExtensions("ws-1"), loadExtensions("ws-1")]);

    expect(listWorkspaceExtensions).toHaveBeenCalledTimes(1);
    expect(getExtensionsSnapshot().status).toBe("ready");
  });

  it("applies the workspace's saved choices over the manifest defaults", async () => {
    listWorkspaceExtensions.mockResolvedValue([
      row({ enabled: false, config: { endpoint: "https://engine.internal" } }),
    ]);

    await loadExtensions("ws-1");
    const entry = extensionEntry(getExtensionsSnapshot(), EXTENSION_ID);

    expect(entry?.state.enabled).toBe(false);
    expect(entry?.endpoint).toBe("https://engine.internal");
    expect(entry?.usesDefaultEndpoint).toBe(false);
  });

  it("falls back to this browser, and says so, when the table is not pushed", async () => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ [EXTENSION_ID]: { enabled: false } }));
    listWorkspaceExtensions.mockRejectedValue(missingTable());

    await loadExtensions("ws-1");
    const state = getExtensionsSnapshot();

    expect(state.storage).toBe("browser");
    expect(state.status).toBe("ready");
    expect(state.notice).toContain("db:push");
    expect(extensionEntry(state, EXTENSION_ID)?.state.enabled).toBe(false);
  });

  it("keeps a read failure visible instead of pretending the defaults are saved", async () => {
    listWorkspaceExtensions.mockRejectedValue(
      Object.assign(new Error("JWT expired"), { code: "PGRST301" }),
    );

    await loadExtensions("ws-1");

    expect(getExtensionsSnapshot().notice).toContain("JWT expired");
  });
});

describe("writes", () => {
  it("persists a toggle to the workspace row", async () => {
    listWorkspaceExtensions.mockResolvedValue([row({ enabled: false })]);
    saveWorkspaceExtension.mockResolvedValue(row());
    await loadExtensions("ws-1");

    await expect(setExtensionEnabled(EXTENSION_ID, true)).resolves.toBe(true);

    expect(saveWorkspaceExtension).toHaveBeenCalledWith("ws-1", EXTENSION_ID, {
      installed: true,
      enabled: true,
      config: {},
    });
    expect(entriesFor(getExtensionsSnapshot())[0].state.enabled).toBe(true);
  });

  it("drops the contributed nav entry as soon as the extension is off", async () => {
    listWorkspaceExtensions.mockResolvedValue([row()]);
    saveWorkspaceExtension.mockResolvedValue(row({ enabled: false }));
    await loadExtensions("ws-1");

    expect(extensionNavGroups(entriesFor(getExtensionsSnapshot()))[0].items).toHaveLength(1);

    await setExtensionEnabled(EXTENSION_ID, false);

    expect(extensionNavGroups(entriesFor(getExtensionsSnapshot()))).toEqual([]);
  });

  it("uninstalling also switches off, and records both", async () => {
    listWorkspaceExtensions.mockResolvedValue([row()]);
    saveWorkspaceExtension.mockResolvedValue(row({ installed: false, enabled: false }));
    await loadExtensions("ws-1");

    await setExtensionInstalled(EXTENSION_ID, false);
    const state = entriesFor(getExtensionsSnapshot())[0].state;

    expect(state).toMatchObject({ installed: false, enabled: false });
    expect(saveWorkspaceExtension).toHaveBeenLastCalledWith(
      "ws-1",
      EXTENSION_ID,
      expect.objectContaining({ installed: false, enabled: false }),
    );
  });

  it("keeps the change locally when the write proves the table is gone", async () => {
    listWorkspaceExtensions.mockResolvedValue([row({ enabled: false })]);
    saveWorkspaceExtension.mockRejectedValue(missingTable());
    await loadExtensions("ws-1");

    await expect(setExtensionEnabled(EXTENSION_ID, true)).resolves.toBe(true);

    expect(getExtensionsSnapshot().storage).toBe("browser");
    expect(stored()[EXTENSION_ID]).toMatchObject({ enabled: true });
    expect(getExtensionsSnapshot().notice).toContain("workspace_extensions");
  });

  it("trims a trailing slash off the endpoint it saves", async () => {
    listWorkspaceExtensions.mockResolvedValue([]);
    saveWorkspaceExtension.mockResolvedValue(row());
    await loadExtensions("ws-1");

    await setExtensionEndpoint(EXTENSION_ID, "https://engine.internal/");

    expect(getExtensionsSnapshot().overrides[EXTENSION_ID]?.endpoint).toBe(
      "https://engine.internal",
    );
    expect(extensionEntry(getExtensionsSnapshot(), EXTENSION_ID)?.endpoint).toBe(
      "https://engine.internal",
    );
  });

  it("refuses to claim a save the database rejected", async () => {
    listWorkspaceExtensions.mockResolvedValue([row()]);
    saveWorkspaceExtension.mockRejectedValue(
      new Error(
        "Only a workspace owner or admin can change extensions. Ask one to install it for this workspace.",
      ),
    );
    await loadExtensions("ws-1");

    await expect(setExtensionEnabled(EXTENSION_ID, false)).resolves.toBe(false);

    expect(getExtensionsSnapshot().overrides[EXTENSION_ID]?.enabled).toBe(true);
    expect(getExtensionsSnapshot().notice).toContain("owner or admin");
  });
});

describe("registry", () => {
  it("knows which extension owns a contributed view", () => {
    expect(extensionForView("satellite")?.id).toBe(EXTENSION_ID);
    expect(extensionForView("dashboard")).toBeUndefined();
  });
});
