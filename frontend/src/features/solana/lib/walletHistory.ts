/**
 * Local, per-browser activity history for the embedded Solana wallet.
 *
 * This tracks sends, invoice payments, and file anchors initiated inside the
 * app so the user sees meaningful labels instead of raw chain signatures.
 * It is intentionally kept in localStorage (not the server) because it is a
 * convenience view of the user's own wallet actions in this browser.
 */

export type WalletActivityType = "send" | "receive" | "payment" | "anchor";

export interface WalletActivity {
  id: string;
  type: WalletActivityType;
  /** ISO timestamp when the activity was recorded. */
  createdAt: string;
  /** Human-readable label shown in the UI. */
  label: string;
  /** Optional transaction or anchor signature. */
  signature?: string;
  /** Optional amount in display units (e.g. 10.5). */
  amount?: string;
  /** Optional token symbol (SOL, USDC). */
  token?: string;
  /** Optional counterparty address, invoice number, or file name. */
  detail?: string;
  /** Explorer network (devnet, mainnet-beta, testnet). */
  network?: string;
}

const STORAGE_KEY = "sitesurveyor:wallet:activity";
const MAX_ITEMS = 50;

export function loadWalletHistory(): WalletActivity[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is WalletActivity =>
          item && typeof item === "object" && typeof item.id === "string",
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  } catch {
    return [];
  }
}

export function saveWalletActivity(activity: Omit<WalletActivity, "id" | "createdAt">): void {
  if (typeof localStorage === "undefined") return;
  try {
    const current = loadWalletHistory();
    const next: WalletActivity = {
      ...activity,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: new Date().toISOString(),
    };
    const combined = [next, ...current].slice(0, MAX_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(combined));
  } catch {
    // Ignore storage errors (e.g. private mode).
  }
}

export function clearWalletHistory(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
