/**
 * Edge Function: secure-field
 * -----------------------------
 * Server-side AES-GCM encryption/decryption for sensitive workspace fields.
 *
 * Currently used only for the "Crypto Wallet" payment method type so the
 * Solana wallet address (and optional network/holder values) are encrypted
 * at rest. Card, mobile-money, and bank-transfer payment methods are left
 * untouched per product requirements.
 *
 * Authorization:
 *   - Caller must be a signed-in Supabase user.
 *   - Caller must be an active member of the workspace being operated on.
 */

import { corsHeaders, json, adminClient, getCallerId } from "../_shared/supabase.ts";

const ENCRYPTION_PREFIX = "enc:v1:";
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

const DEV_KEY_BASE64 = "bW9jLWtleS1mb3ItbG9jYWwtZGV2LW9ubHk="; // "mock-key-for-local-dev-only"

interface SecureFieldRequest {
  action: "encrypt" | "decrypt";
  text: string | string[];
  workspaceId: string;
}

function isValidBase64(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9+/]*={0,2}$/.test(value.trim());
}

function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

async function getEncryptionKey(): Promise<CryptoKey> {
  const envKey = Deno.env.get("SECURE_FIELD_ENCRYPTION_KEY");
  const base64Key = envKey && isValidBase64(envKey) ? envKey : DEV_KEY_BASE64;

  if (!envKey) {
    console.warn("SECURE_FIELD_ENCRYPTION_KEY is not set. Using local-dev-only key.");
  }

  const keyBytes = base64ToBuffer(base64Key);
  if (keyBytes.length !== 32) {
    throw new Error("SECURE_FIELD_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }

  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function parseBody(raw: unknown): SecureFieldRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if ((b.action !== "encrypt" && b.action !== "decrypt") || typeof b.workspaceId !== "string") {
    return null;
  }
  const textOk = typeof b.text === "string" || isStringArray(b.text);
  if (!textOk) return null;
  return { action: b.action, text: b.text as string | string[], workspaceId: b.workspaceId };
}

async function isWorkspaceMember(userId: string, workspaceId: string): Promise<boolean> {
  const admin = adminClient();
  const { data, error } = await admin
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    console.error("workspace membership check failed:", error);
    return false;
  }
  return Boolean(data);
}

async function encryptText(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    TEXT_ENCODER.encode(plaintext),
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return `${ENCRYPTION_PREFIX}${bufferToBase64(combined)}`;
}

async function decryptText(ciphertext: string): Promise<string> {
  if (!ciphertext.startsWith(ENCRYPTION_PREFIX)) {
    // Not an encrypted value yet, return as-is (backward compatibility).
    return ciphertext;
  }
  const key = await getEncryptionKey();
  const combined = base64ToBuffer(ciphertext.slice(ENCRYPTION_PREFIX.length));
  if (combined.length < 13) {
    throw new Error("ciphertext is too short");
  }
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data,
  );
  return TEXT_DECODER.decode(decrypted);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  const userId = await getCallerId(req);
  if (!userId) {
    return json({ error: "authentication required" }, 401);
  }

  let body: SecureFieldRequest;
  try {
    const raw = await req.json();
    const parsed = parseBody(raw);
    if (!parsed) {
      return json({ error: "invalid request body" }, 400);
    }
    body = parsed;
  } catch {
    return json({ error: "invalid request body" }, 400);
  }

  const authorized = await isWorkspaceMember(userId, body.workspaceId);
  if (!authorized) {
    return json({ error: "not authorized for workspace" }, 403);
  }

  try {
    if (body.action === "encrypt") {
      if (Array.isArray(body.text)) {
        const encrypted = await Promise.all(body.text.map((t) => encryptText(t)));
        return json({ text: encrypted });
      }
      const encrypted = await encryptText(body.text);
      return json({ text: encrypted });
    }
    if (Array.isArray(body.text)) {
      const decrypted = await Promise.all(body.text.map((t) => decryptText(t)));
      return json({ text: decrypted });
    }
    const decrypted = await decryptText(body.text);
    return json({ text: decrypted });
  } catch (e) {
    console.error("secure-field error:", e);
    return json({ error: (e as Error).message || "field operation failed" }, 500);
  }
});
