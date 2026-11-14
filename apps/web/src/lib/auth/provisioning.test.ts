import { describe, expect, it, vi, beforeEach } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  provisionAccount,
  ensureAccountProvisioned,
  provisioningDefaultsFromUser,
  ProvisioningError,
} from "./provisioning.ts";

interface QueryCall {
  table: string;
  chain: string[];
  args: unknown[];
}

interface TableRule {
  table: string;
  match: (chain: string[]) => boolean;
  result?: { data?: unknown; error?: { message: string } | null };
  /** Answers in order — for a write that fails once and succeeds on retry. */
  results?: { data?: unknown; error?: { message: string } | null }[];
}

const { mockSupabase, tableState, mockGetSignInProfile, mockRepairSignInProfile } =
  vi.hoisted(() => {
    const tableState = {
      calls: [] as QueryCall[],
      rules: [] as TableRule[],
      rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
      rpcResult: { data: null, error: null } as {
        data: unknown;
        error: { message: string } | null;
      },
      updateUser: vi.fn(async () => ({ data: { user: {} }, error: null })),
    };

    const defaultResult = (table: string, chain: string[]) => {
      if (table === "workspace_members") return { data: [], error: null };
      if (chain.includes("upsert") || chain.includes("update")) {
        return { data: null, error: null };
      }
      return { data: null, error: null };
    };

    const resolve = (table: string, chain: string[]) => {
      const rule = tableState.rules.find(
        (r) => r.table === table && r.match(chain),
      );
      if (!rule) return defaultResult(table, chain);
      if (rule.results?.length) {
        return rule.results.length > 1
          ? (rule.results.shift() as (typeof rule.results)[number])
          : rule.results[0];
      }
      return rule.result ?? defaultResult(table, chain);
    };

    const makeBuilder = (table: string) => {
      const chain: string[] = [];
      const call: QueryCall = { table, chain, args: [] };
      tableState.calls.push(call);
      const builder: Record<string, unknown> = {};
      const chainMethod =
        (name: string) =>
        (...args: unknown[]) => {
          chain.push(name);
          call.args.push(args);
          return builder;
        };
      for (const name of [
        "select",
        "upsert",
        "update",
        "insert",
        "eq",
        "neq",
        "limit",
        "order",
      ]) {
        builder[name] = chainMethod(name);
      }
      builder.maybeSingle = chainMethod("maybeSingle");
      builder.single = chainMethod("single");
      builder.then = (
        onFulfilled: (value: unknown) => unknown,
        onRejected: (reason: unknown) => unknown,
      ) =>
        Promise.resolve(resolve(table, chain)).then(onFulfilled, onRejected);
      return builder;
    };

    const supabase = {
      from: (table: string) => makeBuilder(table),
      rpc: (fn: string, args: Record<string, unknown>) => {
        tableState.rpcCalls.push({ fn, args });
        return {
          then: (
            onFulfilled: (value: unknown) => unknown,
            onRejected: (reason: unknown) => unknown,
          ) => Promise.resolve(tableState.rpcResult).then(onFulfilled, onRejected),
        };
      },
      auth: { updateUser: tableState.updateUser },
    };

    return {
      mockSupabase: supabase,
      tableState,
      mockGetSignInProfile: vi.fn(),
      mockRepairSignInProfile: vi.fn(async (..._args: unknown[]) => undefined),
    };
  });

vi.mock("../supabase/client.ts", () => ({ supabase: mockSupabase }));
vi.mock("../repositories/profiles.ts", () => ({
  getSignInProfile: (...args: unknown[]) => mockGetSignInProfile(...args),
  repairSignInProfile: (...args: unknown[]) => mockRepairSignInProfile(...args),
}));

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "sam@example.com",
    user_metadata: {
      full_name: "Sam Surveyor",
      account_type: "personal",
      contact_email: "sam@example.com",
    },
    app_metadata: {},
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as unknown as User;
}

const COMPLETE_PROFILE = {
  full_name: "Sam Surveyor",
  email: "sam@example.com",
  auth_signup_account_type: "personal",
};

function profileWrites() {
  return tableState.calls.filter(
    (c) => c.table === "profiles" && (c.chain.includes("upsert") || c.chain.includes("update")),
  );
}

