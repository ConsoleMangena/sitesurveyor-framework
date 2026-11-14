import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, Info } from "lucide-react";
import { PublicPage } from "../../components/shared/PublicPage.tsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.ts";
import {
  getJournalEntry,
  journalFormatDate,
  journalReadingMinutes,
} from "../../lib/content/journal.ts";

/**
 * A single journal entry, rendered from the typed content module. Unknown
 * slugs fall through to the public not-found behaviour — back to the index,
 * since the journal has no route of its own in App's protected catch-all.
 */
export default function JournalPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const entry = slug ? getJournalEntry(slug) : undefined;
  useDocumentTitle(entry ? `${entry.title} — SiteSurveyor Journal` : `Journal — SiteSurveyor`);

  if (!entry) {
    return <Navigate to="/journal" replace />;
  }

  return (
    <PublicPage section="Journal">
      <article className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
        <Link
          to="/journal"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All entries
        </Link>

        <header className="mt-8 max-w-[68ch]">
          <p className="web3-mono text-xs text-muted-foreground">
            {journalFormatDate(entry.date)} · {entry.topic} ·{" "}
            {journalReadingMinutes(entry)} min read
          </p>
          <h1 className="mt-3 text-balance text-2xl font-bold leading-tight tracking-[-0.02em] text-foreground sm:text-3xl">
            {entry.title}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
            {entry.summary}
          </p>
          {entry.synthetic ? (
            <p className="mt-6 flex items-start gap-2 border-t border-border/60 pt-4 text-xs leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Examples in this entry are illustrative — they describe how the product works, not
              records from a production deployment.
            </p>
          ) : null}
        </header>

        <div className="mt-10 max-w-[68ch]">
          {entry.sections.map((section) => (
            <section key={section.heading} className="border-t border-border/60 py-8 first:border-t-0 first:pt-0">
              <h2 className="text-lg font-semibold leading-snug tracking-[-0.01em] text-foreground">
                {section.heading}
              </h2>
              {section.paragraphs.map((paragraph, index) => (
                <p
                  key={index}
                  className="mt-4 text-[0.9375rem] leading-relaxed text-foreground/90"
                >
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
      </article>
    </PublicPage>
  );
}
