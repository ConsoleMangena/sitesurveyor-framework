import { supabase } from "../../../lib/supabase/client.ts";

interface SecureFieldResponse {
  text: string | string[];
  error?: string;
}

/**
 * Server-side AES-GCM field encryption/decryption.
 *
 * Used for the "Crypto Wallet" payment method type so the Solana wallet address
 * is encrypted at rest. Other payment method types are not encrypted.
 */
async function invokeSingle(
  action: "encrypt" | "decrypt",
  text: string,
  workspaceId: string,
): Promise<string> {
  const trimmed = (text ?? "").trim();
  if (trimmed === "" || !workspaceId) return trimmed;

  const result = await invoke(action, [trimmed], workspaceId);
  return result[0];
}

async function invoke(
  action: "encrypt" | "decrypt",
  texts: string[],
  workspaceId: string,
): Promise<string[]> {
  const toProcess = texts.map((t) => (t ?? "").trim());

  const { data, error } = await supabase.functions.invoke<SecureFieldResponse>("secure-field", {
    body: { action, text: toProcess, workspaceId },
  });

  if (error) {
    const ctx = (error as { context?: unknown }).context;
    let serverMessage: string | undefined;
    if (ctx instanceof Response) {
      try {
        const parsed = await ctx.clone().json();
        serverMessage = (parsed as { error?: string }).error;
      } catch {
        try {
          serverMessage = await ctx.clone().text();
        } catch {
          /* ignore */
        }
      }
    } else if (ctx && typeof ctx === "object" && "error" in ctx) {
      serverMessage = (ctx as { error?: string }).error;
    }
    throw new Error(serverMessage || error.message || `secure-field ${action} failed`);
  }

  if (!data) {
    throw new Error(`secure-field ${action} returned no data`);
  }

  if (data.error) {
    throw new Error(data.error);
  }

  return Array.isArray(data.text) ? data.text : [data.text];
}

export async function encryptField(text: string, workspaceId: string): Promise<string> {
  return invokeSingle("encrypt", text, workspaceId);
}

export async function decryptField(text: string, workspaceId: string): Promise<string> {
  return invokeSingle("decrypt", text, workspaceId);
}

export async function encryptFields(texts: string[], workspaceId: string): Promise<string[]> {
  return invoke("encrypt", texts, workspaceId);
}

export async function decryptFields(texts: string[], workspaceId: string): Promise<string[]> {
  return invoke("decrypt", texts, workspaceId);
}
