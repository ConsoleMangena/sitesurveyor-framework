import { Link } from "react-router-dom"
import { ArrowRight } from "lucide-react"
import { PublicPage } from "../../components/shared/PublicPage.tsx"
import { PublicHero } from "../../components/shared/PublicHero.tsx"
import { PublicSection } from "../../components/shared/PublicSection.tsx"
import { SurveyPhoto } from "../../components/shared/SurveyPhoto.tsx"
import { useDocumentTitle } from "../../hooks/useDocumentTitle.ts"
import { journalPhoto } from "../../lib/content/journalPhotos.ts"
import {
  JOURNAL_ENTRIES,
  journalFormatDate,
  journalReadingMinutes,
} from "../../lib/content/journal.ts"

export default function JournalPage() {
  useDocumentTitle("Blogs | SiteSurveyor")

  const entries = [...JOURNAL_ENTRIES].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <PublicPage section="Blogs">
      <PublicHero
        id="journal-heading"
        title="Notes from the field and the framework."
        description="Product decisions, our evidence model, and practical engineering notes for connected surveying work."
        image="drone"
      />

      <PublicSection aria-label="Blog entries" className="public-journal-index">
        <ol className="public-journal-list">
          {entries.map((entry) => (
            <li key={entry.slug} className="public-journal-item">
              <Link to={`/journal/${entry.slug}`}>
                <SurveyPhoto image={journalPhoto(entry.slug)} showCaption={false} />
                <div className="public-journal-copy">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <time dateTime={entry.date}>{journalFormatDate(entry.date)}</time>
                    <span aria-hidden="true">·</span>
                    <span>{entry.topic}</span>
                  </div>
                  <h2 className="mt-3 text-balance text-xl font-semibold leading-snug">
                    {entry.title}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {entry.summary}
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-xs font-medium">
                    <span>{journalReadingMinutes(entry)} min read</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </PublicSection>
    </PublicPage>
  )
}
