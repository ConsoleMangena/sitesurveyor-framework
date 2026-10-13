import { invoke } from "@tauri-apps/api/core";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { SOLANA_RPC_URL } from "./config";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

interface RpcResponse {
  result?: unknown;
  error?: unknown;
}

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const resp = (await invoke("solana_rpc_request", {
    rpcUrl: SOLANA_RPC_URL,
    method,
    params,
  })) as RpcResponse;

  if (resp.error) {
    throw new Error(`Solana RPC error: ${JSON.stringify(resp.error)}`);
  }

  if (!Object.prototype.hasOwnProperty.call(resp, "result")) {
    throw new Error("Solana RPC response missing result");
  }

  return resp.result;
}

export async function tauriGetBalance(address: string): Promise<number> {
  const result = (await rpcCall("getBalance", [
    address,
    { commitment: "confirmed" },
  ])) as { value: number };
  return (result?.value ?? 0) / LAMPORTS_PER_SOL;
}

export async function tauriGetAccountInfo(
  address: string,
): Promise<{ exists: boolean; lamports?: number }> {
  const result = (await rpcCall("getAccountInfo", [
    address,
    { commitment: "confirmed", encoding: "base64" },
  ])) as { value: { lamports: number } | null };

  if (!result?.value) {
    return { exists: false };
  }

  return { exists: true, lamports: result.value.lamports };
}

export async function tauriGetTokenAccountBalance(
  address: string,
): Promise<{ amount: string; decimals: number; uiAmount: number | null }> {
  const result = (await rpcCall("getTokenAccountBalance", [
    address,
    { commitment: "confirmed" },
  ])) as {
    value: {
      amount: string;
      decimals: number;
      uiAmount: number | null;
    };
  };
  return result.value;
}
