import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { PublicPage } from "../../components/shared/PublicPage.tsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.ts";
import {
  JOURNAL_ENTRIES,
  journalFormatDate,
  journalReadingMinutes,
} from "../../lib/content/journal.ts";

/**
 * The journal index: dated entries with hairline rules, newest first — the
 * market's registry rhythm applied to writing instead of listings.
 */
export default function JournalPage() {
  useDocumentTitle(`Journal — SiteSurveyor`);

  const entries = [...JOURNAL_ENTRIES].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <PublicPage section="Journal">
      <section aria-labelledby="journal-heading" className="border-b border-border/70 bg-card">
        <div className="mx-auto w-full max-w-5xl px-4 pb-12 pt-14 sm:px-6 sm:pb-16 sm:pt-20">
          <h1 id="journal-heading" className="market-hero-title max-w-3xl text-balance text-foreground">
            Working notes from the field OS
          </h1>
          <p className="mt-5 max-w-[65ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
            How SiteSurveyor is built and why: the product decisions, the evidence model, and the
            engineering behind a workspace that runs a survey job end to end.
          </p>
        </div>
      </section>

      <section aria-label="Journal entries" className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
        <ol className="max-w-[72ch]">
          {entries.map((entry) => (
            <li key={entry.slug} className="border-t border-border/60 py-7 first:border-t-0 first:pt-0">
              <p className="web3-mono text-xs text-muted-foreground">
                {journalFormatDate(entry.date)} · {entry.topic}
              </p>
              <h2 className="mt-2 text-lg font-semibold leading-snug tracking-[-0.01em] text-foreground">
                <Link to={`/journal/${entry.slug}`} className="hover:underline">
                  {entry.title}
                </Link>
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{entry.summary}</p>
              <Link
                to={`/journal/${entry.slug}`}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 hover:underline"
              >
                Read entry
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </PublicPage>
  );
}