describe("provisioningDefaultsFromUser", () => {
  it("reads name, account type, company and email from Auth metadata", () => {
    const defaults = provisioningDefaultsFromUser(
      makeUser({
        user_metadata: {
          full_name: "Ada Surveyor",
          account_type: "business",
          company: "Ada Surveys Ltd",
        },
      } as Partial<User>),
    );

    expect(defaults).toEqual({
      fullName: "Ada Surveyor",
      accountType: "business",
      companyName: "Ada Surveys Ltd",
      email: "sam@example.com",
    });
  });

  it("falls back to personal and tolerates missing metadata", () => {
    const defaults = provisioningDefaultsFromUser(
      makeUser({ email: undefined, user_metadata: {} } as Partial<User>),
    );

    expect(defaults.accountType).toBe("personal");
    expect(defaults.fullName).toBe("");
    expect(defaults.email).toBeNull();
  });
});

describe("provisionAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableState.calls.length = 0;
    tableState.rpcCalls.length = 0;
    tableState.rules.length = 0;
    tableState.rpcResult = { data: null, error: null };
    tableState.updateUser.mockResolvedValue({ data: { user: {} }, error: null });
    mockGetSignInProfile.mockResolvedValue(null);
  });

  it("creates the profile row for a brand-new account", async () => {
    const outcome = await provisionAccount(makeUser());

    expect(outcome).toEqual({ created: true });
    const write = profileWrites()[0];
    expect(write.chain).toContain("upsert");
    expect(write.args[0]).toEqual([
      {
        id: "user-1",
        full_name: "Sam Surveyor",
        email: "sam@example.com",
        auth_signup_account_type: "personal",
      },
      { onConflict: "id" },
    ]);
    expect(tableState.rpcCalls).toHaveLength(0); // personal: trigger handles it
  });

  it("mirrors the profile into Auth metadata when it is not there yet", async () => {
    await provisionAccount(
      makeUser({
        user_metadata: {
          full_name: "Sam Surveyor",
          account_type: "personal",
        },
      } as Partial<User>),
    );

    expect(tableState.updateUser).toHaveBeenCalledTimes(1);
    expect(tableState.updateUser).toHaveBeenCalledWith({
      data: {
        full_name: "Sam Surveyor",
        account_type: "personal",
        contact_email: "sam@example.com",
      },
    });
  });

  it("does not touch Auth metadata that already matches", async () => {
    await provisionAccount(makeUser());

    expect(tableState.updateUser).not.toHaveBeenCalled();
  });

  it("never overwrites profile values the user already has", async () => {
    mockGetSignInProfile.mockResolvedValue(COMPLETE_PROFILE);

    const outcome = await provisionAccount(
      makeUser({
        user_metadata: {
          full_name: "Different Name",
          account_type: "personal",
          contact_email: "other@example.com",
        },
      } as Partial<User>),
    );

    expect(outcome).toEqual({ created: false });
    expect(profileWrites()).toHaveLength(0);
  });

  it("fills only the empty columns of an existing profile", async () => {
    mockGetSignInProfile.mockResolvedValue({
      full_name: "",
      email: "kept@example.com",
      auth_signup_account_type: "personal",
    });

    await provisionAccount(
      makeUser({
        email: "new@example.com",
        user_metadata: {
          full_name: "Sam Surveyor",
          account_type: "personal",
          contact_email: "new@example.com",
        },
      } as Partial<User>),
    );

    const write = profileWrites()[0];
    expect(write.chain).toContain("update");
    expect(write.args[0]).toEqual([{ full_name: "Sam Surveyor" }]);
    const patch = write.args[0] as [Record<string, unknown>];
    expect(patch[0]).not.toHaveProperty("email");
  });

  it("reports EMAIL_REQUIRED for an account with no address at all", async () => {
    const outcome = await provisionAccount(
      makeUser({ email: undefined, user_metadata: { full_name: "No Mail" } } as Partial<User>),
    );

    expect(outcome).toEqual({ blocker: "EMAIL_REQUIRED", created: false });
    expect(mockGetSignInProfile).not.toHaveBeenCalled();
    expect(profileWrites()).toHaveLength(0);
  });

  it("reports DETAILS_REQUIRED for a brand-new account with no name", async () => {
    mockGetSignInProfile.mockResolvedValue(null);

    // The caller supplies the account type (repair path), so this is not a
    // provider signup even though the metadata is empty.
    const outcome = await provisionAccount(
      makeUser({ user_metadata: {} } as Partial<User>),
      { accountType: "personal" },
    );

    expect(outcome).toEqual({ blocker: "DETAILS_REQUIRED", created: false });
    expect(profileWrites()).toHaveLength(0);
  });

  it("reports ONBOARDING_REQUIRED for a provider signup before the survey", async () => {
    // Provider shape: an email on the session but no account_type metadata —
    // exactly what the signup trigger leaves Google/GitHub accounts with.
    mockGetSignInProfile.mockResolvedValue({
      full_name: "Sam Ranger",
      email: "sam@example.com",
      auth_signup_account_type: null,
    });

    const outcome = await provisionAccount(
      makeUser({ user_metadata: {} } as Partial<User>),
    );

    expect(outcome).toEqual({ blocker: "ONBOARDING_REQUIRED", created: false });
    expect(profileWrites()).toHaveLength(0);
    expect(tableState.rpcCalls).toHaveLength(0);
  });

  it("retries the create without an email when another account claims it", async () => {
    tableState.rules.push({
      table: "profiles",
      match: (chain) => chain.includes("upsert"),
      results: [
        {
          data: null,
          error: {
            message:
              'duplicate key value violates unique constraint "profiles_email_key"',
          },
        },
        { data: null, error: null },
      ],
    });

    const outcome = await provisionAccount(makeUser());

    expect(outcome).toEqual({ created: true });
    const writes = profileWrites();
    expect(writes).toHaveLength(2);
    const retry = writes[1].args[0] as [Record<string, unknown>];
    expect(retry[0]).not.toHaveProperty("email");
    expect(retry[0]).toMatchObject({ id: "user-1", full_name: "Sam Surveyor" });
  });

  it("retries the repair without an email when another account claims it", async () => {
    mockGetSignInProfile.mockResolvedValue({
      full_name: "Sam Surveyor",
      email: "",
      auth_signup_account_type: "personal",
    });
    tableState.rules.push({
      table: "profiles",
      match: (chain) => chain.includes("update"),
      results: [
        {
          data: null,
          error: {
            message:
              'duplicate key value violates unique constraint "profiles_email_key"',
          },
        },
        { data: null, error: null },
      ],
    });

    const outcome = await provisionAccount(
      makeUser({
        user_metadata: {
          full_name: "Sam Surveyor",
          account_type: "personal",
          contact_email: "sam@example.com",
        },
      } as Partial<User>),
    );

    expect(outcome).toEqual({ created: false });
    const writes = profileWrites();
    // The email was the only missing column, so the retry writes nothing and
    // no empty PATCH goes to PostgREST.
    expect(writes).toHaveLength(1);
    expect(writes[0].args[0]).toEqual([{ email: "sam@example.com" }]);
  });

  it("keeps the other repair columns when the email is contested", async () => {
    mockGetSignInProfile.mockResolvedValue({
      full_name: "",
      email: "",
      auth_signup_account_type: "personal",
    });
    tableState.rules.push({
      table: "profiles",
      match: (chain) => chain.includes("update"),
      results: [
        {
          data: null,
          error: {
            message:
              'duplicate key value violates unique constraint "profiles_email_key"',
          },
        },
        { data: null, error: null },
      ],
    });

    await provisionAccount(makeUser());

    const writes = profileWrites();
    expect(writes).toHaveLength(2);
    expect(writes[0].args[0]).toEqual([
      { full_name: "Sam Surveyor", email: "sam@example.com" },
    ]);
    expect(writes[1].args[0]).toEqual([{ full_name: "Sam Surveyor" }]);
  });

  it("throws PROFILE_UNREADABLE when the profile write fails", async () => {
    tableState.rules.push({
      table: "profiles",
      match: (chain) => chain.includes("upsert"),
      result: { error: { message: "permission denied for table profiles" } },
    });

    await expect(provisionAccount(makeUser())).rejects.toMatchObject({
      name: "ProvisioningError",
      blocker: "PROFILE_UNREADABLE",
      message: "permission denied for table profiles",
    });
  });

  it("does not retry an update refused for another reason", async () => {
    mockGetSignInProfile.mockResolvedValue({
      full_name: "Sam Surveyor",
      email: "",
      auth_signup_account_type: "personal",
    });
    tableState.rules.push({
      table: "profiles",
      match: (chain) => chain.includes("update"),
      result: {
        error: {
          message: 'new row violates row-level security policy for table "profiles"',
        },
      },
    });

    await expect(provisionAccount(makeUser())).rejects.toMatchObject({
      name: "ProvisioningError",
      blocker: "PROFILE_UNREADABLE",
    });
    expect(profileWrites()).toHaveLength(1);
  });

  it("creates a business workspace only when none exists yet", async () => {
    mockGetSignInProfile.mockResolvedValue(COMPLETE_PROFILE);
    tableState.rules.push({
      table: "profiles",
      match: (chain) => chain.includes("maybeSingle"),
      result: { data: null, error: null },
    });

    const outcome = await provisionAccount(
      makeUser({
        user_metadata: {
          full_name: "Sam Surveyor",
          account_type: "business",
          company: "Sam Surveys",
          contact_email: "sam@example.com",
        },
      } as Partial<User>),
    );

    expect(tableState.rpcCalls).toEqual([
      { fn: "create_business_workspace", args: { workspace_name: "Sam Surveys" } },
    ]);
    expect(outcome.created).toBe(true);
  });

  it("skips the workspace RPC when the account already has one", async () => {
    mockGetSignInProfile.mockResolvedValue(COMPLETE_PROFILE);
    tableState.rules.push({
      table: "workspace_members",
      match: () => true,
      result: { data: [{ workspace_id: "ws-1" }], error: null },
    });

    await provisionAccount(
      makeUser({
        user_metadata: {
          full_name: "Sam Surveyor",
          account_type: "business",
          contact_email: "sam@example.com",
        },
      } as Partial<User>),
    );

    expect(tableState.rpcCalls).toHaveLength(0);
  });

  it("treats an already-existing workspace as success", async () => {
    mockGetSignInProfile.mockResolvedValue(COMPLETE_PROFILE);
    tableState.rules.push({
      table: "profiles",
      match: (chain) => chain.includes("maybeSingle"),
      result: { data: null, error: null },
    });
    tableState.rpcResult = {
      data: null,
      error: { message: 'duplicate key value violates unique constraint "workspaces_pkey"' },
    };

    const outcome = await provisionAccount(
      makeUser({
        user_metadata: {
          full_name: "Sam Surveyor",
          account_type: "business",
          company: "Sam Surveys",
          contact_email: "sam@example.com",
        },
      } as Partial<User>),
    );

    expect(outcome.created).toBe(false);
  });
});

