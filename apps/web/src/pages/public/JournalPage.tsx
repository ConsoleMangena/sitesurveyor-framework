import { Link } from "react-router-dom"
import { ArrowRight } from "lucide-react"
import { PublicPage } from "../../components/shared/PublicPage.tsx"
import { useDocumentTitle } from "../../hooks/useDocumentTitle.ts"
import {
  JOURNAL_ENTRIES,
  journalFormatDate,
  journalReadingMinutes,
} from "../../lib/content/journal.ts"

export default function JournalPage() {
  useDocumentTitle("Journal — SiteSurveyor")

  const entries = [...JOURNAL_ENTRIES].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <PublicPage section="Journal">
      <section aria-labelledby="journal-heading" className="border-b bg-card">
        <div className="mx-auto w-full max-w-5xl px-4 pb-10 pt-14 sm:px-6 sm:pb-12 sm:pt-20">
          <h1 id="journal-heading" className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Journal
          </h1>
          <p className="mt-3 max-w-xl text-base text-muted-foreground">
            Product decisions, evidence model, and engineering notes.
          </p>
        </div>
      </section>

      <section aria-label="Journal entries" className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <ol className="max-w-2xl space-y-8">
          {entries.map((entry) => (
            <li key={entry.slug} className="group">
              <Link to={`/journal/${entry.slug}`} className="block">
                <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                  <span>{journalFormatDate(entry.date)}</span>
                  <span>·</span>
                  <span className="bolt-chip-secondary text-[10px]">{entry.topic}</span>
                </div>
                <h2 className="mt-2 text-lg font-semibold leading-snug group-hover:text-primary">
                  {entry.title}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {entry.summary}
                </p>
                <div className="mt-3 flex items-center gap-4 font-mono text-xs text-muted-foreground">
                  <span>{journalReadingMinutes(entry)} min read</span>
                  <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </PublicPage>
  )
}
