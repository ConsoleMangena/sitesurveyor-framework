import { useSyncExternalStore } from "react";

/**
 * The buyer's market cart. One entry per listing — a request is either open or
 * settled, so quantity has no meaning here. The cart lives in localStorage so
 * the public market and the dashboard market share one basket across reloads
 * and tabs; nothing is written to the database until checkout turns the items
 * into marketplace requests.
 */
export interface CartItem {
  listingId: string;
  name: string;
  kind: "hire" | "sale";
  price: number;
  currency: string;
  seller: string;
  location: string;
  sellerWorkspaceId: string | null;
  addedAt: string;
}

export type CartDraft = Omit<CartItem, "addedAt">;

const STORAGE_KEY = "sitesurveyor-market-cart";

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CartItem>;
  return (
    typeof item.listingId === "string" &&
    typeof item.name === "string" &&
    typeof item.price === "number" &&
    typeof item.currency === "string"
  );
}

function read(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCartItem).map((item) => ({
      ...item,
      kind: item.kind === "hire" ? "hire" : "sale",
      seller: typeof item.seller === "string" ? item.seller : "",
      location: typeof item.location === "string" ? item.location : "",
      sellerWorkspaceId:
        typeof item.sellerWorkspaceId === "string" ? item.sellerWorkspaceId : null,
      addedAt: typeof item.addedAt === "string" ? item.addedAt : "",
    }));
  } catch {
    return [];
  }
}

let items: CartItem[] = read();
const listeners = new Set<() => void>();

function commit(next: CartItem[]): void {
  items = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* a full or blocked store keeps the in-memory basket usable */
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    items = read();
    for (const listener of listeners) listener();
  });
}

/** Add a listing. Returns false when it was already in the basket. */
export function addToCart(draft: CartDraft): boolean {
  if (items.some((item) => item.listingId === draft.listingId)) return false;
  commit([...items, { ...draft, addedAt: new Date().toISOString() }]);
  return true;
}

export function removeFromCart(listingId: string): void {
  const next = items.filter((item) => item.listingId !== listingId);
  if (next.length !== items.length) commit(next);
}

export function removeManyFromCart(listingIds: string[]): void {
  const drop = new Set(listingIds);
  const next = items.filter((item) => !drop.has(item.listingId));
  if (next.length !== items.length) commit(next);
}

export function clearCart(): void {
  if (items.length) commit([]);
}

export function isInCart(listingId: string): boolean {
  return items.some((item) => item.listingId === listingId);
}

export function getCart(): CartItem[] {
  return items;
}

export interface CartTotal {
  currency: string;
  total: number;
  count: number;
}

/** Subtotals per currency — a basket can mix USD gear with ZWL hire. */
export function cartTotals(list: CartItem[] = items): CartTotal[] {
  const byCurrency = new Map<string, CartTotal>();
  for (const item of list) {
    const slot = byCurrency.get(item.currency) ?? {
      currency: item.currency,
      total: 0,
      count: 0,
    };
    slot.total += item.price;
    slot.count += 1;
    byCurrency.set(item.currency, slot);
  }
  return [...byCurrency.values()];
}

export function useCart(): CartItem[] {
  return useSyncExternalStore(subscribe, getCart, getCart);
}

export function useCartCount(): number {
  const list = useCart();
  return list.length;
}

export function useIsInCart(listingId: string): boolean {
  const list = useCart();
  return list.some((item) => item.listingId === listingId);
}
