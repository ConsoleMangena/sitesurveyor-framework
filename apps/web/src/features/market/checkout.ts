import { supabase } from "../../lib/supabase/client.ts";
import { createMarketplaceRequest } from "../../lib/repositories/marketplaceRequests.ts";
import { notifyMarketplaceRequest } from "../../lib/repositories/notificationEvents.ts";
import { removeManyFromCart, type CartItem } from "./cart.ts";

export interface CheckoutOutcome {
  sent: CartItem[];
  failed: { item: CartItem; message: string }[];
}

/**
 * The public market view hides the owning workspace, so resolve it before
 * checkout — the seller notification needs it.
 */
async function resolveSellerWorkspaces(
  listingIds: string[],
): Promise<Map<string, string>> {
  if (listingIds.length === 0) return new Map();
  const { data } = await supabase
    .from("marketplace_listings")
    .select("id, workspace_id")
    .in("id", listingIds);
  return new Map((data ?? []).map((row) => [row.id, row.workspace_id]));
}

/**
 * Turn the basket into one marketplace request per listing. Payment is not
 * taken here: a request stays pending until the seller accepts it, and only an
 * accepted request can be paid. Items that failed to send stay in the basket.
 */
export async function checkoutCart(
  items: CartItem[],
  input: { workspaceId: string; requesterName: string | null; message?: string | null },
): Promise<CheckoutOutcome> {
  const sellers = await resolveSellerWorkspaces(
    items.filter((item) => !item.sellerWorkspaceId).map((item) => item.listingId),
  );

  const sent: CartItem[] = [];
  const failed: CheckoutOutcome["failed"] = [];

  for (const item of items) {
    try {
      await createMarketplaceRequest({
        listingId: item.listingId,
        requesterWorkspaceId: input.workspaceId,
        message: input.message ?? null,
      });
      sent.push(item);
      const sellerWorkspaceId = item.sellerWorkspaceId ?? sellers.get(item.listingId) ?? null;
      if (sellerWorkspaceId) {
        void notifyMarketplaceRequest({
          sellerWorkspaceId,
          listingName: item.name,
          requesterName: input.requesterName,
          listingType: item.kind,
        }).catch(() => undefined);
      }
    } catch (err) {
      failed.push({
        item,
        message: err instanceof Error ? err.message : "Failed to send this request.",
      });
    }
  }

  if (sent.length) removeManyFromCart(sent.map((item) => item.listingId));
  return { sent, failed };
}
