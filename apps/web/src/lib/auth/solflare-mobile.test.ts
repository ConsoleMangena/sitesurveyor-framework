// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nacl from "tweetnacl";
import { base58 } from "@scure/base";

import {
  cancelSolflareMobileAuth,
  continueSolflareMobileAuth,
  createSiwsMessage,
  hasPendingSolflareSignature,
  resumeSolflareMobileAuth,
  shouldResumeSolflareAuth,
  startSolflareMobileAuth,
} from "./solflare-mobile.ts";
import {
  createSolflareDappKeyPair,
  decryptSolflarePayload,
  encryptSolflarePayload,
} from "../../features/phantom/lib/solflareDeeplink.ts";
import { SOLANA_CLUSTER } from "../../features/phantom/lib/config.ts";
import type { SolanaSignUpInput } from "./session.ts";

const STORAGE_KEY = "sitesurveyor.solflare-mobile-auth";
const WALLET_ADDRESS = "9xQeWvG816bUx9EPfC5cJ1nK1rqj1rVY5p6JjN4sQh7T";
const STATEMENT = "Sign in to SiteSurveyor Framework with your Solana account.";
const APP_ORIGIN = "http://localhost:3000";
const APP_HREF = `${APP_ORIGIN}/auth/wallet`;
const SIWS_MESSAGE = [
  "localhost:3000 wants you to sign in with your Solana account:",
  WALLET_ADDRESS,
  "",
  STATEMENT,
  "",
  "Version: 1",
  "URI: http://localhost:3000/",
  "Issued At: 2026-10-31T09:00:00.000Z",
].join("\n");

let assign: ReturnType<typeof vi.fn>;
let replaceState: ReturnType<typeof vi.fn>;

function sharedSecretFor(
  dappPublicKey: string,
  solflareSecretKey: Uint8Array,
): string {
  return base58.encode(
    nacl.box.before(base58.decode(dappPublicKey), solflareSecretKey),
  );
}

interface SeededFlow {
  id: string;
  stage: string;
  createdAt: number;
  dappPublicKey: string;
  dappSecretKey: string;
  intent: string;
  statement: string;
  signup?: SolanaSignUpInput;
  sharedSecret?: string;
  walletAddress?: string;
  session?: string;
  message?: string;
}

function seedFlow(overrides: Partial<SeededFlow> = {}): {
  dapp: ReturnType<typeof createSolflareDappKeyPair>;
  flow: SeededFlow;
} {
  const dapp = createSolflareDappKeyPair();
  const flow: SeededFlow = {
    id: "flow-1",
    stage: "connect",
    createdAt: Date.now(),
    dappPublicKey: dapp.publicKey,
    dappSecretKey: dapp.secretKey,
    intent: "signin",
    statement: STATEMENT,
    ...overrides,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(flow));
  return { dapp, flow };
}

function seedSignStage(): {
  flow: SeededFlow;
  session: string;
  message: string;
} {
  const session = "solflare-session-1";
  const message = SIWS_MESSAGE;
  const { dapp, flow } = seedFlow();
  const solflare = nacl.box.keyPair();
  const sharedSecret = sharedSecretFor(dapp.publicKey, solflare.secretKey);
  const signFlow: SeededFlow = {
    ...flow,
    stage: "sign",
    walletAddress: WALLET_ADDRESS,
    session,
    message,
    sharedSecret,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(signFlow));
  return { flow: signFlow, session, message };
}

function encryptedResponse(
  payload: unknown,
  sharedSecret: string,
): { nonce: string; data: string } {
  const { nonce, payload: data } = encryptSolflarePayload(
    payload,
    sharedSecret,
  );
  return { nonce, data };
}

function connectSearch(
  flow: SeededFlow,
  id = flow.id,
): { search: string; sharedSecret: string } {
  const solflare = nacl.box.keyPair();
  const sharedSecret = sharedSecretFor(flow.dappPublicKey, solflare.secretKey);
  const { nonce, data } = encryptedResponse(
    { public_key: WALLET_ADDRESS, session: "solflare-session-1" },
    sharedSecret,
  );
  const params = new URLSearchParams({
    solflare_flow: id,
    solflare_return: "connect",
    solflare_encryption_public_key: base58.encode(solflare.publicKey),
    nonce,
    data,
  });
  return { search: `?${params.toString()}`, sharedSecret };
}