describe("ensureAccountProvisioned", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableState.calls.length = 0;
    tableState.rpcCalls.length = 0;
    tableState.rules.length = 0;
    tableState.updateUser.mockResolvedValue({ data: { user: {} }, error: null });
    mockGetSignInProfile.mockResolvedValue(null);
  });

  it("throws an EMAIL_REQUIRED ProvisioningError for private-email accounts", async () => {
    await expect(
      ensureAccountProvisioned(
        makeUser({ email: undefined, user_metadata: {} } as Partial<User>),
      ),
    ).rejects.toMatchObject({
      name: "ProvisioningError",
      blocker: "EMAIL_REQUIRED",
    });
  });

  it("throws a DETAILS_REQUIRED ProvisioningError when there is no name", async () => {
    await expect(
      ensureAccountProvisioned(makeUser({ user_metadata: {} } as Partial<User>), {
        accountType: "personal",
      }),
    ).rejects.toMatchObject({
      name: "ProvisioningError",
      blocker: "DETAILS_REQUIRED",
    });
  });

  it("throws an ONBOARDING_REQUIRED ProvisioningError for a provider signup", async () => {
    mockGetSignInProfile.mockResolvedValue({
      full_name: "Sam Ranger",
      email: "sam@example.com",
      auth_signup_account_type: null,
    });

    await expect(
      ensureAccountProvisioned(makeUser({ user_metadata: {} } as Partial<User>)),
    ).rejects.toMatchObject({
      name: "ProvisioningError",
      blocker: "ONBOARDING_REQUIRED",
    });
  });

  it("returns the outcome for a complete account", async () => {
    mockGetSignInProfile.mockResolvedValue(COMPLETE_PROFILE);

    await expect(ensureAccountProvisioned(makeUser())).resolves.toEqual({
      created: false,
    });
  });

  it("keeps the blocker and message on ProvisioningError instances", () => {
    const err = new ProvisioningError("EMAIL_REQUIRED", "Add an email.");
    expect(err).toBeInstanceOf(Error);
    expect(err.blocker).toBe("EMAIL_REQUIRED");
    expect(err.message).toBe("Add an email.");
  });
});
