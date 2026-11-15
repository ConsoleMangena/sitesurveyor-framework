import { Link, Navigate, useParams } from "react-router-dom"
import { ArrowLeft, Info } from "lucide-react"
import { PublicPage } from "../../components/shared/PublicPage.tsx"
import { SurveyPhoto } from "../../components/shared/SurveyPhoto.tsx"
import { useDocumentTitle } from "../../hooks/useDocumentTitle.ts"
import { journalPhoto } from "../../lib/content/journalPhotos.ts"
import {
  getJournalEntry,
  journalFormatDate,
  journalReadingMinutes,
} from "../../lib/content/journal.ts"

export default function JournalPostPage() {
  const { slug } = useParams<{ slug: string }>()
  const entry = slug ? getJournalEntry(slug) : undefined
  useDocumentTitle(entry ? `${entry.title} — SiteSurveyor Blogs` : "Blogs — SiteSurveyor")

  if (!entry) {
    return <Navigate to="/journal" replace />
  }

  return (
    <PublicPage section="Blogs">
      <article className="public-section public-journal-post">
        <Link
          to="/journal"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Blogs
        </Link>

        <header className="mt-6">
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
            <span>{journalFormatDate(entry.date)}</span>
            <span>·</span>
            <span className="bolt-chip-secondary text-[10px]">{entry.topic}</span>
            <span>·</span>
            <span>{journalReadingMinutes(entry)} min read</span>
          </div>
          <h1 className="public-journal-post-title mt-4 text-balance">
            {entry.title}
          </h1>
          <p className="mt-4 max-w-[65ch] text-base leading-relaxed text-muted-foreground">{entry.summary}</p>
          {entry.synthetic ? (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-dashed bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Examples are illustrative — they describe how the product works, not production records.
            </div>
          ) : null}
        </header>

        <SurveyPhoto image={journalPhoto(entry.slug)} className="public-journal-lead" />

        <div className="public-journal-body mt-10 space-y-10">
          {entry.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-xl font-semibold leading-snug">{section.heading}</h2>
              <div className="mt-4 space-y-5">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="max-w-[68ch] text-base leading-8 text-foreground/90">
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
