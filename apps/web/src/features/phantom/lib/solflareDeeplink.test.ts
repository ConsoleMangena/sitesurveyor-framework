import { describe, expect, it, vi } from "vitest";
import nacl from "tweetnacl";
import { base58 } from "@scure/base";

import {
  buildSolflareConnectUrl,
  buildSolflareRedirectLink,
  buildSolflareSignMessageUrl,
  createSolflareDappKeyPair,
  decryptSolflarePayload,
  deriveSolflareSharedSecret,
  encryptSolflarePayload,
  readSolflareRedirect,
  stripSolflareRedirectParams,
} from "./solflareDeeplink.ts";

function solflareSharedSecret(
  dappPublicKey: string,
  solflareSecretKey: Uint8Array,
): string {
  return base58.encode(
    nacl.box.before(base58.decode(dappPublicKey), solflareSecretKey),
  );
}

describe("solflareDeeplink", () => {
  it("derives the same shared secret on both sides of the box", () => {
    const dapp = createSolflareDappKeyPair();
    const solflare = nacl.box.keyPair();

    expect(base58.decode(dapp.publicKey)).toHaveLength(
      nacl.box.publicKeyLength,
    );
    expect(base58.decode(dapp.secretKey)).toHaveLength(
      nacl.box.secretKeyLength,
    );

    const fromDapp = deriveSolflareSharedSecret(
      base58.encode(solflare.publicKey),
      dapp.secretKey,
    );
    const fromWallet = solflareSharedSecret(dapp.publicKey, solflare.secretKey);

    expect(fromDapp).toBe(fromWallet);
  });

  it("round-trips an encrypted Solflare response", () => {
    const dapp = createSolflareDappKeyPair();
    const solflare = nacl.box.keyPair();
    const sharedSecret = deriveSolflareSharedSecret(
      base58.encode(solflare.publicKey),
      dapp.secretKey,
    );

    const response = { signature: base58.encode(new Uint8Array(64).fill(9)) };
    const { nonce, payload } = encryptSolflarePayload(
      response,
      sharedSecret,
    );

    expect(
      decryptSolflarePayload<typeof response>(payload, nonce, sharedSecret),
    ).toEqual(response);
    expect(() =>
      decryptSolflarePayload(
        base58.encode(new Uint8Array([1, 2, 3])),
        nonce,
        sharedSecret,
      ),
    ).toThrow(/could not be decrypted/i);
  });

  it("builds the connect deeplink without a browser bridge", () => {
    const url = new URL(
      buildSolflareConnectUrl({
        dappEncryptionPublicKey: "DappKey111",
        redirectLink: "https://app.test/auth/wallet?solflare_return=connect",
        cluster: "devnet",
      }),
    );

    expect(`${url.origin}${url.pathname}`).toBe(
      "https://solflare.com/ul/v1/connect",
    );
    expect(url.searchParams.get("app_url")).toBe(window.location.origin);
    expect(url.searchParams.get("dapp_encryption_public_key")).toBe(
      "DappKey111",
    );
    expect(url.searchParams.get("redirect_link")).toBe(
      "https://app.test/auth/wallet?solflare_return=connect",
    );
    expect(url.searchParams.get("cluster")).toBe("devnet");
  });

  it("builds the signMessage deeplink with the encrypted payload", () => {
    const url = new URL(
      buildSolflareSignMessageUrl({
        dappEncryptionPublicKey: "DappKey111",
        nonce: "Nonce222",
        payload: "Payload333",
        redirectLink: "https://app.test/auth/wallet?solflare_return=sign",
      }),
    );

    expect(`${url.origin}${url.pathname}`).toBe(
      "https://solflare.com/ul/v1/signMessage",
    );
    expect(url.searchParams.get("dapp_encryption_public_key")).toBe(
      "DappKey111",
    );
    expect(url.searchParams.get("nonce")).toBe("Nonce222");
    expect(url.searchParams.get("payload")).toBe("Payload333");
    expect(url.searchParams.get("redirect_link")).toBe(
      "https://app.test/auth/wallet?solflare_return=sign",
    );
  });

  it("builds a clean return link that keeps unrelated params", () => {
    const link = new URL(
      buildSolflareRedirectLink(
        "sign",
        "flow-7",
        "https://app.test/auth/wallet?keep=1&nonce=old&data=old&solflare_return=connect#top",
      ),
    );

    expect(link.origin + link.pathname).toBe("https://app.test/auth/wallet");
    expect(link.searchParams.get("keep")).toBe("1");
    expect(link.searchParams.get("solflare_flow")).toBe("flow-7");
    expect(link.searchParams.get("solflare_return")).toBe("sign");
    expect(link.searchParams.has("nonce")).toBe(false);
    expect(link.searchParams.has("data")).toBe(false);
    expect(link.hash).toBe("#top");
  });

  it("reads connect, sign and error redirects", () => {
    expect(
      readSolflareRedirect(
        "?solflare_return=connect&solflare_flow=f1&solflare_encryption_public_key=SF&nonce=N&data=D",
      ),
    ).toEqual({
      kind: "connect",
      flowId: "f1",
      solflareEncryptionPublicKey: "SF",
      nonce: "N",
      data: "D",
    });

    expect(
      readSolflareRedirect(
        "?solflare_return=sign&solflare_flow=f1&nonce=N&data=D",
      ),
    ).toEqual({ kind: "sign", flowId: "f1", nonce: "N", data: "D" });

    expect(
      readSolflareRedirect(
        "?solflare_return=connect&solflare_flow=f1&errorCode=USER_REJECTED&errorMessage=Rejected",
      ),
    ).toEqual({
      kind: "error",
      flowId: "f1",
      errorCode: "USER_REJECTED",
      errorMessage: "Rejected",
    });

    expect(readSolflareRedirect("?solflare_flow=f1")).toBeNull();
    expect(readSolflareRedirect("")).toBeNull();
  });

  it("strips the response params from the address bar", () => {
    const replaceState = vi
      .spyOn(window.history, "replaceState")
      .mockImplementation(() => undefined);

    stripSolflareRedirectParams(
      `${window.location.origin}/auth/wallet?keep=1&solflare_flow=f1&solflare_return=sign&nonce=N&data=D&solflare_encryption_public_key=SF&errorCode=E&errorMessage=M`,
    );

    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState.mock.calls[0]?.[2]).toBe("/auth/wallet?keep=1");
  });
});
