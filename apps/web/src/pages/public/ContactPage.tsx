import { useState } from "react"
import { Link } from "react-router-dom"
import { Mail, MessageSquare, Send } from "lucide-react"
import { PublicPage } from "../../components/shared/PublicPage.tsx"
import { useDocumentTitle } from "../../hooks/useDocumentTitle.ts"

const CONTACT_EMAIL = "support@sitesurveyor.tech"

const SUBJECT_OPTIONS = [
  { value: "support", label: "Product support" },
  { value: "sales", label: "Pricing and plans" },
  { value: "security", label: "Security or privacy" },
  { value: "market", label: "Marketplace listing" },
  { value: "other", label: "Something else" },
] as const

type SubjectValue = (typeof SUBJECT_OPTIONS)[number]["value"]

export default function ContactPage() {
  useDocumentTitle("Contact — SiteSurveyor")

  const [subject, setSubject] = useState<SubjectValue>("support")
  const [message, setMessage] = useState("")
  const [opened, setOpened] = useState(false)

  const subjectLabel =
    SUBJECT_OPTIONS.find(({ value }) => value === subject)?.label ?? "Support"

  function composeMailto(): string {
    const query = new URLSearchParams({
      subject: `[${subjectLabel}] SiteSurveyor enquiry`,
      body: message.trim() ? `${message.trim()}\n` : "",
    })
    return `mailto:${CONTACT_EMAIL}?${query.toString()}`
  }

  return (
    <PublicPage section="Contact">
      <section aria-labelledby="contact-heading" className="border-b bg-card">
        <div className="mx-auto w-full max-w-5xl px-4 pb-10 pt-14 sm:px-6 sm:pb-12 sm:pt-20">
          <h1 id="contact-heading" className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Contact
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Product questions, listings, security reports — write to us.
          </p>
        </div>
      </section>

      <section aria-label="Contact form" className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="grid gap-10 lg:grid-cols-[1fr_280px] lg:gap-12">
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault()
              window.location.href = composeMailto()
              setOpened(true)
            }}
          >
            <div>
              <label htmlFor="contact-subject" className="text-sm font-medium">
                Subject
              </label>
              <select
                id="contact-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value as SubjectValue)}
                className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {SUBJECT_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="contact-message" className="text-sm font-medium">
                Message
              </label>
              <textarea
                id="contact-message"
                rows={5}
                required
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="What do you need? Include context if it's a support question."
                className="mt-1 block w-full resize-y rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <button
              type="submit"
              className="inline-flex items-center gap-2 bg-primary px-5 py-2.5 font-mono text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Send className="h-4 w-4" />
              Open email draft
            </button>

            {opened ? (
              <p className="text-xs text-muted-foreground" role="status">
                Your email client opened with the draft. If it didn't, write to{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                  {CONTACT_EMAIL}
                </a>
                .
              </p>
            ) : null}
          </form>

          <aside className="space-y-8 lg:border-l lg:pl-10">
            <div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Direct</h2>
              </div>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="mt-2 block font-mono text-sm text-primary hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Security reports: describe the issue without exploit details — we follow up first.
              </p>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">In-app assistant</h2>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Signed in? The assistant answers questions against your own workspace records.
              </p>
            </div>

            <div className="space-y-2 font-mono text-sm">
              <Link to="/help" className="block text-primary hover:underline">
                → Help & FAQ
              </Link>
              <Link to="/privacy" className="block text-primary hover:underline">
                → Privacy policy
              </Link>
            </div>
          </aside>
        </div>
      </section>
    </PublicPage>
  )
}
