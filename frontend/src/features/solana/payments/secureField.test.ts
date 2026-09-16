import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { encryptField, decryptField, encryptFields, decryptFields } from "./secureField.ts";
import { supabase } from "../../../lib/supabase/client.ts";

vi.mock("../../../lib/supabase/client.ts", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe("secureField", () => {
  const invokeMock = (supabase.functions.invoke as unknown as Mock);

  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("encrypts non-empty text via the secure-field Edge Function", async () => {
    invokeMock.mockResolvedValue({ data: { text: "enc:v1:cipher" }, error: null });

    const result = await encryptField("solana-address", "ws-1");

    expect(result).toBe("enc:v1:cipher");
    expect(invokeMock).toHaveBeenCalledWith("secure-field", {
      body: { action: "encrypt", text: ["solana-address"], workspaceId: "ws-1" },
    });
  });

  it("decrypts non-empty text via the secure-field Edge Function", async () => {
    invokeMock.mockResolvedValue({ data: { text: "solana-address" }, error: null });

    const result = await decryptField("enc:v1:cipher", "ws-1");

    expect(result).toBe("solana-address");
    expect(invokeMock).toHaveBeenCalledWith("secure-field", {
      body: { action: "decrypt", text: ["enc:v1:cipher"], workspaceId: "ws-1" },
    });
  });

  it("returns empty strings without calling the function", async () => {
    const result = await encryptField("", "ws-1");
    expect(result).toBe("");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("throws when the Edge Function returns an error", async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(encryptField("text", "ws-1")).rejects.toThrow("boom");
  });

  it("throws when the response payload contains an error", async () => {
    invokeMock.mockResolvedValue({ data: { error: "not authorized" }, error: null });

    await expect(encryptField("text", "ws-1")).rejects.toThrow("not authorized");
  });

  it("encrypts multiple fields in one call", async () => {
    invokeMock.mockResolvedValue({
      data: { text: ["enc:detail", "enc:holder", "enc:expiry"] },
      error: null,
    });

    const result = await encryptFields(["detail", "holder", "expiry"], "ws-1");

    expect(result).toEqual(["enc:detail", "enc:holder", "enc:expiry"]);
    expect(invokeMock).toHaveBeenCalledWith("secure-field", {
      body: { action: "encrypt", text: ["detail", "holder", "expiry"], workspaceId: "ws-1" },
    });
  });

  it("decrypts multiple fields in one call", async () => {
    invokeMock.mockResolvedValue({
      data: { text: ["detail", "holder", "expiry"] },
      error: null,
    });

    const result = await decryptFields(["enc:detail", "enc:holder", "enc:expiry"], "ws-1");

    expect(result).toEqual(["detail", "holder", "expiry"]);
    expect(invokeMock).toHaveBeenCalledWith("secure-field", {
      body: { action: "decrypt", text: ["enc:detail", "enc:holder", "enc:expiry"], workspaceId: "ws-1" },
    });
  });
});
