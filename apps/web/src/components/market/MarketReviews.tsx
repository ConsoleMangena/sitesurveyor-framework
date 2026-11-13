import { useCallback, useEffect, useState } from "react";
import { Loader2, Star } from "lucide-react";
import { useAuthStore } from "../../lib/auth/auth-store.ts";
import { cn } from "../../lib/utils.ts";
import FieldError from "@/components/errors/FieldError.tsx";
import { Button } from "../ui/button.tsx";
import { Textarea } from "../ui/textarea.tsx";
import {
  getMyMarketReview,
  listMarketReviews,
  saveMarketReview,
  type MarketReview,
  type MarketReviewRow,
  type ReviewableKind,
} from "../../lib/repositories/marketReviews.ts";

/** Star row used by the review list and the rating picker. */
export function StarRow({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            "size-3.5",
            n <= value ? "fill-warning text-warning" : "text-muted-foreground/40",
          )}
        />
      ))}
    </span>
  );
}

/** Reviews for professionals and firms — the rows behind the public rating. */
export function MarketReviews({
  kind,
  itemId,
  average,
  count,
}: {
  kind: ReviewableKind;
  itemId: string;
  average: number | null;
  count: number;
}) {
  const user = useAuthStore((s) => s.user);
  const [reviews, setReviews] = useState<MarketReview[]>([]);
  const [mine, setMine] = useState<MarketReviewRow | null>(null);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setReviews(await listMarketReviews(kind, itemId));
  }, [kind, itemId]);

  // Both effects settle their state inside a promise, never synchronously in
  // the effect body — that keeps the render cascade out and satisfies the
  // set-state-in-effect rule. A signed-out visitor resolves to "no review".
  useEffect(() => {
    let cancelled = false;
    void listMarketReviews(kind, itemId).then((rows) => {
      if (!cancelled) setReviews(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [kind, itemId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user) return null;
      return getMyMarketReview(kind, itemId);
    };
    void load().then((row) => {
      if (cancelled) return;
      setMine(row);
      if (row) {
        setRating(row.rating);
        setBody(row.body ?? "");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [kind, itemId, user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await saveMarketReview({ kind, itemId, rating, body });
      await refresh();
      setMine(await getMyMarketReview(kind, itemId));
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your review.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Reviews</h3>
        {average != null && average > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-warning">
            <StarRow value={Math.round(average)} />
            {average.toFixed(1)} · {count} review{count === 1 ? "" : "s"}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">No reviews yet</span>
        )}
      </div>

      {reviews.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {reviews.slice(0, 3).map((review) => (
            <li key={review.id} className="rounded-xl border border-border/80 bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <StarRow value={review.rating} />
                <span className="text-micro text-muted-foreground">Verified member</span>
              </div>
              {review.body ? (
                <p className="mt-1.5 text-sm leading-6 text-foreground/85">{review.body}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {user ? (
        <div className="mt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 text-xs"
            onClick={() => setOpen((value) => !value)}
          >
            {mine ? "Edit your review" : "Write a review"}
          </Button>
          {open ? (
            <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl border border-border/80 bg-card p-3 text-left">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Rating</span>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-label={`${n} star${n === 1 ? "" : "s"}`}
                    aria-pressed={rating === n}
                    onClick={() => setRating(n)}
                    className="rounded p-0.5"
                  >
                    <Star
                      className={cn(
                        "size-5",
                        n <= rating ? "fill-warning text-warning" : "text-muted-foreground/50",
                      )}
                    />
                  </button>
                ))}
              </div>
              <Textarea
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="How was the work?"
                className="bg-background text-sm leading-6"
              />
              {error ? <FieldError>{error}</FieldError> : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} className="h-9 text-xs">
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={busy} className="h-9 text-xs">
                  {busy ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
                  Save review
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Sign in to leave a review.</p>
      )}
    </section>
  );
}