function signSearch(
  flow: SeededFlow,
  sharedSecret: string,
  signature = new Uint8Array(64).fill(7),
  id = flow.id,
): { search: string; signature: Uint8Array } {
  const { nonce, data } = encryptedResponse(
    { signature: base58.encode(signature) },
    sharedSecret,
  );
  const params = new URLSearchParams({
    solflare_flow: id,
    solflare_return: "sign",
    nonce,
    data,
  });
  return { search: `?${params.toString()}`, signature };
}

function storedFlow(): SeededFlow | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as SeededFlow) : null;
}

function installBrowserStubs(): void {
  assign = vi.fn();
  replaceState = vi.fn();
  vi.stubGlobal("window", {
    location: { origin: APP_ORIGIN, href: APP_HREF, assign },
    history: { state: null, replaceState },
  });

  const entries = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, String(value));
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
    clear: () => entries.clear(),
    key: (index: number) => [...entries.keys()][index] ?? null,
    get length() {
      return entries.size;
    },
  });
}

describe("solflare-mobile", () => {
  beforeEach(() => {
    installBrowserStubs();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("writes the SIWS message auth-js expects", () => {
    expect(
      createSiwsMessage({
        address: WALLET_ADDRESS,
        statement: STATEMENT,
        issuedAt: "2026-10-31T09:00:00.000Z",
        url: "http://localhost:3000/",
      }),
    ).toBe(SIWS_MESSAGE);
  });

  it("opens Solflare's connect approval and persists the flow", () => {
    expect(
      startSolflareMobileAuth({ intent: "signin", statement: STATEMENT }),
    ).toBe(true);

    expect(assign).toHaveBeenCalledTimes(1);
    const url = new URL(assign.mock.calls[0]?.[0] as string);
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://solflare.com/ul/v1/connect",
    );
    expect(url.searchParams.get("app_url")).toBe(APP_ORIGIN);
    expect(url.searchParams.get("cluster")).toBe(SOLANA_CLUSTER);

    const flow = storedFlow();
    expect(flow?.stage).toBe("connect");
    expect(flow?.intent).toBe("signin");
    expect(url.searchParams.get("dapp_encryption_public_key")).toBe(
      flow?.dappPublicKey,
    );

    const redirect = new URL(url.searchParams.get("redirect_link") as string);
    expect(redirect.searchParams.get("solflare_flow")).toBe(flow?.id);
    expect(redirect.searchParams.get("solflare_return")).toBe("connect");
  });

  it("keeps the signup details across the app switch", () => {
    const signup = {
      fullName: "Jane Doe, PLS",
      accountType: "business" as const,
      companyName: "Acme Surveying Ltd",
      email: "jane@acmesurvey.com",
    };

    startSolflareMobileAuth({
      intent: "signup",
      statement: "Create SiteSurveyor Business Account for Jane Doe, PLS",
      signup,
    });

    expect(storedFlow()?.signup).toEqual(signup);
  });

  it("stores the wallet session and SIWS message after connect", () => {
    const { flow } = seedFlow();
    const { search, sharedSecret } = connectSearch(flow);

    expect(shouldResumeSolflareAuth(search)).toBe(true);
    expect(resumeSolflareMobileAuth(search)).toEqual({
      status: "awaiting-signature",
    });

    const saved = storedFlow();
    expect(saved?.stage).toBe("sign");
    expect(saved?.walletAddress).toBe(WALLET_ADDRESS);
    expect(saved?.message).toContain(
      "wants you to sign in with your Solana account:",
    );
    expect(saved?.message).toContain(WALLET_ADDRESS);
    expect(saved?.message).toContain(STATEMENT);
    expect(saved?.sharedSecret).toBe(sharedSecret);
    expect(hasPendingSolflareSignature()).toBe(true);
    expect(replaceState).toHaveBeenCalledWith(null, "", "/auth/wallet");
  });

  it("sends the SIWS message to Solflare for signature", () => {
    const { flow, session, message } = seedSignStage();

    expect(continueSolflareMobileAuth()).toBe(true);

    const url = new URL(assign.mock.calls[0]?.[0] as string);
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://solflare.com/ul/v1/signMessage",
    );
    expect(url.searchParams.get("dapp_encryption_public_key")).toBe(
      flow.dappPublicKey,
    );

    const redirect = new URL(url.searchParams.get("redirect_link") as string);
    expect(redirect.searchParams.get("solflare_flow")).toBe(flow.id);
    expect(redirect.searchParams.get("solflare_return")).toBe("sign");

    const payload = decryptSolflarePayload<{
      message: string;
      session: string;
      display: string;
    }>(
      url.searchParams.get("payload") as string,
      url.searchParams.get("nonce") as string,
      flow.sharedSecret as string,
    );
    expect(new TextDecoder().decode(base58.decode(payload.message))).toBe(
      message,
    );
    expect(payload.session).toBe(session);
    expect(payload.display).toBe("utf8");
  });

  it("completes the flow with the signature Solflare returned", () => {
    const { flow, message } = seedSignStage();
    const { search, signature } = signSearch(
      flow,
      flow.sharedSecret as string,
    );

    const outcome = resumeSolflareMobileAuth(search);

    expect(outcome).toEqual({
      status: "completed",
      intent: "signin",
      signup: undefined,
      message,
      signature,
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(hasPendingSolflareSignature()).toBe(false);
  });

  it("carries signup intent through to the completed outcome", () => {
    const signup = {
      fullName: "Jane Doe, PLS",
      accountType: "personal" as const,
      email: "jane@acmesurvey.com",
    };
    const { flow, message } = seedSignStage();
    const signFlow = { ...flow, intent: "signup", signup };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(signFlow));
    const { search, signature } = signSearch(
      signFlow,
      signFlow.sharedSecret as string,
    );

    expect(resumeSolflareMobileAuth(search)).toEqual({
      status: "completed",
      intent: "signup",
      signup,
      message,
      signature,
    });
  });

  it("treats a rejected app response as a cancellation", () => {
    seedFlow();

    expect(
      resumeSolflareMobileAuth(
        "?solflare_flow=flow-1&solflare_return=connect&errorCode=USER_REJECTED&errorMessage=User%20rejected",
      ),
    ).toEqual({
      status: "error",
      message: "Solflare authorization was cancelled.",
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("rejects a response for a different flow", () => {
    const { flow } = seedFlow();
    const { search } = connectSearch(flow, "another-flow");

    expect(resumeSolflareMobileAuth(search)).toEqual({
      status: "error",
      message: expect.stringMatching(/expired/i),
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("rejects a flow older than fifteen minutes", () => {
    const { flow } = seedFlow({ createdAt: Date.now() - 16 * 60 * 1000 });
    const { search } = connectSearch(flow);

    expect(resumeSolflareMobileAuth(search)).toEqual({
      status: "error",
      message: expect.stringMatching(/expired/i),
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("rejects a response it cannot decrypt", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { flow } = seedFlow();
    const params = new URLSearchParams({
      solflare_flow: flow.id,
      solflare_return: "connect",
      solflare_encryption_public_key: flow.dappPublicKey,
      nonce: base58.encode(new Uint8Array(24)),
      data: base58.encode(new Uint8Array([1, 2, 3])),
    });

    expect(resumeSolflareMobileAuth(`?${params.toString()}`)).toEqual({
      status: "error",
      message: expect.stringMatching(/couldn't verify/i),
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it("does not resume without a Solflare return stage", () => {
    expect(shouldResumeSolflareAuth("?solflare_flow=flow-1")).toBe(false);
    expect(resumeSolflareMobileAuth("?solflare_flow=flow-1")).toBeNull();
  });

  it("refuses to send a signature for an expired flow", () => {
    const { flow } = seedSignStage();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...flow, createdAt: Date.now() - 16 * 60 * 1000 }),
    );

    expect(continueSolflareMobileAuth()).toBe(false);
    expect(assign).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("clears the pending flow when the user cancels", () => {
    seedFlow();
    cancelSolflareMobileAuth();
    expect(hasPendingSolflareSignature()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
