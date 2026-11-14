import { Link, Navigate, useParams } from "react-router-dom"
import { ArrowLeft, Info } from "lucide-react"
import { PublicPage } from "../../components/shared/PublicPage.tsx"
import { useDocumentTitle } from "../../hooks/useDocumentTitle.ts"
import {
  getJournalEntry,
  journalFormatDate,
  journalReadingMinutes,
} from "../../lib/content/journal.ts"

export default function JournalPostPage() {
  const { slug } = useParams<{ slug: string }>()
  const entry = slug ? getJournalEntry(slug) : undefined
  useDocumentTitle(entry ? `${entry.title} — SiteSurveyor Journal` : "Journal — SiteSurveyor")

  if (!entry) {
    return <Navigate to="/journal" replace />
  }

  return (
    <PublicPage section="Journal">
      <article className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        <Link
          to="/journal"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Journal
        </Link>

        <header className="mt-6">
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
            <span>{journalFormatDate(entry.date)}</span>
            <span>·</span>
            <span className="bolt-chip-secondary text-[10px]">{entry.topic}</span>
            <span>·</span>
            <span>{journalReadingMinutes(entry)} min read</span>
          </div>
          <h1 className="mt-3 text-balance text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
            {entry.title}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">{entry.summary}</p>
          {entry.synthetic ? (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-dashed bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Examples are illustrative — they describe how the product works, not production records.
            </div>
          ) : null}
        </header>

        <div className="mt-8 max-w-prose space-y-8">
          {entry.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-semibold leading-snug">{section.heading}</h2>
              <div className="mt-3 space-y-4">
                {section.paragraphs.map((paragraph, index) => (
                  <p key={index} className="text-[0.9375rem] leading-relaxed text-foreground/90">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </article>
    </PublicPage>
  )
}
